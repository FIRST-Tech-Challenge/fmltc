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
from datetime import datetime, timedelta, timezone
from functools import wraps
import json
import logging
import time

# Other Modules
import flask
from flask_oidc_ext import OpenIDConnect
from sqlitedict import SqliteDict
from credentialstore import CredentialStore

# My Modules
import action
import bbox_writer
import blob_storage
import constants
import dataset_producer
import dataset_zipper
import exceptions
import frame_extractor
import model_trainer
import roles
import cloud_secrets
import storage
import tflite_creator
import team_info
import tracking
import util

from roles import Role

app = flask.Flask(__name__)

app.config.update(
    {
        # Flask properties
        "SECRET_KEY": cloud_secrets.get("flask_secret_key"),
        "MAX_CONTENT_LENGTH": 8 * 1024 * 1024,
        "ALLOWED_EXTENSIONS": {'png', 'jpg', 'jpeg', 'gif'},

        # OIDC properties

        "OIDC_ID_TOKEN_COOKIE_SECURE": False,
        "OIDC_REQUIRE_VERIFIED_EMAIL": False,
        "OIDC_SCOPES": ["openid", "email", "roles"],
    }
)

if util.is_development_env():
    app.debug = True
    app.testing = True
else:
    app.debug = False
    app.testing = False


#
# If a redis server is specified, use it, otherwise use a
# local sqlite database.
#
if util.use_oidc():
    payload = cloud_secrets.get("client_secrets")
    credentials_dict = json.loads(payload)
    app.config.update({"OIDC_CLIENT_SECRETS": credentials_dict})
    if constants.REDIS_IP_ADDR is not None:
        oidc = OpenIDConnect(app, credentials_store=CredentialStore())
    else:
        oidc = OpenIDConnect(app, credentials_store=SqliteDict('users.db', autocommit=True))
else:
    oidc = None

application_properties = json.load(open('app.properties', 'r'))

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
        if roles.can_login(flask.session['user_roles']) and team_info.validate_team_info(flask.session):
            return func(*args, **kwargs)
        return forbidden("You do not have the required permissions to access this page")
    return wrapper

def oidc_require_login(func):
    if util.use_oidc():
        return oidc.require_login(func)
    @wraps(func)
    def wrapper(*args, **kwargs):
        return forbidden("You do not have the required permissions to access this page")
    return wrapper

def roles_required(*roles):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if set(roles).issubset(set(flask.session['user_roles'])):
                return func(*args, **kwargs)
            return forbidden("You do not have the required permissions to access this page")
        return wrapper
    return decorator

def roles_accepted(*roles):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if set(roles).isdisjoint(set(flask.session['user_roles'])):
                return forbidden("You do not have the required permissions to access this page")
            return func(*args, **kwargs)
        return wrapper
    return decorator

def handle_exceptions(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except exceptions.HttpError as e:
            return e.status_description, e.status_code
    return wrapper

def validate_keys(dict, expected_keys, check_all_keys=True, optional_keys=[]):
    for k in expected_keys:
        if k not in dict:
            message = "Error: expected parameter '%s' is missing." % k
            logging.critical(message)
            raise exceptions.HttpErrorBadRequest(message)
    if check_all_keys:
        for k in dict.keys():
            if k not in expected_keys and k not in optional_keys:
                message = "Error: '%s' is not an expected or optional parameter." % k
                logging.critical(message)
                raise exceptions.HttpErrorBadRequest(message)
    return dict


def validate_string(s, *args):
    for a in args:
        if s == a:
            return s
    message = "Error: '%s is not a valid argument." % s
    logging.critical(message)
    raise exceptions.HttpErrorBadRequest(message)


def validate_description(s):
    if len(s) >= 1 and len(s) <= 30:
        return s
    message = "Error: '%s is not a valid description." % s
    logging.critical(message)
    raise exceptions.HttpErrorBadRequest(message)


def validate_user_preference_key(s):
    return validate_string(s,
        "canvasWidth",
        "root.currentTab",
        "monitorTraining.currentTab")


def validate_video_content_type(s):
    if not s.startswith("video/"):
        message = "Error: '%s is not a valid video content type." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return s


def validate_job_type(s):
    return validate_string(s, "train", "eval")


def validate_value_type(s):
    return validate_string(s, "scalar", "image")


def validate_float(s, min=None, max=None):
    try:
        f = float(s)
        if min is not None:
            if max is not None:
                # Check min and max.
                if f < min or f > max:
                    message = "Error: '%s is not a valid number between %d and %d." % (s, min, max)
                    logging.critical(message)
                    raise exceptions.HttpErrorBadRequest(message)
            else:
                # Check min only.
                if f < min:
                    message = "Error: '%s is not a valid number >= %d." % (s, min)
                    logging.critical(message)
                    raise exceptions.HttpErrorBadRequest(message)
        elif max is not None:
            # Check max only.
            if f > max:
                message = "Error: '%s is not a valid number <= %d." % (s, max)
                logging.critical(message)
                raise exceptions.HttpErrorBadRequest(message)
        return f
    except:
        message = "Error: '%s is not a valid number." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)


