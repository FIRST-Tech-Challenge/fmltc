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
import io
import json
import logging
import uuid
import zipfile

# Other Modules

# My Modules
import action
import blob_storage
import exceptions
import storage
import util

def prepare_to_zip_dataset(team_uuid, dataset_uuids_json):
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

    dataset_zip_uuid = str(uuid.uuid4().hex)
    dataset_zipper_prep = {
        'dataset_uuid_list': dataset_uuid_list,
        'sorted_label_list': sorted_label_list,
    }
    return dataset_zip_uuid, dataset_zipper_prep

def make_action_parameters(team_uuid, dataset_zip_uuid, dataset_zipper_prep):
    action_parameters = action.create_action_parameters(action.ACTION_NAME_DATASET_ZIPPING)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['dataset_zip_uuid'] = dataset_zip_uuid
    action_parameters['dataset_uuid_list'] = dataset_zipper_prep['dataset_uuid_list']
    action_parameters['sorted_label_list'] = dataset_zipper_prep['sorted_label_list']
    return action_parameters

def zip_dataset(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    dataset_zip_uuid = action_parameters['dataset_zip_uuid']
    dataset_uuid_list = action_parameters['dataset_uuid_list']
    sorted_label_list = action_parameters['sorted_label_list']

    dataset_entities = storage.retrieve_dataset_entities(team_uuid, dataset_uuid_list)
    if len(dataset_entities) != len(dataset_uuid_list):
        message = 'Error: One or more datasets not found for dataset_uuids=%s.' % dataset_uuids_json
        logging.critical(message)
        raise RuntimeError(message)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, allowZip64=True) as zip_file:
        # Write the dataset records out to the folder, renumbering the files.
        train_record_count = 0
        eval_record_count = 0
        for dataset_entity in dataset_entities:
            train_record_count += dataset_entity['train_record_count']
            eval_record_count += dataset_entity['eval_record_count']
        len_longest_record_number = len(str(max(train_record_count - 1, eval_record_count - 1)))
        num_digits = max(len_longest_record_number, 2)
        eval_filename_format = 'eval-%%0%dd.record' % num_digits
        train_filename_format = 'train-%%0%dd.record' % num_digits

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
                record_data = blob_storage.retrieve_dataset_record(
                    dataset_record_entity['tf_record_blob_name'])
                zip_file.writestr(filename, record_data)

        # Write the label.pbtxt file to the folder.
        label_pbtxt = util.make_label_pbtxt(sorted_label_list)
        label_pbtxt_filename = 'label.pbtxt'
        zip_file.writestr(label_pbtxt_filename, label_pbtxt)
    blob_storage.store_dataset_zip(team_uuid, dataset_zip_uuid, zip_buffer.getvalue())
