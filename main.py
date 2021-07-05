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
import tflite_creator
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

def handle_exceptions(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except exceptions.HttpError as e:
            return e.status_description, e.status_code
    return wrapper

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

def strip_model_entity(model_entity):
    props_to_remove = [
        'train_image_summary_items',
        'train_scalar_summary_items',
        'train_input_path',
        'eval_image_summary_items',
        'eval_scalar_summary_items',
        'eval_input_path'
    ]
    for prop in props_to_remove:
        if prop in model_entity:
            model_entity.pop(prop)

# pages

@app.route('/login', methods=['GET', 'POST'])
def login():
    if flask.request.method == 'POST':
        if team_info.login(flask.request.form, flask.session):
            return flask.redirect(flask.url_for('index'))
        else:
            error_message = 'You have entered an invalid team number or team code.'
            program, team_number = team_info.retrieve_program_and_team_number(flask.request.form)
    else:
        error_message = ''
        program, team_number = team_info.retrieve_program_and_team_number(flask.session)
    return flask.render_template('login.html',
        time_time=time.time(), project_id=constants.PROJECT_ID,
        error_message=error_message, program=program, team_number=team_number)

@app.route('/')
@handle_exceptions
@redirect_to_login_if_needed
def index():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    program, team_number = team_info.retrieve_program_and_team_number(flask.session)
    return flask.render_template('root.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        program=program, team_number=team_number,
        team_preferences=storage.retrieve_user_preferences(team_uuid),
        starting_models=model_trainer.get_starting_model_names())

@app.route('/labelVideo')
@handle_exceptions
@redirect_to_login_if_needed
def label_video():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    video_uuid = flask.request.args.get('video_uuid')
    video_entity = storage.retrieve_video_entity_for_labeling(team_uuid, video_uuid)
    video_frame_entity_0 = storage.retrieve_video_frame_entities_with_image_urls(
        team_uuid, video_uuid, 0, 0)[0]
    sanitize(video_entity)
    sanitize(video_frame_entity_0)
    return flask.render_template('labelVideo.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        team_preferences=storage.retrieve_user_preferences(team_uuid),
        video_uuid=video_uuid, video_entity=video_entity, video_frame_entity_0=video_frame_entity_0)

@app.route('/monitorTraining')
@handle_exceptions
@redirect_to_login_if_needed
def monitor_training():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    model_uuid = flask.request.args.get('model_uuid')
    model_entities_by_uuid, dataset_entities_by_uuid, video_entities_by_uuid = storage.retrieve_entities_for_monitor_training(
        team_uuid, model_uuid, model_trainer.retrieve_model_list(team_uuid))
    for model_uuid, model_entity in model_entities_by_uuid.items():
        strip_model_entity(model_entity)
    sanitize(model_entities_by_uuid)
    sanitize(dataset_entities_by_uuid)
    sanitize(video_entities_by_uuid)
    return flask.render_template('monitorTraining.html', time_time=time.time(), project_id=constants.PROJECT_ID,
        team_preferences=storage.retrieve_user_preferences(team_uuid),
        model_uuid=model_uuid,
        model_entities_by_uuid=model_entities_by_uuid,
        dataset_entities_by_uuid=dataset_entities_by_uuid,
        video_entities_by_uuid=video_entities_by_uuid)


#test is for debugging purposes only.
#@app.route('/test')
#@handle_exceptions
#@redirect_to_login_if_needed
#def test():
#    return flask.render_template('test.html', time_time=time.time(), project_id=constants.PROJECT_ID)


# requests

@app.route('/ok', methods=['GET'])
@handle_exceptions
def ok():
    return 'OK'

@app.route('/logout', methods=['POST'])
@handle_exceptions
def logout():
    # Remove the team information from the flask.session if it's there.
    team_info.logout(flask.session)
    return 'OK'

@app.route('/setUserPreference', methods=['POST'])
@handle_exceptions
@login_required
def set_user_preference():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    key = data.get('key')
    value = data.get('value')
    storage.store_user_preference(team_uuid, key, value)
    return 'OK'

@app.route('/prepareToUploadVideo', methods=['POST'])
@handle_exceptions
@login_required
def prepare_to_upload_video():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    description = data.get('description')
    video_filename = data.get('video_filename')
    file_size = int(data.get('file_size'))
    content_type = data.get('content_type')
    create_time_ms = int(data.get('create_time_ms'))
    video_uuid, upload_url = storage.prepare_to_upload_video(
        team_uuid, description, video_filename, file_size, content_type, create_time_ms)
    frame_extractor.start_frame_extraction(team_uuid, video_uuid)
    response = {
        'video_uuid': video_uuid,
        'upload_url': upload_url,
    }
    blob_storage.set_cors_policy_for_put()
    return flask.jsonify(response)

@app.route('/startFrameExtraction', methods=['POST'])
@handle_exceptions
@login_required
def start_frame_extraction():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    frame_extractor.start_frame_extraction(team_uuid, video_uuid)
    return 'OK'

@app.route('/retrieveVideoEntities', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_video_entities():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    video_entities = storage.retrieve_video_list(team_uuid)
    response = {
        'video_entities': video_entities,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/retrieveVideoEntity', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_video_entity():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    video_entity = storage.retrieve_video_entity(team_uuid, video_uuid)
    response = {
        'video_entity': video_entity,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/canDeleteVideos', methods=['POST'])
@handle_exceptions
@login_required
def can_delete_videos():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuids_json = data.get('video_uuids')
    can_delete_videos, messages = storage.can_delete_videos(team_uuid, video_uuids_json)
    response = {
        'can_delete_videos': can_delete_videos,
        'messages': messages,
    }
    return flask.jsonify(response)

@app.route('/deleteVideo', methods=['POST'])
@handle_exceptions
@login_required
def delete_video():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    storage.delete_video(team_uuid, video_uuid)
    return 'OK'

@app.route('/retrieveVideoFrameImage', methods=['GET'])
@handle_exceptions
@login_required
def retrieve_video_frame_image():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.args.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    frame_number = int(data.get('frame_number'))
    image_data, content_type = storage.retrieve_video_frame_image(team_uuid, video_uuid, frame_number)
    return Response(image_data, mimetype=content_type)

@app.route('/retrieveVideoFrameEntitiesWithImageUrls', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_video_frame_entities_with_image_urls():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    min_frame_number = int(data.get('min_frame_number'))
    max_frame_number = int(data.get('max_frame_number'))
    video_frame_entities = storage.retrieve_video_frame_entities_with_image_urls(
        team_uuid, video_uuid, min_frame_number, max_frame_number)
    blob_storage.set_cors_policy_for_get()
    response = {
        'video_frame_entities': video_frame_entities,
    }
    sanitize(response)
    return flask.jsonify(response)


@app.route('/storeVideoFrameBboxesText', methods=['POST'])
@handle_exceptions
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
@handle_exceptions
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
@handle_exceptions
@login_required
def prepare_to_start_tracking():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    init_frame_number = int(data.get('init_frame_number'))
    init_bboxes_text = data.get('init_bboxes_text')
    tracker_name = data.get('tracker_name')
    scale = float(data.get('scale'))
    tracker_uuid = tracking.prepare_to_start_tracking(team_uuid, video_uuid,
        tracker_name, scale, init_frame_number, init_bboxes_text)
    response = {
        'tracker_uuid': tracker_uuid,
    }
    return flask.jsonify(response)

@app.route('/retrieveTrackedBboxes', methods=['POST'])
@handle_exceptions
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
@handle_exceptions
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
@handle_exceptions
@login_required
def tracking_client_still_alive():
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    tracker_uuid = data.get('tracker_uuid')
    storage.tracking_client_still_alive(video_uuid, tracker_uuid)
    return 'OK'

@app.route('/stopTracking', methods=['POST'])
@handle_exceptions
@login_required
def stop_tracking():
    data = flask.request.form.to_dict(flat=True)
    video_uuid = data.get('video_uuid')
    tracker_uuid = data.get('tracker_uuid')
    storage.set_tracking_stop_requested(video_uuid, tracker_uuid)
    return 'OK'

@app.route('/prepareToStartDatasetProduction', methods=['POST'])
@handle_exceptions
@login_required
def prepare_to_start_dataset_production():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    description = data.get('description')
    video_uuids_json = data.get('video_uuids')
    eval_percent = int(data.get('eval_percent'))
    create_time_ms = int(data.get('create_time_ms'))
    dataset_uuid = dataset_producer.prepare_to_start_dataset_production(
        team_uuid, description, video_uuids_json, eval_percent, create_time_ms)
    action_parameters = dataset_producer.make_action_parameters(
        team_uuid, dataset_uuid, video_uuids_json, eval_percent, create_time_ms)
    action.trigger_action_via_blob(action_parameters)
    response = {
        'dataset_uuid': dataset_uuid,
    }
    return flask.jsonify(response)

@app.route('/retrieveDatasetEntities', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_dataset_entities():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    dataset_entities = storage.retrieve_dataset_list(team_uuid)
    response = {
        'dataset_entities': dataset_entities,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/retrieveDatasetEntity', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_dataset_entity():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_uuid = data.get('dataset_uuid')
    dataset_entity = storage.retrieve_dataset_entity(team_uuid, dataset_uuid)
    if dataset_entity['dataset_completed']:
        frames_written = None
    else:
        frames_written = storage.retrieve_dataset_record_writer_frames_written(dataset_entity)
    response = {
        'dataset_entity': dataset_entity,
    }
    if frames_written is not None:
        response['frames_written'] = frames_written
    sanitize(response)
    return flask.jsonify(response)

@app.route('/canDeleteDatasets', methods=['POST'])
@handle_exceptions
@login_required
def can_delete_datasets():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_uuids_json = data.get('dataset_uuids')
    can_delete_datasets, messages = storage.can_delete_datasets(team_uuid, dataset_uuids_json)
    response = {
        'can_delete_datasets': can_delete_datasets,
        'messages': messages,
    }
    return flask.jsonify(response)

@app.route('/deleteDataset', methods=['POST'])
@handle_exceptions
@login_required
def delete_dataset():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_uuid = data.get('dataset_uuid')
    storage.delete_dataset(team_uuid, dataset_uuid)
    return 'OK'

@app.route('/prepareToZipDataset', methods=['POST'])
@handle_exceptions
@login_required
def prepare_to_zip_dataset():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_uuid = data.get('dataset_uuid')
    dataset_zip_uuid, partition_count = dataset_zipper.prepare_to_zip_dataset(
        team_uuid, dataset_uuid)
    action_parameters = dataset_zipper.make_action_parameters(
        team_uuid, dataset_uuid, dataset_zip_uuid, partition_count)
    action.trigger_action_via_blob(action_parameters)
    response = {
        'dataset_zip_uuid': dataset_zip_uuid,
        'partition_count': partition_count,
    }
    return flask.jsonify(response)

@app.route('/getDatasetZipStatus', methods=['POST'])
@handle_exceptions
@login_required
def get_dataset_zip_status():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_zip_uuid = data.get('dataset_zip_uuid')
    partition_count = int(data.get('partition_count'))
    exists_array, download_url_array = blob_storage.get_dataset_zip_download_url(
        team_uuid, dataset_zip_uuid, partition_count)
    file_count_array, files_written_array = storage.retrieve_dataset_zipper_files_written(
        team_uuid, dataset_zip_uuid, partition_count)
    response = {
        'is_ready_array': exists_array,
        'download_url_array': download_url_array,
        'file_count_array': file_count_array,
        'files_written_array': files_written_array,
    }
    blob_storage.set_cors_policy_for_get()
    return flask.jsonify(response)

@app.route('/deleteDatasetZip', methods=['POST'])
@handle_exceptions
@login_required
def delete_dataset_zip():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    dataset_zip_uuid = data.get('dataset_zip_uuid')
    partition_index = int(data.get('partition_index'))
    blob_storage.delete_dataset_zip(team_uuid, dataset_zip_uuid, partition_index)
    storage.delete_dataset_zipper(team_uuid, dataset_zip_uuid, partition_index)
    return 'OK'

@app.route('/startTrainingModel', methods=['POST'])
@handle_exceptions
@login_required
def start_training_model():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    description = data.get('description')
    dataset_uuids_json = data.get('dataset_uuids')
    starting_model = data.get('starting_model')
    max_running_minutes = int(data.get('max_running_minutes'))
    num_training_steps = int(data.get('num_training_steps'))
    create_time_ms = int(data.get('create_time_ms'))
    model_entity = model_trainer.start_training_model(team_uuid, description, dataset_uuids_json,
        starting_model, max_running_minutes, num_training_steps, create_time_ms)
    action_parameters = model_trainer.make_action_parameters(team_uuid, model_entity['model_uuid'])
    action.trigger_action_via_blob(action_parameters)
    team_entity = storage.retrieve_team_entity(team_uuid)
    strip_model_entity(model_entity)
    response = {
        'remaining_training_minutes': team_entity['remaining_training_minutes'],
        'model_entity': model_entity,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/retrieveSummariesUpdated', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_summaries_updated():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    model_entity = model_trainer.retrieve_model_entity(team_uuid, model_uuid)
    training_dict_path_to_updated = blob_storage.get_event_file_paths(
        team_uuid, model_uuid, 'train')
    eval_dict_path_to_updated = blob_storage.get_event_file_paths(
        team_uuid, model_uuid, 'eval')
    strip_model_entity(model_entity)
    response = {
        'model_entity': model_entity,
    }
    for path, updated in training_dict_path_to_updated.items():
        if 'training_updated' not in response or updated > response['training_updated']:
            response['training_updated'] = updated
    for path, updated in eval_dict_path_to_updated.items():
        if 'eval_updated' not in response or updated > response['eval_updated']:
            response['eval_updated'] = updated
    sanitize(response)
    return flask.jsonify(response)

@app.route('/retrieveTagsAndSteps', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_tags_and_steps():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    job_type = data.get('job_type')
    value_type = data.get('value_type')
    step_and_tag_pairs = model_trainer.retrieve_tags_and_steps(
        team_uuid, model_uuid, job_type, value_type)
    response = {
        'step_and_tag_pairs': step_and_tag_pairs,
    }
    return flask.jsonify(response)

@app.route('/retrieveSummaryItems', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_summary_items():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    job_type = data.get('job_type')
    value_type = data.get('value_type')
    # Create a dict from step to array of tags.
    dict_step_to_tags = {}
    i = 0
    while True:
        step_key = 'step' + str(i)
        tag_key = 'tag' + str(i)
        if step_key not in data or tag_key not in data:
            break;
        step = data[step_key]
        if step not in dict_step_to_tags:
            dict_step_to_tags[step] = []
        tag = data[tag_key]
        dict_step_to_tags[step].append(tag)
        i += 1
    summary_items = model_trainer.retrieve_summary_items(
        team_uuid, model_uuid, job_type, value_type, dict_step_to_tags)
    response = {
        'summary_items': summary_items,
    }
    if value_type == 'image':
        blob_storage.set_cors_policy_for_get()
    return flask.jsonify(response)

@app.route('/cancelTrainingModel', methods=['POST'])
@handle_exceptions
@login_required
def cancel_training_model():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    model_entity = model_trainer.cancel_training_model(team_uuid, model_uuid)
    strip_model_entity(model_entity)
    response = {
        'model_entity': model_entity,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/retrieveModelEntities', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_model_entities():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    team_entity = storage.retrieve_team_entity(team_uuid)
    model_entities = model_trainer.retrieve_model_list(team_uuid)
    for model_entity in model_entities:
        strip_model_entity(model_entity)
    response = {
        'total_training_minutes': team_info.TOTAL_TRAINING_MINUTES_PER_TEAM,
        'remaining_training_minutes': team_entity['remaining_training_minutes'],
        'model_entities': model_entities,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/retrieveModelEntity', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_model_entity():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    team_entity = storage.retrieve_team_entity(team_uuid)
    model_entity = model_trainer.retrieve_model_entity(team_uuid, model_uuid)
    strip_model_entity(model_entity)
    response = {
        'remaining_training_minutes': team_entity['remaining_training_minutes'],
        'model_entity': model_entity,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/canDeleteModels', methods=['POST'])
@handle_exceptions
@login_required
def can_delete_models():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuids_json = data.get('model_uuids')
    can_delete_models, messages = storage.can_delete_models(team_uuid, model_uuids_json)
    response = {
        'can_delete_models': can_delete_models,
        'messages': messages,
    }
    return flask.jsonify(response)

@app.route('/deleteModel', methods=['POST'])
@handle_exceptions
@login_required
def delete_model():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    storage.delete_model(team_uuid, model_uuid)
    return 'OK'

@app.route('/createTFLite', methods=['POST'])
@handle_exceptions
@login_required
def create_tflite():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    exists, download_url = blob_storage.get_tflite_model_with_metadata_url(team_uuid, model_uuid)
    if exists:
        blob_storage.set_cors_policy_for_get()
    else:
        tflite_creator.trigger_create_tflite(team_uuid, model_uuid)
    response = {
        'exists': exists,
        'download_url': download_url,
    }
    return flask.jsonify(response)

@app.route('/getTFLiteDownloadUrl', methods=['POST'])
@handle_exceptions
@login_required
def get_tflite_download_url():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = flask.request.form.to_dict(flat=True)
    model_uuid = data.get('model_uuid')
    exists, download_url = blob_storage.get_tflite_model_with_metadata_url(team_uuid, model_uuid)
    if exists:
        blob_storage.set_cors_policy_for_get()
    response = {
        'exists': exists,
        'download_url': download_url,
    }
    return flask.jsonify(response)

#performActionGAE and performActionGCF are for debugging purposes only.
#@app.route('/performActionGAE', methods=['POST'])
#@handle_exceptions
#@login_required
#def perform_action_gae():
#    start_time = datetime.now()
#    action_parameters = flask.request.get_json()
#    # time_limit is wrong for GAE, but this request is only for debugging.
#    time_limit = start_time + timedelta(seconds=500)
#    action.perform_action(action_parameters, time_limit)
#    return 'OK'
#
#@app.route('/performActionGCF', methods=['POST'])
#@handle_exceptions
#@login_required
#def perform_action_gcf():
#    action_parameters = flask.request.get_json()
#    action.trigger_action_via_blob(action_parameters)
#    return 'OK'

# errors

@app.errorhandler(403)
def forbidden(e):
    logging.exception('Forbidden.')
    return "Forbidden: <pre>{}</pre>".format(e), 403

@app.errorhandler(500)
def server_error(e):
    logging.exception('An internal error occurred.')
    return "An internal error occurred: <pre>{}</pre>".format(e), 500

# cloud functions

def perform_action(data, context):
    start_time = datetime.now()
    if data['bucket'] == action.BUCKET_ACTION_PARAMETERS:
        time_limit = start_time + timedelta(seconds=500)
        action.perform_action_from_blob(data['name'], time_limit)
    return 'OK'

# For running locally:

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8088, debug=True)
