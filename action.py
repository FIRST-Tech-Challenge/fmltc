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
from datetime import datetime, timedelta
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
import storage
import tracking
import util

BUCKET_ACTION_PARAMETERS = ('%s-action-parameters' % constants.PROJECT_ID)

ACTION_NAME = 'action_name'
ACTION_NAME_SLEEP = 'sleep' # For testing purposes
ACTION_NAME_DATASET_PRODUCE = 'dataset_produce'
ACTION_NAME_DATASET_PRODUCE_RECORD = 'dataset_produce_record'
ACTION_NAME_DATASET_ZIP = 'dataset_zip'
ACTION_NAME_DATASET_ZIP_PARTITION = 'dataset_zip_partition'
ACTION_NAME_DELETE_DATASET = 'delete_dataset'
ACTION_NAME_DELETE_MODEL = 'delete_model'
ACTION_NAME_DELETE_VIDEO = 'delete_video'
ACTION_NAME_FRAME_EXTRACTION = 'frame_extraction'
ACTION_NAME_TRACKING = 'tracking'


def create_action_parameters(action_name):
    return {
        ACTION_NAME: action_name,
    }


def trigger_action_via_blob(action_parameters):
    action_parameters_blob_name= '%s/%s' % (action_parameters[ACTION_NAME], str(uuid.uuid4().hex))
    action_parameters_json = json.dumps(action_parameters)
    blob = util.storage_client().bucket(BUCKET_ACTION_PARAMETERS).blob(action_parameters_blob_name)
    blob.upload_from_string(action_parameters_json, content_type="text/json")
    return action_parameters


def perform_action_from_blob(action_parameters_blob_name, time_limit, active_memory_limit):
    blob = util.storage_client().get_bucket(BUCKET_ACTION_PARAMETERS).blob(action_parameters_blob_name)
    # If the blob no longer exists, this event is a duplicate and is ignored.
    if blob.exists():
        action_parameters_json = blob.download_as_string()
        blob.delete()
        action_parameters = json.loads(action_parameters_json)
        perform_action(action_parameters, time_limit, active_memory_limit)


def perform_action(action_parameters, time_limit, active_memory_limit):
    if ACTION_NAME not in action_parameters:
        util.log('action.perform_action - start')
        util.log('action.perform_action - end')
        return

    util.log('action.perform_action - %s - start' % action_parameters[ACTION_NAME])

    action_fns = {
        ACTION_NAME_SLEEP: sleep_a_bit,
        ACTION_NAME_DATASET_PRODUCE: dataset_producer.produce_dataset,
        ACTION_NAME_DATASET_PRODUCE_RECORD: dataset_producer.produce_dataset_record,
        ACTION_NAME_DATASET_ZIP: dataset_zipper.zip_dataset,
        ACTION_NAME_DATASET_ZIP_PARTITION: dataset_zipper.zip_dataset_partition,
        ACTION_NAME_DELETE_DATASET: storage.finish_delete_dataset,
        ACTION_NAME_DELETE_MODEL: storage.finish_delete_model,
        ACTION_NAME_DELETE_VIDEO: storage.finish_delete_video,
        ACTION_NAME_FRAME_EXTRACTION: frame_extractor.extract_frames,
        ACTION_NAME_TRACKING: tracking.start_tracking,
    }
    action_fn = action_fns.get(action_parameters[ACTION_NAME], None)
    if action_fn is not None:
        try:
            action_fn(action_parameters, time_limit, active_memory_limit)
        except:
            util.log('action.perform_action - %s except %s' %
                (action_parameters[ACTION_NAME], traceback.format_exc().replace('\n', ' ... ')))
            raise
    else:
        util.log('action.perform_action - %s - action_fn is null' % action_parameters[ACTION_NAME])

    util.log('action.perform_action - %s - end' % action_parameters[ACTION_NAME])


def is_near_limit(time_limit, active_memory_limit):
    if datetime.now() >= time_limit - timedelta(seconds=30):
        return True
    if psutil.virtual_memory().active >= active_memory_limit:
        return True
    return False

def sleep_a_bit(action_parameters, time_limit, active_memory_limit):
    time.sleep(20)
