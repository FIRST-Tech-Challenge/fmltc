# Copyright 2021 FIRST
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

from google.api_core.exceptions import NotFound
from google.cloud import secretmanager

import constants


def get(secret):
    secret_client = secretmanager.SecretManagerServiceClient()
    name = "projects/{0}/secrets/{1}/versions/latest".format(constants.PROJECT_ID, secret)
    payload = secret_client.access_secret_version(name=name).payload.data.decode("UTF-8")
    return payload


def get_or_none(secret):
    try:
        return get(secret)
    except NotFound:
        return None
