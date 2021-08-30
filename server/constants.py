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

#
# This file contains constants that are specific to an individual
# deployment.
#
# If a variable is set in your environment the system will use it,
# otherwise, it will use the static definition here.
#
import os

#
# The project id of your Google Cloud project.  Note that things are
# easier all around if your project id is the same as your project name.
# To ensure that is the case, pick a name that the Google Cloud console
# doesn't want to append a random number onto.
#
# Best practice for project naming
#    - If you are associated with a FIRST team prepend the project name
#      with your program and team number.  e.g.  ftc25-* or frc5218-*
#    - Ensure it is globally unique so that the project name and id are
#      identical
#    - Don't use generic project names that might be globally useful
#      in other contexts.  e.g. first-machine-learning-* or similar.
#
PROJECT_ID = os.getenv('PROJECT_ID')
if PROJECT_ID == None:
    PROJECT_ID = '<YOUR-PROJECT-ID>'

#
# Set in the environment or replace <YOUR-SECRET-KEY> with the secret key you want
# to use to configure flask. This should be kept secret and never be uploaded
# to the open source repo.
#
SECRET_KEY = os.getenv('SECRET_KEY')
if SECRET_KEY == None:
    SECRET_KEY = '<YOUR-SECRET-KEY>'

#
# Set in the environment or replace <YOUR-ORIGIN> with the base URL that will serve
# the website. In many cases, this will be https://<Project ID>.appspot.com
# The value should not end with a / and should not contain a path.
#
ORIGIN = os.getenv('ORIGIN')
if ORIGIN == None:
    ORIGIN = '<YOUR-ORIGIN>'

#
# Set to any value to turn on oidc authentication
#
USE_OIDC = os.getenv('USE_OIDC')

#
# Only applicable for OIDC, set to use a redis instance for session storage
#
REDIS_IP_ADDR = os.getenv('REDIS_IP_ADDR')