def validate_positive_float(s):
    f = validate_float(s)
    if f <= 0:
        message = "Error: '%s is not a valid positive number." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return f


def validate_int(s, min=None, max=None):
    try:
        i = int(s)
        if min is not None:
            if max is not None:
                # Check min and max.
                if i < min or i > max:
                    message = "Error: '%s is not a valid number between %d and %d." % (s, min, max)
                    logging.critical(message)
                    raise exceptions.HttpErrorBadRequest(message)
            else:
                # Check min only.
                if i < min:
                    message = "Error: '%s is not a valid number >= %d." % (s, min)
                    logging.critical(message)
                    raise exceptions.HttpErrorBadRequest(message)
        elif max is not None:
            # Check max only.
            if i > max:
                message = "Error: '%s is not a valid number <= %d." % (s, max)
                logging.critical(message)
                raise exceptions.HttpErrorBadRequest(message)
        return i
    except:
        message = "Error: '%s is not a valid integer." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)


def validate_positive_int(s):
    i = validate_int(s)
    if i <= 0:
        message = "Error: '%s is not a valid positive integer." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return i


def validate_frame_number(s):
    return validate_int(s, min=0)

def validate_create_time_ms(s):
    i = validate_positive_int(s)
    create_time = util.datetime_from_ms(i)
    now = datetime.now(timezone.utc)
    delta = now - create_time
    if delta < timedelta(seconds=0):
        message = "Error: '%s is not a valid create time." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    if delta > timedelta(minutes=1):
        message = "Error: '%s is not a valid create time." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return i


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
            model_entity.pop(prop, None)

@oidc_require_login
def login_via_oidc():
    if oidc.user_loggedin:
        flask.session['user_roles'] = [x.upper() for x in oidc.user_getfield('external_roles')]
        flask.session['user_roles'].extend(oidc.user_getfield('global_roles'))

        if not roles.can_login(flask.session['user_roles']):
            return forbidden("You do not have the required permissions to access this page")

        team_roles = oidc.user_getfield('team_roles')
        if len(team_roles) == 1:
            team_num = next(iter(team_roles))
            flask.session['team_number'] = team_num
            flask.session['user_roles'].extend(team_roles[team_num])
            return flask.redirect(flask.url_for('submit_team', team=team_num))
        else:
            return flask.redirect(flask.url_for('select_team', teams=list(team_roles.keys())))

@app.after_request
def setXFrameOptions(response):
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response

# pages

@app.route('/selectTeam')
@handle_exceptions
def select_team():
    teams = flask.request.args.getlist('teams')
    return flask.render_template('selectTeam.html', version=application_properties['version'], teams=teams)

@app.route('/submitTeam', methods=['GET', 'POST'])
def submit_team():
    if oidc.user_loggedin:
        given_name = oidc.user_getfield('given_name')
        team_roles = oidc.user_getfield('team_roles')
        flask.session['program'] = "FTC"
        flask.session['oidc_auth'] = "true"
        if flask.request.method == 'POST':
            team_num = flask.request.form['team_num']
        else:
            team_num = flask.request.args.get('team')
        flask.session['user_roles'].extend(team_roles[team_num])
        flask.session['team_number'] = team_num
        flask.session['name'] = given_name
        return flask.redirect(flask.url_for('index'))
    else:
        return forbidden("You do not have the required permissions to access this page")

