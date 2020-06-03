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
import os
import time
import traceback

# Other Modules
from google.oauth2 import service_account
import googleapiclient.discovery
from tensorflow.python.summary.summary_iterator import summary_iterator

# My Modules
import action
import blob_storage
import constants
import storage
import util

BUCKET = ('%s' % constants.PROJECT_ID)

def start_training_model(team_uuid, dataset_uuid, max_running_minutes, start_time_ms):
    # Call retrieve_model_list to update all models and update the team_entity.
    retrieve_model_list(team_uuid)
    # storage.model_trainer_starting will raise an exception if the team doesn't have enough
    # training time left.
    model_uuid = storage.model_trainer_starting(team_uuid, max_running_minutes)
    try:
        object_detection_tar_gz = 'gs://%s/static/training/object_detection-0.1.tar.gz' % BUCKET
        slim_tar_gz = 'gs://%s/static/training/slim-0.1.tar.gz' % BUCKET
        pycocotools_tar_gz = 'gs://%s/static/training/pycocotools-2.0.tar.gz' % BUCKET
        fine_tune_checkpoint = 'gs://%s/static/training/models/ssd_mobilenet_v1_0.75_depth_300x300_coco14_sync_2018_07_03/model.ckpt' % BUCKET

        dataset_entity = storage.retrieve_dataset_entity(team_uuid, dataset_uuid)

        # Create the pipeline.config file and store it in cloud storage.
        bucket = util.storage_client().get_bucket(BUCKET)
        config_template_blob_name = 'static/training/models/configs/ssd_mobilenet_v1_0.75_depth_quantized_300x300_pets_sync.config'
        pipeline_config = (bucket.blob(config_template_blob_name).download_as_string().decode('utf-8')
            .replace('TO_BE_CONFIGURED/num_classes', str(len(dataset_entity['sorted_label_list'])))
            .replace('TO_BE_CONFIGURED/fine_tune_checkpoint', fine_tune_checkpoint)
            .replace('TO_BE_CONFIGURED/train_input_path', dataset_entity['train_input_path'])
            .replace('TO_BE_CONFIGURED/label_map_path', dataset_entity['label_map_path'])
            .replace('TO_BE_CONFIGURED/eval_input_path', dataset_entity['eval_input_path'])
            .replace('TO_BE_CONFIGURED/num_examples', str(dataset_entity['eval_frame_count']))
            )
        pipeline_config_path = blob_storage.store_pipeline_config(team_uuid, model_uuid, pipeline_config)

        model_dir = blob_storage.get_model_folder_path(team_uuid, model_uuid)
        job_dir = model_dir
        checkpoint_dir = model_dir

        ml = __get_ml_service()
        parent = __get_parent()
        train_job_id = __get_train_job_id(model_uuid)
        scheduling = {
            'maxRunningTime': '%ds' % (max_running_minutes * 60),
        }
        train_training_input = {
            'scaleTier': 'BASIC_TPU',
            'packageUris': [
                object_detection_tar_gz,
                slim_tar_gz,
                pycocotools_tar_gz,
            ],
            'pythonModule': 'object_detection.model_tpu_main',
            'args': [
                '--model_dir', model_dir,
                '--tpu_zone', 'us-central1',
                '--pipeline_config_path', pipeline_config_path,
            ],
            # TODO(lizlooney): Specify hyperparameters.
            #'hyperparameters': {
            #  object (HyperparameterSpec)
            #},
            'region': 'us-central1', # Don't hardcode?
            'jobDir': job_dir,
            'runtimeVersion': '1.15',
            'pythonVersion': '3.7',
            'scheduling': scheduling,
        }
        train_job = {
            'jobId': train_job_id,
            'trainingInput': train_training_input,
        }
        train_job_response = ml.projects().jobs().create(parent=parent, body=train_job).execute()
    except:
        util.log('model_trainer.start_training_model - creating training job - except %s' %
            traceback.format_exc().replace('\n', ' ... '))
        # storage.failed_to_start_training will adjust the team's remaining training time.
        storage.model_trainer_failed_to_start(team_uuid, model_uuid, max_running_minutes)
        raise

    try:
        if dataset_entity['eval_record_count'] > 0:
            eval_job_id = __get_eval_job_id(model_uuid)
            eval_training_input = {
                'scaleTier': 'BASIC_GPU',
                'packageUris': [
                    object_detection_tar_gz,
                    slim_tar_gz,
                    pycocotools_tar_gz,
                ],
                'pythonModule': 'object_detection.model_main',
                'args': [
                    '--model_dir', model_dir,
                    '--pipeline_config_path', pipeline_config_path,
                    '--checkpoint_dir', checkpoint_dir,
                ],
                # TODO(lizlooney): Specify hyperparameters.
                #'hyperparameters': {
                #  object (HyperparameterSpec)
                #},
                'region': 'us-central1',
                'jobDir': job_dir,
                'runtimeVersion': '1.15',
                'pythonVersion': '3.7',
                'scheduling': scheduling,
            }
            eval_job = {
                'jobId': eval_job_id,
                'trainingInput': eval_training_input,
            }
            eval_job_response = ml.projects().jobs().create(parent=parent, body=eval_job).execute()
        else:
            eval_job_response = None
    except:
        util.log('model_trainer.start_training_model - creating eval job - except %s' %
            traceback.format_exc().replace('\n', ' ... '))
        # storage.model_trainer_failed_to_start will adjust the team's remaining training time.
        storage.model_trainer_failed_to_start(team_uuid, model_uuid, max_running_minutes)
        # Cancel the training job.
        ml.projects().jobs().cancel(name=__get_train_job_name(model_uuid)).execute()
        raise
    model_entity = storage.model_trainer_started(team_uuid, model_uuid,
        dataset_uuid, max_running_minutes, start_time_ms,
        dataset_entity['video_filenames'], fine_tune_checkpoint,
        train_job_response, eval_job_response)
    return model_entity

