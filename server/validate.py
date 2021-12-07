# Copyright 2021 Google LLC
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
import math

# My Modules
import exceptions
import util


def validate_keys(dict, expected_keys, check_all_keys=True, optional_keys=[]):
    for k in expected_keys:
        if k not in dict:
            message = "Error: expected parameter '%s' is missing." % k
            logging.critical(message)
            raise exceptions.HttpErrorBadRequest(message)
    if check_all_keys:
        for k in dict.keys():
            if k not in expected_keys and k not in optional_keys:
                message = "Error: '%s' is not an expected or optional parameter." % k
                logging.critical(message)
                raise exceptions.HttpErrorBadRequest(message)
    return dict


def validate_string(s, *args):
    for a in args:
        if s == a:
            return s
    message = "Error: '%s' is not a valid argument." % s
    logging.critical(message)
    raise exceptions.HttpErrorBadRequest(message)


def validate_description(s, other_descriptions=[]):
    duplicate = s in other_descriptions
    if not duplicate and len(s) >= 1 and len(s) <= 30 :
        return s
    if duplicate:
        message = "Error: '%s' is not a valid description, it is a duplicate." % s
        logging.info(message)
    else:
        message = "Error: '%s' is not a valid description." % s
        logging.critical(message)
    raise exceptions.HttpErrorBadRequest(message)


def validate_user_preference_key(s):
    return validate_string(s,
        "canvasWidth",
        "root.currentTab",
        "monitorTraining.currentTab")


def validate_video_content_type(s):
    if not s.startswith("video/"):
        message = "Error: '%s' is not a valid video content type." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return s


def validate_job_type(s):
    return validate_string(s, "train", "eval")


def validate_value_type(s):
    return validate_string(s, "scalar", "image")


def validate_float(s, min=None, max=None):
    try:
        f = float(s)
        if min is not None:
            if max is not None:
                # Check min and max.
                if f < min or f > max:
                    message = "Error: '%s' is not a valid number between %d and %d." % (s, min, max)
                    logging.critical(message)
                    raise exceptions.HttpErrorBadRequest(message)
            else:
                # Check min only.
                if f < min:
                    message = "Error: '%s' is not a valid number >= %d." % (s, min)
                    logging.critical(message)
                    raise exceptions.HttpErrorBadRequest(message)
        elif max is not None:
            # Check max only.
            if f > max:
                message = "Error: '%s' is not a valid number <= %d." % (s, max)
                logging.critical(message)
                raise exceptions.HttpErrorBadRequest(message)
        return f
    except:
        message = "Error: '%s' is not a valid number." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)


def validate_positive_float(s):
    f = validate_float(s)
    if f <= 0:
        message = "Error: '%s' is not a valid positive number." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return f


def validate_int(s, min=None, max=None):
    try:
        i = int(s)
        if min is not None:
            if max is not None:
                # Check min and max.
                if i < min or i > max:
                    message = "Error: '%s' is not a valid number between %d and %d." % (s, min, max)
                    logging.critical(message)
                    raise exceptions.HttpErrorBadRequest(message)
            else:
                # Check min only.
                if i < min:
                    message = "Error: '%s' is not a valid number >= %d." % (s, min)
                    logging.critical(message)
                    raise exceptions.HttpErrorBadRequest(message)
        elif max is not None:
            # Check max only.
            if i > max:
                message = "Error: '%s' is not a valid number <= %d." % (s, max)
                logging.critical(message)
                raise exceptions.HttpErrorBadRequest(message)
        return i
    except:
        message = "Error: '%s' is not a valid integer." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)


def validate_positive_int(s):
    i = validate_int(s)
    if i <= 0:
        message = "Error: '%s' is not a valid positive integer." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return i


def validate_frame_number(s):
    return validate_int(s, min=0)


def validate_create_time_ms(s):
    i = validate_positive_int(s)
    create_time = util.datetime_from_ms(i)
    now = datetime.now(timezone.utc)
    delta_seconds = math.fabs((now - create_time).total_seconds())
    # Allow a 3 minute difference between the user's clock and the server's clock.
    if delta_seconds > 3 * 60:
        message = "Error: '%s' is not a valid create time." % s
        logging.critical(message)
        raise exceptions.HttpErrorBadRequest(message)
    return i