@app.route('/login', methods=['GET', 'POST'])
def login():
    if util.use_oidc():
        return login_via_oidc()
    elif flask.request.method == 'POST':
        if team_info.login(flask.request.form, flask.session):
            #
            # Local, privately, hosted instances get the team admin role by default.
            #
            flask.session['user_roles'] = [Role.TEAM_ADMIN]
            return flask.redirect(flask.url_for('index'))
        else:
            error_message = 'You have entered an invalid team number or team code.'
            program, team_number = team_info.retrieve_program_and_team_number(flask.request.form)
    else:
        error_message = ''
        program, team_number = team_info.retrieve_program_and_team_number(flask.session)
    return flask.render_template('login.html',
        time_time=time.time(), version=application_properties['version'], project_id=constants.PROJECT_ID,
        error_message=error_message, program=program, team_number=team_number)

@app.route('/')
@handle_exceptions
@redirect_to_login_if_needed
def index():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    program, team_number = team_info.retrieve_program_and_team_number(flask.session)
    return flask.render_template('root.html', time_time=time.time(), version=application_properties['version'], project_id=constants.PROJECT_ID,
        program=program, team_number=team_number, can_upload_video=roles.can_upload_video(flask.session['user_roles']),
        team_preferences=storage.retrieve_user_preferences(team_uuid),
        starting_models=model_trainer.get_starting_model_names())

@app.route('/labelVideo')
@handle_exceptions
@redirect_to_login_if_needed
def label_video():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.args.to_dict(flat=True),
        ['video_uuid'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    # storage.retrieve_video_entity_for_labeling will raise HttpErrorNotFound
    # if the team_uuid/video_uuid is not found.
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
    data = validate_keys(flask.request.args.to_dict(flat=True),
        ['model_uuid'])
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    # storage.retrieve_entities_for_monitor_training will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
    model_entities_by_uuid, dataset_entities_by_uuid, video_entities_by_uuid = storage.retrieve_entities_for_monitor_training(
        team_uuid, model_uuid, model_trainer.retrieve_model_list(team_uuid))
    for _, model_entity in model_entities_by_uuid.items():
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


# test is for debugging purposes only.
@app.route('/test')
@handle_exceptions
@redirect_to_login_if_needed
def test():
    if util.is_production_env():
        raise exceptions.HttpErrorNotFound("Not found")
    return flask.render_template('test.html', time_time=time.time(), project_id=constants.PROJECT_ID,
                                 use_oidc=constants.USE_OIDC, redis_ip=constants.REDIS_IP_ADDR)

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
    flask.session.clear()
    if util.use_oidc():
        #
        # TODO: If using OIDC, logout of identity provider also.
        #
        oidc.logout()
    return 'OK'

@app.route('/setUserPreference', methods=['POST'])
@handle_exceptions
@login_required
def set_user_preference():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['key', 'value'])
    key = validate_user_preference_key(data.get('key'))
    value = data.get('value')
    storage.store_user_preference(team_uuid, key, value)
    return 'OK'

@app.route('/prepareToUploadVideo', methods=['POST'])
@handle_exceptions
@login_required
@roles_required(roles.Role.TEAM_ADMIN)
def prepare_to_upload_video():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['description', 'video_filename', 'file_size', 'content_type', 'create_time_ms'])
    # Check whether the team is currently uploading a video or extracting frames for a video.
    # We only allow one at a time.
    team_entity = storage.retrieve_team_entity(team_uuid)
    if 'last_video_uuid' in team_entity and team_entity['last_video_uuid'] != '':
        last_video_entity = storage.maybe_retrieve_video_entity(team_uuid, team_entity['last_video_uuid'])
        if last_video_entity is None:
            # The last video hasn't been uploaded yet. Check if it has been less than 10 minutes
            # since the upload was initiated.
            if datetime.now(timezone.utc) - team_entity['last_video_time'] < timedelta(minutes=10):
                # Send an message to the client.
                response = {
                    'video_uuid': '',
                    'upload_url': '',
                    'message': 'The previous video has not been uploaded yet. Please wait a few minutes and try again.'
                }
                return flask.jsonify(response)
        elif 'frame_extraction_active_time' not in last_video_entity:
            # Frame extraction of the last video hasn't started yet. Check if it has been less than
            # 10 minutes since the video entity was created.
            if datetime.now(timezone.utc) - last_video_entity['entity_create_time'] < timedelta(minutes=10):
                # Send an message to the client.
                response = {
                    'video_uuid': '',
                    'upload_url': '',
                    'message': 'The previous video has not been processed yet. Please wait a few minutes and try again.'
                }
                return flask.jsonify(response)
        else:
            # Frame extraction of the last video hasn't finished yet. Check if it has been less
            # than 10 minutes since the frame extraction was active.
            if datetime.now(timezone.utc) - last_video_entity['frame_extraction_active_time'] < timedelta(minutes=10):
                # Send an message to the client.
                response = {
                    'video_uuid': '',
                    'upload_url': '',
                    'message': 'The previous video has not been processed yet. Please wait a few minutes and try again.'
                }
                return flask.jsonify(response)
    # If we get here, either the last video was fully processed or it failed to be uploaded or it
    # failed to be processed. In these cases, we can let the user upload another video.
    description = validate_description(data.get('description'))
    video_filename = data.get('video_filename')
    file_size = validate_positive_int(data.get('file_size'))
    content_type = validate_video_content_type(data.get('content_type'))
    create_time_ms = validate_create_time_ms(data.get('create_time_ms'))
    video_uuid, upload_url = storage.prepare_to_upload_video(team_uuid, content_type)
    frame_extractor.start_wait_for_video_upload(team_uuid, video_uuid, description, video_filename, file_size, content_type, create_time_ms)
    response = {
        'message': '',
        'video_uuid': video_uuid,
        'upload_url': upload_url,
    }
    blob_storage.set_cors_policy_for_put()
    return flask.jsonify(response)


