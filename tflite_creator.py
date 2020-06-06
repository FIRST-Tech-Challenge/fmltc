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
import os
import uuid

# Other Modules
from google.protobuf import text_format
from object_detection import export_tflite_ssd_graph_lib
from object_detection.protos import pipeline_pb2
import tensorflow as tf
from tensorflow.lite.python import lite_constants

# My Modules
import blob_storage
import model_trainer
import storage
import util


def create_tflite_graph_pb(team_uuid, model_uuid):
    if blob_storage.tflite_graph_pb_exists(team_uuid, model_uuid):
        return

    # The following code is inspired by
    # https://github.com/tensorflow/models/tree/e5c9661aadbcb90cb4fd3ef76066f6d1dab116ff/research/object_detection/export_tflite_ssd_graph.py
    pipeline_config_path = blob_storage.get_pipeline_config_path(team_uuid, model_uuid)
    pipeline_config = pipeline_pb2.TrainEvalPipelineConfig()
    with tf.io.gfile.GFile(pipeline_config_path, 'r') as f:
        text_format.Merge(f.read(), pipeline_config)
    trained_checkpoint_prefix = blob_storage.get_trained_checkpoint_prefix(team_uuid, model_uuid)
    output_directory = blob_storage.get_tflite_folder_path(team_uuid, model_uuid)
    add_postprocessing_op = True
    max_detections = 10
    max_classes_per_detection = 1
    use_regular_nms = False
    export_tflite_ssd_graph_lib.export_tflite_graph(
        pipeline_config, trained_checkpoint_prefix, output_directory,
        add_postprocessing_op, max_detections,
        max_classes_per_detection, use_regular_nms=use_regular_nms)


def create_tflite(team_uuid, model_uuid):
    exists, download_url = blob_storage.get_tflite_download_url(team_uuid, model_uuid)
    if exists:
        return download_url

    # Write the tflite_graph.pb to a local file.
    graph_def_file = '/tmp/%s.pb' % str(uuid.uuid4().hex)
    os.makedirs(os.path.dirname(graph_def_file), exist_ok=True)
    success = blob_storage.write_tflite_graph_pb_to_file(team_uuid, model_uuid, graph_def_file)

    try:
        # The following code is inspired by
        # https://github.com/tensorflow/tensorflow/tree/4386a6640c9fb65503750c37714971031f3dc1fd/tensorflow/lite/python/lite.py
        # and
        # https://github.com/tensorflow/tensorflow/tree/4386a6640c9fb65503750c37714971031f3dc1fd/tensorflow/lite/python/tflite_convert.py
        input_arrays = ['normalized_input_image_tensor']
        output_arrays = [
            'TFLite_Detection_PostProcess',
            'TFLite_Detection_PostProcess:1',
            'TFLite_Detection_PostProcess:2',
            'TFLite_Detection_PostProcess:3'
        ]
        input_shapes = {'normalized_input_image_tensor': [1, 300, 300, 3]}
        converter = tf.lite.TFLiteConverter.from_frozen_graph(
            graph_def_file, input_arrays, output_arrays, input_shapes=input_shapes)
        converter.inference_type = lite_constants.QUANTIZED_UINT8
        mean_values = [128]
        std_dev_values = [128]
        quant_stats = list(zip(mean_values, std_dev_values))
        converter.quantized_input_stats = dict(list(zip(input_arrays, quant_stats)))
        converter.change_concat_input_ranges = False
        converter.allow_custom_ops = True
        tflite_model = converter.convert()
        blob_storage.store_tflite(team_uuid, model_uuid, tflite_model)
        _, download_url = blob_storage.get_tflite_download_url(team_uuid, model_uuid)
        return download_url
    finally:
        # Delete the temporary file.
        os.remove(graph_def_file)
