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


class Role(str, Enum):
    GLOBAL_ADMIN = 'GLOBAL_ADMIN'
    ML_DEVELOPER = 'ML_DEVELOPER'
    ML_TEST = 'ML_TEST'
    TEAM_ADMIN = 'TEAM_ADMIN'
    TEAM_MEMBER = 'TEAM_MEMBER'


def can_upload_video(roles):
    return Role.TEAM_ADMIN in roles


def can_login(roles):
    if util.use_oidc() and (util.is_production_env() or util.is_development_env()):
        return is_global_admin(roles) or is_ml_developer(roles) or is_ml_test()
    else:
        return True


def is_global_admin(roles):
    return Role.GLOBAL_ADMIN in roles


def is_ml_developer(roles):
    return Role.ML_DEVELOPER in roles


def is_ml_test(roles):
    return Role.ML_TEST in roles