@app.route('/maybeRestartFrameExtraction', methods=['POST'])
@handle_exceptions
@login_required
def maybe_restart_frame_extraction():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    # frame_extractor.maybe_restart_frame_extraction will raise HttpErrorNotFound
    # if the team_uuid/video_uuid is not found.
    restarted = frame_extractor.maybe_restart_frame_extraction(team_uuid, video_uuid)
    response = {
        'restarted': restarted,
    }
    return flask.jsonify(response)

@app.route('/retrieveVideoEntities', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_video_entities():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    validate_keys(flask.request.form.to_dict(flat=True), [])
    video_entities = storage.retrieve_video_list(team_uuid)
    response = {
        'video_entities': video_entities,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/doesVideoEntityExist', methods=['POST'])
@handle_exceptions
@login_required
def does_video_entity_exist():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    video_entity = storage.maybe_retrieve_video_entity(team_uuid, video_uuid)
    video_entity_exists = video_entity is not None
    response = {
        'video_entity_exists': video_entity_exists,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/retrieveVideoEntity', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_video_entity():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    # storage.retrieve_video_entity will raise HttpErrorNotFound
    # if the team_uuid/video_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuids'])
    video_uuids_json = storage.validate_uuids_json(data.get('video_uuids'))
    # storage.can_delete_videos will raise HttpErrorNotFound
    # if any of the team_uuid/video_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    # storage.delete_video will raise HttpErrorNotFound
    # if the team_uuid/video_uuid is not found.
    storage.delete_video(team_uuid, video_uuid)
    return 'OK'

@app.route('/retrieveVideoFrameImage', methods=['GET'])
@handle_exceptions
@login_required
def retrieve_video_frame_image():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    # This is a get request, so we use flask.request.args.
    data = validate_keys(flask.request.args.to_dict(flat=True),
        ['video_uuid'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    frame_number = validate_frame_number(data.get('frame_number'))
    # storage.retrieve_video_frame_image will raise HttpErrorNotFound
    # if the team_uuid/video_uuid/frame_number is not found.
    image_data, content_type = storage.retrieve_video_frame_image(team_uuid, video_uuid, frame_number)
    return Response(image_data, mimetype=content_type)

@app.route('/retrieveVideoFrameEntitiesWithImageUrls', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_video_frame_entities_with_image_urls():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid', 'min_frame_number', 'max_frame_number'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    min_frame_number = validate_frame_number(data.get('min_frame_number'))
    max_frame_number = validate_frame_number(data.get('max_frame_number'))
    if max_frame_number < min_frame_number:
        message = "Error: 'max_frame_number cannot be less than min_frame_number."
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    # storage.retrieve_video_frame_entities_with_image_urls will raise HttpErrorNotFound
    # if none of the team_uuid/video_uuid/frame_numbers is found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid', 'frame_number', 'bboxes_text'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    frame_number = validate_frame_number(data.get('frame_number'))
    bboxes_text = bbox_writer.validate_bboxes_text(data.get('bboxes_text'))
    # storage.store_video_frame_bboxes_text will raise HttpErrorNotFound
    # if the team_uuid/video_uuid/frame_number is not found.
    storage.store_video_frame_bboxes_text(team_uuid, video_uuid, frame_number, bboxes_text)
    return 'ok'

@app.route('/storeVideoFrameIncludeInDataset', methods=['POST'])
@handle_exceptions
@login_required
def store_video_frame_include_in_dataset():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid', 'frame_number', 'include_frame_in_dataset'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    frame_number = validate_frame_number(data.get('frame_number'))
    include_frame_in_dataset = (data.get('include_frame_in_dataset') == 'true')
    # storage.store_video_frame_include_in_dataset will raise HttpErrorNotFound
    # if the team_uuid/video_uuid/frame_number is not found.
    storage.store_video_frame_include_in_dataset(team_uuid, video_uuid, frame_number, include_frame_in_dataset)
    return 'ok'

@app.route('/prepareToStartTracking', methods=['POST'])
@handle_exceptions
@login_required
def prepare_to_start_tracking():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid', 'init_frame_number', 'init_bboxes_text', 'tracker_name', 'scale'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    init_frame_number = validate_frame_number(data.get('init_frame_number'))
    init_bboxes_text = bbox_writer.validate_bboxes_text(data.get('init_bboxes_text'))
    tracker_name = tracking.validate_tracker_name(data.get('tracker_name'))
    # The following min/max number (1 and 3) should match the min/max values in labelVideo.html.
    scale = validate_float(data.get('scale'), min=1, max=3)
    # tracking.prepare_to_start_tracking will raise HttpErrorNotFound
    # if the team_uuid/video_uuid is not found.
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
    time_limit = datetime.now(timezone.utc) + timedelta(seconds=25)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid', 'tracker_uuid', 'retrieve_frame_number'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    tracker_uuid = storage.validate_uuid(data.get('tracker_uuid'))
    retrieve_frame_number = validate_frame_number(data.get('retrieve_frame_number'))
    # storage.retrieve_tracked_bboxes returns True for tracker_failed
    # if the video_uuid/tracker_uuid is not found.
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
    time_limit = datetime.now(timezone.utc) + timedelta(seconds=25)
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid', 'tracker_uuid', 'frame_number', 'bboxes_text'], optional_keys=['retrieve_frame_number'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    tracker_uuid = storage.validate_uuid(data.get('tracker_uuid'))
    frame_number = validate_frame_number(data.get('frame_number'))
    bboxes_text = bbox_writer.validate_bboxes_text(data.get('bboxes_text'))
    # storage.continue_tracking does nothing
    # if the video_uuid/tracker_uuid is not found.
    storage.continue_tracking(team_uuid, video_uuid, tracker_uuid, frame_number, bboxes_text)
    if 'retrieve_frame_number' in data:
        time.sleep(0.2)
        retrieve_frame_number = validate_frame_number(data.get('retrieve_frame_number'))
        # storage.retrieve_tracked_bboxes returns True for tracker_failed
        # if the video_uuid/tracker_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid', 'tracker_uuid'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    tracker_uuid = storage.validate_uuid(data.get('tracker_uuid'))
    # storage.tracking_client_still_alive does nothing
    # if the video_uuid/tracker_uuid is not found.
    storage.tracking_client_still_alive(video_uuid, tracker_uuid)
    return 'OK'

@app.route('/stopTracking', methods=['POST'])
@handle_exceptions
@login_required
def stop_tracking():
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['video_uuid', 'tracker_uuid'])
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    tracker_uuid = storage.validate_uuid(data.get('tracker_uuid'))
    # storage.set_tracking_stop_requested does nothing
    # if the video_uuid/tracker_uuid is not found.
    storage.set_tracking_stop_requested(video_uuid, tracker_uuid)
    return 'OK'

@app.route('/prepareToStartDatasetProduction', methods=['POST'])
@handle_exceptions
@login_required
def prepare_to_start_dataset_production():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['description', 'video_uuids', 'eval_percent', 'create_time_ms'])
    description = validate_description(data.get('description'))
    video_uuids_json = storage.validate_uuids_json(data.get('video_uuids'))
    # The following min/max number (0 and 90) should match the min/max values in root.html.
    eval_percent = validate_float(data.get('eval_percent'), min=0, max=90)
    create_time_ms = validate_create_time_ms(data.get('create_time_ms'))
    # dataset_producer.prepare_to_start_dataset_production will raise HttpErrorNotFound
    # if any of the team_uuid/video_uuids is not found.
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
    validate_keys(flask.request.form.to_dict(flat=True), [])
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['dataset_uuid'])
    dataset_uuid = storage.validate_uuid(data.get('dataset_uuid'))
    # storage.retrieve_dataset_entity will raise HttpErrorNotFound
    # if the team_uuid/dataset_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['dataset_uuids'])
    dataset_uuids_json = storage.validate_uuids_json(data.get('dataset_uuids'))
    # storage.can_delete_datasets will raise HttpErrorNotFound
    # if any of the team_uuid/dataset_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['dataset_uuid'])
    dataset_uuid = storage.validate_uuid(data.get('dataset_uuid'))
    # storage.delete_dataset will raise HttpErrorNotFound
    # if the team_uuid/dataset_uuid is not found.
    storage.delete_dataset(team_uuid, dataset_uuid)
    return 'OK'

@app.route('/prepareToZipDataset', methods=['POST'])
@handle_exceptions
@login_required
def prepare_to_zip_dataset():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['dataset_uuid'])
    dataset_uuid = storage.validate_uuid(data.get('dataset_uuid'))
    # dataset_zipper.prepare_to_zip_dataset will raise HttpErrorNotFound
    # if the team_uuid/dataset_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['dataset_zip_uuid', 'partition_count'])
    dataset_zip_uuid = storage.validate_uuid(data.get('dataset_zip_uuid'))
    partition_count = validate_positive_int(data.get('partition_count'))
    # storage.retrieve_dataset_zipper_files_written will raise HttpErrorNotFound
    # if none of the partitions for team_uuid/dataset_zipper_uuid is found.
    file_count_array, files_written_array = storage.retrieve_dataset_zipper_files_written(
        team_uuid, dataset_zip_uuid, partition_count)
    exists_array, download_url_array = blob_storage.get_dataset_zip_download_url(
        team_uuid, dataset_zip_uuid, partition_count)
    response = {
        'file_count_array': file_count_array,
        'files_written_array': files_written_array,
        'is_ready_array': exists_array,
        'download_url_array': download_url_array,
    }
    blob_storage.set_cors_policy_for_get()
    return flask.jsonify(response)

@app.route('/deleteDatasetZip', methods=['POST'])
@handle_exceptions
@login_required
def delete_dataset_zip():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['dataset_zip_uuid', 'partition_index'])
    dataset_zip_uuid = storage.validate_uuid(data.get('dataset_zip_uuid'))
    partition_index = validate_int(data.get('partition_index'), min=0)
    # blob_storage.delete_dataset_zip does nothing
    # if the team_uuid/dataset_zip_uuid/partition_index is not found
    blob_storage.delete_dataset_zip(team_uuid, dataset_zip_uuid, partition_index)
    # storage.delete_dataset_zipper does nothing
    # if the team_uuid/dataset_zip_uuid/partition_index is not found
    storage.delete_dataset_zipper(team_uuid, dataset_zip_uuid, partition_index)
    return 'OK'

@app.route('/startTrainingModel', methods=['POST'])
@handle_exceptions
@login_required
def start_training_model():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['description', 'dataset_uuids', 'starting_model', 'max_running_minutes', 'num_training_steps', 'create_time_ms'])
    description = validate_description(data.get('description'))
    dataset_uuids_json = storage.validate_uuids_json(data.get('dataset_uuids'))
    starting_model = model_trainer.validate_starting_model(data.get('starting_model'))
    max_running_minutes = validate_positive_float(data.get('max_running_minutes'))
    # The following min/max numbers (100 and 4000) should match the min/max values in root.html.
    num_training_steps = validate_int(data.get('num_training_steps'), min=100)
    create_time_ms = validate_create_time_ms(data.get('create_time_ms'))
    # model_trainer.start_training_model will raise HttpErrorNotFound
    # if starting_model is not a valid starting model and it's not a valid model_uuid, or
    # if any of the team_uuid/dataset_uuid is not found.
    # model_trainer.start_training_model will raise HttpErrorBadRequest
    # if the sorted_label_list values for all the datasets are not the same.
    # model_trainer.start_training_model will raise HttpErrorUnprocessableEntity
    # if the max_running_minutes exceeds the team's remaining_training_minutes.
    model_entity = model_trainer.start_training_model(team_uuid, description, dataset_uuids_json,
        starting_model, max_running_minutes, num_training_steps, create_time_ms)
    # Retrieve the team entity so the client gets the updated remaining_training_minutes.
    team_entity = storage.retrieve_team_entity(team_uuid)
    strip_model_entity(model_entity)
    response = {
        'remaining_training_minutes': team_entity['remaining_training_minutes'],
        'model_entity': model_entity,
    }
    sanitize(response)
    return flask.jsonify(response)

