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

# Python Standard Library
from datetime import datetime, timezone

# Other Modules
from google.cloud import logging as cloud_logging


def save_action_metrics(action_entity):
    now = datetime.now(timezone.utc)
    total_time = (now - action_entity['create_time']).total_seconds()
    inactive_time = 0
    active_time = 0
    min_wait_time = -1
    max_wait_time = -1
    len_times = len(action_entity['start_times'])
    if len_times == len(action_entity['stop_times']):
        for i in range(len_times):
            if i == 0:
                wait_time = (action_entity['start_times'][i] - action_entity['create_time']).total_seconds()
            else:
                wait_time = (action_entity['start_times'][i] - action_entity['stop_times'][i - 1]).total_seconds()
            if min_wait_time < 0 or wait_time < min_wait_time:
                min_wait_time = wait_time
            if max_wait_time < 0 or wait_time > max_wait_time:
                max_wait_time = wait_time
            inactive_time += wait_time
            active_time += (action_entity['stop_times'][i] - action_entity['start_times'][i]).total_seconds()
    if min_wait_time < 0:
        min_wait_time = 0
    if max_wait_time < 0:
        max_wait_time = 0
    message = {
        'type': 'action',
        'action_name': action_entity['action_name'],
        'total_time': total_time,
        'cloud_function_calls': len_times,
        'active_time': active_time,
        'inactive_time': inactive_time,
        'min_wait_time': min_wait_time,
        'max_wait_time': max_wait_time,
    }
    cloud_logger = cloud_logging.Client().logger('metrics')
    cloud_logger.log_struct(message)


def save_video_metrics(video_entity):
    if 'width' in video_entity and 'height' in video_entity:
        width_x_height = '%d x %d' % (video_entity['width'], video_entity['height'])
    else:
        width_x_height = ''
    if 'fps' in video_entity:
        fps = video_entity['fps']
    else:
        fps = 0
    if 'frame_count' in video_entity:
        frame_count = video_entity['frame_count']
    else:
        frame_count = 0
    message = {
        'type': 'video',
        'file_size': video_entity['file_size'],
        'video_content_type': video_entity['video_content_type'],
        'width_x_height': width_x_height,
        'fps': fps,
        'frame_count': frame_count,
    }
    cloud_logger = cloud_logging.Client().logger('metrics')
    cloud_logger.log_struct(message)


def save_labeling_metrics(bboxes_count):
    message = {
        'type': 'labeling',
        'bboxes_count': bboxes_count,
    }
    cloud_logger = cloud_logging.Client().logger('metrics')
    cloud_logger.log_struct(message)


def save_tracking_metrics(tracker_name, scale, bboxes_count):
    message = {
        'type': 'tracking',
        'tracker_name': tracker_name,
        'scale': scale,
        'bboxes_count': bboxes_count,
    }
    cloud_logger = cloud_logging.Client().logger('metrics')
    cloud_logger.log_struct(message)
