# Copyright 2021 Google LLC
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


def __strip_entity(entity, props_to_keep):
    props_to_remove = []
    for prop in entity:
        if prop not in props_to_keep:
            props_to_remove.append(prop)
    for prop in props_to_remove:
        if prop in entity:
            entity.pop(prop, None)
    return entity

def strip_video_entity(video_entity):
    return __strip_entity(video_entity, [
        'create_time_ms',
        'description',
        'extracted_frame_count',
        'file_size',
        'fps',
        'frame_count',
        'frame_extraction_active_time_ms',
        'frame_extraction_error_message',
        'frame_extraction_failed',
        'frame_extraction_triggered_time_ms',
        'height',
        'included_frame_count',
        'labeled_frame_count',
        'tracking_in_progress',
        'video_filename',
        'video_uuid',
        'width',
    ])

def strip_video_frame_entity(video_frame_entity):
    return __strip_entity(video_frame_entity, [
        'bboxes_text',
        'frame_number',
        'image_url',
        'include_frame_in_dataset',
    ])

def strip_dataset_entity(dataset_entity):
    return __strip_entity(dataset_entity, [
        'create_time_ms',
        'dataset_completed',
        'dataset_uuid',
        'description',
        'eval_frame_count',
        'eval_negative_frame_count',
        'sorted_label_list',
        'total_record_count',
        'train_frame_count',
        'train_negative_frame_count',
    ])

def strip_model_entity(model_entity):
    return __strip_entity(model_entity, [
        'cancel_requested',
        'create_time_ms',
        'dataset_uuids',
        'description',
        'eval_dict_label_to_count',
        'eval_frame_count',
        'eval_job_state',
        'eval_negative_frame_count',
        'evaled_steps',
        'model_uuid',
        'monitor_training_active_time_ms',
        'monitor_training_finished',
        'monitor_training_triggered_time_ms',
        'num_training_steps',
        'original_starting_model',
        'sorted_label_list',
        'starting_model',
        'tensorflow_version',
        'total_training_steps',
        'train_dict_label_to_count',
        'train_error_message',
        'train_frame_count',
        'train_job_elapsed_seconds',
        'train_job_start_time',
        'train_job_state',
        'train_negative_frame_count',
        'trained_checkpoint_path',
        'trained_steps',
        'user_visible_starting_model',
    ])


def sanitize(o):
    if isinstance(o, list):
        for item in o:
            sanitize(item)
    if isinstance(o, dict):
        if 'team_uuid' in o:
            o.pop('team_uuid', None)
        for key, value in o.items():
            sanitize(value)
    return o

