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
KEY_RESTRICT_BETA = 'restrict_beta'

from distutils.util import strtobool

#
# Container for properties that should be read on startup, and maybe be
# refreshed dynamically.
#
# If using redis all the keys are cached in the redis server, otherwise
# the keys are just the attributes of this class.  Note that redis does
# not support boolean values.  Hence care must be taken with the string
# conversion.  Also note that, while not strictly necessary, an attempt is
# made to keep the redis values synced with the dictionary instance values.
# Hence the write on read of __getitem__ in the redis case.
#
# At application startup refresh() is called to do the initial population
# of an instance of this dictionary, and the redis server.  Note that if
# a second instance of the server is started and a configuration item was
# changed in the datastore, then that second instance will refresh the items
# in the redis server.
#

class Config(dict):

    def __init__(self):
        if constants.REDIS_IP_ADDR is not None:
            self.red = redis.Redis(constants.REDIS_IP_ADDR, port=6379)

    def __getitem__(self, key):
        if constants.REDIS_IP_ADDR is not None:
            # TODO: Rethink how this is done as it will break if we store anything in the config other than a boolean.
            super(Config, self).__setitem__(key, True if strtobool(str(self.red.get(key), 'utf-8')) else False)
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
        self[KEY_RESTRICT_BETA] = False

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
        self.__setvalue(entity, KEY_TRAINING_ENABLED, True)
        self.__setvalue(entity, KEY_USE_TPU, True)
        self.__setvalue(entity, KEY_SECURE_SESSION_COOKIES, True)
        self.__setvalue(entity, KEY_SAMESITE_SESSION_COOKIES, True)
        self.__setvalue(entity, KEY_RESTRICT_BETA, False)

    def __setvalue(self, entity, key, default):
        self[key] = entity[key] if key in entity else default
    #
    # This is for compatibility with javascript.  If we pass in a python boolean
    # then the 神社 (Jinja) template renders it as 'False' or 'True' which javascript does
    # not recognize.
    #
    def get_training_enabled_as_str(self):
        return str(self[KEY_TRAINING_ENABLED]).lower()


#
# Lazy way to get a singleton
#
config = Config()
config.refresh()

