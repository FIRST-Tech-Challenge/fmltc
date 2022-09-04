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
import json
import logging
import traceback

# My Modules
from app_engine import action
from app_engine import storage
from app_engine import util
import cf_dataset_producer
import cf_dataset_zipper
import cf_frame_extractor
import cf_model_trainer
import cf_tflite_creator
import cf_tracking

def perform_action_from_blob(action_parameters_blob_name, time_limit):
    blob = util.storage_client().get_bucket(action.BUCKET_ACTION_PARAMETERS).blob(action_parameters_blob_name)
    # If the blob no longer exists, this event is a duplicate and is ignored.
    if blob.exists():
        action_parameters_json = blob.download_as_string()
        blob.delete()
        action_parameters = json.loads(action_parameters_json)
        __perform_action(action_parameters, time_limit)


def __perform_action(action_parameters, time_limit):
    action_parameters[action.ACTION_TIME_LIMIT] = time_limit
    logging.info('action.__perform_action - %s - start' % action_parameters[action.ACTION_NAME])
    storage.action_on_start(action_parameters[action.ACTION_UUID], action_parameters[action.ACTION_IS_ADMIN_ACTION])

    action_fns = {
        action.ACTION_NAME_TEST: action.test, # For debugging purposes only
        action.ACTION_NAME_WAIT_FOR_VIDEO_UPLOAD: cf_frame_extractor.wait_for_video_upload,
        action.ACTION_NAME_FRAME_EXTRACTION: cf_frame_extractor.extract_frames,
        action.ACTION_NAME_TRACKING: cf_tracking.start_tracking,
        action.ACTION_NAME_DATASET_PRODUCE: cf_dataset_producer.produce_dataset,
        action.ACTION_NAME_DATASET_PRODUCE_RECORD: cf_dataset_producer.produce_dataset_record,
        action.ACTION_NAME_DELETE_DATASET_RECORD_WRITERS: storage.finish_delete_dataset_record_writers,
        action.ACTION_NAME_DATASET_ZIP: cf_dataset_zipper.zip_dataset,
        action.ACTION_NAME_DATASET_ZIP_PARTITION: cf_dataset_zipper.zip_dataset_partition,
        action.ACTION_NAME_MONITOR_TRAINING: cf_model_trainer.monitor_training,
        action.ACTION_NAME_CREATE_TFLITE: cf_tflite_creator.create_tflite,
        action.ACTION_NAME_DELETE_MODEL: storage.finish_delete_model,
        action.ACTION_NAME_DELETE_DATASET: storage.finish_delete_dataset,
        action.ACTION_NAME_DELETE_VIDEO: storage.finish_delete_video,
        action.ACTION_NAME_RESET_REMAINING_TRAINING_MINUTES: storage.reset_remaining_training_minutes,
        action.ACTION_NAME_INCREMENT_REMAINING_TRAINING_MINUTES: storage.increment_remaining_training_minutes,
        action.ACTION_NAME_SAVE_END_OF_SEASON_ENTITIES: storage.save_end_of_season_entities,
    }
    action_fn = action_fns.get(action_parameters[action.ACTION_NAME], None)
    if action_fn is not None:
        try:
            action_fn(action_parameters)
        except action.Stop as e:
            pass
        except:
            logging.critical('action.__perform_action - %s exception!!! action_parameters: %s traceback: %s' %
                (action_parameters[action.ACTION_NAME], str(action_parameters), traceback.format_exc().replace('\n', ' ... ')))
    else:
        logging.warning('action.__perform_action - %s - action_fn is None' % action_parameters[action.ACTION_NAME])

    if action.ACTION_RETRIGGERED not in action_parameters:
        logging.info('action.__perform_action - %s - finish' % action_parameters[action.ACTION_NAME])
        storage.action_on_finish(action_parameters[action.ACTION_UUID], action_parameters[action.ACTION_IS_ADMIN_ACTION], action_parameters)
