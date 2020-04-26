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

# Other Modules
import google.cloud.storage

# My Modules
import constants
import storage
import util

BUCKET = ('%s' % constants.PROJECT_ID)

def save(request_form, session):
    session['program'] = request_form['program']
    session['team_number'] = request_form['team_number']
    session['team_code'] = request_form['team_code']

def clear(session):
    session.pop('program', None)
    session.pop('team_number', None)
    session.pop('team_code', None)

def validate_team_info(session):
    program = session.get('program')
    if program:
        team_number = session.get('team_number')
        if team_number:
            team_code = session.get('team_code')
            if team_code:
                return __validate_team_info(program, team_number, team_code)
    return False

def __validate_team_info(program, team_number, team_code):
    bucket = google.cloud.storage.Client.from_service_account_json('key.json').get_bucket(BUCKET)
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

def retrieve_program(session):
    return session.get('program', '')

def retrieve_team_number(session):
    return session.get('team_number', '')

def retrieve_team_uuid(session, request):
    program = session['program']
    team_number = session['team_number']
    team_code = session['team_code']
    return storage.retrieve_team_uuid(program, team_number, team_code, request.path)
