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
import flask

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


app = flask.Flask(__name__)
app.config.update(
    SECRET_KEY=constants.SECRET_KEY,
    MAX_CONTENT_LENGTH=8 * 1024 * 1024,
    ALLOWED_EXTENSIONS=set(['png', 'jpg', 'jpeg', 'gif'])
)
app.debug = False
app.testing = False

HTTP_PERFORM_ACTION_URL = 'https://%s-%s.cloudfunctions.net/http_perform_action' % (constants.REGION, constants.PROJECT_ID)


def redirect_to_login_if_needed(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if team_info.validate_team_info(flask.session):
            return func(*args, **kwargs)
        return flask.redirect(flask.url_for('login'))
    return wrapper

def login_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if team_info.validate_team_info(flask.session):
            return func(*args, **kwargs)
        return flask.redirect('/403')
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
    if flask.request.method == 'POST':
        team_info.save(flask.request.form, flask.session)
        return flask.redirect(flask.url_for('index'))
    program = team_info.retrieve_program(flask.session)
    team_number = team_info.retrieve_team_number(flask.session)
    return flask.render_template('login.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        program=program, team_number=team_number)

# TODO(lizlooney): add logout button to all pages.
@app.route('/logout')
def logout():
    # Remove the team information from the flask.session if it's there.
    team_info.clear(flask.session)
    return flask.redirect(flask.url_for('index'))

@app.route('/')
@redirect_to_login_if_needed
def index():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    team_number = team_info.retrieve_team_number(flask.session)
    return flask.render_template('root.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        team_preferences=storage.retrieve_user_preferences(team_uuid, team_number),
        http_perform_action_url=HTTP_PERFORM_ACTION_URL)

@app.route('/labelVideo')
@redirect_to_login_if_needed
def label_video():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    team_number = team_info.retrieve_team_number(flask.session)
    video_uuid = flask.request.args.get('video_uuid')
    video_entity = storage.retrieve_video_entity_for_labeling(team_uuid, video_uuid)
    sanitize(video_entity)
    return flask.render_template('labelVideo.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        team_preferences=storage.retrieve_user_preferences(team_uuid, team_number),
        http_perform_action_url=HTTP_PERFORM_ACTION_URL,
        video_uuid=video_uuid, video_entity=video_entity)


@app.route('/test')
@redirect_to_login_if_needed
def test():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    team_number = team_info.retrieve_team_number(flask.session)
    return flask.render_template('test.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        team_preferences=storage.retrieve_user_preferences(team_uuid, team_number),
        http_perform_action_url=HTTP_PERFORM_ACTION_URL)


# requests

@app.route('/setUserPreference', methods=['POST'])
@login_required
def set_user_preference():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    team_number = team_info.retrieve_team_number(flask.session)
    data = flask.request.form.to_dict(flat=True)
    key = data.get('key')
    value = data.get('value')
    storage.store_user_preference(team_uuid, team_number, key, value)
    return 'OK'

@app.route('/prepareToUploadVideo', methods=['POST'])
@login_required
def prepare_to_upload_video():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_filename = data.get('video_filename')
    file_size = int(data.get('file_size'))
    content_type = data.get('content_type')
    upload_time_ms = int(data.get('upload_time_ms'))
    video_uuid, upload_url = storage.prepare_to_upload_video(
        team_uuid, video_filename, file_size, content_type, upload_time_ms)
    action_parameters = frame_extractor.make_action_parameters(team_uuid, video_uuid)
    response = {
        'video_uuid': video_uuid,
        'upload_url': upload_url,
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return flask.jsonify(response)

@app.route('/triggerFrameExtraction', methods=['POST'])
@login_required
def trigger_frame_extraction():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    storage.prepare_to_trigger_frame_extractor(team_uuid, video_uuid)
    action_parameters = frame_extractor.make_action_parameters(team_uuid, video_uuid)
    response = {
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return flask.jsonify(response)

@app.route('/retrieveVideoList', methods=['POST'])
@login_required
def retrieve_video_list():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    video_entities = storage.retrieve_video_list(team_uuid)
    sanitize(video_entities)
    response = {
        'video_entities': video_entities,
    }
    return flask.jsonify(response)

@app.route('/retrieveVideo', methods=['POST'])
@login_required
def retrieve_video():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    video_entity = storage.retrieve_video_entity(team_uuid, video_uuid)
    sanitize(video_entity)
    response = {
        'video_entity': video_entity,
    }
    return flask.jsonify(response)

@app.route('/deleteVideo', methods=['POST'])
@login_required
def delete_video():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    storage.delete_video(team_uuid, video_uuid)
    return 'OK'

@app.route('/retrieveVideoFrameImage', methods=['GET'])
@login_required
def retrieve_video_frame_image():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.args.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    frame_number = int(data.get('frame_number'))
    image_data, content_type = storage.retrieve_video_frame_image(team_uuid, video_uuid, frame_number)
    return Response(image_data, mimetype=content_type)

@app.route('/retrieveVideoFrames', methods=['POST'])
@login_required
def retrieve_video_frames():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    min_frame_number = int(data.get('min_frame_number'))
    max_frame_number = int(data.get('max_frame_number'))
    video_frame_entities = storage.retrieve_video_frame_entities(
        team_uuid, video_uuid, min_frame_number, max_frame_number)
    sanitize(video_frame_entities)
    response = {
        'video_frame_entities': video_frame_entities,
    }
    return flask.jsonify(response)

@app.route('/retrieveVideoFramesWithImageUrls', methods=['POST'])
@login_required
def retrieve_video_frames_with_image_urls():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    min_frame_number = int(data.get('min_frame_number'))
    max_frame_number = int(data.get('max_frame_number'))
    video_frame_entities = storage.retrieve_video_frame_entities_with_image_urls(
        team_uuid, video_uuid, min_frame_number, max_frame_number)
    sanitize(video_frame_entities)
    response = {
        'video_frame_entities': video_frame_entities,
    }
    return flask.jsonify(response)


@app.route('/storeVideoFrameBboxesText', methods=['POST'])
@login_required
def store_video_frame_bboxes_text():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    frame_number = int(data.get('frame_number'))
    bboxes_text = data.get('bboxes_text')
    storage.store_video_frame_bboxes_text(team_uuid, video_uuid, frame_number, bboxes_text)
    return 'ok'

@app.route('/storeVideoFrameIncludeInDataset', methods=['POST'])
@login_required
def store_video_frame_include_in_dataset():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    frame_number = int(data.get('frame_number'))
    include_frame_in_dataset = (data.get('include_frame_in_dataset') == 'true')
    storage.store_video_frame_include_in_dataset(team_uuid, video_uuid, frame_number, include_frame_in_dataset)
    return 'ok'

@app.route('/prepareToStartTracking', methods=['POST'])
@login_required
def prepare_to_start_tracking():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    init_frame_number = int(data.get('init_frame_number'))
    init_bboxes_text = data.get('init_bboxes_text')
    tracker_name = data.get('tracker_name')
    scale = float(data.get('scale'))
    tracker_uuid = tracking.prepare_to_start_tracking(team_uuid, video_uuid, tracker_name, scale, init_frame_number, init_bboxes_text)
    action_parameters = tracking.make_action_parameters(video_uuid, tracker_uuid)
    response = {
        'tracker_uuid': tracker_uuid,
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return flask.jsonify(response)

@app.route('/retrieveTrackedBboxes', methods=['POST'])
@login_required
def retrieve_tracked_bboxes():
    time_limit = datetime.now() + timedelta(seconds=25)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    tracker_uuid = data.get('tracker_uuid')
    retrieve_frame_number = int(data.get('retrieve_frame_number'))
    tracker_failed, frame_number, bboxes_text = storage.retrieve_tracked_bboxes(
        video_uuid, tracker_uuid, retrieve_frame_number, time_limit)
    response = {
        'tracker_failed': tracker_failed,
        'frame_number': frame_number,
        'bboxes_text': bboxes_text,
    }
    return flask.jsonify(response)

@app.route('/continueTracking', methods=['POST'])
@login_required
def continue_tracking():
    time_limit = datetime.now() + timedelta(seconds=25)
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    tracker_uuid = data.get('tracker_uuid')
    frame_number = int(data.get('frame_number'))
    bboxes_text = data.get('bboxes_text')
    storage.continue_tracking(team_uuid, video_uuid, tracker_uuid, frame_number, bboxes_text)
    if 'retrieve_frame_number' in data:
        time.sleep(0.2)
        retrieve_frame_number = int(data.get('retrieve_frame_number'))
        tracker_failed, frame_number, bboxes_text = storage.retrieve_tracked_bboxes(
            video_uuid, tracker_uuid, retrieve_frame_number, time_limit)
        response = {
            'tracker_failed': tracker_failed,
            'frame_number': frame_number,
            'bboxes_text': bboxes_text,
        }
        return flask.jsonify(response)
    return 'OK'

@app.route('/trackingClientStillAlive', methods=['POST'])
@login_required
def tracking_client_still_alive():
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    tracker_uuid = data.get('tracker_uuid')
    storage.tracking_client_still_alive(video_uuid, tracker_uuid)
    return 'OK'

@app.route('/stopTracking', methods=['POST'])
@login_required
def stop_tracking():
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    tracker_uuid = data.get('tracker_uuid')
    storage.set_tracking_stop_requested(video_uuid, tracker_uuid)
    return 'OK'

@app.route('/prepareToStartDatasetProduction', methods=['POST'])
@login_required
def prepare_to_start_dataset_production():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuids_json = data.get('video_uuids')
    eval_percent = int(data.get('eval_percent'))
    start_time_ms = int(data.get('start_time_ms'))
    dataset_uuid = dataset_producer.prepare_to_start_dataset_production(
        team_uuid, eval_percent, start_time_ms)
    action_parameters = dataset_producer.make_action_parameters(
        team_uuid, dataset_uuid, video_uuids_json, eval_percent, start_time_ms)
    response = {
        'dataset_uuid': dataset_uuid,
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return flask.jsonify(response)

@app.route('/retrieveDatasetList', methods=['POST'])
@login_required
def retrieve_dataset_list():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    dataset_entities = storage.retrieve_dataset_list(team_uuid)
    sanitize(dataset_entities)
    response = {
        'dataset_entities': dataset_entities,
    }
    return flask.jsonify(response)

@app.route('/retrieveDataset', methods=['POST'])
@login_required
def retrieve_dataset():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_uuid = data.get('dataset_uuid')
    dataset_entity = storage.retrieve_dataset_entity(team_uuid, dataset_uuid)
    sanitize(dataset_entity)
    response = {
        'dataset_entity': dataset_entity,
    }
    return flask.jsonify(response)

@app.route('/deleteDataset', methods=['POST'])
@login_required
def delete_dataset():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_uuid = data.get('dataset_uuid')
    storage.delete_dataset(team_uuid, dataset_uuid)
    return 'OK'

@app.route('/prepareToZipDataset', methods=['POST'])
@login_required
def prepare_to_zip_dataset():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_uuid = data.get('dataset_uuid')
    dataset_zip_uuid = dataset_zipper.prepare_to_zip_dataset(team_uuid, dataset_uuid)
    partition_count, action_parameters = dataset_zipper.make_action_parameters(team_uuid, dataset_uuid, dataset_zip_uuid)
    response = {
        'dataset_zip_uuid': dataset_zip_uuid,
        'partition_count': partition_count,
        # TODO(lizlooney): encrypt the action_parameters
        'action_parameters': action_parameters,
    }
    return flask.jsonify(response)

@app.route('/getDatasetZipStatus', methods=['POST'])
@login_required
def get_dataset_zip_status():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_zip_uuid = data.get('dataset_zip_uuid')
    partition_index = int(data.get('partition_index'))
    is_ready, download_url = blob_storage.get_dataset_zip_status(team_uuid, dataset_zip_uuid, partition_index)
    response = {
        'is_ready': is_ready,
        'download_url': download_url,
    }
    return flask.jsonify(response)

@app.route('/deleteDatasetZip', methods=['POST'])
@login_required
def delete_dataset_zip():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_zip_uuid = data.get('dataset_zip_uuid')
    partition_index = int(data.get('partition_index'))
    blob_storage.delete_dataset_zip(team_uuid, dataset_zip_uuid, partition_index)
    return 'OK'

@app.route('/startTrainingModel', methods=['POST'])
@login_required
def start_training_model():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_uuid = data.get('dataset_uuid')
    start_time_ms = int(data.get('start_time_ms'))
    model_entity = model_trainer.start_training_model(team_uuid, dataset_uuid, start_time_ms)
    sanitize(model_entity)
    response = {
        'model_entity': model_entity,
    }
    return flask.jsonify(response)

@app.route('/retrieveModelList', methods=['POST'])
@login_required
def retrieve_model_list():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    model_entities = storage.retrieve_model_list(team_uuid)
    sanitize(model_entities)
    response = {
        'model_entities': model_entities,
    }
    return flask.jsonify(response)

@app.route('/retrieveModel', methods=['POST'])
@login_required
def retrieve_model():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    model_entity = model_trainer.retrieve_model_entity(team_uuid, model_uuid)
    sanitize(model_entity)
    response = {
        'model_entity': model_entity,
    }
    return flask.jsonify(response)

@app.route('/deleteModel', methods=['POST'])
@login_required
def delete_model():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    model_trainer.delete_model(team_uuid, model_uuid)
    return 'OK'

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
    if request.headers.get('Origin') != constants.ORIGIN:
       return flask.abort(403)
    # Set CORS headers for the preflight request
    if request.method == 'OPTIONS':
        # Allows POST requests from any origin with the Content-Type
        # header and caches preflight response for an 3600s.
        if request.headers.get('Access-Control-Request-Method') != 'POST':
            return flask.abort(405)
        headers = {
            'Access-Control-Allow-Origin': constants.ORIGIN,
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'content-type',
            'Access-Control-Max-Age': '3600',
        }
        return flask.make_response('', 204, headers) # 204 means success with no content
    if request.method != 'POST':
        return flask.abort(405)

    # Set CORS headers for the main request
    headers = {
        'Access-Control-Allow-Origin': constants.ORIGIN,
    }
    action_parameters = request.get_json()
    active_memory_limit = 2000000000
    action.perform_action(action_parameters, time_limit, active_memory_limit)
    return flask.make_response('OK', 200, headers)

def perform_action(data, context):
    time_limit = datetime.now() + timedelta(seconds=500)
    if data['bucket'] == action.BUCKET_ACTION_PARAMETERS:
        active_memory_limit = 2000000000
        action.perform_action_from_blob(data['name'], time_limit, active_memory_limit)
    return 'OK'

# For running locally:

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8088, debug=True)
