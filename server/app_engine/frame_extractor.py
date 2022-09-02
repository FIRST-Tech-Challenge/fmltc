# Copyright 2022 Google LLC
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

# My Modules
import action
import storage


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


def start_frame_extraction(video_entity):
    action_parameters = action.create_action_parameters(
        video_entity['team_uuid'], action.ACTION_NAME_FRAME_EXTRACTION)
    action_parameters['team_uuid'] = video_entity['team_uuid']
    action_parameters['video_uuid'] = video_entity['video_uuid']
    action.trigger_action_via_blob(action_parameters)


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
            start_frame_extraction(video_entity)
            return True
        # It's been less than 3 minutes since the video entity was created. Give it more time
        # before restarting frame extraction.
        return False
    # Frame extraction video hasn't finished yet. Check if it has been more than 3 minutes since the frame extraction was active.
    if datetime.now(timezone.utc) - video_entity['frame_extraction_active_time'] >= timedelta(minutes=3):
        start_frame_extraction(video_entity)
        return True
    # It's been less than 3 minutes since the frame extraction was active. Give it more time before
    # restarting frame extraction.
    return False
