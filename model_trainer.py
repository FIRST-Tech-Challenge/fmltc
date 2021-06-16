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
import json
import logging
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
import exceptions
import storage
import util

BUCKET = ('%s' % constants.PROJECT_ID)

STARTING_MODELS = {
    #Takes too long 'ssd_mobilenet_v1_0.75_depth_300x300_coco14_sync': 'ssd_mobilenet_v1_0.75_depth_300x300_coco14_sync_2018_07_03',
    'ssd_mobilenet_v1_0.75_depth_quantized_300x300_coco14_sync': 'ssd_mobilenet_v1_0.75_depth_quantized_300x300_coco14_sync_2018_07_18',
    #Model never detects any objects 'ssd_mobilenet_v1_fpn_shared_box_predictor_640x640_coco14_sync': 'ssd_mobilenet_v1_fpn_shared_box_predictor_640x640_coco14_sync_2018_07_03',
    #'ssd_mobilenet_v1_ppn_shared_box_predictor_300x300_coco14_sync': 'ssd_mobilenet_v1_ppn_shared_box_predictor_300x300_coco14_sync_2018_07_03',
    #'ssd_mobilenet_v1_quantized_300x300_coco14_sync': 'ssd_mobilenet_v1_quantized_300x300_coco14_sync_2018_07_18',
}

def get_starting_model_names():
    names = list(STARTING_MODELS.keys())
    names.sort()
    return names

def get_normalized_input_image_tensor(starting_model_name):
    if '640x640' in starting_model_name:
        return [1, 640, 640, 3]
    elif '300x300' in starting_model_name:
        return [1, 300, 300, 3]
    else:
        message = 'Error: cannot determine normalized_input_image_tensor for %s.' % starting_model_name
        logging.critical(message)
        raise exceptions.HttpErrorInternalServerError(message)

