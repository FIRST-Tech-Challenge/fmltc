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
from datetime import datetime, timedelta
import json
import os
import re
import uuid

# My Modules
import action
import constants
import util

BUCKET_BLOBS = ('%s-blobs' % constants.PROJECT_ID)

# blob storage

def __retrieve_blob(blob_name):
    blob = util.storage_client().get_bucket(BUCKET_BLOBS).blob(blob_name)
    return blob.download_as_string()

def __write_blob_to_file(blob_name, filename):
    blob = util.storage_client().get_bucket(BUCKET_BLOBS).blob(blob_name)
    if blob.exists():
        blob.download_to_filename(filename)
        return True
    return False

def __write_file_to_blob(blob_name, filename, content_type):
    blob = util.storage_client().bucket(BUCKET_BLOBS).blob(blob_name)
    # Retry up to 5 times.
    retry = 0
    while True:
        try:
            blob.upload_from_filename(filename, content_type=content_type)
            return
        except:
            if retry < 5:
                retry += 1
            else:
                raise

def __write_string_to_blob(blob_name, s, content_type):
    blob = util.storage_client().bucket(BUCKET_BLOBS).blob(blob_name)
    # Retry up to 5 times.
    retry = 0
    while True:
        try:
            blob.upload_from_string(s, content_type=content_type)
            return
        except:
            if retry < 5:
                retry += 1
            else:
                raise

def __get_path(blob_name_or_folder):
    return 'gs://%s/%s' % (BUCKET_BLOBS, blob_name_or_folder)

def set_cors_policy_for_get():
    bucket = util.storage_client().bucket(BUCKET_BLOBS)
    policies = bucket.cors
    if len(policies) == 0:
        policies.append({'origin': [constants.ORIGIN]})
        policies[0]['responseHeader'] = ['Content-Type']
        policies[0]['method'] = ['GET']
        policies[0]['maxAgeSeconds'] = 3600
        bucket.cors = policies
        bucket.update()

def set_cors_policy_for_put():
    bucket = util.storage_client().bucket(BUCKET_BLOBS)
    policies = bucket.cors
    if len(policies) == 0:
        policies.append({'origin': [constants.ORIGIN]})
        policies[0]['responseHeader'] = ['Content-Type']
        policies[0]['method'] = ['PUT']
        policies[0]['maxAgeSeconds'] = 3600
        bucket.cors = policies
        bucket.update()

def __get_download_url(blob_name):
    blob = util.storage_client().bucket(BUCKET_BLOBS).blob(blob_name)
    if not blob.exists():
        return False, ''
    expires_at_datetime = datetime.now() + timedelta(minutes=10)
    return True, blob.generate_signed_url(expires_at_datetime, method='GET')

def __delete_blob(blob_name):
    blob = util.storage_client().get_bucket(BUCKET_BLOBS).blob(blob_name)
    if blob.exists():
        blob.delete()
        return True
    return False

def __delete_blobs(blob_names):
    # Ignore 404 errors on delete.
    bucket = util.storage_client().get_bucket(BUCKET_BLOBS)
    bucket.delete_blobs(blob_names, on_error=lambda blob: None)

# video files

def prepare_to_upload_video(team_uuid, video_uuid, content_type):
    video_blob_name = 'video_files/%s/%s' % (team_uuid, video_uuid)
    blob = util.storage_client().bucket(BUCKET_BLOBS).blob(video_blob_name)
    expires_at_datetime = datetime.now() + timedelta(minutes=5)
    signed_url = blob.generate_signed_url(expires_at_datetime, method='PUT', content_type=content_type)
    return video_blob_name, signed_url

def retrieve_video(video_blob_name):
    return __retrieve_blob(video_blob_name)

def write_video_to_file(video_blob_name, filename):
    return __write_blob_to_file(video_blob_name, filename)

def delete_video_blob(video_blob_name):
    __delete_blob(video_blob_name)

# video frame images

def store_video_frame_image(team_uuid, video_uuid, frame_number, content_type, image):
    image_blob_name = 'image_files/%s/%s/%05d' % (team_uuid, video_uuid, frame_number)
    __write_string_to_blob(image_blob_name, image, content_type)
    return image_blob_name

def retrieve_video_frame_image(image_blob_name):
    return __retrieve_blob(image_blob_name)

def get_image_urls(image_blob_names):
    bucket = util.storage_client().bucket(BUCKET_BLOBS)
    expires_at_datetime = datetime.now() + timedelta(minutes=10)
    signed_urls = []
    for image_blob_name in image_blob_names:
        blob = bucket.blob(image_blob_name)
        signed_urls.append(blob.generate_signed_url(expires_at_datetime, method='GET'))
    return signed_urls

def delete_video_frame_images(image_blob_names):
    __delete_blobs(image_blob_names)

# dataset records

def get_dataset_folder(team_uuid, dataset_uuid):
    return 'tf_records/%s/%s' % (team_uuid, dataset_uuid)

def get_dataset_folder_path(team_uuid, dataset_uuid):
    return __get_path(get_dataset_folder(team_uuid, dataset_uuid))

