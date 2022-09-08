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

# Python Standard Library
from functools import wraps

# Other Modules
import flask
from werkzeug.exceptions import Forbidden

# My Modules
import constants
import exceptions
import oidc
import roles
import team_info


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
        raise Forbidden("You do not have the required permissions to access this page")
    return wrapper


def oidc_require_login(func):
    if oidc.is_using_oidc():
        return oidc.get_handle().require_login(func)
    @wraps(func)
    def wrapper(*args, **kwargs):
        raise Forbidden("You do not have the required permissions to access this page")
    return wrapper


def roles_required(*roles):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if set(roles).issubset(set(flask.session['user_roles'])):
                return func(*args, **kwargs)
            raise Forbidden("You do not have the required permissions to access this page")
        return wrapper
    return decorator


def roles_accepted(*roles):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if set(roles).isdisjoint(set(flask.session['user_roles'])):
                raise Forbidden("You do not have the required permissions to access this page")
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

