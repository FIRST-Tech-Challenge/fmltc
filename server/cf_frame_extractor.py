# Copyright 2020 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

__author__ = "lizlooney@google.com (Liz Looney)"

# Python Standard Library
from datetime import timedelta
import logging
import os
import time
import uuid

# Other Modules
import cv2

# My Modules
from app_engine import action
from app_engine import blob_storage
from app_engine import constants
from app_engine import storage
from app_engine import frame_extractor


def wait_for_video_upload(action_parameters):
    team_uuid = action_parameters['team_uuid']
    video_uuid = action_parameters['video_uuid']
    description = action_parameters['description']
    video_filename = action_parameters['video_filename']
    file_size = action_parameters['file_size']
    content_type = action_parameters['content_type']
    create_time_ms = action_parameters['create_time_ms']

    while action.remaining_timedelta(action_parameters) > timedelta(seconds=30):
        time.sleep(10)
        # Check to see whether the blob exists.
        if blob_storage.video_blob_exists(team_uuid, video_uuid):
            video_entity = storage.create_video_entity(
                team_uuid, video_uuid, description, video_filename, file_size, content_type, create_time_ms)
            storage.prepare_to_start_frame_extraction(team_uuid, video_uuid)
            frame_extractor.start_frame_extraction(video_entity)
            return
        # Note that we don't retrigger this action. If the video isn't there by now, it's probably
        # failed.


def extract_frames(action_parameters):
    team_uuid = action_parameters['team_uuid']
    video_uuid = action_parameters['video_uuid']

    # Read the video_entity from storage and store the fact that frame extraction is now/still
    # active.
    video_entity = storage.frame_extraction_active(team_uuid, video_uuid)
    previously_extracted_frame_count = video_entity['extracted_frame_count']
    if video_entity['delete_in_progress']:
        return

    # Write the video out to a temporary file.
    video_blob_name = video_entity['video_blob_name']
    video_filename = '/tmp/%s' % str(uuid.uuid4().hex)
    os.makedirs(os.path.dirname(video_filename), exist_ok=True)

    if not blob_storage.write_video_to_file(video_blob_name, video_filename):
        storage.frame_extraction_failed(team_uuid, video_uuid,
                "Unable to extract frames from the video.")
        return

    storage.frame_extraction_active(team_uuid, video_uuid)

    try:
        # Open the video file with cv2.
        vid = cv2.VideoCapture(video_filename)
        if not vid.isOpened():
            storage.frame_extraction_failed(team_uuid, video_uuid,
                    "Unable to the open the video file.")
            return
        try:
            # If we haven't extracted any frames yet, we need to create the video frame entities
            # and update the video entity with the width, height, fps, and frame_count.
            if previously_extracted_frame_count == 0:
                width = int(vid.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(vid.get(cv2.CAP_PROP_FRAME_HEIGHT))
                fps = vid.get(cv2.CAP_PROP_FPS)
                # Count the frames. Getting the CAP_PROP_FRAME_COUNT property is not reliable.
                # Instead, we iterate through the video using vid.grab(), which is faster than
                # vid.read().
                frame_count = 0
                while True:
                    action.retrigger_if_necessary(action_parameters)
                    success = vid.grab()
                    if not success:
                        # We've reached the end of the video. All finished counting!
                        break
                    frame_count += 1
                # Limit by duration.
                duration = frame_count / fps
                if duration > constants.MAX_VIDEO_LENGTH_SECONDS:
                    message = "This video is longer than %d seconds, which is the maximum duration allowed." % constants.MAX_VIDEO_LENGTH_SECONDS
                    storage.frame_extraction_failed(team_uuid, video_uuid, message,
                            width=width, height=height, fps=fps, frame_count=frame_count)
                    return
                # Limit by number of frames.
                if frame_count > constants.MAX_FRAMES_PER_VIDEO:
                    message = "This video has more than %d frames, which is the maximum allowed." % constants.MAX_FRAMES_PER_VIDEO
                    storage.frame_extraction_failed(team_uuid, video_uuid, message,
                            width=width, height=height, fps=fps, frame_count=frame_count)
                    return
                # Don't allow videos that have zero frames.
                if frame_count <= 0:
                    storage.frame_extraction_failed(team_uuid, video_uuid,
                            "This video has zero frames.",
                            width=width, height=height, fps=fps, frame_count=frame_count)
                    return
                # Limit by resolution.
                if (max(width, height) > max(constants.MAX_VIDEO_RESOLUTION_WIDTH, constants.MAX_VIDEO_RESOLUTION_HEIGHT) or
                        min(width, height) > min(constants.MAX_VIDEO_RESOLUTION_WIDTH, constants.MAX_VIDEO_RESOLUTION_HEIGHT)):
                    message = "This video's resolution is larger than %d x %d, which is the maximum resolution allowed." % (
                            constants.MAX_VIDEO_RESOLUTION_WIDTH, constants.MAX_VIDEO_RESOLUTION_HEIGHT)
                    storage.frame_extraction_failed(team_uuid, video_uuid, message,
                            width=width, height=height, fps=fps, frame_count=frame_count)
                    return

                video_entity = storage.frame_extraction_starting(team_uuid, video_uuid,
                    width, height, fps, frame_count)
                if video_entity['delete_in_progress']:
                    return

                # Back up to the beginning of the video. Setting the CAP_PROP_POS_FRAMES property
                # is not reliable. Instead, we release vid and open it again.
                vid.release()
                vid = cv2.VideoCapture(video_filename)
            else:
                # We are continuing the extraction. Skip to the next frame we need to extract.
                # Setting the CAP_PROP_POS_FRAMES property is not reliable. Instead, we skip
                # through frames using vid.grab().
                for i in range(previously_extracted_frame_count):
                    ret = vid.grab()

            frame_number = previously_extracted_frame_count

            action.retrigger_if_necessary(action_parameters)

            while True:
                success, frame = vid.read()
                if not success:
                    # We've reached the end of the video. All finished extracting frames!
                    video_entity = storage.frame_extraction_done(team_uuid, video_uuid, frame_number)
                    return
                # Store the frame as a jpg image, which are smaller/faster than png.
                success, buffer = cv2.imencode('.jpg', frame)
                if success:
                    try:
                        video_entity = storage.store_frame_image(team_uuid, video_uuid, frame_number,
                            'image/jpg', buffer.tostring())
                    except:
                        # Check if the video has been deleted.
                        team_entity = storage.retrieve_team_entity(team_uuid)
                        if 'video_uuids_deleted' in team_entity:
                            if video_uuid in team_entity['video_uuids_deleted']:
                                return
                        raise
                    if video_entity['delete_in_progress']:
                        return
                    frame_number += 1
                else:
                    logging.error('cv2.imencode() returned %s' % success)
                action.retrigger_if_necessary(action_parameters)

        finally:
            # Release the cv2 video.
            vid.release()
    finally:
        # Delete the temporary file.
        os.remove(video_filename)