@app.route('/maybeRestartMonitorTraining', methods=['POST'])
@handle_exceptions
@login_required
def maybe_restart_monitor_training():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuid'])
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    # model_trainer.maybe_restart_monitor_training will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
    restarted, model_entity = model_trainer.maybe_restart_monitor_training(team_uuid, model_uuid)
    response = {
        'restarted': restarted,
        'model_entity': model_entity,
    }
    return flask.jsonify(response)

@app.route('/retrieveSummariesUpdated', methods=['POST'])
@handle_exceptions
@login_required
def retrieve_summaries_updated():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuid'])
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    # model_trainer.retrieve_model_entity will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
    model_entity = model_trainer.retrieve_model_entity(team_uuid, model_uuid)
    model_folder = model_entity['model_folder']
    training_dict_path_to_updated = blob_storage.get_event_file_paths(model_folder, 'train')
    eval_dict_path_to_updated = blob_storage.get_event_file_paths(model_folder, 'eval')
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuid', 'job_type', 'value_type'])
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    job_type = validate_job_type(data.get('job_type'))
    value_type = validate_value_type(data.get('value_type'))
    # model_trainer.retrieve_tags_and_steps will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuid', 'job_type', 'value_type'], check_all_keys=False)
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    job_type = validate_job_type(data.get('job_type'))
    value_type = validate_value_type(data.get('value_type'))
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
    # model_trainer.retrieve_summary_items will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuid'])
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    # model_trainer.cancel_training_model will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
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
    validate_keys(flask.request.form.to_dict(flat=True), [])
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuid'])
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    team_entity = storage.retrieve_team_entity(team_uuid)
    # model_trainer.retrieve_model_entity will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuids'])
    model_uuids_json = storage.validate_uuids_json(data.get('model_uuids'))
    # storage.can_delete_models will raise HttpErrorNotFound
    # if any of the team_uuid/model_uuid is not found.
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuid'])
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    # storage.delete_model will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
    storage.delete_model(team_uuid, model_uuid)
    return 'OK'

