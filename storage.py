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
from datetime import datetime, timedelta, timezone
import dateutil.parser
import time
import uuid

# Other Modules
from google.cloud import datastore

# My Modules
import action
import blob_storage
import exceptions
import logging
import util
import frame_extractor

DS_KIND_TEAM = 'Team'
DS_KIND_VIDEO = 'Video'
DS_KIND_VIDEO_FRAME = 'VideoFrame'
DS_KIND_TRACKER = 'Tracker'
DS_KIND_TRACKER_CLIENT = 'TrackerClient'
DS_KIND_DATASET = 'Dataset'
DS_KIND_DATASET_RECORD_WRITER = 'DatasetRecordWriter'
DS_KIND_DATASET_RECORD = 'DatasetRecord'
DS_KIND_DATASET_ZIPPER = 'DatasetZipper'
DS_KIND_MODEL = 'Model'

# teams - public methods

def retrieve_team_uuid(program, team_number, team_code):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        query = datastore_client.query(kind=DS_KIND_TEAM)
        query.add_filter('program', '=', program)
        query.add_filter('team_number', '=', team_number)
        query.add_filter('team_code', '=', team_code)
        team_entities = list(query.fetch(1))
        if len(team_entities) == 0:
            team_uuid = str(uuid.uuid4().hex)
            incomplete_key = datastore_client.key(DS_KIND_TEAM)
            team_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
            team_entity.update({
                'team_uuid': team_uuid,
                'program': program,
                'team_number': team_number,
                'team_code': team_code,
                'remaining_training_minutes': team_info.TOTAL_TRAINING_MINUTES_PER_TEAM,
                'last_time_utc_ms': datetime.now(timezone.utc),
                'preferences': {},
            })
        else:
            team_entity = team_entities[0]
        team_entity['last_time_utc_ms'] = datetime.now(timezone.utc)
        if 'preferences' not in team_entity:
            team_entity['preferences'] = {}
        transaction.put(team_entity)
        return team_entity['team_uuid']

