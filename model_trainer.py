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

# Other Modules

# My Modules
import action
import storage
import util


def make_action_parameters(team_uuid, dataset_uuid):
    model_uuid = storage.model_trainer_starting(team_uuid, dataset_uuid)
    action_parameters = action.create_action_parameters(action.ACTION_NAME_MODEL_TRAINING)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['model_uuid'] = model_uuid
    action_parameters['dataset_uuid'] = dataset_uuid
    return model_uuid, action_parameters

def train_model(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    model_uuid = action_parameters['model_uuid']
    dataset_uuid = action_parameters['dataset_uuid']

    dataset_entity = storage.retrieve_dataset_entity(team_uuid, dataset_uuid)
    sorted_label_list = dataset_entity['sorted_label_list']
    dataset_record_entities = storage.retrieve_dataset_records(dataset_entity)
    blob_names = [dataset_record_entity['tf_record_blob_name'] for dataset_record_entity in dataset_record_entities]
    common_path = os.path.commonpath(blob_names)
    train_input_path = '%s/train-%s.record' % (common_path, dataset_entity['wildcards'])
    eval_input_path = '%s/eval-%s.record' % (common_path, dataset_entity['wildcards'])
    label_pbtxt_path = '%s/label.pbtxt' % common_path

    # TODO(lizlooney): Write the pipeline.config file. What else?
