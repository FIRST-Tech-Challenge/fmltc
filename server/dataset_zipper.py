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
import math
import os
import uuid
import zipfile

# Other Modules

# My Modules
import action
import blob_storage
import storage
import util

def prepare_to_zip_dataset(team_uuid, dataset_uuid):
    team_entity = storage.retrieve_team_entity(team_entity)
    if 'datasets_downloaded_today' in team_entity:
        team_entity['datasets_downloaded_today'] += 1 
    dataset_zip_uuid = str(uuid.uuid4().hex)
    max_files_per_partition = 10
    # storage.retrieve_dataset_entity will raise HttpErrorNotFound
    # if the team_uuid/dataset_uuid is not found.
    dataset_entity = storage.retrieve_dataset_entity(team_uuid, dataset_uuid)
    total_file_count = dataset_entity['total_record_count'] + 1
    partition_count = math.ceil(total_file_count / max_files_per_partition)
    storage.create_dataset_zippers(team_uuid, dataset_zip_uuid, partition_count)
    return dataset_zip_uuid, partition_count

def make_action_parameters(team_uuid, dataset_uuid, dataset_zip_uuid, partition_count):
    action_parameters = action.create_action_parameters(
        team_uuid, action.ACTION_NAME_DATASET_ZIP)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['dataset_uuid'] = dataset_uuid
    action_parameters['dataset_zip_uuid'] = dataset_zip_uuid
    action_parameters['partition_count']  = partition_count
    return action_parameters

def zip_dataset(action_parameters):
    team_uuid = action_parameters['team_uuid']
    dataset_zip_uuid = action_parameters['dataset_zip_uuid']
    dataset_uuid = action_parameters['dataset_uuid']
    partition_count = action_parameters['partition_count']

    partition_lists = [[] for i in range(partition_count)]
    dataset_entity = storage.retrieve_dataset_entity(team_uuid, dataset_uuid)
    partition_lists[0].append(dataset_entity['label_map_blob_name'])
    dataset_record_entities = storage.retrieve_dataset_records(dataset_entity)
    for i, dataset_record_entity in enumerate(dataset_record_entities):
        partition_lists[(i + 1) % partition_count].append(dataset_record_entity['tf_record_blob_name'])

    # Trigger actions for the partitions
    action_parameters = action.create_action_parameters(
        team_uuid, action.ACTION_NAME_DATASET_ZIP_PARTITION)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['dataset_zip_uuid'] = dataset_zip_uuid
    for partition_index, partition_list in enumerate(partition_lists):
        file_count = len(partition_list)
        storage.update_dataset_zipper(team_uuid, dataset_zip_uuid, partition_index, file_count, 0)
        action_parameters['partition_list'] = partition_list
        action_parameters['partition_index'] = partition_index
        action.trigger_action_via_blob(action_parameters)

def zip_dataset_partition(action_parameters):
    team_uuid = action_parameters['team_uuid']
    dataset_zip_uuid = action_parameters['dataset_zip_uuid']
    partition_list = action_parameters['partition_list']
    partition_index = action_parameters['partition_index']
    files_written = 0
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, allowZip64=True) as zip_file:
        # Write the files.
        file_count = len(partition_list)
        for blob_name in partition_list:
            content = blob_storage.retrieve_dataset_blob(blob_name)
            filename = os.path.basename(blob_name)
            zip_file.writestr(filename, content)
            files_written += 1
            storage.update_dataset_zipper(team_uuid, dataset_zip_uuid, partition_index, file_count, files_written)
    blob_storage.store_dataset_zip(team_uuid, dataset_zip_uuid, partition_index, zip_buffer.getvalue())
