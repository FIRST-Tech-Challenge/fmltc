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
from datetime import datetime, timezone
import json
import logging

# Other Modules
import google.cloud.storage
from google.oauth2 import service_account

# My Modules
import cloud_secrets
import constants

LOG_MESSAGE_PREFIX = 'FMLTC_LOG - '
ENV_DEVELOPMENT = "development"
ENV_PRODUCTION = "production"

def log(message):
    logging.critical('%s%s' % (LOG_MESSAGE_PREFIX, message))


def ms_from_datetime(dt):
    return round(dt.timestamp() * 1000)


def datetime_from_ms(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc)


def make_label_map(sorted_label_list):
    label_map = ""
    for i, label in enumerate(sorted_label_list):
        label_map = "%sitem {\n  id: %d\n  name:'%s'\n}\n" % (label_map, i + 1, label)
    return label_map


def storage_client():
    payload = cloud_secrets.get("key_json")
    credentials_dict = json.loads(payload)
    credentials = service_account.Credentials.from_service_account_info(credentials_dict)
    return google.cloud.storage.Client(project=constants.PROJECT_ID, credentials=credentials)


def extend_dict_label_to_count(dict, other_dict):
    for label, count in other_dict.items():
        if label in dict:
            dict[label] += count
        else:
            dict[label] = count


def is_development_env():
    if (constants.ENVIRONMENT == ENV_DEVELOPMENT):
        return True
    else:
        return False


def is_production_env():
    if (constants.ENVIRONMENT == ENV_PRODUCTION):
        return True
    else:
        return False