def retrieve_model_list(team_uuid):
    model_entities = storage.retrieve_model_list(team_uuid)
    ml = None
    for model_entity in model_entities:
        model_entity, ml = update_model_entity(model_entity, ml)
    return model_entities

def retrieve_model_entity(team_uuid, model_uuid):
    model_entity = storage.retrieve_model_entity(team_uuid, model_uuid)
    model_entity, _ = update_model_entity(model_entity)
    return model_entity

def update_model_entity(model_entity, ml=None):
    # If the train and eval jobs weren't done last time we checked, check now.
    if is_not_done(model_entity):
        if ml is None:
            ml = __get_ml_service()
        train_job_name = __get_train_job_name(model_entity['model_uuid'])
        train_job_response = ml.projects().jobs().get(name=train_job_name).execute()
        if model_entity['eval_job']:
            eval_job_name = __get_eval_job_name(model_entity['model_uuid'])
            eval_job_response = ml.projects().jobs().get(name=eval_job_name).execute()
            # If the train job has failed or been cancelled, cancel the eval job is it's still alive.
            if __is_dead_or_dying(train_job_response['state']) and __is_alive(eval_job_response['state']):
                ml.projects().jobs().cancel(name=eval_job_name).execute()
                eval_job_response = ml.projects().jobs().get(name=eval_job_name).execute()
        else:
            eval_job_response = None
        model_entity = storage.update_model_entity(
            model_entity['team_uuid'], model_entity['model_uuid'], train_job_response, eval_job_response)
    return model_entity, ml

def is_not_done(model_entity):
    return (
        __is_not_done(model_entity['train_job_state']) or
        __is_not_done(model_entity['eval_job_state']))

def is_done(model_entity):
    return (
        __is_done(model_entity['train_job_state']) and
        __is_done(model_entity['eval_job_state']))

def cancel_training_model(team_uuid, model_uuid):
    model_entity = storage.retrieve_model_entity(team_uuid, model_uuid)
    ml = __get_ml_service()
    train_job_name = __get_train_job_name(model_uuid)
    train_job_response = ml.projects().jobs().get(name=train_job_name).execute()
    if __is_alive(train_job_response['state']):
        try:
            ml.projects().jobs().cancel(name=train_job_name).execute()
        except:
            util.log('model_trainer.cancel_training_model - canceling training job - except %s' %
                traceback.format_exc().replace('\n', ' ... '))
    if model_entity['eval_job']:
        eval_job_name = __get_eval_job_name(model_uuid)
        eval_job_response = ml.projects().jobs().get(name=eval_job_name).execute()
        if __is_alive(eval_job_response['state']):
            try:
                ml.projects().jobs().cancel(name=eval_job_name).execute()
            except:
                util.log('model_trainer.cancel_training_model - canceling eval job - except %s' %
                    traceback.format_exc().replace('\n', ' ... '))

def __get_ml_service():
    scopes = ['https://www.googleapis.com/auth/cloud-platform']
    credentials = service_account.Credentials.from_service_account_file('key.json', scopes=scopes)
    return googleapiclient.discovery.build(
        serviceName='ml', version='v1', credentials=credentials, cache_discovery=False)

def __get_parent():
    # TODO(lizlooney): Is the project id here supposed to be our Google Cloud Project ID?
    return 'projects/%s' % constants.PROJECT_ID

def __get_train_job_id(model_uuid):
    return 'train_%s' % model_uuid

