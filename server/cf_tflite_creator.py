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
import logging
import os
import shutil
import uuid

# Other Modules
from google.protobuf import text_format
from object_detection import export_tflite_graph_lib_tf2
from object_detection.protos import pipeline_pb2
import tensorflow as tf
from tflite_support.metadata_writers import object_detector
from tflite_support.metadata_writers import writer_utils

# My Modules
from app_engine import action
from app_engine import blob_storage
from app_engine import exceptions
from app_engine import storage


def create_tflite(action_parameters):
    team_uuid = action_parameters['team_uuid']
    model_uuid = action_parameters['model_uuid']

    try:
        model_entity = storage.retrieve_model_entity(team_uuid, model_uuid)
        model_folder = model_entity['model_folder']
        tflite_files_folder = model_entity['tflite_files_folder']

        # The following code is inspired by
        # https://colab.sandbox.google.com/github/tensorflow/models/blob/master/research/object_detection/colab_tutorials/convert_odt_model_to_TFLite.ipynb
        # and
        # https://github.com/tensorflow/models/blob/b3483b3942ab9bddc94fcbc5bd00fc790d1ddfcb/research/object_detection/export_tflite_graph_tf2.py

        if not blob_storage.tflite_saved_model_exists(model_folder):
            # Export TFLite inference graph.
            pipeline_config_path = blob_storage.get_pipeline_config_path(model_folder)
            pipeline_config = pipeline_pb2.TrainEvalPipelineConfig()
            with tf.io.gfile.GFile(pipeline_config_path, 'r') as f:
                text_format.Parse(f.read(), pipeline_config)
            trained_checkpoint_path = model_entity['trained_checkpoint_path']
            if trained_checkpoint_path == '':
                message = 'Error: Trained checkpoint not found for model_uuid=%s.' % model_uuid
                logging.critical(message)
                raise exceptions.HttpErrorNotFound(message)
            trained_checkpoint_dir = trained_checkpoint_path[:trained_checkpoint_path.rindex('/')]
            output_directory = blob_storage.get_tflite_saved_model_parent_path(model_folder)
            max_detections = 10  # This matches the default for TFObjectDetector.Parameters.maxNumDetections in the the FTC SDK.
            export_tflite_graph_lib_tf2.export_tflite_model(pipeline_config, trained_checkpoint_dir,
                output_directory, max_detections, use_regular_nms=False)

        action.retrigger_if_necessary(action_parameters)

        if not blob_storage.tflite_quantized_model_exists(model_folder):
            # Convert to a quantized tflite model
            saved_model_path = blob_storage.get_tflite_saved_model_path(model_folder)
            converter = tf.lite.TFLiteConverter.from_saved_model(saved_model_path)
            converter.optimizations = [tf.lite.Optimize.DEFAULT] # DEFAULT means the tflite model will be quantized.
            tflite_quantized_model = converter.convert()
            blob_storage.store_tflite_quantized_model(model_folder, tflite_quantized_model)

        action.retrigger_if_necessary(action_parameters)

        if not blob_storage.tflite_label_map_txt_exists(tflite_files_folder):
            # Create the label map.
            blob_storage.store_tflite_label_map_txt(tflite_files_folder,
                    '\n'.join(model_entity['sorted_label_list']))

        action.retrigger_if_necessary(action_parameters)

        if not blob_storage.tflite_model_with_metadata_exists(tflite_files_folder):
            # Add Metadata
            # Make a temporary directory
            temp_folder = '/tmp/tflite_creater/%s' % str(uuid.uuid4().hex)
            os.makedirs(temp_folder, exist_ok=True)
            try:
                quantized_model_filename = '%s/quantized_model' % temp_folder
                blob_storage.write_tflite_quantized_model_to_file(model_folder, quantized_model_filename)
                label_map_txt_filename = '%s/label_map.txt' % temp_folder
                blob_storage.write_tflite_label_map_txt_to_file(tflite_files_folder, label_map_txt_filename)
                model_with_metadata_filename = '%s/model_with_metadata.tflite' % temp_folder

                writer = object_detector.MetadataWriter.create_for_inference(
                        writer_utils.load_file(quantized_model_filename),
                        input_norm_mean=[127.5],  input_norm_std=[127.5],
                        label_file_paths=[label_map_txt_filename])
                writer_utils.save_file(writer.populate(), model_with_metadata_filename)

                blob_storage.store_tflite_model_with_metadata(tflite_files_folder, model_with_metadata_filename)
            finally:
                # Delete the temporary directory.
                shutil.rmtree(temp_folder)
    except:
        # Check if the model has been deleted.
        team_entity = storage.retrieve_team_entity(team_uuid)
        if 'model_uuids_deleted' in team_entity:
            if model_uuid in team_entity['model_uuids_deleted']:
                return
        raise
