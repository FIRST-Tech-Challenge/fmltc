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

#
# The following corresponds to a datastore document and properties
# within that document.  Care should be taken to ensure that there
# are sensible defaults for properties that don't exist.  One should
# not rely upon an initializer to set a default.
#
DS_SERVER_CONFIG = "Configuration"
KEY_TRAINING_ENABLED = 'training_enabled'
KEY_USE_TPU = 'use_tpu'


#
# Container for properties that should be read on startup, and maybe be
# refreshed dynamically.
#
class Config:

    training_enabled = True
    use_tpu = True

    def reset(self):
        self.training_enabled = True
        self.use_tpu = True

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
            self.training_enabled = entity[KEY_TRAINING_ENABLED]
        else:
            self.training_enabled = True

        if KEY_USE_TPU in entity:
            self.use_tpu = entity[KEY_USE_TPU]
        else:
            self.use_tpu = True

    def get_training_enabled(self):
        return self.training_enabled

    def get_use_tpu(self):
        return self.use_tpu



