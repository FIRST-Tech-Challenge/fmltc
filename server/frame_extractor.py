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
from datetime import datetime, timedelta, timezone
import logging
import os
import time
import uuid

# Other Modules
import cv2

# My Modules
import action
import blob_storage
import exceptions
import metrics
import storage
import util

def start_wait_for_video_upload(team_uuid, video_uuid, description, video_filename, file_size, content_type, create_time_ms):
    action_parameters = action.create_action_parameters(
        team_uuid, action.ACTION_NAME_WAIT_FOR_VIDEO_UPLOAD)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['video_uuid'] = video_uuid
    action_parameters['description'] = description
    action_parameters['video_filename'] = video_filename
    action_parameters['file_size'] = file_size
    action_parameters['content_type'] = content_type
    action_parameters['create_time_ms'] = create_time_ms
    action.trigger_action_via_blob(action_parameters)


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
            __start_frame_extraction(video_entity)
            return
        # Note that we don't retrigger this action. If the video isn't there by now, it's probably
        # failed.


def maybe_restart_frame_extraction(team_uuid, video_uuid):
    # storage.retrieve_video_entity will raise HttpErrorNotFound
    # if the team_uuid/video_uuid is not found.
    video_entity = storage.retrieve_video_entity(team_uuid, video_uuid)
    if video_entity['delete_in_progress']:
        return False
    if 'frame_extraction_failed' in video_entity:
        if video_entity['frame_extraction_failed']:
            return False
    if 'frame_extraction_end_time' in video_entity:
        return False
    if 'frame_extraction_active_time' not in video_entity:
        # Frame extraction hasn't started yet. Check if it has been more than 3 minutes since the video entity was created.
        if datetime.now(timezone.utc) - video_entity['entity_create_time'] >= timedelta(minutes=3):
            __start_frame_extraction(video_entity)
            return True
        # It's been less than 3 minutes since the video entity was created. Give it more time
        # before restarting frame extraction.
        return False
    # Frame extraction video hasn't finished yet. Check if it has been more than 3 minutes since the frame extraction was active.
    if datetime.now(timezone.utc) - video_entity['frame_extraction_active_time'] >= timedelta(minutes=3):
        __start_frame_extraction(video_entity)
        return True
    # It's been less than 3 minutes since the frame extraction was active. Give it more time before
    # restarting frame extraction.
    return False


def __start_frame_extraction(video_entity):
    action_parameters = action.create_action_parameters(
        video_entity['team_uuid'], action.ACTION_NAME_FRAME_EXTRACTION)
    action_parameters['team_uuid'] = video_entity['team_uuid']
    action_parameters['video_uuid'] = video_entity['video_uuid']
    action.trigger_action_via_blob(action_parameters)


def extract_frames(action_parameters):
    team_uuid = action_parameters['team_uuid']
    video_uuid = action_parameters['video_uuid']

    # Read the video_entity from storage and store the fact that frame extraction is now/still
    # active.
    video_entity = storage.frame_extraction_active(team_uuid, video_uuid)
    previously_extracted_frame_count = video_entity['extracted_frame_count']
    need_to_save_metrics = (previously_extracted_frame_count == 0)
    try:
        if video_entity['delete_in_progress']:
            return

        # Write the video out to a temporary file.
        video_blob_name = video_entity['video_blob_name']
        video_filename = '/tmp/%s' % str(uuid.uuid4().hex)
        os.makedirs(os.path.dirname(video_filename), exist_ok=True)

        if not blob_storage.write_video_to_file(video_blob_name, video_filename):
            storage.frame_extraction_failed(team_uuid, video_uuid)
            message = "Fatal Error: Unable to write video to file for video_uuid=%s." % video_uuid
            logging.critical(message)
            return

        storage.frame_extraction_active(team_uuid, video_uuid)

        try:
            # Open the video file with cv2.
            vid = cv2.VideoCapture(video_filename)
            if not vid.isOpened():
                storage.frame_extraction_failed(team_uuid, video_uuid)
                message = "Fatal Error: Unable to open video for video_uuid=%s." % video_uuid
                logging.critical(message)
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
                    video_entity = storage.frame_extraction_starting(team_uuid, video_uuid,
                        width, height, fps, frame_count)
                    metrics.save_video_metrics(video_entity)
                    need_to_save_metrics = False
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
                        video_entity = storage.store_frame_image(team_uuid, video_uuid, frame_number,
                            'image/jpg', buffer.tostring())
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
    finally:
        if need_to_save_metrics:
            metrics.save_video_metrics(video_entity)
