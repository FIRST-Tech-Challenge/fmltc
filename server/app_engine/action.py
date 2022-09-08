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
import json
import logging
import uuid

# Other Modules
import psutil

# My Modules
import constants
import storage
import util

BUCKET_ACTION_PARAMETERS = ('%s-action-parameters' % constants.PROJECT_ID)

ACTIVE_MEMORY_LIMIT = 2000000000

# action_parameter fields
# All the fields defined here begin with 'action'.
# That distinguishes them from fields defined in other files.
ACTION_TEAM_UUID = 'action_team_uuid'
ACTION_NAME = 'action_name'
ACTION_UUID = 'action_uuid'
ACTION_IS_ADMIN_ACTION = 'action_is_admin_action'
ACTION_TIME_LIMIT = 'action_time_limit'
ACTION_RETRIGGERED = 'action_retriggered'

# ACTION_NAME values
ACTION_NAME_TEST = 'test' # For debugging purposes only
ACTION_NAME_WAIT_FOR_VIDEO_UPLOAD = 'wait_for_video_upload'
ACTION_NAME_FRAME_EXTRACTION = 'frame_extraction'
ACTION_NAME_TRACKING = 'tracking'
ACTION_NAME_DATASET_PRODUCE = 'dataset_produce'
ACTION_NAME_DATASET_PRODUCE_RECORD = 'dataset_produce_record'
ACTION_NAME_DELETE_DATASET_RECORD_WRITERS = 'delete_dataset_record_writers'
ACTION_NAME_DATASET_ZIP = 'dataset_zip'
ACTION_NAME_DATASET_ZIP_PARTITION = 'dataset_zip_partition'
ACTION_NAME_MONITOR_TRAINING = 'monitor_training'
ACTION_NAME_CREATE_TFLITE = 'create_tflite'
ACTION_NAME_DELETE_MODEL = 'delete_model'
ACTION_NAME_DELETE_DATASET = 'delete_dataset'
ACTION_NAME_DELETE_VIDEO = 'delete_video'
ACTION_NAME_RESET_REMAINING_TRAINING_MINUTES = 'reset_remaining_training_minutes'
ACTION_NAME_INCREMENT_REMAINING_TRAINING_MINUTES = 'increment_remaining_training_minutes'
ACTION_NAME_SAVE_END_OF_SEASON_ENTITIES = 'save_end_of_season_entities'
ACTION_NAME_EXPUNGE_STORAGE = 'expunge_storage'
ACTION_NAME_EXPUNGE_BLOB_STORAGE = 'expunge_blob_storage'

def create_action_parameters(team_uuid, action_name):
    if (action_name == ACTION_NAME_RESET_REMAINING_TRAINING_MINUTES or
            action_name == ACTION_NAME_INCREMENT_REMAINING_TRAINING_MINUTES or
            action_name == ACTION_NAME_SAVE_END_OF_SEASON_ENTITIES or
            action_name == ACTION_NAME_EXPUNGE_STORAGE or
            action_name == ACTION_NAME_EXPUNGE_BLOB_STORAGE or
            action_name == ACTION_NAME_TEST):
        is_admin_action = True
    else:
        is_admin_action = False
    return {
        ACTION_TEAM_UUID: team_uuid,
        ACTION_NAME: action_name,
        ACTION_IS_ADMIN_ACTION: is_admin_action,
    }


def trigger_action_via_blob(action_parameters_arg):
    # Copy the given action_parameters and remove the ACTION_TIME_LIMIT and ACTION_RETRIGGERED
    # fields from the copy.
    action_parameters = action_parameters_arg.copy()
    action_parameters.pop(ACTION_TIME_LIMIT, None)
    action_parameters.pop(ACTION_RETRIGGERED, None)

    # Create the action_entity.
    if ACTION_UUID not in action_parameters:
        team_uuid = action_parameters[ACTION_TEAM_UUID]
        action_name = action_parameters[ACTION_NAME]
        is_admin_action = action_parameters[ACTION_IS_ADMIN_ACTION]
        # Check whether there is already an action with these parameters.
        action_entities = storage.retrieve_action_list(team_uuid, action_name)
        found_existing_action = False
        for action_entity in action_entities:
            action_entity_parameters = action_entity['action_parameters']
            # Only check the parameters that are in action_parameters. action_entity_parameters
            # has additional parameters that are added after the action starts.
            parameters_equal = True
            for key in action_parameters:
                if key not in action_entity_parameters:
                    parameters_equal = False
                    break
                if action_parameters[key] != action_entity_parameters[key]:
                    parameters_equal = False
                    break
            if parameters_equal:
                time = action_entity['create_time']
                len_start_times = len(action_entity['start_times'])
                if len_start_times > 0:
                    len_stop_times = len(action_entity['stop_times'])
                    if len_start_times > len_stop_times:
                        time = action_entity['start_times'][len_start_times-1]
                    else:
                        time = action_entity['stop_times'][len_stop_times-1]
                time_delta = datetime.now(timezone.utc) - time
                if time_delta > timedelta(minutes=15):
                    logging.warning('action.trigger_action_via_blob - %s - found duplicate action that is %s old' %
                            (action_name, str(time_delta)))
                    storage.action_on_remove_old_action(action_entity)
                else:
                    found_existing_action = True
                    break
        if found_existing_action:
            logging.warning('action.trigger_action_via_blob - %s - ignoring duplicate action' %
                    action_name)
            return
        action_parameters[ACTION_UUID] = storage.action_on_create(
            team_uuid, action_name, is_admin_action, action_parameters)

    # Write the copied action_parameters to trigger the cloud function.
    action_parameters_blob_name= '%s/%s' % (action_parameters[ACTION_NAME], str(uuid.uuid4().hex))
    action_parameters_json = json.dumps(action_parameters)
    blob = util.storage_client().bucket(BUCKET_ACTION_PARAMETERS).blob(action_parameters_blob_name)
    logging.info('action.trigger_action_via_blob - %s' % action_parameters[ACTION_NAME])
    blob.upload_from_string(action_parameters_json, content_type="text/json")
    return action_parameters[ACTION_UUID]


def retrigger_now(action_parameters):
    if ACTION_RETRIGGERED not in action_parameters:
        logging.info('action.retrigger_now - %s - stop' % action_parameters[ACTION_NAME])
        storage.action_on_stop(action_parameters[ACTION_UUID], action_parameters[ACTION_IS_ADMIN_ACTION])
        trigger_action_via_blob(action_parameters)
        action_parameters[ACTION_RETRIGGERED] = True
    raise Stop()


def retrigger_if_necessary(action_parameters):
    if remaining_timedelta(action_parameters) <= timedelta(seconds=70):
        retrigger_now(action_parameters)
    if psutil.virtual_memory().active >= ACTIVE_MEMORY_LIMIT:
        retrigger_now(action_parameters)


def remaining_timedelta(action_parameters):
    return action_parameters[ACTION_TIME_LIMIT] - datetime.now(timezone.utc)


class Stop(Exception):
  def __init__(self):
    Exception.__init__(self)


# test is for debugging purposes only.
def test(action_parameters):
    logging.info('action.test')
