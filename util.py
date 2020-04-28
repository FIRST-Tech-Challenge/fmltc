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
import logging


LOG_MESSAGE_PREFIX = 'FMLTC - '

def log(message):
    logging.critical('%s%s' % (LOG_MESSAGE_PREFIX, message))


def time_now_utc_seconds():
    return datetime.now(timezone.utc).timestamp()


def time_now_utc_millis():
    return round(time_now_utc_seconds() * 1000)


def make_label_pbtxt(sorted_label_list):
    label_pbtxt = ""
    for i, label in enumerate(sorted_label_list):
        label_pbtxt = "%sitem {\n  id: %d\n  name:'%s'\n}\n" % (label_pbtxt, i + 1, label)
    return label_pbtxt
