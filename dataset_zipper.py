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
import logging
import os
import uuid
import zipfile

# Other Modules

# My Modules
import action
import blob_storage
import storage
import util

def make_action_parameters(team_uuid, dataset_uuid):
    dataset_zip_uuid = str(uuid.uuid4().hex)
    action_parameters = action.create_action_parameters(action.ACTION_NAME_DATASET_ZIPPING)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['dataset_zip_uuid'] = dataset_zip_uuid
    action_parameters['dataset_uuid'] = dataset_uuid
    return dataset_zip_uuid, action_parameters

def zip_dataset(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    dataset_zip_uuid = action_parameters['dataset_zip_uuid']
    dataset_uuid = action_parameters['dataset_uuid']

    dataset_entity = storage.retrieve_dataset_entity(team_uuid, dataset_uuid)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, allowZip64=True) as zip_file:
        # Write the label.pbtxt file.
        blob_name = dataset_entity['label_pbtxt_blob_name']
        content = blob_storage.retrieve_dataset_label_pbtxt(blob_name)
        filename = os.path.basename(blob_name)
        zip_file.writestr(filename, content)
        # Write the dataset records.
        dataset_record_entities = storage.retrieve_dataset_records(dataset_entity)
        for dataset_record_entity in dataset_record_entities:
            blob_name = dataset_record_entity['tf_record_blob_name']
            content = blob_storage.retrieve_dataset_record(blob_name)
            filename = os.path.basename(blob_name)
            zip_file.writestr(filename, content)
    blob_storage.store_dataset_zip(team_uuid, dataset_zip_uuid, zip_buffer.getvalue())
