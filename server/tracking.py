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

# Inspired by
# https://github.com/google/ftc-object-detection/tree/46197ce4ecaee954c2164d257d7dc24e85678285/training/tracking.py

# Python Standard Library
from datetime import datetime, timedelta, timezone
import logging
import os
import time
import traceback
import uuid

# Other Modules
import cv2
import numpy as np

# My Modules
import action
import bbox_writer
import blob_storage
import exceptions
import storage
import util


tracker_fns = {
    'CSRT': cv2.legacy.TrackerCSRT_create,
    'MedianFlow': cv2.legacy.TrackerMedianFlow_create,
    'MIL': cv2.legacy.TrackerMIL_create,
    'MOSSE': cv2.legacy.TrackerMOSSE_create,
    'TLD': cv2.legacy.TrackerTLD_create,
    'KCF': cv2.legacy.TrackerKCF_create,
    'Boosting': cv2.legacy.TrackerBoosting_create,
}

TWO_MINUTES_IN_MS = 2 * 60 * 1000

def prepare_to_start_tracking(team_uuid, video_uuid, tracker_name, scale, init_frame_number, init_bboxes_text):
    tracker_uuid = storage.tracker_starting(team_uuid, video_uuid, tracker_name, scale, init_frame_number, init_bboxes_text)
    action_parameters = action.create_action_parameters(action.ACTION_NAME_TRACKING)
    action_parameters['video_uuid'] = video_uuid
    action_parameters['tracker_uuid'] = tracker_uuid
    action.trigger_action_via_blob(action_parameters)
    return tracker_uuid

