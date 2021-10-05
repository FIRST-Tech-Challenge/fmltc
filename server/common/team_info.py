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

# My Modules
import constants
import storage
import util

BUCKET_BLOBS = ('%s-blobs' % constants.PROJECT_ID)

TOTAL_TRAINING_MINUTES_PER_TEAM = 120

def login(request_form, session):
    program = request_form.get('program')
    team_number = request_form.get('team_number')
    team_code = request_form.get('team_code')
    if (program and team_number and team_code and
            __validate_team_info(program, team_number, team_code)):
        session['program'] = request_form['program']
        session['team_number'] = request_form['team_number']
        session['team_code'] = request_form['team_code']
        return True
    return False

def logout(session):
    session.pop('program', None)
    session.pop('team_number', None)
    session.pop('team_code', None)
    session.pop('team_uuid', None)

def validate_team_info(session):
    oidc_auth = session.get('oidc_auth')
    if oidc_auth:
        return __validate_team_oidc(session)
    else:
        return __validate_team_local(session)

def __validate_team_oidc(session):
    return True

def __validate_team_local(session):
    program = session.get('program')
    team_number = session.get('team_number')
    team_code = session.get('team_code')
    if program and team_number and team_code:
        return __validate_team_info(program, team_number, team_code)
    return False

def __validate_team_info(program, team_number, team_code):
    bucket = util.storage_client().get_bucket(BUCKET_BLOBS)
    teams = bucket.blob('team_info/teams').download_as_string().decode('utf-8')
    for line in teams.split('\n'):
        line = line.strip()
        if line == "":
            continue
        tokens = line.split(',')
        if program == tokens[0].strip():
            if team_number == tokens[1].strip():
                return team_code == tokens[2].strip()
    logging.critical("__validate_team_info incorrect login program='%s' team_number='%s' team_code='%s'" %
        (program, team_number, team_code))
    return False

def retrieve_program_and_team_number(session_or_request_form):
    return session_or_request_form.get('program', ''), session_or_request_form.get('team_number', '')

def retrieve_team_uuid(session, request):
    if 'team_uuid' in session:
        return session['team_uuid']
    program = session['program']
    team_number = session['team_number']
    team_uuid = storage.retrieve_team_uuid(program, team_number)
    session['team_uuid'] = team_uuid
    return team_uuid
