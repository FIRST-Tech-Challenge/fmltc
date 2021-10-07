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

from werkzeug.wrappers import Response

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


def redirect(location: str, code: int = 302) -> "Response":
    """Returns a response object (a WSGI application) that, if called,
    redirects the client to the target location. Supported codes are
    301, 302, 303, 305, 307, and 308. 300 is not supported because
    it's not a real redirect and 304 because it's the answer for a
    request with a request with defined If-Modified-Since headers.

    .. versionadded:: 0.6
       The location can now be a unicode string that is encoded using
       the :func:`iri_to_uri` function.

    .. versionadded:: 0.10
        The class used for the Response object can now be passed in.

    :param location: the location the response should redirect to.
    :param code: the redirect status code. defaults to 302.
    :param class Response: a Response class to use when instantiating a
        response. The default is :class:`werkzeug.wrappers.Response` if
        unspecified.
    """
    import html

    from werkzeug.wrappers import Response  # type: ignore
    from werkzeug.urls import iri_to_uri

    display_location = html.escape(location)
    if isinstance(location, str):
        # Safe conversion is necessary here as we might redirect
        # to a broken URI scheme (for instance itms-services).

        location = iri_to_uri(location, safe_conversion=True)

    response = Response(
        '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">\n'
        "<title>Redirecting...</title>\n"
        "<h1>Redirecting...</h1>\n"
        "<p>You should be redirected automatically to target URL: "
        f'<a href="{html.escape(location)}">{display_location}</a>. If'
        " not click the link.",
        code,
        mimetype="text/html",
    )
    response.headers["Location"] = location
    return response

