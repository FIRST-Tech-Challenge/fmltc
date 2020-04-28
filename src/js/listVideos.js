/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview The class for listing videos.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.ListVideos');

goog.require('fmltc.Util');


/**
 * Class for listing videos.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.ListVideos = function(util, videoEntityArray) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.videoTable = document.getElementById('videoTable');

  this.headerRowCount = this.videoTable.rows.length;

  // Arrays with one element per video. Note that these need to be spliced in deleteButton_onclick.
  this.videoEntityArray = [];
  this.lastTimeVideoEntityChanged = [];
  this.trs = [];
  this.videoFilenameTds = [];
  this.dimensionsSpans = [];
  this.durationSpans = [];
  this.framesPerSecondSpans = [];
  this.frameCountSpans = [];
  this.extractedFrameCountSpans = [];

  const uploadVideoFileButton = document.getElementById('uploadVideoFileButton');
  uploadVideoFileButton.onclick = this.uploadVideoFileButton_onclick.bind(this);

  for (let i = 0; i < videoEntityArray.length; i++) {
    this.onVideoEntityUpdated(videoEntityArray[i]);
  }
};

fmltc.ListVideos.prototype.onVideoEntityUpdated = function(videoEntity) {
  let i = this.indexOfVideo(videoEntity.video_uuid);
  if (i != -1) {
    this.videoEntityArray[i] = videoEntity;
  } else {
    i = this.videoEntityArray.length;
    this.videoEntityArray.push(videoEntity);

    const tr = this.videoTable.insertRow(-1);
    this.trs[i] = tr;

    const deleteTd = tr.insertCell(-1);
    const deleteButton = document.createElement('button');
    deleteButton.textContent = String.fromCodePoint(0x1F5D1); // wastebasket
    deleteButton.onclick = this.deleteButton_onclick.bind(this, videoEntity.video_uuid);
    deleteTd.appendChild(deleteButton);

    const videoFilenameTd = tr.insertCell(-1);
    this.videoFilenameTds[i] = videoFilenameTd
    videoFilenameTd.appendChild(document.createTextNode(videoEntity.video_filename));

    const dateUploadedTd = tr.insertCell(-1);
    const dateUploadedSpan = document.createElement('span');
    dateUploadedSpan.textContent = new Date(videoEntity.upload_time_ms).toLocaleString();
    dateUploadedTd.appendChild(dateUploadedSpan);

    const fileSizeTd = tr.insertCell(-1);
    fileSizeTd.setAttribute('align', 'right');
    fileSizeTd.appendChild(document.createTextNode(new Number(videoEntity.file_size).toLocaleString()));

    const dimensionsTd = tr.insertCell(-1);
    const dimensionsSpan = document.createElement('span');
    this.dimensionsSpans[i] = dimensionsSpan;
    dimensionsTd.appendChild(dimensionsSpan);

    const durationTd = tr.insertCell(-1);
    durationTd.setAttribute('align', 'right');
    const durationSpan = document.createElement('span');
    this.durationSpans[i] = durationSpan;
    durationTd.appendChild(durationSpan);

    const framesPerSecondTd = tr.insertCell(-1);
    framesPerSecondTd.setAttribute('align', 'right');
    const framesPerSecondSpan = document.createElement('span');
    this.framesPerSecondSpans[i] = framesPerSecondSpan;
    framesPerSecondTd.appendChild(framesPerSecondSpan);

    const frameCountTd = tr.insertCell(-1);
    frameCountTd.setAttribute('align', 'right');
    const frameCountSpan = document.createElement('span');
    this.frameCountSpans[i] = frameCountSpan;
    frameCountTd.appendChild(frameCountSpan);

    const extractedFrameCountTd = tr.insertCell(-1);
    extractedFrameCountTd.setAttribute('align', 'right');
    const extractedFrameCountSpan = document.createElement('span');
    this.extractedFrameCountSpans[i] = extractedFrameCountSpan;
    extractedFrameCountTd.appendChild(extractedFrameCountSpan);
  }

  let frameExtractionComplete = true;
  if ('width' in videoEntity && 'height' in videoEntity) {
    this.dimensionsSpans[i].textContent = videoEntity.width + ' x ' + videoEntity.height;
  } else {
    frameExtractionComplete = false;
  }
  if ('frame_count' in videoEntity && 'fps' in videoEntity) {
    const duration = videoEntity.frame_count / videoEntity.fps;
    const durationMinutes = Math.floor(duration / 60);
    const durationSeconds = Math.round(duration - durationMinutes * 60);
    this.durationSpans[i].textContent = durationMinutes + ':' + String(durationSeconds).padStart(2, '0');
  } else {
    frameExtractionComplete = false;
  }
  if ('fps' in videoEntity) {
    this.framesPerSecondSpans[i].textContent = videoEntity.fps.toFixed(0);
  } else {
    frameExtractionComplete = false;
  }
  if ('frame_count' in videoEntity) {
    this.frameCountSpans[i].textContent = videoEntity.frame_count;
    if (videoEntity.extracted_frame_count != videoEntity.frame_count) {
      frameExtractionComplete = false;
    }
  } else {
    frameExtractionComplete = false;
  }
  this.extractedFrameCountSpans[i].textContent = videoEntity.extracted_frame_count;
  if (frameExtractionComplete) {
    this.trs[i].className = 'frameExtractionComplete';
    const videoFilenameElement = this.videoFilenameTds[i].childNodes[0];
    // Make the video filename a link to the labelVideo page, if it isn't already a link
    if (videoFilenameElement.nodeName != 'A') { // A for Anchor
      const videoFilenameA = document.createElement('a'); // a for anchor
      const url = 'labelVideo?video_uuid=' + encodeURIComponent(videoEntity.video_uuid);
      videoFilenameA.setAttribute('href', url);
      videoFilenameA.appendChild(document.createTextNode(videoEntity.video_filename));
      this.videoFilenameTds[i].replaceChild(videoFilenameA, videoFilenameElement);
    }
  } else {
    if (videoEntity.frame_extractor_active_time_utc_ms > 0 &&
        Date.now() - videoEntity.frame_extractor_active_time_utc_ms > 3 * 60000) {
      minutesAgo = (Date.now() - videoEntity.frame_extractor_active_time_utc_ms) / 60000;
      console.log("Frame extraction has stalled. Frame extractor was active " +
          minutesAgo + " minutes ago.");
      this.trs[i].className = 'frameExtractionStalled';
    } else {
      this.trs[i].className = 'frameExtractionIncomplete';
      setTimeout(this.retrieveVideoEntity.bind(this, videoEntity.video_uuid, true), 1000);
    }
  }
};

fmltc.ListVideos.prototype.retrieveVideoEntity = function(videoUuid, checkDeleted) {
  if (checkDeleted && this.indexOfVideo(videoUuid) == -1) {
    // The video was deleted.
    return;
  }

  const xhr = new XMLHttpRequest();
  const params = 'video_uuid=' + encodeURIComponent(videoUuid);
  xhr.open('POST', '/retrieveVideo', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveVideo_onreadystatechange.bind(this, xhr, params, videoUuid, checkDeleted);
  xhr.send(params);
};

fmltc.ListVideos.prototype.xhr_retrieveVideo_onreadystatechange = function(xhr, params, videoUuid, checkDeleted) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (checkDeleted && this.indexOfVideo(videoUuid) == -1) {
      // This video was deleted.
      return;
    }

    if (xhr.status === 200) {
      const videoEntity = JSON.parse(xhr.responseText);
      this.onVideoEntityUpdated(videoEntity);

    } else {
      // TODO(lizlooney): handle error properly. Currently we try again in 3 seconds, but that
      // might not be the best idea.
      console.log('Failure! /retrieveVideo?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Will retry /retrieveVideo?' + params + ' in 3 seconds.');
      setTimeout(this.retrieveVideoEntity.bind(this, videoUuid, checkDeleted), 3000);
    }
  }
};

fmltc.ListVideos.prototype.uploadVideoFileButton_onclick = function() {
  new fmltc.UploadVideoFileDialog(this.util, this.onVideoUploaded.bind(this));
};

fmltc.ListVideos.prototype.onVideoUploaded = function(videoUuid) {
  this.retrieveVideoEntity(videoUuid, false);
};

fmltc.ListVideos.prototype.deleteButton_onclick = function(videoUuid) {
  this.util.setWaitCursor();

  let i = this.indexOfVideo(videoUuid);
  if (i != -1) {
    this.videoTable.deleteRow(i + this.headerRowCount);
    this.videoEntityArray.splice(i, 1);
    this.trs.splice(i, 1);
    this.videoFilenameTds.splice(i, 1);
    this.dimensionsSpans.splice(i, 1);
    this.durationSpans.splice(i, 1);
    this.framesPerSecondSpans.splice(i, 1);
    this.frameCountSpans.splice(i, 1);
    this.extractedFrameCountSpans.splice(i, 1);
  }

  const xhr = new XMLHttpRequest();
  const params = 'video_uuid=' + encodeURIComponent(videoUuid);
  xhr.open('POST', '/deleteVideo', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_deleteVideo_onreadystatechange.bind(this, xhr, params, videoUuid);
  xhr.send(params);
};

fmltc.ListVideos.prototype.xhr_deleteVideo_onreadystatechange = function(xhr, params, videoUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.util.clearWaitCursor();

    if (xhr.status === 200) {

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /deleteVideo?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListVideos.prototype.indexOfVideo = function(videoUuid) {
  for (let i = 0; i < this.videoEntityArray.length; i++) {
    if (this.videoEntityArray[i].video_uuid == videoUuid) {
      return i;
    }
  }
  return -1;
};

