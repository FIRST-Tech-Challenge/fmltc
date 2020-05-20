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

# Inspired by https://github.com/google/ftc-object-detection/tree/master/training/convert_labels_to_records.py

# Python Standard Library
import collections
import io
import json
import logging
import math
import os
import random
import shutil
import uuid

# Other Modules
import cv2
import PIL.Image
import tensorflow as tf
import dataset_util

# My Modules
import action
import bbox_writer
import blob_storage
import exceptions
import storage
import util

# NamedTuple for split
Split = collections.namedtuple('Split', [
    'train_frame_count', 'train_frame_number_lists', 'eval_frame_count', 'eval_frame_number_lists',
    'label_set'])

# NamedTuple for frame data.
FrameData = collections.namedtuple('FrameData', [
    'video_filename', 'frame_number', 'filename', 'image', 'format', 'bboxes_text'])


def prepare_to_start_dataset_production(team_uuid, eval_percent, start_time_ms):
    dataset_uuid = storage.prepare_to_start_dataset_production(team_uuid, eval_percent, start_time_ms)
    return dataset_uuid

def make_action_parameters(team_uuid, dataset_uuid, video_uuids_json, eval_percent, start_time_ms):
    action_parameters = action.create_action_parameters(action.ACTION_NAME_DATASET_PRODUCE)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['dataset_uuid'] = dataset_uuid
    action_parameters['video_uuids_json'] = video_uuids_json
    action_parameters['eval_percent'] = eval_percent
    action_parameters['start_time_ms'] = start_time_ms
    return action_parameters

def produce_dataset(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    dataset_uuid = action_parameters['dataset_uuid']
    video_uuids_json = action_parameters['video_uuids_json']
    eval_percent = action_parameters['eval_percent']
    start_time_ms = action_parameters['start_time_ms']

    video_uuid_list = json.loads(video_uuids_json)
    if len(video_uuid_list) == 0:
        message = "Error: No videos to process."
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)

    video_entities = storage.retrieve_video_entities(team_uuid, video_uuid_list)
    if len(video_entities) != len(video_uuid_list):
        message = 'Error: One or more videos not found for video_uuids=%s.' % video_uuids_json
        logging.critical(message)
        raise exceptions.HttpErrorNotFound(message)

    video_filenames = []
    dict_video_uuid_to_split = {}
    train_frame_count = 0
    train_record_count = 0
    eval_frame_count = 0
    eval_record_count = 0
    label_set = set()

    for video_entity in video_entities:
        video_uuid = video_entity['video_uuid']
        video_filenames.append(video_entity['video_filename'])
        # Read the video_frame entities from storage. They contain the labels.
        video_frame_entities = storage.retrieve_video_frame_entities(
             team_uuid, video_uuid, 0, video_entity['frame_count'] - 1)
        # Determine which frames will be used for training and which frames will be used for eval.
        split = __split_for_records(video_frame_entities, eval_percent)
        dict_video_uuid_to_split[video_uuid] = split
        train_frame_count += split.train_frame_count
        train_record_count += len(split.train_frame_number_lists)
        eval_frame_count += split.eval_frame_count
        eval_record_count += len(split.eval_frame_number_lists)
        label_set.update(split.label_set)

    sorted_label_list = sorted(label_set)
    train_record_id_format = 'train_dataset.record-%05d-%05d'
    train_input_path = 'train_dataset.record-?????-%05d' % train_record_count
    eval_record_id_format = 'eval_dataset.record-%05d-%05d'
    eval_input_path = 'eval_dataset.record-?????-%05d' % eval_record_count

    storage.dataset_producer_starting(
        team_uuid, dataset_uuid, video_filenames, sorted_label_list,
        train_frame_count, train_record_count, train_input_path,
        eval_frame_count, eval_record_count, eval_input_path)

    record_number = 0
    train_record_number = 0
    eval_record_number = 0

    # Trigger actions for the train records
    for video_entity in video_entities:
        video_uuid = video_entity['video_uuid']
        split = dict_video_uuid_to_split[video_uuid]
        action_parameters = action.create_action_parameters(action.ACTION_NAME_DATASET_PRODUCE_RECORD)
        action_parameters['team_uuid'] = team_uuid
        action_parameters['dataset_uuid'] = dataset_uuid
        action_parameters['video_uuid'] = video_uuid
        action_parameters['sorted_label_list'] = sorted_label_list
        for i, train_frame_number_list in enumerate(split.train_frame_number_lists):
            action_parameters_copy = action_parameters.copy()
            action_parameters_copy['frame_number_list'] = train_frame_number_list
            action_parameters_copy['record_number'] = record_number
            action_parameters_copy['record_id'] = train_record_id_format % (train_record_number, train_record_count)
            action_parameters_copy['is_eval'] = False
            action.trigger_action_via_blob(action_parameters_copy)
            train_record_number += 1
            record_number += 1

    # Trigger actions for the eval records
    for video_entity in video_entities:
        video_uuid = video_entity['video_uuid']
        split = dict_video_uuid_to_split[video_uuid]
        action_parameters = action.create_action_parameters(action.ACTION_NAME_DATASET_PRODUCE_RECORD)
        action_parameters['team_uuid'] = team_uuid
        action_parameters['dataset_uuid'] = dataset_uuid
        action_parameters['video_uuid'] = video_uuid
        action_parameters['sorted_label_list'] = sorted_label_list
        for i, eval_frame_number_list in enumerate(split.eval_frame_number_lists):
            action_parameters_copy = action_parameters.copy()
            action_parameters_copy['frame_number_list'] = eval_frame_number_list
            action_parameters_copy['record_number'] = record_number
            action_parameters_copy['record_id'] = eval_record_id_format % (eval_record_number, eval_record_count)
            action_parameters_copy['is_eval'] = True
            action.trigger_action_via_blob(action_parameters_copy)
            eval_record_number += 1
            record_number += 1


