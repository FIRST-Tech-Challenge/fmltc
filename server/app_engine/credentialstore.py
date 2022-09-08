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

import redis

import constants

class CredentialStore():

    def __init__(self):
        self.red = redis.Redis(host=constants.REDIS_IP_ADDR, port=6379)

    def __getitem__(self, item):
        return self.red.get(item)

    def __setitem__(self, item, value):
        self.red.set(item, value)



