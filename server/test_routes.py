# Copyright 2020 Google LLC, FIRST
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

import time

import flask
from flask import Blueprint

import constants
import exceptions
import oidc
import util
from wrappers import handle_exceptions
from wrappers import redirect_to_login_if_needed


test_routes = Blueprint('test_routes', __name__, template_folder='templates')

@test_routes.route('/test')
@handle_exceptions
@redirect_to_login_if_needed
def test():
    if util.is_production_env():
        raise exceptions.HttpErrorNotFound("Not found")
    return flask.render_template('test.html', time_time=time.time(), project_id=constants.PROJECT_ID,
                                 use_oidc=oidc.is_using_oidc(), redis_ip=constants.REDIS_IP_ADDR)


@test_routes.route('/testExcept')
@handle_exceptions
@redirect_to_login_if_needed
def testExcept():
    if util.is_production_env():
        raise exceptions.HttpErrorNotFound("Not found")
    raise ArithmeticError("Exception Test")

