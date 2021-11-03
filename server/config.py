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

from google.cloud import datastore
import constants
import redis

#
# The following corresponds to a datastore document and properties
# within that document.  Care should be taken to ensure that there
# are sensible defaults for properties that don't exist.  One should
# not rely upon an initializer to set a default.
#
DS_SERVER_CONFIG = "Configuration"
KEY_TRAINING_ENABLED = 'training_enabled'
KEY_USE_TPU = 'use_tpu'
KEY_SECURE_SESSION_COOKIES = 'secure_session_cookies'
KEY_SAMESITE_SESSION_COOKIES = 'samesite_session_cookies'

from distutils.util import strtobool

#
# Container for properties that should be read on startup, and maybe be
# refreshed dynamically.
#
# If using redis all the keys are cached in the redis server, otherwise
# the keys are just the attributes of this class.  Note that redis does
# not support boolean values.  Hence care must be taken with the string
# conversion.
#
class Config(dict):

    def __init__(self):
        if constants.REDIS_IP_ADDR is not None:
            self.red = redis.Redis(constants.REDIS_IP_ADDR, port=6379)

    def __getitem__(self, key):
        if constants.REDIS_IP_ADDR is not None:
            # TODO: Rethink how this is done as it will break if we store anything in the config other than a boolean.
            return True if strtobool(str(self.red.get(key), 'utf-8')) else False
        else:
            return super(Config, self).__getitem__(key)

    def __setitem__(self, key, value):
       if constants.REDIS_IP_ADDR is not None:
           self.red.set(key, str(value))
       super(Config, self).__setitem__(key, value)

    def reset(self):
        self[KEY_TRAINING_ENABLED] = True
        self[KEY_USE_TPU] = True
        self[KEY_SECURE_SESSION_COOKIES] = True
        self[KEY_SAMESITE_SESSION_COOKIES] = True

    def refresh(self):
        client = datastore.Client()
        query = client.query(kind=DS_SERVER_CONFIG)
        #
        # This query should never return more than one document.
        #
        config = list(query.fetch())
        if len(config) != 1:
            self.reset()
            return

        entity = config[0]
        if KEY_TRAINING_ENABLED in entity:
            self[KEY_TRAINING_ENABLED] = entity[KEY_TRAINING_ENABLED]
        else:
            self[KEY_TRAINING_ENABLED] = True

        if KEY_USE_TPU in entity:
            self[KEY_USE_TPU] = entity[KEY_USE_TPU]
        else:
            self[KEY_USE_TPU] = True

        if KEY_SECURE_SESSION_COOKIES in entity:
            self[KEY_SECURE_SESSION_COOKIES] = entity[KEY_SECURE_SESSION_COOKIES]
        else:
            self[KEY_SECURE_SESSION_COOKIES] = True

        if KEY_SAMESITE_SESSION_COOKIES in entity:
            self[KEY_SAMESITE_SESSION_COOKIES] = entity[KEY_SAMESITE_SESSION_COOKIES]
        else:
            self[KEY_SAMESITE_SESSION_COOKIES] = True

    #
    # This is for compatibility with javascript.  If we pass in a python boolean
    # then the 神社 template renders it as 'False' or 'True' which javascript does
    # not recognize.
    #
    def get_training_enabled_as_str(self):
        return str(self.training_enabled).lower()

