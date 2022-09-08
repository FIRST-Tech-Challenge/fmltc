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

from datetime import datetime
from google.cloud import datastore

DS_ANNOUNCEMENT = 'Announcements'


#
# Returns a list of announcement entities
#
def get_announcements():
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_ANNOUNCEMENT)
    return list(query.fetch())


#
# Could this be done with an indexed query?  Perhaps, but despite all the documentation
# from Google, built in indexes don't seem to be supported when using Firestore in datastore mode.
# And it seems silly to create a single property index when all the Google documentation says
# single property indexes already exist.  So, this is just easier than fighting the datastore api.
#
def get_unexpired_announcements():
    elems = get_announcements()
    announcements = list(filter(lambda a: a['expires'].replace(tzinfo=None) > datetime.now(), elems))
    return announcements

