# Copyright 2022 Google LLC
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
import math
import uuid

# My Modules
import action
import storage


def prepare_to_zip_dataset(team_uuid, dataset_uuid):
    dataset_zip_uuid = str(uuid.uuid4().hex)
    max_files_per_partition = 10
    # storage.retrieve_dataset_entity will raise HttpErrorNotFound
    # if the team_uuid/dataset_uuid is not found.
    dataset_entity = storage.retrieve_dataset_entity(team_uuid, dataset_uuid)
    total_file_count = dataset_entity['total_record_count'] + 1
    partition_count = math.ceil(total_file_count / max_files_per_partition)
    storage.create_dataset_zippers(team_uuid, dataset_zip_uuid, partition_count)
    storage.increment_datasets_downloaded_today(team_uuid)
    return dataset_zip_uuid, partition_count

def make_action_parameters(team_uuid, dataset_uuid, dataset_zip_uuid, partition_count):
    action_parameters = action.create_action_parameters(
        team_uuid, action.ACTION_NAME_DATASET_ZIP)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['dataset_uuid'] = dataset_uuid
    action_parameters['dataset_zip_uuid'] = dataset_zip_uuid
    action_parameters['partition_count']  = partition_count
    return action_parameters

