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

class HttpError(Exception):
    """Class for exceptions with an HTTP error code."""
    def __init__(self, message, status_code, status_description):
        Exception.__init__(self)
        self.message = message
        self.status_code = status_code
        self.status_description = status_description


class HttpErrorBadRequest(HttpError):
    """Class for 400 Bad Request exceptions."""
    def __init__(self, message, status_code=400):
        HttpError.__init__(self, message, status_code, 'Bad Request')


class HttpErrorNotFound(HttpError):
    """Class for 404 Not Found exceptions."""
    def __init__(self, message, status_code=404):
        HttpError.__init__(self, message, status_code, 'Not Found')


class HttpErrorConflict(HttpError):
    """Class for 409 Conflict exceptions."""
    def __init__(self, message, status_code=409):
        HttpError.__init__(self, message, status_code, 'Conflict')


class HttpErrorUnprocessableEntity(HttpError):
    """Class for 422 Unprocessable Entity exceptions."""
    def __init__(self, message, status_code=422):
        HttpError.__init__(self, message, status_code, 'Unprocessable Entity')


class HttpErrorInternalServerError(HttpError):
    """Class for 500 Internal Server Error exceptions."""
    def __init__(self, message, status_code=500):
        HttpError.__init__(self, message, status_code, 'Internal Server Error')


class NoRoles(Exception):
    pass


class DownForMaintenance(Exception):
    pass


class ClosedForOffseason(Exception):
    pass