def __get_eval_job_id(model_uuid):
    return 'eval_%s' % model_uuid

def __get_train_job_name(model_uuid):
    return '%s/jobs/%s' % (__get_parent(), __get_train_job_id(model_uuid))

def __get_eval_job_name(model_uuid):
    return '%s/jobs/%s' % (__get_parent(), __get_eval_job_id(model_uuid))

def __is_alive(state):
    return (state == 'QUEUED' or
            state == 'PREPARING' or
            state == 'RUNNING')

def __is_dead_or_dying(state):
    return (state == 'FAILED' or
            state == 'CANCELLING' or
            state == 'CANCELLED')

def __is_not_done(state):
    return (state != '' and
            state != 'SUCCEEDED' and
            state != 'FAILED' and
            state != 'CANCELLED')

def __is_done(state):
    return not __is_not_done(state)


def retrieve_summaries(team_uuid, model_uuid):
    training_folder, training_event_file_path, _ = blob_storage.get_training_event_file_path(
            team_uuid, model_uuid)
    if training_event_file_path is None:
        training_summaries = []
    else:
        training_summaries = retrieve_summaries_for_event_file(team_uuid, model_uuid,
            training_folder, training_event_file_path)

    eval_folder, eval_event_file_path, _ = blob_storage.get_eval_event_file_path(
        team_uuid, model_uuid)
    if eval_event_file_path is None:
        eval_summaries = []
    else:
        eval_summaries = retrieve_summaries_for_event_file(team_uuid, model_uuid,
            eval_folder, eval_event_file_path)

    return training_summaries, eval_summaries


def retrieve_summaries_for_event_file(team_uuid, model_uuid, folder, event_file_path):
    summaries = []
    for event in summary_iterator(event_file_path):
        values = {}
        for value in event.summary.value:
            if value.HasField('simple_value'):
                values[value.tag] = value.simple_value
            elif value.HasField('image'):
                exists, image_url = blob_storage.get_event_summary_image_download_url(team_uuid, model_uuid,
                    folder, event.step, value.tag, value.image.encoded_image_string)
                if exists:
                    values[value.tag] = {
                        'width': value.image.width,
                        'height': value.image.height,
                        'image_url': image_url,
                    }
        if len(values) > 0:
            summary = {
                'step': event.step,
            }
            summary['values'] = values
            summaries.append(summary)
    return summaries

def make_action_parameters(team_uuid, model_uuid):
    action_parameters = action.create_action_parameters(action.ACTION_NAME_EXTRACT_SUMMARY_IMAGES)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['model_uuid'] = model_uuid
    return action_parameters

def extract_summary_images(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    model_uuid = action_parameters['model_uuid']

    previous_training_updated = None
    previous_eval_updated = None

    while True:
        model_entity = retrieve_model_entity(team_uuid, model_uuid)

        training_folder, training_event_file_path, training_updated = blob_storage.get_training_event_file_path(
                team_uuid, model_uuid)
        if training_event_file_path is not None and training_updated != previous_training_updated:
            need_restart = extract_summary_images_for_event_file(team_uuid, model_uuid,
                training_folder, training_event_file_path,
                action_parameters, time_limit, active_memory_limit)
            if need_restart:
                action.trigger_action_via_blob(action_parameters)
                return
        previous_training_updated = training_updated

        eval_folder, eval_event_file_path, eval_updated = blob_storage.get_eval_event_file_path(
                team_uuid, model_uuid)
        if eval_event_file_path is not None and eval_updated != previous_eval_updated:
            need_restart = extract_summary_images_for_event_file(team_uuid, model_uuid,
                eval_folder, eval_event_file_path,
                action_parameters, time_limit, active_memory_limit)
            if need_restart:
                action.trigger_action_via_blob(action_parameters)
                return
        previous_eval_updated = eval_updated

        if is_done(model_entity):
            return

        if datetime.now() < time_limit - timedelta(minutes=3):
            time.sleep(150)
        elif datetime.now() < time_limit - timedelta(minutes=2):
            time.sleep(90)
        elif datetime.now() < time_limit - timedelta(minutes=1):
            time.sleep(30)

        if action.is_near_limit(time_limit, active_memory_limit):
            action.trigger_action_via_blob(action_parameters)
            return


def extract_summary_images_for_event_file(team_uuid, model_uuid, folder, event_file_path,
        action_parameters, time_limit, active_memory_limit):
    for event in summary_iterator(event_file_path):
        if action.is_near_limit(time_limit, active_memory_limit):
            return True
        for value in event.summary.value:
            if value.HasField('image'):
                blob_storage.store_event_summary_image(team_uuid, model_uuid,
                    folder, event.step, value.tag, value.image.encoded_image_string)
    return False