def __split_for_records(video_frame_entities, eval_percent, max_frames_per_record=50):
    # Make sure the shuffle order is the same.
    random.seed(42)

    included_frame_numbers = []
    label_set = set()
    for frame_number, video_frame_entity in enumerate(video_frame_entities):
        if video_frame_entity['include_frame_in_dataset']:
            included_frame_numbers.append(frame_number)
            bboxes_text = video_frame_entities[frame_number]['bboxes_text']
            if bboxes_text is not None:
                labels = bbox_writer.extract_labels(bboxes_text)
                label_set.update(set(labels))
    random.shuffle(included_frame_numbers)

    included_frame_count = len(included_frame_numbers)
    if included_frame_count == 1 and eval_percent > 0 and eval_percent < 100:
        message = "Error: if the number of included video frames is 1, eval_percent must be 0 or 100."
        logging.critical(message)
        raise exceptions.HttpErrorUnprocessableEntity(message)

    if eval_percent == 0:
        eval_frame_numbers = []
        train_frame_numbers = included_frame_numbers
    elif eval_percent == 100:
        eval_frame_numbers = included_frame_numbers
        train_frame_numbers = []
    else:
        # If the team_uuid didn't specify eval_percent=0 or eval_percent=100, we will have at least 1 frame
        # for training and at least 1 frame for eval.
        lowest = 1
        highest = len(included_frame_numbers) - 1
        eval_frame_count = round(len(included_frame_numbers) * eval_percent / 100)
        eval_frame_count = max(lowest, min(eval_frame_count, highest))
        eval_frame_numbers = included_frame_numbers[:eval_frame_count]
        train_frame_numbers = included_frame_numbers[eval_frame_count:]

    train_frame_count = len(train_frame_numbers)
    if train_frame_count > 0:
        # Split up the training frame numbers.
        train_record_count = math.ceil(len(train_frame_numbers) / max_frames_per_record)
        train_frame_number_lists = [[] for i in range(train_record_count)]
        for i, frame_number in enumerate(train_frame_numbers):
            train_frame_number_lists[i % train_record_count].append(frame_number)
    else:
        train_frame_number_lists = []

    eval_frame_count = len(eval_frame_numbers)
    if eval_frame_count > 0:
        # Split up the eval frame numbers.
        eval_record_count = math.ceil(len(eval_frame_numbers) / max_frames_per_record)
        eval_frame_number_lists = [[] for i in range(eval_record_count)]
        for i, frame_number in enumerate(eval_frame_numbers):
            eval_frame_number_lists[i % eval_record_count].append(frame_number)
    else:
        eval_frame_number_lists = []
    return Split(train_frame_count, train_frame_number_lists,
        eval_frame_count, eval_frame_number_lists, label_set)


