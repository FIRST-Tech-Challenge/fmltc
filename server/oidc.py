# Copyright 2020 FIRST
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
import json

# Other Modules
from flask_oidc_ext import OpenIDConnect
from sqlitedict import SqliteDict

# My Modules
import cloud_secrets
import constants
from credentialstore import CredentialStore

oidc_handle = None
using_oidc = False

#
# If a redis server is specified, use it, otherwise use a
# local sqlite database.
#
def oidc_init(app):
    global oidc_handle
    global using_oidc
    payload = cloud_secrets.get_or_none("client_secrets")
    if payload is not None:
        using_oidc = True
        credentials_dict = json.loads(payload)
        app.config.update({"OIDC_CLIENT_SECRETS": credentials_dict})
        if constants.REDIS_IP_ADDR is not None:
            oidc_handle = OpenIDConnect(app, credentials_store=CredentialStore())
        else:
            oidc_handle = OpenIDConnect(app, credentials_store=SqliteDict('users.db', autocommit=True))
    else:
        using_oidc = False


def get_handle():
    return oidc_handle


def is_using_oidc():
    return using_oidc


def logout():
    oidc_handle.logout()


def is_user_loggedin():
    return oidc_handle.user_loggedin


def user_getfield(token):
    return oidc_handle.user_getfield(token)