def store_dataset_label_map(team_uuid, dataset_uuid, sorted_label_list):
    label_map = util.make_label_map(sorted_label_list)
    label_map_blob_name = '%s/label.pbtxt' % get_dataset_folder(team_uuid, dataset_uuid)
    label_map_path = '%s/label.pbtxt' % get_dataset_folder_path(team_uuid, dataset_uuid)
    __write_string_to_blob(label_map_blob_name, label_map, 'text/plain')
    return label_map_blob_name, label_map_path

def store_dataset_record(team_uuid, dataset_uuid, record_id, temp_record_filename):
    tf_record_blob_name = '%s/%s' % (get_dataset_folder(team_uuid, dataset_uuid), record_id)
    __write_file_to_blob(tf_record_blob_name, temp_record_filename, 'application/octet-stream')
    return tf_record_blob_name

def retrieve_dataset_blob(blob_name):
    return __retrieve_blob(blob_name)

def delete_dataset_blob(blob_name):
    __delete_blob(blob_name)

def delete_dataset_blobs(blob_names):
    __delete_blobs(blob_names)

# dataset zips

def __get_dataset_zip_blob_name(team_uuid, dataset_zip_uuid, partition_index):
    return 'dataset_zips/%s/%s/%s' % (team_uuid, dataset_zip_uuid, partition_index)

def store_dataset_zip(team_uuid, dataset_zip_uuid, partition_index, zip_data):
    blob_name = __get_dataset_zip_blob_name(team_uuid, dataset_zip_uuid, partition_index)
    __write_string_to_blob(blob_name, zip_data, 'application/zip')
    return blob_name

def get_dataset_zip_download_url(team_uuid, dataset_zip_uuid, partition_count):
    exists_array = []
    download_url_array = []
    for partition_index in range(partition_count):
        exists, download_url =  __get_download_url(
            __get_dataset_zip_blob_name(team_uuid, dataset_zip_uuid, partition_index))
        exists_array.append(exists)
        download_url_array.append(download_url)
    return exists_array, download_url_array

def delete_dataset_zip(team_uuid, dataset_zip_uuid, partition_index):
    blob_name = __get_dataset_zip_blob_name(team_uuid, dataset_zip_uuid, partition_index)
    __delete_blob(blob_name)

# models

def __get_model_folder(team_uuid, model_uuid):
    return 'models/%s/%s' % (team_uuid, model_uuid)

def get_model_folder_path(team_uuid, model_uuid):
    return __get_path(__get_model_folder(team_uuid, model_uuid))

def __get_pipeline_config_blob_name(team_uuid, model_uuid):
    return '%s/%s' % (__get_model_folder(team_uuid, model_uuid), 'pipeline.config')

def get_pipeline_config_path(team_uuid, model_uuid):
    return __get_path(__get_pipeline_config_blob_name(team_uuid, model_uuid))

def store_pipeline_config(team_uuid, model_uuid, pipeline_config):
    pipeline_config_blob_name = __get_pipeline_config_blob_name(team_uuid, model_uuid)
    __write_string_to_blob(pipeline_config_blob_name, pipeline_config, 'text/plain')
    return get_pipeline_config_path(team_uuid, model_uuid)

def write_pipeline_config_to_file(team_uuid, model_uuid, filename):
    blob_name = __get_pipeline_config_blob_name(team_uuid, model_uuid)
    __write_blob_to_file(blob_name, filename)

def get_event_file_paths(team_uuid, model_uuid, job_type):
    client = util.storage_client()
    if job_type == 'train':
        folder = '%s/train' % __get_model_folder(team_uuid, model_uuid)
    else: # 'eval'
        folder = '%s/eval' % __get_model_folder(team_uuid, model_uuid)
    prefix = '%s/events.out.tfevents.' % folder
    dict_path_to_updated = {}
    for blob in client.list_blobs(BUCKET_BLOBS, prefix=prefix):
        dict_path_to_updated[__get_path(blob.name)] = blob.updated
    return dict_path_to_updated

def get_event_summary_image_blob_name(team_uuid, model_uuid, job_type, step, tag):
    return '%s/images_%s/step_%d_%s' % (__get_model_folder(team_uuid, model_uuid), job_type, step, tag.replace('/', '_'))

def store_event_summary_image(team_uuid, model_uuid, job_type, step, tag, encoded_image_string):
    blob_name = get_event_summary_image_blob_name(team_uuid, model_uuid, job_type, step, tag)
    bucket = util.storage_client().bucket(BUCKET_BLOBS)
    blob = bucket.blob(blob_name)
    if not blob.exists():
        __write_string_to_blob(blob_name, encoded_image_string, 'image/png')

def get_event_summary_image_download_url(team_uuid, model_uuid, job_type, step, tag, encoded_image_string):
    blob_name = get_event_summary_image_blob_name(team_uuid, model_uuid, job_type, step, tag)
    bucket = util.storage_client().bucket(BUCKET_BLOBS)
    blob = bucket.blob(blob_name)
    if not blob.exists() and encoded_image_string is not None:
        __write_string_to_blob(blob_name, encoded_image_string, 'image/png')
    return __get_download_url(blob_name)