@app.route('/createTFLite', methods=['POST'])
@handle_exceptions
@login_required
def create_tflite():
    team_uuid = team_info.retrieve_team_uuid(flask.session, flask.request)
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuid'])
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    # storage.retrieve_model_entity will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
    model_entity = storage.retrieve_model_entity(team_uuid, model_uuid)
    model_folder = model_entity['model_folder']
    exists, download_url = blob_storage.get_tflite_model_with_metadata_url(model_folder)
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
    data = validate_keys(flask.request.form.to_dict(flat=True),
        ['model_uuid'])
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    # storage.retrieve_model_entity will raise HttpErrorNotFound
    # if the team_uuid/model_uuid is not found.
    model_entity = storage.retrieve_model_entity(team_uuid, model_uuid)
    model_folder = model_entity['model_folder']
    exists, download_url = blob_storage.get_tflite_model_with_metadata_url(model_folder)
    if exists:
        blob_storage.set_cors_policy_for_get()
    response = {
        'exists': exists,
        'download_url': download_url,
    }
    return flask.jsonify(response)

# performActionGAE is for debugging purposes only.
@app.route('/performActionGAE', methods=['POST'])
@handle_exceptions
@login_required
def perform_action_gae():
    if util.is_production_env():
        raise exceptions.HttpErrorNotFound("Not found")
    start_time = datetime.now()
    action_parameters = flask.request.get_json()
    action.test(action_parameters)
    return 'OK'

# performActionGCF is for debugging purposes only.
@app.route('/performActionGCF', methods=['POST'])
@handle_exceptions
@login_required
def perform_action_gcf():
    if util.is_production_env():
        raise exceptions.HttpErrorNotFound("Not found")
    action_parameters = flask.request.get_json()
    action.trigger_action_via_blob(action_parameters)
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