def produce_dataset_record(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    dataset_uuid = action_parameters['dataset_uuid']
    video_uuid = action_parameters['video_uuid']
    sorted_label_list = action_parameters['sorted_label_list']
    frame_number_list = action_parameters['frame_number_list']
    record_number = action_parameters['record_number']
    record_id = action_parameters['record_id']
    is_eval = action_parameters['is_eval']

    # Read the video_entity from storage.
    video_entity = storage.retrieve_video_entity(team_uuid, video_uuid)

    # Read the video_frame entities from storage. They contain the labels.
    video_frame_entities = storage.retrieve_video_frame_entities(
         team_uuid, video_uuid, 0, video_entity['frame_count'] - 1)

    # Get the data for the frames in frame_number_list.
    frame_data_dict = __get_frame_data(video_entity, video_frame_entities, frame_number_list)

    # Make the directory for tensorflow record files.
    folder = '/tmp/dataset/%s' % str(uuid.uuid4().hex)
    os.makedirs(folder, exist_ok=True)
    try:
        temp_record_filename = '%s/%s' % (folder, record_id)
        __write_record(team_uuid, sorted_label_list, frame_data_dict, dataset_uuid, record_number,
            record_id, is_eval, temp_record_filename)
        storage.dataset_producer_maybe_done(team_uuid, dataset_uuid)
    finally:
        # Delete the temporary director.
        shutil.rmtree(folder)


def __get_frame_data(video_entity, video_frame_entities, frame_number_list):
    video_uuid = video_entity['video_uuid']
    video_blob_name = video_entity['video_blob_name']

    # Write the video out to a temporary file and open it with cv2.
    temp_video_filename = '/tmp/%s' % str(uuid.uuid4().hex)
    os.makedirs(os.path.dirname(temp_video_filename), exist_ok=True)
    blob_storage.write_video_to_file(video_blob_name, temp_video_filename)
    try:
        vid = cv2.VideoCapture(temp_video_filename)
        if not vid.isOpened():
            message = "Error: Unable to open video for video_uuid=%s." % video_uuid
            logging.critical(message)
            raise RuntimeError(message)
        try:
            # frame_data_dict is a dict where keys are frame numbers, and values are FrameData
            # named tuples.
            frame_data_dict = {}
            frame_number = 0
            while True:
                if frame_number in frame_number_list:
                    success, frame = vid.read()
                    if not success:
                        # We've reached the end of the video.
                        break
                    format = 'png'
                    success, buffer = cv2.imencode('.%s' % format, frame)
                    if not success:
                        message = 'cv2.imencode returned %s for frame number %d.' % (success, frame_number)
                        logging.critical(message)
                        raise RuntimeError(message)
                    filename = '%s_%05d.%s' % (video_uuid, frame_number, format)
                    image = buffer
                    bboxes_text = video_frame_entities[frame_number]['bboxes_text']
                    frame_data_dict[frame_number] = FrameData(
                        video_entity['video_filename'], frame_number,
                        filename, image, format, bboxes_text)
                else:
                    success = vid.grab()
                    if not success:
                        # We've reached the end of the video.
                        break
                frame_number += 1
            return frame_data_dict
        finally:
            # Release the cv2 video.
            vid.release()
    finally:
        # Delete the temporary file.
        os.remove(temp_video_filename)


def __write_record(team_uuid, sorted_label_list, frame_data_dict,
        dataset_uuid, record_number, record_id, is_eval, temp_record_filename):
    negative_frame_count = 0
    label_counter = collections.Counter()
    debug_infos = {}
    with tf.io.TFRecordWriter(temp_record_filename) as writer:
        for frame_number, frame_data in frame_data_dict.items():
            tf_example, label_counter_for_frame, is_negative, debug_info = __create_tf_example(frame_data, sorted_label_list)
            debug_infos[str(frame_number)] = debug_info
            writer.write(tf_example.SerializeToString())
            negative_frame_count += is_negative
            label_counter += label_counter_for_frame
    tf_record_blob_name = blob_storage.store_dataset_record(team_uuid, dataset_uuid, record_id, temp_record_filename)
    os.remove(temp_record_filename)
    dict_label_to_count = dict(label_counter)
    storage.store_dataset_record(team_uuid, dataset_uuid, record_number, record_id, is_eval, tf_record_blob_name,
        negative_frame_count, dict_label_to_count)
    #blob_storage.store_debug_infos(team_uuid, dataset_uuid, record_id, debug_infos)


def __create_tf_example(frame_data, sorted_label_list):
    im = PIL.Image.open(io.BytesIO(frame_data.image))
    arr = io.BytesIO()
    if frame_data.format == 'jpg':
      format = 'JPEG'
    else:
      format = frame_data.format.upper()
    im.save(arr, format=format)
    height = im.height
    width = im.width
    encoded_image_data = arr.getvalue()
    rects, labels = bbox_writer.convert_text_to_rects_and_labels(frame_data.bboxes_text)
    # List of normalized coordinates, 1 per box, capped to [0, 1]
    xmins = [max(min(rect[0] / width, 1), 0) for rect in rects] # left x
    xmaxs = [max(min(rect[2] / width, 1), 0) for rect in rects] # right x
    ymins = [max(min(rect[1] / height, 1), 0) for rect in rects] # top y
    ymaxs = [max(min(rect[3] / height, 1), 0) for rect in rects] # bottom y

    classes_txt = [label.encode('utf-8') for label in labels] # String names
    label_to_id_dict = {label: i for i, label in enumerate(sorted_label_list)}
    class_ids = [label_to_id_dict[label] for label in labels]

    debug_info = {
        'frame_data_video_filename': frame_data.video_filename,
        'frame_data_frame_number': frame_data.frame_number,
        'image_object_bbox_xmin': xmins,
        'image_object_bbox_xmax': xmaxs,
        'image_object_bbox_ymin': ymins,
        'image_object_bbox_ymax': ymaxs,
    }

    tf_example = tf.train.Example(features=tf.train.Features(feature={
        'image/height': dataset_util.int64_feature(height),
        'image/width': dataset_util.int64_feature(width),
        'image/filename': dataset_util.bytes_feature(frame_data.filename.encode('utf-8')),
        'image/source_id': dataset_util.bytes_feature(frame_data.filename.encode('utf-8')),
        'image/encoded': dataset_util.bytes_feature(encoded_image_data),
        'image/format': dataset_util.bytes_feature(frame_data.format.encode('utf-8')),
        'image/object/bbox/xmin': dataset_util.float_list_feature(xmins),
        'image/object/bbox/xmax': dataset_util.float_list_feature(xmaxs),
        'image/object/bbox/ymin': dataset_util.float_list_feature(ymins),
        'image/object/bbox/ymax': dataset_util.float_list_feature(ymaxs),
        'image/object/class/text': dataset_util.bytes_list_feature(classes_txt),
        'image/object/class/label': dataset_util.int64_list_feature(class_ids),
    }))
    label_counter_for_frame = collections.Counter(labels)
    is_negative = len(rects) == 0
    return tf_example, label_counter_for_frame, is_negative, debug_info
