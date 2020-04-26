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
import os
import shutil

# Other Modules

# My Modules
import action
import blob_storage
import exceptions
import storage
import util


def prepare_to_train_model(team_uuid, dataset_uuids_json):
    dataset_uuid_list = json.loads(dataset_uuids_json)
    if len(dataset_uuid_list) == 0:
        message = "Error: No datasets to process."
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)

    dataset_entities = storage.retrieve_dataset_entities(team_uuid, dataset_uuid_list)
    if len(dataset_entities) != len(dataset_uuid_list):
        message = 'Error: One or more datasets not found for dataset_uuids=%s.' % dataset_uuids_json
        logging.critical(message)
        raise exceptions.HttpErrorNotFound(message)

    # Make sure all of the datasets have the same sorted_label_list.
    sorted_label_list = dataset_entities[0]['sorted_label_list']
    for dataset_entity in dataset_entities:
        if dataset_entity['sorted_label_list'] != sorted_label_list:
            message = "Error: The labels used in all datasets must be the same."
            logging.critical(message)
            raise exceptions.HttpErrorUnprocessableEntity(message)

    model_uuid = storage.model_trainer_starting(team_uuid, dataset_uuid_list)
    model_trainer_prep = {
        'dataset_uuid_list': dataset_uuid_list,
        'sorted_label_list': sorted_label_list,
    }
    return model_uuid, model_trainer_prep

def make_action_parameters(team_uuid, model_uuid, model_trainer_prep):
    action_parameters = action.create_action_parameters(action.ACTION_NAME_MODEL_TRAINING)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['model_uuid'] = model_uuid
    action_parameters['dataset_uuid_list'] = model_trainer_prep['dataset_uuid_list']
    action_parameters['sorted_label_list'] = model_trainer_prep['sorted_label_list']
    return action_parameters

def train_model(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    model_uuid = action_parameters['model_uuid']
    dataset_uuid_list = action_parameters['dataset_uuid_list']
    sorted_label_list = action_parameters['sorted_label_list']

    dataset_entities = storage.retrieve_dataset_entities(team_uuid, dataset_uuid_list)
    if len(dataset_entities) != len(dataset_uuid_list):
        message = 'Error: One or more datasets not found for dataset_uuids=%s.' % dataset_uuids_json
        logging.critical(message)
        raise RuntimeError(message)

    # Create a temporary folder.
    folder = '/tmp/%s/data' % model_uuid
    os.makedirs(folder, exist_ok=True)
    try:
        # Write the dataset records out to the folder, renumbering the files.
        train_record_count = 0
        eval_record_count = 0
        for dataset_entity in dataset_entities:
            train_record_count += dataset_entity['train_record_count']
            eval_record_count += dataset_entity['eval_record_count']
        len_longest_record_number = len(str(max(train_record_count - 1, eval_record_count - 1)))
        num_digits = max(len_longest_record_number, 2)
        eval_filename_format = '%s/eval-%%0%dd.record' % (folder, num_digits)
        train_filename_format = '%s/train-%%0%dd.record' % (folder, num_digits)

        train_record_number = 0
        eval_record_number = 0
        for dataset_entity in dataset_entities:
            dataset_record_entities = storage.retrieve_dataset_records(dataset_entity)
            for dataset_record_entity in dataset_record_entities:
                if dataset_record_entity['is_eval']:
                    filename = eval_filename_format % eval_record_number
                    eval_record_number += 1
                else:
                    filename = train_filename_format % train_record_number
                    train_record_number += 1
                util.log("writing %s" % filename)
                blob_storage.write_dataset_record_to_file(
                    dataset_record_entity['tf_record_blob_name'], filename)

        # Write the label.pbtxt file to the folder.
        label_pbtxt = util.make_label_pbtxt(sorted_label_list)
        label_pbtxt_filename = '%s/label.pbtxt' % folder
        util.log("writing %s" % label_pbtxt_filename)
        f = open(label_pbtxt_filename, 'w')
        f.write(label_pbtxt)
        f.close()

        # TODO(lizlooney): Write the pipeline.config file. What else?

    finally:
        # Delete the temporary director.
        shutil.rmtree(folder)
