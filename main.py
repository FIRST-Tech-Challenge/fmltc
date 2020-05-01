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
from functools import wraps
import json
import logging
import time

# Other Modules
from flask import Flask, jsonify, redirect, render_template, request, Response, session, url_for
from google.cloud import error_reporting

# My Modules
import action
import blob_storage
import constants
import dataset_producer
import dataset_zipper
import exceptions
import frame_extractor
import model_trainer
import storage
import team_info
import tracking
import util


app = Flask(__name__)
app.config.update(
    SECRET_KEY=constants.SECRET_KEY,
    MAX_CONTENT_LENGTH=8 * 1024 * 1024,
    ALLOWED_EXTENSIONS=set(['png', 'jpg', 'jpeg', 'gif'])
)
app.debug = False
app.testing = False

BASE_URL = 'https://%s.appspot.com' % constants.PROJECT_ID
HTTP_PERFORM_ACTION_URL = 'https://%s-%s.cloudfunctions.net/http_perform_action' % (constants.REGION, constants.PROJECT_ID)


def redirect_to_login_if_needed(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if team_info.validate_team_info(session):
            return func(*args, **kwargs)
        return redirect(url_for('login'))
    return wrapper

def login_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if team_info.validate_team_info(session):
            return func(*args, **kwargs)
        return redirect('/403')
    return wrapper

def sanitize(o):
    if isinstance(o, list):
        for item in o:
            sanitize(item)
    if isinstance(o, dict):
        o.pop('team_uuid', None)
    return o

# pages

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        team_info.save(request.form, session)
        return redirect(url_for('index'))
    program = team_info.retrieve_program(session)
    team_number = team_info.retrieve_team_number(session)
    return render_template('login.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        program=program, team_number=team_number)

# TODO(lizlooney): add logout button to all pages.
@app.route('/logout')
def logout():
    # Remove the team information from the session if it's there.
    team_info.clear(session)
    return redirect(url_for('index'))

@app.route('/')
@redirect_to_login_if_needed
def index():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    team_number = team_info.retrieve_team_number(session)
    return render_template('root.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        team_preferences=storage.retrieve_user_preferences(team_uuid, team_number),
        http_perform_action_url=HTTP_PERFORM_ACTION_URL)

@app.route('/labelVideo')
@redirect_to_login_if_needed
def label_video():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    team_number = team_info.retrieve_team_number(session)
    video_uuid = request.args.get('video_uuid')
    video_entity = storage.retrieve_video_entity(team_uuid, video_uuid)
    sanitize(video_entity)
    return render_template('labelVideo.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        team_preferences=storage.retrieve_user_preferences(team_uuid, team_number),
        http_perform_action_url=HTTP_PERFORM_ACTION_URL,
        video_uuid=video_uuid, video_entity=video_entity)


# requests

@app.route('/setUserPreference', methods=['POST'])
@login_required
def set_user_preference():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    team_number = team_info.retrieve_team_number(session)
    data = request.form.to_dict(flat=True)
    key = data.get('key')
    value = data.get('value')
    storage.store_user_preference(team_uuid, team_number, key, value)
    return 'OK'

@app.route('/prepareToUploadVideo', methods=['POST'])
@login_required
def prepare_to_upload_video():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_filename = data.get('video_filename')
    file_size = int(data.get('file_size'))
    content_type = data.get('content_type')
    upload_time_ms = int(data.get('upload_time_ms'))
    video_uuid = storage.store_video(team_uuid, video_filename, file_size, upload_time_ms)
    signed_url = storage.prepare_to_upload_video(team_uuid, video_uuid, content_type)
    action_parameters = frame_extractor.make_action_parameters(team_uuid, video_uuid)
    response = {
        'video_uuid': video_uuid,
        'signed_url': signed_url,
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return jsonify(response)

@app.route('/triggerFrameExtraction', methods=['POST'])
@login_required
def trigger_frame_extraction():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    storage.prepare_to_trigger_frame_extractor(team_uuid, video_uuid)
    action_parameters = frame_extractor.make_action_parameters(team_uuid, video_uuid)
    response = {
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return jsonify(response)

@app.route('/retrieveVideoList', methods=['POST'])
@login_required
def retrieve_video_list():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    video_entities = storage.retrieve_video_list(team_uuid)
    sanitize(video_entities)
    response = {
        'video_entities': video_entities,
    }
    return jsonify(response)

@app.route('/retrieveVideo', methods=['POST'])
@login_required
def retrieve_video():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    video_entity = storage.retrieve_video_entity(team_uuid, video_uuid)
    sanitize(video_entity)
    response = {
        'video_entity': video_entity,
    }
    return jsonify(response)

@app.route('/deleteVideo', methods=['POST'])
@login_required
def delete_video():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    storage.delete_video(team_uuid, video_uuid)
    return 'OK'

@app.route('/retrieveVideoFrameImage', methods=['GET'])
@login_required
def retrieve_video_frame_image():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.args.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    frame_number = int(data.get('frame_number'))
    image_data, content_type = storage.retrieve_video_frame_image(team_uuid, video_uuid, frame_number)
    return Response(image_data, mimetype=content_type)

@app.route('/retrieveVideoFrames', methods=['POST'])
@login_required
def retrieve_video_frames():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    min_frame_number = int(data.get('min_frame_number'))
    max_frame_number = int(data.get('max_frame_number'))
    video_frame_entities = storage.retrieve_video_frame_entities(
        team_uuid, video_uuid, min_frame_number, max_frame_number)
    sanitize(video_frame_entities)
    response = {
        'video_frame_entities': video_frame_entities,
    }
    return jsonify(response)

@app.route('/retrieveVideoFramesWithImageUrls', methods=['POST'])
@login_required
def retrieve_video_frames_with_image_urls():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    min_frame_number = int(data.get('min_frame_number'))
    max_frame_number = int(data.get('max_frame_number'))
    video_frame_entities = storage.retrieve_video_frame_entities_with_image_urls(
        team_uuid, video_uuid, min_frame_number, max_frame_number)
    sanitize(video_frame_entities)
    response = {
        'video_frame_entities': video_frame_entities,
    }
    return jsonify(response)


@app.route('/storeVideoFrameBboxesText', methods=['POST'])
@login_required
def store_video_frame_bboxes_text():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    frame_number = int(data.get('frame_number'))
    bboxes_text = data.get('bboxes_text')
    storage.store_video_frame_bboxes_text(team_uuid, video_uuid, frame_number, bboxes_text)
    return 'ok'

@app.route('/storeVideoFrameIncludeInDataset', methods=['POST'])
@login_required
def store_video_frame_include_in_dataset():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    frame_number = int(data.get('frame_number'))
    include_frame_in_dataset = (data.get('include_frame_in_dataset') == 'true')
    storage.store_video_frame_include_in_dataset(team_uuid, video_uuid, frame_number, include_frame_in_dataset)
    return 'ok'

@app.route('/prepareToStartTracking', methods=['POST'])
@login_required
def prepare_to_start_tracking():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    init_frame_number = int(data.get('init_frame_number'))
    init_bboxes_text = data.get('init_bboxes_text')
    tracker_name = data.get('tracker_name')
    scale = float(data.get('scale'))
    tracker_uuid = tracking.prepare_to_start_tracking(team_uuid, video_uuid, tracker_name, scale, init_frame_number, init_bboxes_text)
    action_parameters = tracking.make_action_parameters(tracker_uuid)
    response = {
        'tracker_uuid': tracker_uuid,
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return jsonify(response)

@app.route('/retrieveTrackedBboxes', methods=['POST'])
@login_required
def retrieve_tracked_bboxes():
    data = request.form.to_dict(flat=True)
    tracker_uuid = data.get('tracker_uuid')
    frame_number, bboxes_text, update_time_utc_ms = storage.retrieve_tracked_bboxes(tracker_uuid)
    response = {
        'frame_number': frame_number,
        'bboxes_text': bboxes_text,
        'update_time_utc_ms': update_time_utc_ms,
    }
    return jsonify(response)

@app.route('/continueTracking', methods=['POST'])
@login_required
def continue_tracking():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    tracker_uuid = data.get('tracker_uuid')
    frame_number = int(data.get('frame_number'))
    bboxes_text = data.get('bboxes_text')
    storage.continue_tracking(team_uuid, video_uuid, tracker_uuid, frame_number, bboxes_text)
    return 'OK'

@app.route('/trackingClientStillAlive', methods=['POST'])
@login_required
def tracking_client_still_alive():
    data = request.form.to_dict(flat=True)
    tracker_uuid = data.get('tracker_uuid')
    storage.tracking_client_still_alive(tracker_uuid)
    return 'OK'

@app.route('/stopTracking', methods=['POST'])
@login_required
def stop_tracking():
    data = request.form.to_dict(flat=True)
    tracker_uuid = data.get('tracker_uuid')
    storage.set_tracking_stop_requested(tracker_uuid)
    return 'OK'

@app.route('/startDatasetProduction', methods=['POST'])
@login_required
def start_dataset_production():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    video_uuids_json = data.get('video_uuids')
    eval_percent = int(data.get('eval_percent'))
    start_time_ms = int(data.get('start_time_ms'))
    dataset_uuid = dataset_producer.start_dataset_production(
        team_uuid, video_uuids_json, eval_percent, start_time_ms)
    response = {
        'dataset_uuid': dataset_uuid,
    }
    return jsonify(response)

@app.route('/retrieveDatasetList', methods=['POST'])
@login_required
def retrieve_dataset_list():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    dataset_entities = storage.retrieve_dataset_list(team_uuid)
    sanitize(dataset_entities)
    response = {
        'dataset_entities': dataset_entities,
    }
    return jsonify(response)

@app.route('/retrieveDataset', methods=['POST'])
@login_required
def retrieve_dataset():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    dataset_uuid = data.get('dataset_uuid')
    dataset_entity = storage.retrieve_dataset_entity(team_uuid, dataset_uuid)
    sanitize(dataset_entity)
    response = {
        'dataset_entity': dataset_entity,
    }
    return jsonify(response)

@app.route('/deleteDataset', methods=['POST'])
@login_required
def delete_dataset():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    dataset_uuid = data.get('dataset_uuid')
    storage.delete_dataset(team_uuid, dataset_uuid)
    return 'OK'

@app.route('/prepareToZipDataset', methods=['POST'])
@login_required
def prepare_to_zip_dataset():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    dataset_uuids_json = data.get('dataset_uuids')
    dataset_zip_uuid, dataset_zipper_prep = dataset_zipper.prepare_to_zip_dataset(team_uuid, dataset_uuids_json)
    action_parameters = dataset_zipper.make_action_parameters(team_uuid, dataset_zip_uuid, dataset_zipper_prep)
    response = {
        'dataset_zip_uuid': dataset_zip_uuid,
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return jsonify(response)

@app.route('/getDatasetZipStatus', methods=['POST'])
@login_required
def get_dataset_zip_status():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    dataset_zip_uuid = data.get('dataset_zip_uuid')
    is_ready, signed_url = blob_storage.get_dataset_zip_status(team_uuid, dataset_zip_uuid)
    response = {
        'is_ready': is_ready,
        'signed_url': signed_url,
    }
    return jsonify(response)

@app.route('/deleteDatasetZip', methods=['POST'])
@login_required
def delete_dataset_zip():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    dataset_zip_uuid = data.get('dataset_zip_uuid')
    blob_storage.delete_dataset_zip(team_uuid, dataset_zip_uuid)
    return 'OK'

@app.route('/prepareToTrainModel', methods=['POST'])
@login_required
def prepare_to_train_model():
    team_uuid = team_info.retrieve_team_uuid(session, request)
    data = request.form.to_dict(flat=True)
    dataset_uuids_json = data.get('dataset_uuids')
    model_uuid, model_trainer_prep = model_trainer.prepare_to_train_model(team_uuid, dataset_uuids_json)
    action_parameters = model_trainer.make_action_parameters(team_uuid, model_uuid, model_trainer_prep)
    response = {
        'model_uuid': model_uuid,
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return jsonify(response)

# errors

@app.errorhandler(403)
def forbidden(e):
    logging.exception('Forbidden.')
    return "Forbidden: <pre>{}</pre>".format(e), 403

@app.errorhandler(500)
def server_error(e):
    logging.exception('An internal error occurred.')
    return "An internal error occurred: <pre>{}</pre>".format(e), 500

# functions

def http_perform_action(request):
    time_limit = datetime.now() + timedelta(seconds=500)
    # Set CORS headers for the preflight request
    if request.method == 'OPTIONS':
        # Allows POST requests from any origin with the Content-Type
        # header and caches preflight response for an 3600s.
        headers = {
            #'Access-Control-Allow-Origin': BASE_URL,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600',
        }
        return ('', 204, headers)
    # Set CORS headers for the main request
    headers = {
        #'Access-Control-Allow-Origin': BASE_URL,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600',
    }
    # TODO(lizlooney): Use some mechanism to verify that the request is from our js code.
    action_parameters = request.get_json()
    active_memory_limit = 2000000000
    action.perform_action(action_parameters, time_limit, active_memory_limit)
    return ('OK', 200, headers)

def perform_action(data, context):
    time_limit = datetime.now() + timedelta(seconds=500)
    if data['bucket'] == action.BUCKET_ACTION_PARAMETERS:
        active_memory_limit = 2000000000
        action.perform_action_from_blob(data['name'], time_limit, active_memory_limit)
    return 'OK'

# For running locally:

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8088, debug=True)