def start_tracking(action_parameters):
    video_uuid = action_parameters['video_uuid']
    tracker_uuid = action_parameters['tracker_uuid']

    tracker_entity = storage.retrieve_tracker_entity(video_uuid, tracker_uuid)
    if tracker_entity is None:
        util.log('Unexpected: storage.retrieve_tracker_entity returned None')
        return
    team_uuid = tracker_entity['team_uuid']

    tracker_client_entity = storage.retrieve_tracker_client_entity(video_uuid, tracker_uuid)
    if tracker_client_entity is None:
        util.log('Unexpected: storage.retrieve_tracker_client_entity returned None')
        return
    if (tracker_client_entity['tracking_stop_requested'] or
            datetime.now(timezone.utc) - tracker_client_entity['update_time'] > timedelta(minutes=2)):
        storage.tracker_stopping(team_uuid, video_uuid, tracker_uuid)
        return

    tracker_name = tracker_entity['tracker_name']
    scale = tracker_entity['scale']
    frame_number = tracker_entity['frame_number']

    if tracker_name not in tracker_fns:
        message = 'Error: Tracker named %s not found.' % tracker_name
        logging.critical(message)
        raise exceptions.HttpErrorNotFound(message)
    tracker_fn = tracker_fns[tracker_name]

    # Write the video out to a temporary file.
    video_filename = '/tmp/%s' % str(uuid.uuid4().hex)
    os.makedirs(os.path.dirname(video_filename), exist_ok=True)
    blob_storage.write_video_to_file(tracker_entity['video_blob_name'], video_filename)

    try:
        # Open the video file with cv2.
        vid = cv2.VideoCapture(video_filename)
        if not vid.isOpened():
            message = "Error: Unable to open video for video_uuid=%s." % video_uuid
            logging.critical(message)
            raise exceptions.HttpErrorInternalServerError(message)
        try:
            if frame_number > 0:
                # We are tracking from a frame that is not the beginning of the video. Skip to
                # that frame. Setting the CAP_PROP_POS_FRAMES property is not reliable.
                # Instead, we skip through frames using vid.grab().
                for i in range(frame_number):
                    vid.grab()

            trackers = None

            # Read the frame from the video file.
            success, frame = vid.read()
            if not success:
                # We've reached the end of the video.
                storage.tracker_stopping(team_uuid, video_uuid, tracker_uuid)
                return

            # Wait for the bboxes to be approved/adjusted.
            while tracker_client_entity['frame_number'] != frame_number:
                if __should_stop(team_uuid, video_uuid, tracker_uuid, tracker_client_entity,
                        action_parameters):
                    return
                time.sleep(0.1)
                tracker_client_entity = storage.retrieve_tracker_client_entity(video_uuid, tracker_uuid)
                if tracker_client_entity is None:
                    util.log('Unexpected: storage.retrieve_tracker_client_entity returned None')
                    return

            # Separate bboxes_text into bboxes and classes.
            bboxes, classes = bbox_writer.parse_bboxes_text(tracker_client_entity['bboxes_text'], scale)
            # Create the trackers, one per bbox.
            trackers = __create_trackers(tracker_fn, tracker_name,
                tracker_entity['video_width'], tracker_entity['video_height'], frame, bboxes, classes)

            while True:
                # Read the next frame from the video file.
                frame_number += 1
                success, frame = vid.read()
                if not success:
                    # We've reached the end of the video.
                    storage.tracker_stopping(team_uuid, video_uuid, tracker_uuid)
                    return

                # Get the updated bboxes from the trackers.
                bboxes = []
                for i, tracker in enumerate(trackers):
                    if tracker is not None:
                        success, tuple = tracker.update(frame)
                        if success:
                            bboxes.append(np.array(tuple))
                        else:
                            logging.error('Tracking failure for object %d on frame %d' % (i, frame_number))
                            bboxes.append(None)
                    else:
                        logging.error('Tracking failure for object %d on frame %d' % (i, frame_number))
                        bboxes.append(None)

                # Store the new bboxes.
                tracked_bboxes_text = bbox_writer.format_bboxes_text(bboxes, classes, scale)
                storage.store_tracked_bboxes(video_uuid, tracker_uuid, frame_number, tracked_bboxes_text)

                if __should_stop(team_uuid, video_uuid, tracker_uuid, tracker_client_entity,
                        action_parameters):
                    return

                # Wait for the bboxes to be approved/adjusted.
                tracker_client_entity = storage.retrieve_tracker_client_entity(video_uuid, tracker_uuid)
                if tracker_client_entity is None:
                    util.log('Unexpected: storage.retrieve_tracker_client_entity returned None')
                    return
                while tracker_client_entity['frame_number'] != frame_number:
                    if __should_stop(team_uuid, video_uuid, tracker_uuid, tracker_client_entity,
                            action_parameters):
                        return
                    time.sleep(0.1)
                    tracker_client_entity = storage.retrieve_tracker_client_entity(video_uuid, tracker_uuid)
                    if tracker_client_entity is None:
                        util.log('Unexpected: storage.retrieve_tracker_client_entity returned None')
                        return

                if tracker_client_entity['bboxes_text'] != tracked_bboxes_text:
                    # Separate bboxes_text into bboxes and classes.
                    bboxes, classes = bbox_writer.parse_bboxes_text(tracker_client_entity['bboxes_text'], scale)
                    # Create new trackers, one per bbox.
                    trackers = __create_trackers(tracker_fn, tracker_name,
                        tracker_entity['video_width'], tracker_entity['video_height'], frame, bboxes, classes)

        finally:
            # Release the cv2 video.
            vid.release()
    finally:
        # Delete the temporary file.
        os.remove(video_filename)

def __should_stop(team_uuid, video_uuid, tracker_uuid, tracker_client_entity, action_parameters):
    if (tracker_client_entity['tracking_stop_requested'] or
            datetime.now(timezone.utc) - tracker_client_entity['update_time'] > timedelta(minutes=2)):
        storage.tracker_stopping(team_uuid, video_uuid, tracker_uuid)
        return True
    action.retrigger_if_necessary(action_parameters)
    return False

def __create_trackers(tracker_fn, tracker_name, video_width, video_height, frame, init_bboxes, classes):
    trackers = []
    for i, bbox in enumerate(init_bboxes):
        rect = np.array(bbox, dtype=float).astype(int)
        tracker = tracker_fn()
        try:
            success = tracker.init(frame, tuple(rect))
            if success:
                trackers.append(tracker)
            else:
                trackers.append(None)
                logging.error('Unable to initialize tracker %s for rect %s' % (tracker_name, str(rect)))
                continue
        except:
            trackers.append(None)
            logging.error('Unable to initialize tracker %s for rect %s, traceback: %s' %
                (tracker_name, str(rect), traceback.format_exc().replace('\n', ' ... ')))
            continue
    return trackers
