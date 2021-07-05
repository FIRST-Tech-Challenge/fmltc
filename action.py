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
import json
import time
import traceback
import uuid

# Other Modules
import psutil

# My Modules
import constants
import dataset_producer
import dataset_zipper
import frame_extractor
import model_trainer
import storage
import tflite_creator
import tracking
import util

BUCKET_ACTION_PARAMETERS = ('%s-action-parameters' % constants.PROJECT_ID)

ACTIVE_MEMORY_LIMIT = 2000000000

ACTION_NAME = 'action_name'
ACTION_RETRIGGERED = 'action_retriggered'
ACTION_TIME_LIMIT = 'action_time_limit'
ACTION_UUID = 'action_uuid'

ACTION_NAME_TEST = 'test' # For testing purposes
ACTION_NAME_DATASET_PRODUCE = 'dataset_produce'
ACTION_NAME_DATASET_PRODUCE_RECORD = 'dataset_produce_record'
ACTION_NAME_DELETE_DATASET_RECORD_WRITERS = 'delete_dataset_record_writers'
ACTION_NAME_DATASET_ZIP = 'dataset_zip'
ACTION_NAME_DATASET_ZIP_PARTITION = 'dataset_zip_partition'
ACTION_NAME_DELETE_DATASET = 'delete_dataset'
ACTION_NAME_DELETE_MODEL = 'delete_model'
ACTION_NAME_DELETE_VIDEO = 'delete_video'
ACTION_NAME_MONITOR_TRAINING = 'monitor_training'
ACTION_NAME_FRAME_EXTRACTION = 'frame_extraction'
ACTION_NAME_TRACKING = 'tracking'
ACTION_NAME_CREATE_TFLITE = 'create_tflite'

def create_action_parameters(action_name):
    return {
        ACTION_NAME: action_name,
    }


def trigger_action_via_blob(action_parameters):
    # Copy the given action_parameters and remove the action_time_limit entry from the copy
    action_parameters_copy = action_parameters.copy()
    action_parameters_copy.pop(ACTION_TIME_LIMIT, None)
    action_parameters_copy.pop(ACTION_RETRIGGERED, None)
    # Write the copied action_parameters to trigger the cloud function.
    action_parameters_blob_name= '%s/%s' % (action_parameters_copy[ACTION_NAME], str(uuid.uuid4().hex))
    action_parameters_json = json.dumps(action_parameters_copy)
    blob = util.storage_client().bucket(BUCKET_ACTION_PARAMETERS).blob(action_parameters_blob_name)
    util.log('action.trigger_action_via_blob - %s' % action_parameters_copy[ACTION_NAME])
    blob.upload_from_string(action_parameters_json, content_type="text/json")


def perform_action_from_blob(action_parameters_blob_name, time_limit):
    blob = util.storage_client().get_bucket(BUCKET_ACTION_PARAMETERS).blob(action_parameters_blob_name)
    # If the blob no longer exists, this event is a duplicate and is ignored.
    if blob.exists():
        action_parameters_json = blob.download_as_string()
        blob.delete()
        action_parameters = json.loads(action_parameters_json)
        perform_action(action_parameters, time_limit)


def perform_action(action_parameters, time_limit):
    action_parameters[ACTION_TIME_LIMIT] = time_limit
    if ACTION_UUID not in action_parameters:
        util.log('action.perform_action - %s - create' % action_parameters[ACTION_NAME])
        action_parameters[ACTION_UUID] = storage.action_on_create(action_parameters[ACTION_NAME])
    util.log('action.perform_action - %s - start' % action_parameters[ACTION_NAME])
    storage.action_on_start(action_parameters[ACTION_UUID])


    action_fns = {
        ACTION_NAME_TEST: test,
        ACTION_NAME_DATASET_PRODUCE: dataset_producer.produce_dataset,
        ACTION_NAME_DATASET_PRODUCE_RECORD: dataset_producer.produce_dataset_record,
        ACTION_NAME_DELETE_DATASET_RECORD_WRITERS: storage.finish_delete_dataset_record_writers,
        ACTION_NAME_DATASET_ZIP: dataset_zipper.zip_dataset,
        ACTION_NAME_DATASET_ZIP_PARTITION: dataset_zipper.zip_dataset_partition,
        ACTION_NAME_DELETE_DATASET: storage.finish_delete_dataset,
        ACTION_NAME_DELETE_MODEL: storage.finish_delete_model,
        ACTION_NAME_DELETE_VIDEO: storage.finish_delete_video,
        ACTION_NAME_MONITOR_TRAINING: model_trainer.monitor_training,
        ACTION_NAME_FRAME_EXTRACTION: frame_extractor.extract_frames,
        ACTION_NAME_TRACKING: tracking.start_tracking,
        ACTION_NAME_CREATE_TFLITE: tflite_creator.create_tflite,
    }
    action_fn = action_fns.get(action_parameters[ACTION_NAME], None)
    if action_fn is not None:
        try:
            action_fn(action_parameters)
        except Stop as e:
            pass
        except:
            util.log('action.perform_action - %s exception!!! action_parameters: %s traceback: %s' %
                (action_parameters[ACTION_NAME], str(action_parameters), traceback.format_exc().replace('\n', ' ... ')))
    else:
        util.log('action.perform_action - %s - action_fn is None' % action_parameters[ACTION_NAME])

    util.log('action.perform_action - %s - stop' % action_parameters[ACTION_NAME])
    storage.action_on_stop(action_parameters[ACTION_UUID])
    if ACTION_RETRIGGERED not in action_parameters:
        util.log('action.perform_action - %s - destroy' % action_parameters[ACTION_NAME])
        storage.action_on_destroy(action_parameters[ACTION_UUID])


def __retrigger_action(action_parameters):
    if ACTION_RETRIGGERED not in action_parameters:
        trigger_action_via_blob(action_parameters)
        action_parameters[ACTION_RETRIGGERED] = True


def retrigger_if_necessary(action_parameters):
    if remaining_timedelta(action_parameters) <= timedelta(seconds=70):
        __retrigger_action(action_parameters)
        if remaining_timedelta(action_parameters) <= timedelta(seconds=30):
            raise Stop()
        # If there's more than 30 seconds remaining, let this function keep running.
    if psutil.virtual_memory().active >= ACTIVE_MEMORY_LIMIT:
        __retrigger_action(action_parameters)
        raise Stop()


class Stop(Exception):
  def __init__(self):
    Exception.__init__(self)


def remaining_timedelta(action_parameters):
    return action_parameters[ACTION_TIME_LIMIT] - datetime.now()


def test(action_parameters):
    action_finish_time = action_parameters['action_finish_time']
    while util.ms_from_datetime(datetime.now(timezone.utc)) < action_finish_time:
        time.sleep(20)
        retrigger_if_necessary(action_parameters)