def retrieve_team_entity(team_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        query = datastore_client.query(kind=DS_KIND_TEAM)
        query.add_filter('team_uuid', '=', team_uuid)
        query.add_filter('last_time_utc_ms', '>', 0)
        team_entities = list(query.fetch(1))
        if len(team_entities) == 0:
            message = 'Error: Team entity for team_uuid=%s not found.' % (team_uuid)
            logging.critical(message)
            raise exceptions.HttpErrorNotFound(message)
        team_entity = team_entities[0]
        team_entity['last_time_utc_ms'] = datetime.now(timezone.utc)
        transaction.put(team_entity)
        return team_entity

def store_user_preference(team_uuid, key, value):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        team_entity = retrieve_team_entity(team_uuid)
        team_entity['preferences'][key] = value
        team_entity['last_time_utc_ms'] = datetime.now(timezone.utc)
        transaction.put(team_entity)

def retrieve_user_preferences(team_uuid):
    team_entity = retrieve_team_entity(team_uuid)
    return team_entity['preferences']

# video - public methods

def prepare_to_upload_video(team_uuid, description, video_filename, file_size, content_type, upload_time_ms):
    video_uuid = str(uuid.uuid4().hex)
    video_blob_name, upload_url = blob_storage.prepare_to_upload_video(team_uuid, video_uuid, content_type)
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        incomplete_key = datastore_client.key(DS_KIND_VIDEO)
        video_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
        video_entity.update({
            'team_uuid': team_uuid,
            'video_uuid': video_uuid,
            'description': description,
            'video_filename': video_filename,
            'file_size': file_size,
            'video_content_type': content_type,
            'upload_time_ms': upload_time_ms,
            'video_blob_name': video_blob_name,
            'create_time_utc_ms': util.time_now_utc_millis(),
            'frame_extractor_triggered_time_utc_ms': util.time_now_utc_millis(),
            'frame_extractor_active_time_utc_ms': 0,
            'frame_extraction_start_time_utc_ms': 0,
            'frame_extraction_end_time_utc_ms': 0,
            'extracted_frame_count': 0,
            'included_frame_count': 0,
            'labeled_frame_count': 0,
            'tracking_in_progress': False,
            'tracker_uuid': '',
            'delete_in_progress': False,
        })
        transaction.put(video_entity)
        return video_uuid, upload_url

def prepare_to_trigger_frame_extractor(team_uuid, video_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        video_entity = retrieve_video_entity(team_uuid, video_uuid)
        video_entity['frame_extractor_triggered_time_utc_ms'] = util.time_now_utc_millis()
        transaction.put(video_entity)
        return video_entity

def frame_extractor_active(team_uuid, video_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        video_entity = retrieve_video_entity(team_uuid, video_uuid)
        video_entity['frame_extractor_active_time_utc_ms'] = util.time_now_utc_millis()
        transaction.put(video_entity)
        return video_entity

def frame_extraction_starting(team_uuid, video_uuid, width, height, fps, frame_count):
    store_video_frames(team_uuid, video_uuid, frame_count)
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        video_entity = retrieve_video_entity(team_uuid, video_uuid)
        video_entity['width'] = width
        video_entity['height'] = height
        video_entity['fps'] = fps
        video_entity['frame_count'] = frame_count
        time_now_utc_millis = util.time_now_utc_millis()
        video_entity['frame_extraction_start_time_utc_ms'] = time_now_utc_millis
        video_entity['frame_extractor_active_time_utc_ms'] = time_now_utc_millis
        transaction.put(video_entity)
        return video_entity

def frame_extraction_done(team_uuid, video_uuid, frame_count):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        video_entity = retrieve_video_entity(team_uuid, video_uuid)
        if frame_count > 0:
            video_entity['frame_count'] = frame_count
        time_now_utc_millis = util.time_now_utc_millis()
        video_entity['frame_extraction_end_time_utc_ms'] = time_now_utc_millis
        video_entity['frame_extractor_active_time_utc_ms'] = time_now_utc_millis
        transaction.put(video_entity)
        return video_entity


# Returns a list containing the video entity associated with the given team_uuid and
# video_uuid. If no such entity exists, returns an empty list.
def __query_video_entity(team_uuid, video_uuid):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_VIDEO)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('video_uuid', '=', video_uuid)
    video_entities = list(query.fetch(1))
    return video_entities


# Retrieves the video entity associated with the given team_uuid and video_uuid. If no such
# entity exists, raises HttpErrorNotFound.
def retrieve_video_entity(team_uuid, video_uuid):
    video_entities = __query_video_entity(team_uuid, video_uuid)
    if len(video_entities) == 0:
        message = 'Error: Video entity for video_uuid=%s not found.' % video_uuid
        logging.critical(message)
        raise exceptions.HttpErrorNotFound(message)
    return video_entities[0]

def retrieve_video_list(team_uuid):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_VIDEO)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('delete_in_progress', '=', False)
    query.order = ['upload_time_ms']
    video_entities = list(query.fetch())
    return video_entities

def retrieve_video_entities(team_uuid, video_uuid_list):
    video_entities = []
    all_video_entities = retrieve_video_list(team_uuid)
    for video_entity in all_video_entities:
        if video_entity['video_uuid'] in video_uuid_list:
            video_entities.append(video_entity)
    return video_entities

def retrieve_video_entity_for_labeling(team_uuid, video_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        video_entity = retrieve_video_entity(team_uuid, video_uuid)
        if video_entity['tracking_in_progress']:
            tracking_in_progress = True
            tracker_uuid = video_entity['tracker_uuid']
            tracker_entity = retrieve_tracker_entity(video_uuid, tracker_uuid)
            if tracker_entity is None:
                tracking_in_progress = False
                util.log('Tracker is not in progress. Tracker entity is missing.')
            else:
                # If it's been more than two minutes, assume the tracker has died.
                millis_since_last_update = util.time_now_utc_millis() - tracker_entity['update_time_utc_ms']
                two_minutes_in_ms = 2 * 60 * 1000
                if millis_since_last_update > two_minutes_in_ms:
                    tracking_in_progress = False
                    util.log('Tracker is not in progress. Elapsed time since last tracker update: %d ms' %
                        millis_since_last_update)
            tracker_client_entity = retrieve_tracker_client_entity(video_uuid, tracker_uuid)
            if tracker_client_entity is None:
                tracking_in_progress = False
                util.log('Tracker is not in progress. Tracker client entity is missing.')
            else:
                # If it's been more than two minutes, assume the tracker client is not connected.
                millis_since_last_update = util.time_now_utc_millis() - tracker_client_entity['update_time_utc_ms']
                two_minutes_in_ms = 2 * 60 * 1000
                if millis_since_last_update > two_minutes_in_ms:
                    tracking_in_progress = False
                    util.log('Tracker is not in progress. Elapsed time since last tracker client update: %d ms' %
                        millis_since_last_update)
            if not tracker_in_progress:
                video_entity['tracking_in_progress'] = False
                video_entity['tracker_uuid'] = ''
                transaction.put(video_entity)
                if tracker_entity is not None:
                    transaction.delete(tracker_entity.key)
                if tracker_client_entity is not None:
                    transaction.delete(tracker_client_entity.key)
        return video_entity

def delete_video(team_uuid, video_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        query = datastore_client.query(kind=DS_KIND_VIDEO)
        query.add_filter('team_uuid', '=', team_uuid)
        query.add_filter('video_uuid', '=', video_uuid)
        video_entities = list(query.fetch(1))
        if len(video_entities) != 0:
            video_entity = video_entities[0]
            video_entity['delete_in_progress'] = True
            transaction.put(video_entity)
            action_parameters = action.create_action_parameters(action.ACTION_NAME_DELETE_VIDEO)
            action_parameters['team_uuid'] = team_uuid
            action_parameters['video_uuid'] = video_uuid
            action.trigger_action_via_blob(action_parameters)


def finish_delete_video(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    video_uuid = action_parameters['video_uuid']
    datastore_client = datastore.Client()
    # Delete the video.
    video_entities = __query_video_entity(team_uuid, video_uuid)
    if len(video_entities) != 0:
        video_entity = video_entities[0]
        if 'video_blob_name' in video_entity:
            blob_storage.delete_video_blob(video_entity['video_blob_name'])
        datastore_client.delete(video_entity.key)
    # Delete the video frames, 500 at a time.
    while True:
        if action.is_near_limit(time_limit, active_memory_limit):
            # Time or memory is running out. Trigger the action again to restart.
            action.trigger_action_via_blob(action_parameters)
            return
        query = datastore_client.query(kind=DS_KIND_VIDEO_FRAME)
        query.add_filter('team_uuid', '=', team_uuid)
        query.add_filter('video_uuid', '=', video_uuid)
        video_frame_entities = list(query.fetch(500))
        if len(video_frame_entities) == 0:
            return
        if action.is_near_limit(time_limit, active_memory_limit):
            # Time or memory is running out. Trigger the action again to restart.
            action.trigger_action_via_blob(action_parameters)
            return
        blob_names = []
        keys = []
        while len(video_frame_entities) > 0:
            video_frame_entity = video_frame_entities.pop()
            if 'image_blob_name' in video_frame_entity:
                blob_names.append(video_frame_entity['image_blob_name'])
            keys.append(video_frame_entity.key)
        # Delete the blobs.
        blob_storage.delete_video_frame_images(blob_names)
        if action.is_near_limit(time_limit, active_memory_limit):
            # Time or memory is running out. Trigger the action again to restart.
            action.trigger_action_via_blob(action_parameters)
            return
        # Then, delete the video frame entities.
        datastore_client.delete_multi(keys)


# video frame - private methods

def __query_video_frame(team_uuid, video_uuid, min_frame_number, max_frame_number):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_VIDEO_FRAME)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('video_uuid', '=', video_uuid)
    query.add_filter('frame_number', '>=', min_frame_number)
    query.add_filter('frame_number', '<=', max_frame_number)
    query.order = ['frame_number']
    video_frame_entities = list(query.fetch(max_frame_number - min_frame_number + 1))
    return video_frame_entities


def __retrieve_video_frame_entity(team_uuid, video_uuid, frame_number):
    video_frame_entities = __query_video_frame(team_uuid, video_uuid, frame_number, frame_number)
    if len(video_frame_entities) == 0:
        message = 'Error: Video frame entity for video_uuid=%s frame_number=%d not found.' % (video_uuid, frame_number)
        logging.critical(message)
        raise exceptions.HttpErrorNotFound(message)
    return video_frame_entities[0]


def __store_video_frames(team_uuid, video_uuid, frame_numbers):
    datastore_client = datastore.Client()
    batch = datastore_client.batch()
    batch.begin()
    for frame_number in frame_numbers:
        incomplete_key = datastore_client.key(DS_KIND_VIDEO_FRAME)
        video_frame_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
        video_frame_entity.update({
            'team_uuid': team_uuid,
            'video_uuid': video_uuid,
            'frame_number': frame_number,
            'include_frame_in_dataset': True,
            'bboxes_text': '',
        })
        batch.put(video_frame_entity)
    batch.commit()

# video frame - public methods

def store_video_frames(team_uuid, video_uuid, frame_count):
    frame_numbers = [i for i in range(frame_count)]
    while len(frame_numbers) > 0:
        if len(frame_numbers) > 500:
            frame_numbers_to_do_now = frame_numbers[0:500]
            frame_numbers = frame_numbers[500:]
        else:
            frame_numbers_to_do_now = frame_numbers
            frame_numbers = []
        __store_video_frames(team_uuid, video_uuid, frame_numbers_to_do_now)


def retrieve_video_frame_entities(team_uuid, video_uuid, min_frame_number, max_frame_number):
    return __query_video_frame(team_uuid, video_uuid, min_frame_number, max_frame_number)


def store_frame_image(team_uuid, video_uuid, frame_number, content_type, image_data):
    image_blob_name = blob_storage.store_video_frame_image(team_uuid, video_uuid, frame_number, content_type, image_data)
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        video_frame_entity = __retrieve_video_frame_entity(team_uuid, video_uuid, frame_number)
        video_frame_entity['content_type'] = content_type
        video_frame_entity['image_blob_name'] = image_blob_name
        transaction.put(video_frame_entity)
        # Also update the video_entity in the same transaction.
        video_entity = retrieve_video_entity(team_uuid, video_uuid)
        video_entity['extracted_frame_count'] = frame_number + 1
        video_entity['included_frame_count'] = frame_number + 1
        video_entity['frame_extractor_active_time_utc_ms'] = util.time_now_utc_millis()
        if frame_number == 0:
            video_entity['image_content_type'] = content_type
            video_entity['image_blob_name'] = image_blob_name
        transaction.put(video_entity)
        # Return the video entity, not the video frame entity!
        return video_entity


def retrieve_video_frame_image(team_uuid, video_uuid, frame_number):
    video_frame_entity = __retrieve_video_frame_entity(team_uuid, video_uuid, frame_number)
    if 'image_blob_name' not in video_frame_entity:
        message = 'Error: Image for video_uuid=%s frame_number=%d not found.' % (video_uuid, frame_number)
        logging.critical(message)
        raise exceptions.HttpErrorNotFound(message)
    image = blob_storage.retrieve_video_frame_image(video_frame_entity['image_blob_name'])
    return image, video_frame_entity['content_type']


def store_video_frame_bboxes_text(team_uuid, video_uuid, frame_number, bboxes_text):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        return __store_video_frame_bboxes_text(transaction, team_uuid, video_uuid, frame_number, bboxes_text)

def __store_video_frame_bboxes_text(transaction, team_uuid, video_uuid, frame_number, bboxes_text):
    video_frame_entity = __retrieve_video_frame_entity(team_uuid, video_uuid, frame_number)
    previously_had_labels = len(video_frame_entity['bboxes_text']) > 0
    now_has_labels = len(bboxes_text) > 0
    video_frame_entity['bboxes_text'] = bboxes_text
    transaction.put(video_frame_entity)
    if previously_had_labels != now_has_labels:
        # Also update the video_entity in the same transaction.
        video_entity = retrieve_video_entity(team_uuid, video_uuid)
        if now_has_labels:
            video_entity['labeled_frame_count'] += 1
        else:
            video_entity['labeled_frame_count'] -= 1
        transaction.put(video_entity)
    return video_frame_entity

def store_video_frame_include_in_dataset(team_uuid, video_uuid, frame_number, include_frame_in_dataset):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        video_frame_entity = __retrieve_video_frame_entity(team_uuid, video_uuid, frame_number)
        previous_include_frame_in_dataset = video_frame_entity['include_frame_in_dataset']
        if include_frame_in_dataset != previous_include_frame_in_dataset:
            video_frame_entity['include_frame_in_dataset'] = include_frame_in_dataset
            transaction.put(video_frame_entity)
            # Also update the video_entity in the same transaction.
            video_entity = retrieve_video_entity(team_uuid, video_uuid)
            if include_frame_in_dataset:
                video_entity['included_frame_count'] += 1
            else:
                video_entity['included_frame_count'] -= 1
            transaction.put(video_entity)
        return video_frame_entity

def retrieve_video_frame_entities_with_image_urls(team_uuid, video_uuid,
        min_frame_number, max_frame_number):
    video_frame_entities = __query_video_frame(team_uuid, video_uuid, min_frame_number, max_frame_number)
    image_blob_names = []
    for video_frame_entity in video_frame_entities:
        image_blob_names.append(video_frame_entity['image_blob_name'])
    image_urls = blob_storage.get_image_urls(image_blob_names)
    for i, video_frame_entity in enumerate(video_frame_entities):
        video_frame_entity['image_url'] = image_urls[i]
    return video_frame_entities

# tracking - public methods

def tracker_starting(team_uuid, video_uuid, tracker_name, scale, init_frame_number, init_bboxes_text):
    tracker_uuid = str(uuid.uuid4().hex)
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        video_entity = retrieve_video_entity(team_uuid, video_uuid)
        if video_entity['tracking_in_progress']:
            message = 'Error: Tracking is already in progress for video_uuid=%s.' % video_uuid
            logging.critical(message)
            raise exceptions.HttpErrorConflict(message)
        incomplete_key = datastore_client.key(DS_KIND_TRACKER)
        tracker_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
        tracker_entity.update({
            'team_uuid': team_uuid,
            'video_uuid': video_uuid,
            'tracker_uuid': tracker_uuid,
            'update_time_utc_ms': util.time_now_utc_millis(),
            'video_blob_name': video_entity['video_blob_name'],
            'tracker_name': tracker_name,
            'scale': scale,
            'frame_number': init_frame_number,
            'bboxes_text': init_bboxes_text,
            'tracker_failed': False,
        })
        transaction.put(tracker_entity)
        incomplete_key = datastore_client.key(DS_KIND_TRACKER_CLIENT)
        tracker_client_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
        tracker_client_entity.update({
            'team_uuid': team_uuid,
            'video_uuid': video_uuid,
            'tracker_uuid': tracker_uuid,
            'update_time_utc_ms': util.time_now_utc_millis(),
            'frame_number': init_frame_number,
            'bboxes_text': init_bboxes_text,
            'tracking_stop_requested': False,
        })
        transaction.put(tracker_client_entity)
        # Also update the video_entity in the same transaction.
        video_entity['tracking_in_progress'] = True
        video_entity['tracker_uuid'] = tracker_uuid
        transaction.put(video_entity)
        return tracker_uuid

def retrieve_tracker_entity(video_uuid, tracker_uuid):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_TRACKER)
    query.add_filter('tracker_uuid', '=', tracker_uuid)
    query.add_filter('video_uuid', '=', video_uuid)
    tracker_entities = list(query.fetch(1))
    if len(tracker_entities) == 0:
        return None
    return tracker_entities[0]

def retrieve_tracker_client_entity(video_uuid, tracker_uuid):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_TRACKER_CLIENT)
    query.add_filter('tracker_uuid', '=', tracker_uuid)
    query.add_filter('video_uuid', '=', video_uuid)
    tracker_client_entities = list(query.fetch(1))
    if len(tracker_client_entities) == 0:
        return None
    return tracker_client_entities[0]

def store_tracked_bboxes(video_uuid, tracker_uuid, frame_number, bboxes_text):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        tracker_entity = retrieve_tracker_entity(video_uuid, tracker_uuid)
        if tracker_entity is not None:
            tracker_entity['frame_number'] = frame_number
            tracker_entity['bboxes_text'] = bboxes_text
            tracker_entity['update_time_utc_ms'] = util.time_now_utc_millis()
            transaction.put(tracker_entity)

def retrieve_tracked_bboxes(video_uuid, tracker_uuid, retrieve_frame_number, time_limit):
    tracking_client_still_alive(video_uuid, tracker_uuid)
    tracker_entity = retrieve_tracker_entity(video_uuid, tracker_uuid)
    while True:
        if tracker_entity is None:
            util.log('Tracker appears to have failed. Tracker entity is missing.')
            return True, 0, ''
        if tracker_entity['frame_number'] == retrieve_frame_number:
            break
        if datetime.now() >= time_limit - timedelta(seconds=5):
            break
        # If it's been more than two minutes, assume the tracker has died.
        millis_since_last_update = util.time_now_utc_millis() - tracker_entity['update_time_utc_ms']
        two_minutes_in_ms = 2 * 60 * 1000
        if millis_since_last_update > two_minutes_in_ms:
            util.log('Tracker appears to have failed. Elapsed time since last update: %d ms' % millis_since_last_update)
            tracker_stopping(tracker_entity['team_uuid'], tracker_entity['video_uuid'], tracker_uuid)
            tracker_entity['tracker_failed'] = True
            break
        time.sleep(0.1)
        tracker_entity = retrieve_tracker_entity(video_uuid, tracker_uuid)
    return tracker_entity['tracker_failed'], tracker_entity['frame_number'], tracker_entity['bboxes_text']

def tracking_client_still_alive(video_uuid, tracker_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        tracker_client_entity = retrieve_tracker_client_entity(video_uuid, tracker_uuid)
        if tracker_client_entity is not None:
            tracker_client_entity['update_time_utc_ms'] = util.time_now_utc_millis()
            transaction.put(tracker_client_entity)

def continue_tracking(team_uuid, video_uuid, tracker_uuid, frame_number, bboxes_text):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        tracker_client_entity = retrieve_tracker_client_entity(video_uuid, tracker_uuid)
        if tracker_client_entity is not None:
            # Update the video_frame_entity (and the video_entity if necessary)
            __store_video_frame_bboxes_text(transaction, team_uuid, video_uuid, frame_number, bboxes_text)
            # Update the tracker_client_entity
            tracker_client_entity['frame_number'] = frame_number
            tracker_client_entity['bboxes_text'] = bboxes_text
            tracker_client_entity['update_time_utc_ms'] = util.time_now_utc_millis()
            transaction.put(tracker_client_entity)

def set_tracking_stop_requested(video_uuid, tracker_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        tracker_client_entity = retrieve_tracker_client_entity(video_uuid, tracker_uuid)
        if tracker_client_entity is not None:
            tracker_client_entity['tracking_stop_requested'] = True
            tracker_client_entity['update_time_utc_ms'] = util.time_now_utc_millis()
            transaction.put(tracker_client_entity)

def tracker_stopping(team_uuid, video_uuid, tracker_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        video_entity = retrieve_video_entity(team_uuid, video_uuid)
        video_entity['tracking_in_progress'] = False
        video_entity['tracker_uuid'] = ''
        transaction.put(video_entity)
        tracker_entity = retrieve_tracker_entity(video_uuid, tracker_uuid)
        if tracker_entity is not None:
            transaction.delete(tracker_entity.key)
        tracker_client_entity = retrieve_tracker_client_entity(video_uuid, tracker_uuid)
        if tracker_client_entity is not None:
            transaction.delete(tracker_client_entity.key)


# dataset - private methods

def __query_dataset(team_uuid, dataset_uuid):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_DATASET)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('dataset_uuid', '=', dataset_uuid)
    dataset_entities = list(query.fetch(1))
    return dataset_entities

# dataset - public methods

def prepare_to_start_dataset_production(team_uuid, description, eval_percent, start_time_ms):
    dataset_uuid = str(uuid.uuid4().hex)
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        incomplete_key = datastore_client.key(DS_KIND_DATASET)
        dataset_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
        dataset_entity.update({
            'team_uuid': team_uuid,
            'dataset_uuid': dataset_uuid,
            'description': description,
            'eval_percent': eval_percent,
            'creation_time_ms': start_time_ms,
            'dataset_completed': False,
            'train_negative_frame_count': 0,
            'train_dict_label_to_count': {},
            'eval_negative_frame_count': 0,
            'eval_dict_label_to_count': {},
            'delete_in_progress': False,
        })
        transaction.put(dataset_entity)
        return dataset_uuid

def dataset_producer_starting(team_uuid, dataset_uuid, video_filenames, sorted_label_list,
        train_frame_count, train_record_count, train_input_path,
        eval_frame_count, eval_record_count, eval_input_path):
    dataset_folder_path = blob_storage.get_dataset_folder_path(team_uuid, dataset_uuid)
    label_map_blob_name, label_map_path = blob_storage.store_dataset_label_map(team_uuid, dataset_uuid, sorted_label_list)
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        dataset_entity = retrieve_dataset_entity(team_uuid, dataset_uuid)
        dataset_entity['video_filenames'] = video_filenames
        dataset_entity['sorted_label_list'] = sorted_label_list
        dataset_entity['train_record_count'] = train_record_count
        dataset_entity['train_frame_count'] = train_frame_count
        dataset_entity['train_input_path'] = '%s/%s' % (dataset_folder_path, train_input_path)
        dataset_entity['eval_record_count'] = eval_record_count
        dataset_entity['eval_frame_count'] = eval_frame_count
        dataset_entity['eval_input_path'] = '%s/%s' % (dataset_folder_path, eval_input_path)
        dataset_entity['total_record_count'] = train_record_count + eval_record_count
        dataset_entity['label_map_blob_name'] = label_map_blob_name
        dataset_entity['label_map_path'] = label_map_path
        transaction.put(dataset_entity)
        # Create dataset_record_writer_entities.
        for record_number in range(train_record_count + eval_record_count):
            incomplete_key = datastore_client.key(DS_KIND_DATASET_RECORD_WRITER)
            dataset_record_writer_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
            dataset_record_writer_entity.update({
                'team_uuid': team_uuid,
                'dataset_uuid': dataset_uuid,
                'record_number': record_number,
                'frames_written': 0,
                'update_time_utc_ms': util.time_now_utc_millis(),
            })
            transaction.put(dataset_record_writer_entity)


def dataset_producer_maybe_done(team_uuid, dataset_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        # Fetch the dataset entity first.
        dataset_entity = retrieve_dataset_entity(team_uuid, dataset_uuid)
        if not dataset_entity['dataset_completed']:
            total_record_count = dataset_entity['total_record_count']
            # Fetch the dataset record entities.
            query = datastore_client.query(kind=DS_KIND_DATASET_RECORD)
            query.add_filter('team_uuid', '=', team_uuid)
            query.add_filter('dataset_uuid', '=', dataset_uuid)
            dataset_record_entities = list(query.fetch(total_record_count))
            if len(dataset_record_entities) == total_record_count:
                util.log('Dataset producer is all done!')
                # All the dataset records have been stored. The dataset producer is done.
                # Update dataset_completed, train_negative_frame_count, train_dict_label_to_count,
                # eval_negative_frame_count, and eval_dict_label_to_count in the dataset entity.
                train_negative_frame_count = 0
                eval_negative_frame_count = 0
                train_dict_label_to_count = {}
                eval_dict_label_to_count = {}
                for dataset_record_entity in dataset_record_entities:
                    if dataset_record_entity['is_eval']:
                        eval_negative_frame_count += dataset_record_entity['negative_frame_count']
                        dict_label_to_count = eval_dict_label_to_count
                    else:
                        train_negative_frame_count += dataset_record_entity['negative_frame_count']
                        dict_label_to_count = train_dict_label_to_count
                    util.extend_dict_label_to_count(dict_label_to_count, dataset_record_entity['dict_label_to_count'])
                dataset_entity['dataset_completed'] = True
                dataset_entity['train_negative_frame_count'] = train_negative_frame_count
                dataset_entity['train_dict_label_to_count'] = train_dict_label_to_count
                dataset_entity['eval_negative_frame_count'] = eval_negative_frame_count
                dataset_entity['eval_dict_label_to_count'] = eval_dict_label_to_count
                transaction.put(dataset_entity)
                __delete_dataset_record_writers(dataset_entity)

# Retrieves the dataset entity associated with the given team_uuid and dataset_uuid. If no such
# entity exists, raises HttpErrorNotFound.
def retrieve_dataset_entity(team_uuid, dataset_uuid):
    dataset_entities = __query_dataset(team_uuid, dataset_uuid)
    if len(dataset_entities) == 0:
        message = 'Error: Dataset entity for dataset_uuid=%s not found.' % dataset_uuid
        logging.critical(message)
        raise exceptions.HttpErrorNotFound(message)
    return dataset_entities[0]

def retrieve_dataset_list(team_uuid):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_DATASET)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('delete_in_progress', '=', False)
    query.order = ['creation_time_ms']
    dataset_entities = list(query.fetch())
    return dataset_entities


def retrieve_dataset_entities(team_uuid, dataset_uuid_list):
    dataset_entities = []
    all_dataset_entities = retrieve_dataset_list(team_uuid)
    for dataset_entity in all_dataset_entities:
        if dataset_entity['dataset_uuid'] in dataset_uuid_list:
            dataset_entities.append(dataset_entity)
    return dataset_entities


def delete_dataset(team_uuid, dataset_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        query = datastore_client.query(kind=DS_KIND_DATASET)
        query.add_filter('team_uuid', '=', team_uuid)
        query.add_filter('dataset_uuid', '=', dataset_uuid)
        dataset_entities = list(query.fetch(1))
        if len(dataset_entities) != 0:
            dataset_entity = dataset_entities[0]
            dataset_entity['delete_in_progress'] = True
            transaction.put(dataset_entity)
            action_parameters = action.create_action_parameters(action.ACTION_NAME_DELETE_DATASET)
            action_parameters['team_uuid'] = team_uuid
            action_parameters['dataset_uuid'] = dataset_uuid
            action.trigger_action_via_blob(action_parameters)


def finish_delete_dataset(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    dataset_uuid = action_parameters['dataset_uuid']
    datastore_client = datastore.Client()
    # Delete the dataset.
    dataset_entities = __query_dataset(team_uuid, dataset_uuid)
    if len(dataset_entities) != 0:
        dataset_entity = dataset_entities[0]
        datastore_client.delete(dataset_entity.key)
    # Delete the label.pbtxt blob.
    blob_storage.delete_dataset_blob(dataset_entity['label_map_blob_name'])
    # Delete the dataset records, 500 at a time.
    while True:
        if action.is_near_limit(time_limit, active_memory_limit):
            # Time or memory is running out. Trigger the action again to restart.
            action.trigger_action_via_blob(action_parameters)
            return
        query = datastore_client.query(kind=DS_KIND_DATASET_RECORD)
        query.add_filter('team_uuid', '=', team_uuid)
        query.add_filter('dataset_uuid', '=', dataset_uuid)
        dataset_record_entities = list(query.fetch(500))
        if len(dataset_record_entities) == 0:
            return
        if action.is_near_limit(time_limit, active_memory_limit):
            # Time or memory is running out. Trigger the action again to restart.
            action.trigger_action_via_blob(action_parameters)
            return
        blob_names = []
        keys = []
        while len(dataset_record_entities) > 0:
            dataset_record_entity = dataset_record_entities.pop()
            if 'tf_record_blob_name' in dataset_record_entity:
                blob_names.append(dataset_record_entity['tf_record_blob_name'])
            keys.append(dataset_record_entity.key)
        # Delete the blobs.
        blob_storage.delete_dataset_blobs(blob_names)
        if action.is_near_limit(time_limit, active_memory_limit):
            # Time or memory is running out. Trigger the action again to restart.
            action.trigger_action_via_blob(action_parameters)
            return
        # Then, delete the dataset record entities.
        datastore_client.delete_multi(keys)


# dataset record

def store_dataset_record(team_uuid, dataset_uuid, record_number, record_id, is_eval, tf_record_blob_name,
        negative_frame_count, dict_label_to_count):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        incomplete_key = datastore_client.key(DS_KIND_DATASET_RECORD)
        dataset_record_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
        dataset_record_entity.update({
            'team_uuid': team_uuid,
            'dataset_uuid': dataset_uuid,
            'record_number': record_number,
            'record_id': record_id,
            'is_eval': is_eval,
            'tf_record_blob_name': tf_record_blob_name,
            'negative_frame_count': negative_frame_count,
            'dict_label_to_count': dict_label_to_count.copy(),
        })
        transaction.put(dataset_record_entity)

def retrieve_dataset_records(dataset_entity):
    if 'total_record_count' not in dataset_entity:
        return []
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_DATASET_RECORD)
    query.add_filter('team_uuid', '=', dataset_entity['team_uuid'])
    query.add_filter('dataset_uuid', '=', dataset_entity['dataset_uuid'])
    query.order = ['record_number']
    dataset_record_entities = list(query.fetch(dataset_entity['total_record_count']))
    return dataset_record_entities

# dataset record writer - public methods

def __retrieve_dataset_record_writer(team_uuid, dataset_uuid, record_number):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_DATASET_RECORD_WRITER)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('dataset_uuid', '=', dataset_uuid)
    query.add_filter('record_number', '=', record_number)
    dataset_record_writer_entities = list(query.fetch(1))
    if len(dataset_record_writer_entities) == 0:
        return None
    return dataset_record_writer_entities[0]

def update_dataset_record_writer(team_uuid, dataset_uuid, record_number, frames_written):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        dataset_record_writer_entity = __retrieve_dataset_record_writer(team_uuid, dataset_uuid, record_number)
        if dataset_record_writer_entity is not None:
            dataset_record_writer_entity['frames_written'] = frames_written
            dataset_record_writer_entity['update_time_utc_ms'] = util.time_now_utc_millis()
            transaction.put(dataset_record_writer_entity)

def retrieve_dataset_record_writer_frames_written(dataset_entity):
    if 'total_record_count' not in dataset_entity:
        return 0
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_DATASET_RECORD_WRITER)
    query.add_filter('team_uuid', '=', dataset_entity['team_uuid'])
    query.add_filter('dataset_uuid', '=', dataset_entity['dataset_uuid'])
    query.order = ['record_number']
    dataset_record_writer_entities = list(query.fetch(dataset_entity['total_record_count']))
    frames_written = 0
    for dataset_record_writer_entity in dataset_record_writer_entities:
        frames_written += dataset_record_writer_entity['frames_written']
    return frames_written

def __delete_dataset_record_writers(dataset_entity):
    action_parameters = action.create_action_parameters(action.ACTION_NAME_DELETE_DATASET_RECORD_WRITERS)
    action_parameters['team_uuid'] = dataset_entity['team_uuid']
    action_parameters['dataset_uuid'] = dataset_entity['dataset_uuid']
    action.trigger_action_via_blob(action_parameters)

def finish_delete_dataset_record_writers(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    dataset_uuid = action_parameters['dataset_uuid']
    datastore_client = datastore.Client()
    # Delete the dataset record writers, 500 at a time.
    while True:
        if action.is_near_limit(time_limit, active_memory_limit):
            # Time or memory is running out. Trigger the action again to restart.
            action.trigger_action_via_blob(action_parameters)
            return
        query = datastore_client.query(kind=DS_KIND_DATASET_RECORD_WRITER)
        query.add_filter('team_uuid', '=', team_uuid)
        query.add_filter('dataset_uuid', '=', dataset_uuid)
        dataset_record_writer_entities = list(query.fetch(500))
        if len(dataset_record_writer_entities) == 0:
            return
        if action.is_near_limit(time_limit, active_memory_limit):
            # Time or memory is running out. Trigger the action again to restart.
            action.trigger_action_via_blob(action_parameters)
            return
        keys = []
        while len(dataset_record_writer_entities) > 0:
            dataset_record_writer_entity = dataset_record_writer_entities.pop()
            keys.append(dataset_record_writer_entity.key)
        # Then, delete the dataset record entities.
        datastore_client.delete_multi(keys)

# dataset zipper - public methods

def create_dataset_zippers(team_uuid, dataset_zip_uuid, partition_count):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        for partition_index in range(partition_count):
            incomplete_key = datastore_client.key(DS_KIND_DATASET_ZIPPER)
            dataset_zipper_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
            dataset_zipper_entity.update({
                'team_uuid': team_uuid,
                'dataset_zip_uuid': dataset_zip_uuid,
                'partition_index': partition_index,
                'file_count': 0,
                'files_written': 0,
                'update_time_utc_ms': util.time_now_utc_millis(),
            })
            transaction.put(dataset_zipper_entity)

def __retrieve_dataset_zipper(team_uuid, dataset_zip_uuid, partition_index):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_DATASET_ZIPPER)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('dataset_zip_uuid', '=', dataset_zip_uuid)
    query.add_filter('partition_index', '=', partition_index)
    dataset_zipper_entities = list(query.fetch(1))
    if len(dataset_zipper_entities) == 0:
        return None
    return dataset_zipper_entities[0]

def update_dataset_zipper(team_uuid, dataset_zip_uuid, partition_index, file_count, files_written):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        dataset_zipper_entity = __retrieve_dataset_zipper(team_uuid, dataset_zip_uuid, partition_index)
        if dataset_zipper_entity is not None:
            dataset_zipper_entity['file_count'] = file_count
            dataset_zipper_entity['files_written'] = files_written
            dataset_zipper_entity['update_time_utc_ms'] = util.time_now_utc_millis()
            transaction.put(dataset_zipper_entity)

def retrieve_dataset_zipper_files_written(team_uuid, dataset_zip_uuid, partition_count):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_DATASET_ZIPPER)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('dataset_zip_uuid', '=', dataset_zip_uuid)
    query.order = ['partition_index']
    dataset_zipper_entities = list(query.fetch(partition_count))
    file_count_array = []
    files_written_array = []
    for dataset_zipper_entity in dataset_zipper_entities:
        file_count_array.append(dataset_zipper_entity['file_count'])
        files_written_array.append(dataset_zipper_entity['files_written'])
    return file_count_array, files_written_array

def delete_dataset_zipper(team_uuid, dataset_zip_uuid, partition_index):
    datastore_client = datastore.Client()
    dataset_zipper_entity =__retrieve_dataset_zipper(team_uuid, dataset_zip_uuid, partition_index)
    datastore_client.delete(dataset_zipper_entity.key)

# model - public methods

def model_trainer_starting(team_uuid, max_running_minutes):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        team_entity = retrieve_team_entity(team_uuid)
        team_entity['remaining_training_minutes'] -= max_running_minutes
        if team_entity['remaining_training_minutes'] < 0:
            message = (
                "Error: The requested training time (%d minutes) exceeds the team's remaining training time (%d minutes)." %
                (max_running_minutes, team_entity['remaining_training_minutes']))
            logging.critical(message)
            raise exceptions.HttpErrorUnprocessableEntity(message)
        transaction.put(team_entity)
    model_uuid = str(uuid.uuid4().hex)
    return model_uuid

def model_trainer_failed_to_start(team_uuid, max_running_minutes):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        team_entity = retrieve_team_entity(team_uuid)
        team_entity['remaining_training_minutes'] += max_running_minutes
        transaction.put(team_entity)

def model_trainer_started(team_uuid, model_uuid, description,
        dataset_uuids, start_time_ms, max_running_minutes, num_training_steps,
        previous_training_steps, starting_model, user_visible_starting_model,
        original_starting_model, fine_tune_checkpoint, video_filenames,
        sorted_label_list, label_map_path, train_input_path, eval_input_path,
        train_frame_count, eval_frame_count, train_negative_frame_count, eval_negative_frame_count,
        train_dict_label_to_count, eval_dict_label_to_count, train_job, eval_job):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        incomplete_key = datastore_client.key(DS_KIND_MODEL)
        model_entity = datastore.Entity(key=incomplete_key) # TODO(lizlooney): exclude_from_indexes?
        model_entity.update({
            'team_uuid': team_uuid,
            'model_uuid': model_uuid,
            'description': description,
            'dataset_uuids': dataset_uuids,
            'creation_time_ms': start_time_ms,
            'video_filenames': video_filenames,
            'sorted_label_list': sorted_label_list,
            'label_map_path': label_map_path,
            'train_input_path': train_input_path,
            'eval_input_path': eval_input_path,
            'train_frame_count': train_frame_count,
            'eval_frame_count': eval_frame_count,
            'train_negative_frame_count': train_negative_frame_count,
            'eval_negative_frame_count': eval_negative_frame_count,
            'train_dict_label_to_count': train_dict_label_to_count,
            'eval_dict_label_to_count': eval_dict_label_to_count,
            'starting_model': starting_model,
            'user_visible_starting_model': user_visible_starting_model,
            'original_starting_model': original_starting_model,
            'fine_tune_checkpoint': fine_tune_checkpoint,
            'max_running_minutes': max_running_minutes,
            'num_training_steps': num_training_steps,
            'previous_training_steps': previous_training_steps,
            'total_training_steps': (num_training_steps + previous_training_steps),
            'cancel_requested': False,
            'delete_in_progress': False,
            'train_consumed_ml_units': 0,
            'train_job_elapsed_seconds': 0,
            'eval_consumed_ml_units': 0,
            'eval_job_elapsed_seconds': 0,
            'trained_checkpoint_path': '',
        })
        __update_model_entity(model_entity, train_job, 'train_')
        # If the training job has already ended, adjust the team's remaining training time.
        if 'train_job_end_time' in model_entity:
            team_entity = retrieve_team_entity(team_uuid)
            train_job_elapsed_minutes = model_entity['train_job_elapsed_seconds'] / 60
            delta = model_entity['max_running_minutes'] - train_job_elapsed_minutes
            # Don't add the delta if it's negative. The job ran longer than the maximum running
            # time that the user specified.
            if delta > 0:
                team_entity['remaining_training_minutes'] += delta
                transaction.put(team_entity)
        if eval_job is None:
            model_entity['eval_job'] = False
            model_entity['eval_job_state'] = ''
        else:
            model_entity['eval_job'] = True
            __update_model_entity(model_entity, eval_job, 'eval_')
        model_entity['update_time_utc_ms'] = util.time_now_utc_millis()
        transaction.put(model_entity)
        return model_entity

def cancel_training_requested(team_uuid, model_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        model_entity = retrieve_model_entity(team_uuid, model_uuid)
        model_entity['cancel_requested'] = True
        model_entity['update_time_utc_ms'] = util.time_now_utc_millis()
        transaction.put(model_entity)
        return model_entity

# Returns a list containing the model entity associated with the given team_uuid and
# model_uuid. If no such entity exists, returns an empty list.
def __query_model_entity(team_uuid, model_uuid):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_MODEL)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('model_uuid', '=', model_uuid)
    model_entities = list(query.fetch(1))
    return model_entities


# Retrieves the model entity associated with the given team_uuid and model_uuid. If no such
# entity exists, raises HttpErrorNotFound.
def retrieve_model_entity(team_uuid, model_uuid):
    model_entities = __query_model_entity(team_uuid, model_uuid)
    if len(model_entities) == 0:
        message = 'Error: Model entity for model_uuid=%s not found.' % model_uuid
        logging.critical(message)
        raise exceptions.HttpErrorNotFound(message)
    return model_entities[0]

def __update_model_entity(model_entity, job, prefix):
    model_entity[prefix + 'job_state'] = job['state']
    if 'trainingOutput' in job:
        model_entity[prefix + 'consumed_ml_units'] = job['trainingOutput'].get('consumedMLUnits', 0)
    if 'createTime' in job:
        model_entity[prefix + 'job_create_time'] = job['createTime']
    if 'startTime' in job:
        model_entity[prefix + 'job_start_time'] = job['startTime']
    if 'endTime' in job:
        model_entity[prefix + 'job_end_time'] = job['endTime']
    if (prefix + 'job_start_time') in model_entity and (prefix + 'job_end_time') in model_entity:
        elapsed = (
            dateutil.parser.parse(model_entity[prefix + 'job_end_time']) -
            dateutil.parser.parse(model_entity[prefix + 'job_start_time']))
        model_entity[prefix + 'job_elapsed_seconds'] = elapsed.total_seconds()
    error_message = job.get('errorMessage', '')
    if len(error_message) > 0:
      util.log('%s_error_message is %s' % (prefix, error_message))
    model_entity[prefix + 'error_message'] = (error_message[:200] + '..') if len(error_message) > 200 else error_message


def update_model_entity(team_uuid, model_uuid, train_job, eval_job):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        model_entity = retrieve_model_entity(team_uuid, model_uuid)
        train_job_was_not_already_done = ('train_job_end_time' not in model_entity)
        __update_model_entity(model_entity, train_job, 'train_')
        # If the training job has ended, adjust the team's remaining training time.
        if train_job_was_not_already_done and ('train_job_end_time' in model_entity):
            team_entity = retrieve_team_entity(team_uuid)
            train_job_elapsed_minutes = model_entity['train_job_elapsed_seconds'] / 60
            delta = model_entity['max_running_minutes'] - train_job_elapsed_minutes
            # Don't add the delta if it's negative. The job ran longer than the maximum running
            # time that the user specified.
            if delta > 0:
                team_entity['remaining_training_minutes'] += delta
                transaction.put(team_entity)
        if eval_job is not None:
            __update_model_entity(model_entity, eval_job, 'eval_')
        # Set trained_checkpoint_path.
        model_entity['trained_checkpoint_path'] = blob_storage.get_trained_checkpoint_path(team_uuid, model_uuid)
        model_entity['update_time_utc_ms'] = util.time_now_utc_millis()
        transaction.put(model_entity)
        return model_entity

def retrieve_model_list(team_uuid):
    datastore_client = datastore.Client()
    query = datastore_client.query(kind=DS_KIND_MODEL)
    query.add_filter('team_uuid', '=', team_uuid)
    query.add_filter('delete_in_progress', '=', False)
    query.order = ['creation_time_ms']
    model_entities = list(query.fetch())
    return model_entities

def delete_model(team_uuid, model_uuid):
    datastore_client = datastore.Client()
    with datastore_client.transaction() as transaction:
        query = datastore_client.query(kind=DS_KIND_MODEL)
        query.add_filter('team_uuid', '=', team_uuid)
        query.add_filter('model_uuid', '=', model_uuid)
        model_entities = list(query.fetch(1))
        if len(model_entities) != 0:
            model_entity = model_entities[0]
            model_entity['delete_in_progress'] = True
            transaction.put(model_entity)
            action_parameters = action.create_action_parameters(action.ACTION_NAME_DELETE_MODEL)
            action_parameters['team_uuid'] = team_uuid
            action_parameters['model_uuid'] = model_uuid
            action.trigger_action_via_blob(action_parameters)

def finish_delete_model(action_parameters, time_limit, active_memory_limit):
    team_uuid = action_parameters['team_uuid']
    model_uuid = action_parameters['model_uuid']
    datastore_client = datastore.Client()
    # Delete the blobs.
    blob_storage.delete_model_blobs(team_uuid, model_uuid)
    # Delete the model entity.
    model_entities = __query_model_entity(team_uuid, model_uuid)
    if len(model_entities) != 0:
        model_entity = model_entities[0]
        datastore_client.delete(model_entity.key)
