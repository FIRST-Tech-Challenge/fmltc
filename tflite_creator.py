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
import action
import blob_storage
import model_trainer
import storage
import util


def trigger_create_tflite(team_uuid, model_uuid):
    action_parameters = action.create_action_parameters(action.ACTION_NAME_CREATE_TFLITE)
    action_parameters['team_uuid'] = team_uuid
    action_parameters['model_uuid'] = model_uuid
    action.trigger_action_via_blob(action_parameters)

def create_tflite(action_parameters):
    team_uuid = action_parameters['team_uuid']
    model_uuid = action_parameters['model_uuid']

    model_entity = model_trainer.retrieve_model_entity(team_uuid, model_uuid)

    # The following code is inspired by
    # https://colab.sandbox.google.com/github/tensorflow/models/blob/master/research/object_detection/colab_tutorials/convert_odt_model_to_TFLite.ipynb
    # and
    # https://github.com/tensorflow/models/blob/b3483b3942ab9bddc94fcbc5bd00fc790d1ddfcb/research/object_detection/export_tflite_graph_tf2.py

    if not blob_storage.tflite_saved_model_exists(team_uuid, model_uuid):
        # Export TFLite inference graph.
        pipeline_config_path = blob_storage.get_pipeline_config_path(team_uuid, model_uuid)
        pipeline_config = pipeline_pb2.TrainEvalPipelineConfig()
        with tf.io.gfile.GFile(pipeline_config_path, 'r') as f:
            text_format.Parse(f.read(), pipeline_config)
        trained_checkpoint_path = model_entity['trained_checkpoint_path']
        if trained_checkpoint_path == '':
            message = 'Error: Trained checkpoint not found for model_uuid=%s.' % model_uuid
            logging.critical(message)
            raise exceptions.HttpErrorNotFound(message)
        trained_checkpoint_dir = trained_checkpoint_path[:trained_checkpoint_path.rindex('/')]
        output_directory = blob_storage.get_tflite_folder_path(team_uuid, model_uuid)
        max_detections = 10  # This matches the default for TFObjectDetector.Parameters.maxNumDetections in the the FTC SDK.
        export_tflite_graph_lib_tf2.export_tflite_model(pipeline_config, trained_checkpoint_dir,
            output_directory, max_detections, use_regular_nms=False)

    action.retrigger_if_necessary(action_parameters)

    if not blob_storage.tflite_quantized_model_exists(team_uuid, model_uuid):
        # Convert to a quantized tflite model
        saved_model_path = blob_storage.get_tflite_saved_model_path(team_uuid, model_uuid)
        converter = tf.lite.TFLiteConverter.from_saved_model(saved_model_path)
        converter.optimizations = [tf.lite.Optimize.DEFAULT] # DEFAULT means the tflite model with be quantized.
        tflite_quantized_model = converter.convert()
        blob_storage.store_tflite_quantized_model(team_uuid, model_uuid, tflite_quantized_model)

    action.retrigger_if_necessary(action_parameters)

    if not blob_storage.tflite_label_map_txt_exists(team_uuid, model_uuid):
        # Create the label map.
        blob_storage.store_tflite_label_map_txt(team_uuid, model_uuid,
                '\n'.join(model_entity['sorted_label_list']))

    action.retrigger_if_necessary(action_parameters)

    if not blob_storage.tflite_model_with_metadata_exists(team_uuid, model_uuid):
        # Add Metadata
        # Make a temporary directory
        folder = '/tmp/tflite_creater/%s' % str(uuid.uuid4().hex)
        os.makedirs(folder, exist_ok=True)
        try:
            quantized_model_filename = '%s/quantized_model' % folder
            blob_storage.write_tflite_quantized_model_to_file(team_uuid, model_uuid, quantized_model_filename)
            label_map_txt_filename = '%s/label_map.txt' % folder
            blob_storage.write_tflite_label_map_txt_to_file(team_uuid, model_uuid, label_map_txt_filename)
            model_with_metadata_filename = '%s/model_with_metadata.tflite' % folder

            writer = object_detector.MetadataWriter.create_for_inference(
                    writer_utils.load_file(quantized_model_filename),
                    input_norm_mean=[127.5],  input_norm_std=[127.5],
                    label_file_paths=[label_map_txt_filename])
            writer_utils.save_file(writer.populate(), model_with_metadata_filename)

            blob_storage.store_tflite_model_with_metadata(team_uuid, model_uuid, model_with_metadata_filename)
        finally:
            # Delete the temporary directory.
            shutil.rmtree(folder)
