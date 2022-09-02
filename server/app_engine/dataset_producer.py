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

# My Modules
import action
import storage


def prepare_to_start_dataset_production(team_uuid, description, video_uuid_list, eval_percent, create_time_ms):
    # storage.prepare_to_start_dataset_production will raise HttpErrorNotFound
    # if any of the team_uuid/video_uuids is not found or if none of the videos have labeled frames.
    dataset_uuid = storage.prepare_to_start_dataset_production(team_uuid, description,
        video_uuid_list, eval_percent, create_time_ms)
    return dataset_uuid

def make_action_parameters(team_uuid, dataset_uuid, video_uuid_list, eval_percent, create_time_ms):
    action_parameters = action.create_action_parameters(
        team_uuid, action.ACTION_NAME_DATASET_PRODUCE)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['dataset_uuid'] = dataset_uuid
    action_parameters['video_uuid_list'] = video_uuid_list
    action_parameters['eval_percent'] = eval_percent
    action_parameters['create_time_ms'] = create_time_ms
    return action_parameters
