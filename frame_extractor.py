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
import storage
import util

def make_action_parameters(team_uuid, video_uuid):
    action_parameters = action.create_action_parameters(action.ACTION_NAME_FRAME_EXTRACTION)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['video_uuid'] = video_uuid
    return action_parameters

def extract_frames(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    video_uuid = action_parameters['video_uuid']

    # Read the video_entity from storage and store the fact that the frame extractor is now/still
    # active.
    video_entity = storage.frame_extractor_active(team_uuid, video_uuid)

    # Write the video out to a temporary file.
    video_blob_name = video_entity['video_blob_name']
    video_filename = '/tmp/%s' % str(uuid.uuid4().hex)
    os.makedirs(os.path.dirname(video_filename), exist_ok=True)

    if not blob_storage.write_video_to_file(video_blob_name, video_filename):
        # The video blob hasn't been uploaded yet. Wait until it has.
        while True:
            if action.is_near_limit(time_limit, active_memory_limit):
                # Time or memory is running out. Trigger the action again to restart.
                action.trigger_action_via_blob(action_parameters)
                return
            time.sleep(1)
            if blob_storage.write_video_to_file(video_blob_name, video_filename):
                break

    storage.frame_extractor_active(team_uuid, video_uuid)

    try:
        # Open the video file with cv2.
        vid = cv2.VideoCapture(video_filename)
        if not vid.isOpened():
            message = "Error: Unable to open video for video_uuid=%s." % video_uuid
            logging.critical(message)
            raise exceptions.HttpErrorInternalServerError(message)
        try:
            previously_extracted_frame_count = video_entity['extracted_frame_count']

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
                    if action.is_near_limit(time_limit, active_memory_limit):
                        # Time or memory is running out. Trigger the action again to restart.
                        action.trigger_action_via_blob(action_parameters)
                        return
                    success = vid.grab()
                    if not success:
                        # We've reached the end of the video. All finished counting!
                        break
                    frame_count += 1
                video_entity = storage.frame_extraction_starting(team_uuid, video_uuid,
                    width, height, fps, frame_count)

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

            if action.is_near_limit(time_limit, active_memory_limit):
                # Time or memory is running out. Trigger the action again to restart.
                action.trigger_action_via_blob(action_parameters)
                return

            while True:
                success, frame = vid.read()
                if not success:
                    # We've reached the end of the video. All finished extracting frames!
                    video_entity = storage.frame_extraction_done(team_uuid, video_uuid, frame_number)
                    break
                # Store the frame as a jpg image, which are smaller/faster than png.
                success, buffer = cv2.imencode('.jpg', frame)
                if success:
                    video_entity = storage.store_frame_image(team_uuid, video_uuid, frame_number,
                        'image/jpg', buffer.tostring())
                    frame_number += 1
                else:
                    logging.error('cv2.imencode() returned %s' % success)
                if action.is_near_limit(time_limit, active_memory_limit):
                    # Time or memory is running out. Trigger the action again to restart.
                    action.trigger_action_via_blob(action_parameters)
                    break

        finally:
            # Release the cv2 video.
            vid.release()
    finally:
        # Delete the temporary file.
        os.remove(video_filename)
