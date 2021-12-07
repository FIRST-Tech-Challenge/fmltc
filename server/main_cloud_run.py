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
import logging
import os

# Other Modules
import flask
import flask_cors
import jwt

# My Modules
import blob_storage
import cloud_secrets
import constants
import exceptions
import model_trainer
import storage
import strip
import validate
import wrappers


app = flask.Flask(__name__)
flask_cors.CORS(app)


@app.route('/', methods=['GET'])
@wrappers.handle_exceptions
def root():
    return 'OK'


@app.route('/retrieveVideoFrameEntitiesWithImageUrls', methods=['POST'])
@wrappers.handle_exceptions
def retrieve_video_frame_entities_with_image_urls():
    data = validate.validate_keys(flask.request.form.to_dict(flat=True),
        ['encoded_jwt', 'video_uuid', 'min_frame_number', 'max_frame_number'])
    team_uuid = __authenticate_request(data.get('encoded_jwt'))
    video_uuid = storage.validate_uuid(data.get('video_uuid'))
    min_frame_number = validate.validate_frame_number(data.get('min_frame_number'))
    max_frame_number = validate.validate_frame_number(data.get('max_frame_number'))
    if max_frame_number < min_frame_number:
        message = "Error: 'max_frame_number cannot be less than min_frame_number."
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    # storage.retrieve_video_frame_entities_with_image_urls will raise HttpErrorNotFound
    # if none of the team_uuid/video_uuid/frame_numbers is found.
    video_frame_entities = storage.retrieve_video_frame_entities_with_image_urls(
        team_uuid, video_uuid, min_frame_number, max_frame_number)
    for video_frame_entity in video_frame_entities:
        strip.strip_video_frame_entity(video_frame_entity)
    blob_storage.set_cors_policy_for_get()
    response = {
        'video_frame_entities': video_frame_entities,
    }
    return flask.jsonify(strip.sanitize(response))


@app.route('/retrieveSummaryItems', methods=['POST'])
@wrappers.handle_exceptions
def retrieve_summary_items():
    data = validate.validate_keys(flask.request.form.to_dict(flat=True),
        ['encoded_jwt', 'model_uuid', 'job_type', 'value_type'], check_all_keys=False)
    team_uuid = __authenticate_request(data.get('encoded_jwt'))
    model_uuid = storage.validate_uuid(data.get('model_uuid'))
    job_type = validate.validate_job_type(data.get('job_type'))
    job_type = data.get('job_type')
    value_type = validate.validate_value_type(data.get('value_type'))
    value_type = data.get('value_type')
    # Create a dict from step (as a string) to array of tags.
    dict_step_to_tags = {}
    i = 0
    while True:
        step_key = 'step' + str(i)
        tag_key = 'tag' + str(i)
        if step_key not in data or tag_key not in data:
            break
        step_string = data[step_key]
        if step_string not in dict_step_to_tags:
            dict_step_to_tags[step_string] = []
        tag = data[tag_key]
        dict_step_to_tags[step_string].append(tag)
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
    return flask.jsonify(strip.sanitize(response))


def __authenticate_request(encoded_jwt):
    try:
        jwt_payload = jwt.decode(encoded_jwt, cloud_secrets.get('cloud_run_secret_key'),
            issuer=constants.ORIGIN, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        message = "Error: token has expired"
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    except jwt.InvalidIssuerError:
        message = "Error: invalid issuer"
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return storage.retrieve_team_uuid(jwt_payload['program'], jwt_payload['team_number'])


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
