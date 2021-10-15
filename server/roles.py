# Copyright 2021 Craig MacFarlane
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

from enum import Enum

import util
from exceptions import NoRoles
from werkzeug.exceptions import Forbidden


class Role(str, Enum):
    GLOBAL_ADMIN = 'GLOBAL_ADMIN'
    ML_DEVELOPER = 'ML_DEVELOPER'
    ML_TEST = 'ML_TEST'
    TEAM_ADMIN = 'TEAM_ADMIN'
    TEAM_MEMBER = 'TEAM_MEMBER'


def can_upload_video(roles):
    return Role.TEAM_ADMIN in roles


#
# Silent if the user can login, raises either NoRoles or Forbidden if the use
# can not login in.
#
def can_login(roles):
    if not has_team_role(roles):
        raise NoRoles()

    if util.is_production_env() or util.is_development_env():
        if not (is_global_admin(roles) or is_ml_developer(roles) or is_ml_test(roles)):
            raise Forbidden()


def has_team_role(roles):
    return Role.TEAM_ADMIN in roles or Role.TEAM_MEMBER in roles


def is_global_admin(roles):
    return Role.GLOBAL_ADMIN in roles


def is_ml_developer(roles):
    return Role.ML_DEVELOPER in roles


def is_ml_test(roles):
    return Role.ML_TEST in roles
