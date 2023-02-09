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
import dateutil.parser
import io
import math
import time

# Other Modules
from google.api_core.exceptions import GoogleAPIError
import PIL.Image
import tensorflow as tf
from tensorflow.core.util import event_pb2

# My Modules
from app_engine import action
from app_engine import blob_storage
from app_engine import model_trainer
from app_engine import storage
from app_engine import tflite_creator


def __update_model_entity_job_state(model_entity):
    # If the training and eval jobs weren't done last time we checked, check now.
    if is_not_done(model_entity):
        ml = model_trainer.get_ml_service()
        train_job_name = model_trainer.get_train_job_name(model_entity['model_uuid'])
        train_job_response = ml.projects().jobs().get(name=train_job_name).execute()
        if model_entity['eval_job']:
            eval_job_name = model_trainer.get_eval_job_name(model_entity['model_uuid'])
            eval_job_response = ml.projects().jobs().get(name=eval_job_name).execute()
            need_to_cancel_eval = False
            if model_trainer.is_alive(eval_job_response['state']):
                # If the training job has failed or been cancelled, cancel the eval job.
                if __is_dead_or_dying(train_job_response['state']):
                    need_to_cancel_eval = True
                # If the training job succeeded and we have the final eval, cancel the eval job.
                elif __is_done(train_job_response['state']):
                    if model_entity['evaled_steps'] >= model_entity['trained_steps']:
                        need_to_cancel_eval = True
                    elif 'endTime' in train_job_response:
                        time_since_train_ended = datetime.now(timezone.utc) - dateutil.parser.parse(train_job_response['endTime'])
                        if time_since_train_ended> timedelta(minutes=10):
                            need_to_cancel_eval = True
            if need_to_cancel_eval:
                ml.projects().jobs().cancel(name=eval_job_name).execute()
                eval_job_response = ml.projects().jobs().get(name=eval_job_name).execute()
        else:
            eval_job_response = None
        try:
            model_entity = storage.update_model_entity_job_state(
                model_entity['team_uuid'], model_entity['model_uuid'], train_job_response, eval_job_response)
        except GoogleAPIError:
            # This happens from time to time. It's not fatal if we can't update the job state in
            # the model entity.
            pass
    return model_entity

def is_not_done(model_entity):
    return (
        __is_not_done(model_entity['train_job_state']) or
        __is_not_done(model_entity['eval_job_state']))

def is_done(model_entity):
    return (
        __is_done(model_entity['train_job_state']) and
        __is_done(model_entity['eval_job_state']))

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


def monitor_training(action_parameters):
    team_uuid = action_parameters['team_uuid']
    model_uuid = action_parameters['model_uuid']

    model_entity = storage.retrieve_model_entity(team_uuid, model_uuid)
    model_folder = model_entity['model_folder']
    prev_training_done = __is_done(model_entity['train_job_state'])

    while True:
        model_entity = storage.monitor_training_active(team_uuid, model_uuid)
        model_entity = __update_model_entity_job_state(model_entity)
        previous_time_ms = model_entity['monitor_training_active_time_ms']

        if not prev_training_done:
            training_done = __is_done(model_entity['train_job_state'])
            if training_done:
                # Training just finished. Trigger the action to create the tflite model if there is
                # a checkpoint.
                if model_entity['trained_checkpoint_path'] != '':
                    tflite_creator.trigger_create_tflite(team_uuid, model_uuid)
            prev_training_done = training_done

        for job_type in ['train', 'eval']:
            dict_path_to_updated = blob_storage.get_event_file_paths(model_folder, job_type)
            for event_file_path, updated in dict_path_to_updated.items():
                if ('dict_event_file_path_to_updated' in model_entity and
                        event_file_path in model_entity['dict_event_file_path_to_updated'] and
                        model_entity['dict_event_file_path_to_updated'][event_file_path] == updated):
                    continue
                largest_step, scalar_summary_items, image_summary_items = __monitor_training_for_event_file(
                    model_folder, job_type, event_file_path, action_parameters)
                scalar_modified_count = storage.store_model_summary_items(team_uuid, model_uuid, job_type,
                    'scalar', scalar_summary_items)
                image_modified_count = storage.store_model_summary_items(team_uuid, model_uuid, job_type,
                    'image', image_summary_items)
                model_entity, modified_model_entity = storage.update_model_entity_for_event_file(team_uuid, model_uuid, job_type,
                    event_file_path, updated, largest_step)
                if scalar_modified_count > 0 or image_modified_count > 0 or modified_model_entity:
                    action.retrigger_now(action_parameters)

        if is_done(model_entity):
            # The job(s) are done. If we didn't update the model entity during the for loop, we are done.
            if model_entity['monitor_training_active_time_ms'] == previous_time_ms:
                model_entity = storage.monitor_training_finished(team_uuid, model_uuid)
                return

        if action.remaining_timedelta(action_parameters) > timedelta(minutes=2):
            time.sleep(30)
        action.retrigger_if_necessary(action_parameters)


def __monitor_training_for_event_file(model_folder, job_type, event_file_path, action_parameters):
    largest_step = None
    scalar_summary_items = {}
    image_summary_items = {}
    for record in tf.data.TFRecordDataset(event_file_path):
        action.retrigger_if_necessary(action_parameters)
        event = event_pb2.Event.FromString(record.numpy())
        if not hasattr(event, 'step'):
            continue
        if largest_step is None or event.step > largest_step:
            largest_step = event.step
        if not hasattr(event, 'summary'):
            continue
        for value in event.summary.value:
            if (not hasattr(value, 'metadata') or
                    not hasattr(value.metadata, 'plugin_data') or
                    not hasattr(value.metadata.plugin_data, 'plugin_name')):
                continue
            if value.metadata.plugin_data.plugin_name == 'scalars':
                item_value = float(tf.make_ndarray(value.tensor))
                if math.isnan(item_value):
                    continue
                item = {
                    'step': event.step,
                    'tag': value.tag,
                    'value': item_value
                }
                scalar_summary_items[model_trainer.make_key(event.step, value.tag)] = item
            elif value.metadata.plugin_data.plugin_name == 'images':
                if job_type == 'train':
                    # Don't bother saving training images.
                    continue
                image_value = tf.make_ndarray(value.tensor)
                if len(image_value) < 3: # width, height, image bytes
                    continue
                width = int(float(image_value[0].decode('utf-8')))
                height = int(float(image_value[1].decode('utf-8')))
                image_bytes = image_value[2]

                # Convert to JPEG with lower quality.
                im = PIL.Image.open(io.BytesIO(image_bytes))
                arr = io.BytesIO()
                im.save(arr, format='JPEG', quality=50)
                jpeg_image_bytes = arr.getvalue()

                blob_storage.store_event_summary_image(model_folder, job_type,
                    event.step, value.tag, jpeg_image_bytes)
                item = {
                    'job_type': job_type,
                    'step': event.step,
                    'tag': value.tag,
                    'width': width,
                    'height': height,
                }
                image_summary_items[model_trainer.make_key(event.step, value.tag)] = item
    return largest_step, scalar_summary_items, image_summary_items