def start_training_model(team_uuid, description, dataset_uuids_json,
        starting_model, max_running_minutes, num_training_steps, create_time_ms):
    # Call retrieve_model_list to update all models (which may have finished training) and update
    # the team_entity.
    model_entities = retrieve_model_list(team_uuid)

    found_starting_model = False
    for starting_model_name, starting_model_checkpoint in STARTING_MODELS.items():
        if starting_model == starting_model_name:
            found_starting_model = True
            starting_model_uuid = None
            starting_model_entity = None
            user_visible_starting_model = starting_model
            original_starting_model = starting_model
            fine_tune_checkpoint = 'gs://%s/static/training/models/%s/model.ckpt' % (
                BUCKET, starting_model_checkpoint)
            break
    if not found_starting_model:
        # starting_model is the model_uuid of one of the user's own models.
        starting_model_uuid = starting_model
        starting_model_entity = retrieve_model_entity(team_uuid, starting_model_uuid)
        if starting_model_entity['trained_checkpoint_path'] == '':
            message = 'Error: Trained checkpoint not found for model_uuid=%s.' % starting_model_uuid
            logging.critical(message)
            raise exceptions.HttpErrorNotFound(message)
        # user_visible_starting_model is the description of that model.
        user_visible_starting_model = starting_model_entity['description']
        original_starting_model = starting_model_entity['original_starting_model']
        fine_tune_checkpoint = starting_model_entity['trained_checkpoint_path']

    # storage.model_trainer_starting will raise an exception if the team doesn't have enough
    # training time left.
    model_uuid = storage.model_trainer_starting(team_uuid, max_running_minutes)
    try:
        object_detection_tar_gz = 'gs://%s/static/training/object_detection-0.1.tar.gz' % BUCKET
        slim_tar_gz = 'gs://%s/static/training/slim-0.1.tar.gz' % BUCKET
        pycocotools_tar_gz = 'gs://%s/static/training/pycocotools-2.0.tar.gz' % BUCKET

        dataset_uuid_list = json.loads(dataset_uuids_json)
        dataset_entities = storage.retrieve_dataset_entities(team_uuid, dataset_uuid_list)
        if len(dataset_entities) != len(dataset_uuid_list):
            message = 'Error: One or more datasets not found for dataset_uuids=%s.' % dataset_uuids_json
            logging.critical(message)
            raise exceptions.HttpErrorNotFound(message)

        previous_training_steps = 0
        dataset_uuids = []
        train_input_path = []
        eval_input_path = []
        train_frame_count = 0
        eval_frame_count = 0
        train_negative_frame_count = 0
        eval_negative_frame_count = 0
        train_dict_label_to_count = {}
        eval_dict_label_to_count = {}
        sorted_label_list = None
        label_map_path = None
        if starting_model_entity is not None:
            previous_training_steps += starting_model_entity['previous_training_steps']
            dataset_uuids.extend(starting_model_entity['dataset_uuids'])
            train_input_path.extend(starting_model_entity['train_input_path'])
            eval_input_path.extend(starting_model_entity['eval_input_path'])
            train_frame_count += starting_model_entity['train_frame_count']
            eval_frame_count += starting_model_entity['eval_frame_count']
            train_negative_frame_count += starting_model_entity['train_negative_frame_count']
            eval_negative_frame_count += starting_model_entity['eval_negative_frame_count']
            util.extend_dict_label_to_count(train_dict_label_to_count, starting_model_entity['train_dict_label_to_count'])
            util.extend_dict_label_to_count(eval_dict_label_to_count, starting_model_entity['eval_dict_label_to_count'])
            sorted_label_list = starting_model_entity['sorted_label_list']
            label_map_path = starting_model_entity['label_map_path']

        for dataset_entity in dataset_entities:
            dataset_uuids.append(dataset_entity['dataset_uuid'])
            train_input_path.append(dataset_entity['train_input_path'])
            eval_input_path.append(dataset_entity['eval_input_path'])
            train_frame_count += dataset_entity['train_frame_count']
            eval_frame_count += dataset_entity['eval_frame_count']
            train_negative_frame_count += dataset_entity['train_negative_frame_count']
            eval_negative_frame_count += dataset_entity['eval_negative_frame_count']
            util.extend_dict_label_to_count(train_dict_label_to_count, dataset_entity['train_dict_label_to_count'])
            util.extend_dict_label_to_count(eval_dict_label_to_count, dataset_entity['eval_dict_label_to_count'])
            if sorted_label_list is None:
                sorted_label_list = dataset_entity['sorted_label_list']
                label_map_path = dataset_entity['label_map_path']
            elif sorted_label_list != dataset_entity['sorted_label_list']:
                message = "Error: The datasets contain different labels and cannot be used together."
                logging.critical(message)
                raise exceptions.HttpErrorBadRequest(message)

        # Create the pipeline.config file and store it in cloud storage.
        bucket = util.storage_client().get_bucket(BUCKET)
        config_template_blob_name = 'static/training/models/configs/%s.config' % original_starting_model
        quantization_delay = max(0, num_training_steps - 200)
        pipeline_config = (bucket.blob(config_template_blob_name).download_as_string().decode('utf-8')
            .replace('TO_BE_CONFIGURED/num_classes', str(len(sorted_label_list)))
            .replace('TO_BE_CONFIGURED/fine_tune_checkpoint', fine_tune_checkpoint)
            .replace('TO_BE_CONFIGURED/train_input_path',  json.dumps(train_input_path))
            .replace('TO_BE_CONFIGURED/label_map_path', label_map_path)
            .replace('TO_BE_CONFIGURED/eval_input_path', json.dumps(eval_input_path))
            .replace('TO_BE_CONFIGURED/num_examples', str(eval_frame_count))
            .replace('TO_BE_CONFIGURED/num_visualizations', str(eval_frame_count))
            # TODO(lizlooney): Adjust eval_interval_secs.
            .replace('TO_BE_CONFIGURED/eval_interval_secs', str(300))
            .replace('TO_BE_CONFIGURED/num_training_steps', str(num_training_steps))
            .replace('TO_BE_CONFIGURED/quantization_delay', str(quantization_delay))
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
                '--pipeline_config_path', pipeline_config_path,
                '--num_train_steps', str(num_training_steps),

                # Note(lizloone) I commented out the tpu_zone argument after jobs were failing on
                # July 10, 2020. I found documentation at
                # https://cloud.google.com/ai-platform/training/docs/using-tpus#connecting_to_the_tpu_grpc_server
                # that says "However, you must make one important change when you use
                # TPUClusterResolver for code that runs on AI Platform Training: Do not provide any
                # arguments when you construct the TPUClusterResolver instance. When the tpu, zone,
                # and project keyword arguments are all set to their default value of None, AI
                # Platform Training automatically provides the cluster resolver with the necessary
                # connection details through environment variables."
                #'--tpu_zone', 'us-central1',
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
        if eval_frame_count > 0:
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
                'region': 'us-central1',
                'jobDir': job_dir,
                'runtimeVersion': '1.15',
                'pythonVersion': '3.7',
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
    model_entity = storage.model_trainer_started(team_uuid, model_uuid, description,
        dataset_uuids, create_time_ms, max_running_minutes, num_training_steps,
        previous_training_steps, starting_model, user_visible_starting_model,
        original_starting_model, fine_tune_checkpoint,
        sorted_label_list, label_map_path, train_input_path, eval_input_path,
        train_frame_count, eval_frame_count, train_negative_frame_count, eval_negative_frame_count,
        train_dict_label_to_count, eval_dict_label_to_count,
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
    model_entity = retrieve_model_entity(team_uuid, model_uuid)
    ml = __get_ml_service()
    if __is_alive(model_entity['train_job_state']):
        try:
            train_job_name = __get_train_job_name(model_uuid)
            ml.projects().jobs().cancel(name=train_job_name).execute()
        except:
            util.log('model_trainer.cancel_training_model - canceling training job - except %s' %
                traceback.format_exc().replace('\n', ' ... '))
    if model_entity['eval_job']:
        if __is_alive(model_entity['eval_job_state']):
            try:
                eval_job_name = __get_eval_job_name(model_uuid)
                ml.projects().jobs().cancel(name=eval_job_name).execute()
            except:
                util.log('model_trainer.cancel_training_model - canceling eval job - except %s' %
                    traceback.format_exc().replace('\n', ' ... '))
    return storage.cancel_training_requested(team_uuid, model_uuid)

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


def make_action_parameters(team_uuid, model_uuid):
    action_parameters = action.create_action_parameters(action.ACTION_NAME_EXTRACT_SUMMARY_IMAGES)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['model_uuid'] = model_uuid
    return action_parameters

def extract_summary_images(action_parameters):
    team_uuid = action_parameters['team_uuid']
    model_uuid = action_parameters['model_uuid']

    previous_training_updated = None
    previous_eval_updated = None

    while True:
        model_entity = retrieve_model_entity(team_uuid, model_uuid)

        training_folder, training_event_file_path, training_updated = blob_storage.get_training_event_file_path(
                team_uuid, model_uuid)
        if training_event_file_path is not None and training_updated != previous_training_updated:
            __extract_summary_images_for_event_file(team_uuid, model_uuid,
                training_folder, training_event_file_path, action_parameters)
        previous_training_updated = training_updated

        eval_folder, eval_event_file_path, eval_updated = blob_storage.get_event_file_path(
                team_uuid, model_uuid, 'eval')
        if eval_event_file_path is not None and eval_updated != previous_eval_updated:
            __extract_summary_images_for_event_file(team_uuid, model_uuid,
                eval_folder, eval_event_file_path, action_parameters)
        previous_eval_updated = eval_updated

        if is_done(model_entity):
            return

        if action.remaining_timedelta(action_parameters) > timedelta(minutes=2):
            time.sleep(60)
        action.retrigger_if_necessary(action_parameters)


def __extract_summary_images_for_event_file(team_uuid, model_uuid, folder, event_file_path,
        action_parameters):
    for event in summary_iterator(event_file_path):
        action.retrigger_if_necessary(action_parameters)
        for value in event.summary.value:
            if value.HasField('image'):
                blob_storage.store_event_summary_image(team_uuid, model_uuid,
                    folder, event.step, value.tag, value.image.encoded_image_string)

def retrieve_tags_and_steps(team_uuid, model_uuid, job, value_type):
    folder, event_file_path, updated = blob_storage.get_event_file_path(
        team_uuid, model_uuid, job)
    step_and_tag_pairs = []
    if event_file_path is None:
        return step_and_tag_pairs
    for event in summary_iterator(event_file_path):
        for value in event.summary.value:
            if value_type == 'scalar':
                if not value.HasField('simple_value'):
                    continue
            elif value_type == 'image':
                if not value.HasField('image'):
                    continue
            else:
                continue
            pair = {
                'step': event.step,
                'tag': value.tag,
            }
            step_and_tag_pairs.append(pair)
    return step_and_tag_pairs


def retrieve_summary_items(team_uuid, model_uuid, job, value_type, dict_step_to_tags):
    folder, event_file_path, updated = blob_storage.get_event_file_path(
        team_uuid, model_uuid, job)
    summary_items = []
    if event_file_path is None:
        return summary_items

    for event in summary_iterator(event_file_path):
        step_key = str(event.step)
        if step_key not in dict_step_to_tags:
            continue
        for value in event.summary.value:
            if value.tag not in dict_step_to_tags[step_key]:
                continue
            if value_type == 'scalar':
                if not value.HasField('simple_value'):
                    continue
            elif value_type == 'image':
                if not value.HasField('image'):
                    continue
            else:
                continue
            summary_item = {
                'step': event.step,
                'tag': value.tag,
            }
            if value_type == 'scalar':
                summary_item['value'] = value.simple_value
            elif value_type == 'image':
                exists, image_url = blob_storage.get_event_summary_image_download_url(team_uuid, model_uuid,
                    folder, event.step, value.tag, value.image.encoded_image_string)
                if not exists:
                    continue
                summary_item['value'] = {
                    'width': value.image.width,
                    'height': value.image.height,
                    'image_url': image_url,
                }
            summary_items.append(summary_item)
    return summary_items