def get_trained_checkpoint_path(team_uuid, model_uuid):
    client = util.storage_client()
    # We're looking for a file like this: ckpt-1.index
    prefix = '%s/ckpt-' % __get_model_folder(team_uuid, model_uuid)
    pattern = re.compile(r'%s(\d*)\.index' % prefix)
    max_number = None
    blob_name = ''
    for blob in client.list_blobs(BUCKET_BLOBS, prefix=prefix):
        match = pattern.match(blob.name)
        if match is not None:
            n = int(match.group(1))
            if max_number is None or n > max_number:
                max_number = n
                blob_name = blob.name
    if blob_name != '':
        return __get_path(blob_name)
    return ''

def __get_tflite_folder(team_uuid, model_uuid):
    return '%s/tflite' % (__get_model_folder(team_uuid, model_uuid))

def get_tflite_folder_path(team_uuid, model_uuid):
    return __get_path(__get_tflite_folder(team_uuid, model_uuid))

def __get_tflite_saved_model_folder(team_uuid, model_uuid):
    return '%s/saved_model' % __get_tflite_folder(team_uuid, model_uuid)

def get_tflite_saved_model_path(team_uuid, model_uuid):
    return __get_path(__get_tflite_saved_model_folder(team_uuid, model_uuid))

def tflite_saved_model_exists(team_uuid, model_uuid):
    client = util.storage_client()
    # saved_model is a directory. Check whether any files exist in the directory.
    prefix = '%s/' % __get_tflite_saved_model_folder(team_uuid, model_uuid)
    for blob in client.list_blobs(BUCKET_BLOBS, prefix=prefix):
        return True
    return False

def __get_tflite_quantized_model_blob_name(team_uuid, model_uuid):
    return '%s/quantized_model' % __get_tflite_folder(team_uuid, model_uuid)

def tflite_quantized_model_exists(team_uuid, model_uuid):
    client = util.storage_client()
    blob_name = __get_tflite_quantized_model_blob_name(team_uuid, model_uuid)
    blob = util.storage_client().get_bucket(BUCKET_BLOBS).blob(blob_name)
    return blob.exists()

def store_tflite_quantized_model(team_uuid, model_uuid, tflite_quantized_model):
    blob_name = __get_tflite_quantized_model_blob_name(team_uuid, model_uuid)
    __write_string_to_blob(blob_name, tflite_quantized_model, 'application/octet-stream')

def write_tflite_quantized_model_to_file(team_uuid, model_uuid, filename):
    blob_name = __get_tflite_quantized_model_blob_name(team_uuid, model_uuid)
    return __write_blob_to_file(blob_name, filename)

def __get_tflite_label_map_txt_blob_name(team_uuid, model_uuid):
    return '%s/label_map.txt' % __get_tflite_folder(team_uuid, model_uuid)

def tflite_label_map_txt_exists(team_uuid, model_uuid):
    client = util.storage_client()
    blob_name = __get_tflite_label_map_txt_blob_name(team_uuid, model_uuid)
    blob = util.storage_client().get_bucket(BUCKET_BLOBS).blob(blob_name)
    return blob.exists()

def store_tflite_label_map_txt(team_uuid, model_uuid, tflite_label_map_txt):
    blob_name = __get_tflite_label_map_txt_blob_name(team_uuid, model_uuid)
    __write_string_to_blob(blob_name, tflite_label_map_txt, 'text/plain')

def write_tflite_label_map_txt_to_file(team_uuid, model_uuid, filename):
    blob_name = __get_tflite_label_map_txt_blob_name(team_uuid, model_uuid)
    return __write_blob_to_file(blob_name, filename)

def __get_tflite_model_with_metadata_blob_name(team_uuid, model_uuid):
    return '%s/model_with_metadata.tflite' % __get_tflite_folder(team_uuid, model_uuid)

def tflite_model_with_metadata_exists(team_uuid, model_uuid):
    client = util.storage_client()
    blob_name = __get_tflite_model_with_metadata_blob_name(team_uuid, model_uuid)
    blob = util.storage_client().get_bucket(BUCKET_BLOBS).blob(blob_name)
    return blob.exists()

def store_tflite_model_with_metadata(team_uuid, model_uuid, tflite_model_with_metadata_filename):
    blob_name = __get_tflite_model_with_metadata_blob_name(team_uuid, model_uuid)
    __write_file_to_blob(blob_name, tflite_model_with_metadata_filename, 'application/octet-stream')

def get_tflite_model_with_metadata_url(team_uuid, model_uuid):
    return __get_download_url(__get_tflite_model_with_metadata_blob_name(team_uuid, model_uuid))

def delete_model_blobs(team_uuid, model_uuid, action_parameters):
    client = util.storage_client()
    prefix = '%s/' % __get_model_folder(team_uuid, model_uuid)
    for blob in client.list_blobs(BUCKET_BLOBS, prefix=prefix):
        __delete_blob(blob.name)
        action.retrigger_if_necessary(action_parameters)
