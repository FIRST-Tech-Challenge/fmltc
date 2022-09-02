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

# Inspired by
# https://github.com/google/ftc-object-detection/tree/46197ce4ecaee954c2164d257d7dc24e85678285/training/tracking.py

# Python Standard Library
import logging

# My Modules
import action
import storage


# These values should match the keys in tracker_fns in server/cf_tracking.py.
tracker_fns = [
    'CSRT',
    'MedianFlow',
    'MIL',
    'MOSSE',
    'TLD',
    'KCF',
    'Boosting',
]


def validate_tracker_name(s):
    if s not in tracker_fns:
        message = "Error: '%s' is not a valid argument." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return s


def prepare_to_start_tracking(team_uuid, video_uuid, tracker_name, scale, init_frame_number, init_bboxes_text):
    # storage.tracker_starting will raise HttpErrorConflict if tracking is already in progress on
    # this video.
    tracker_uuid = storage.tracker_starting(team_uuid, video_uuid, tracker_name, scale, init_frame_number, init_bboxes_text)
    action_parameters = action.create_action_parameters(
        team_uuid, action.ACTION_NAME_TRACKING)
    action_parameters['video_uuid'] = video_uuid
    action_parameters['tracker_uuid'] = tracker_uuid
    action.trigger_action_via_blob(action_parameters)
    return tracker_uuid
