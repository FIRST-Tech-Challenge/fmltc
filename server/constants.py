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

import os

# PROJECT_ID is set in the environment in app engine and cloud functions.
PROJECT_ID = os.getenv('PROJECT_ID')

# ORIGIN is set in the environment in app engine, but not cloud functions.
ORIGIN = os.getenv('ORIGIN')

# REDIS_IP_ADDR may be set in the environment in app engine, but not cloud functions.
REDIS_IP_ADDR = os.getenv('REDIS_IP_ADDR')

# Expects to be 'development' or 'production'
ENVIRONMENT = os.getenv('ENVIRONMENT')

# Limits
MAX_DESCRIPTION_LENGTH = 30
MAX_VIDEOS_PER_TEAM = 50
MAX_VIDEO_SIZE_MB = 100
MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1000 * 1000
MAX_VIDEO_LENGTH_SECONDS = 120
MAX_FRAMES_PER_VIDEO = 1000
MAX_VIDEO_RESOLUTION_WIDTH = 3840
MAX_VIDEO_RESOLUTION_HEIGHT = 2160
MAX_VIDEOS_TRACKING_PER_TEAM = 3
MAX_BOUNDING_BOX_PER_FRAME = 10
MAX_DATASETS_PER_TEAM = 20
