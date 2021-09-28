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
 * @fileoverview The class for a dialog that uploads a video file.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.UploadVideoFileDialog');

goog.require('fmltc.Util');

/**
 * Class for a dialog that uploads a video file.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.UploadVideoFileDialog = function(util, onVideoUploaded) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.onVideoUploaded = onVideoUploaded;
  this.dialog = document.getElementById('uploadVideoFileDialog');
  this.dismissButton = document.getElementById('uvfDismissButton');
  this.videoFileInput = document.getElementById('uvfVideoFileInput');
  this.descriptionInput = document.getElementById('uvfDescriptionInput');
  this.uploadButton = document.getElementById('uvfUploadButton');
  this.uploadingH3 = document.getElementById('uvfUploadingH3');
  this.uploadingState = document.getElementById('uvfUploadingState');
  this.uploadingProgress = document.getElementById('uvfUploadingProgress');
  this.uploadingFailedDiv = document.getElementById('uvfUploadingFailedDiv');
  // Bootstrap modal backdrop
  this.backdrop = document.getElementsByClassName('modal-backdrop')[0];

  this.descriptionInput.value = '';

  this.dismissButton.onclick = this.dismissButton_onclick.bind(this);
  this.videoFileInput.onchange = this.videoFileInput_onchange.bind(this);
  this.descriptionInput.oninput = this.descriptionInput_oninput.bind(this);
  this.uploadButton.onclick = this.uploadButton_onclick.bind(this);

  this.setState(fmltc.UploadVideoFileDialog.STATE_ZERO);
};

fmltc.UploadVideoFileDialog.STATE_ZERO = 0;
fmltc.UploadVideoFileDialog.STATE_FILE_CHOSEN = 1;
fmltc.UploadVideoFileDialog.STATE_PREPARING_TO_UPLOAD = 2;
fmltc.UploadVideoFileDialog.STATE_PREPARING_TO_UPLOAD_FAILED = 3;
fmltc.UploadVideoFileDialog.STATE_UPLOADING = 4;
fmltc.UploadVideoFileDialog.STATE_UPLOADING_FAILED = 5;
fmltc.UploadVideoFileDialog.STATE_UPLOADING_FINISHED = 6;
fmltc.UploadVideoFileDialog.STATE_EXTRACTION_STARTING = 7;

fmltc.UploadVideoFileDialog.prototype.setState = function(state, optMessage) {
  this.state = state;
  switch (this.state) {
    case fmltc.UploadVideoFileDialog.STATE_ZERO:
      this.videoFileInput.value = '';
      this.videoFileInput.disabled = false;
      this.dismissButton.disabled = false;
      this.updateUploadButton();
      this.uploadingH3.style.visibility = 'hidden';
      this.uploadingState.textContent = '';
      this.uploadingProgress.style.visibility = 'hidden';
      this.uploadingFailedDiv.style.display = 'none';
      this.dialog.style.display = 'block';
      break;
    case fmltc.UploadVideoFileDialog.STATE_FILE_CHOSEN:
      this.updateUploadButton();
      break;
    case fmltc.UploadVideoFileDialog.STATE_PREPARING_TO_UPLOAD:
      this.dismissButton.disabled = true;
      this.updateUploadButton();
      this.uploadingState.textContent = 'Preparing to upload the video file.';
      this.uploadingH3.style.visibility = 'visible';
      this.uploadingProgress.style.visibility = 'visible';
      this.videoFileInput.disabled = true;
      break;
    case fmltc.UploadVideoFileDialog.STATE_PREPARING_TO_UPLOAD_FAILED:
      this.uploadingState.textContent = optMessage ? optMessage : 'Unable to upload video at this time. Please wait a few minutes and try again.';
      this.dismissButton.disabled = false;
      break;
    case fmltc.UploadVideoFileDialog.STATE_UPLOADING:
      this.uploadingState.textContent = 'Uploading the video file.';
      break;
    case fmltc.UploadVideoFileDialog.STATE_UPLOADING_FAILED:
      this.uploadingState.textContent = '';
      this.dismissButton.disabled = false;
      this.uploadingFailedDiv.style.display = 'block';
      break;
    case fmltc.UploadVideoFileDialog.STATE_UPLOADING_FINISHED:
      this.uploadingState.textContent = 'Finished uploading the video file. Please wait for frame extraction to begin.';
      break;
    case fmltc.UploadVideoFileDialog.STATE_EXTRACTION_STARTING:
      this.uploadingState.textContent = 'Starting to extract frames from the video file.';
      this.dismissButton.disabled = false;
      break;
  }
};

fmltc.UploadVideoFileDialog.prototype.dismissButton_onclick = function() {
  // Clear event handlers.
  this.videoFileInput.onchange = null;
  this.descriptionInput.oninput = null;
  this.dismissButton.onclick = null;
  this.uploadButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
  this.backdrop.style.display = 'none';
};

fmltc.UploadVideoFileDialog.prototype.videoFileInput_onchange = function() {
  if (this.videoFileInput.files.length == 0) {
    this.setState(fmltc.UploadVideoFileDialog.ZERO);
  } else {
    this.setState(fmltc.UploadVideoFileDialog.STATE_FILE_CHOSEN);
  }
};

fmltc.UploadVideoFileDialog.prototype.descriptionInput_oninput = function() {
  this.updateUploadButton();
};

fmltc.UploadVideoFileDialog.prototype.updateUploadButton = function() {
  this.uploadButton.disabled = (
      this.videoFileInput.files.length == 0 ||
      this.videoFileInput.files[0].size == 0 ||
      this.descriptionInput.value.length == 0 ||
      this.descriptionInput.value.length > 30);
};

fmltc.UploadVideoFileDialog.prototype.uploadButton_onclick = function() {
  let description = this.descriptionInput.value;
  let videoFile = this.videoFileInput.files[0];
  let createTimeMs = Date.now();

  this.uploadingProgress.value = 0;
  this.uploadingProgress.max = videoFile.size;
  this.setState(fmltc.UploadVideoFileDialog.STATE_PREPARING_TO_UPLOAD);

  this.prepareToUploadVideo(description, videoFile, createTimeMs);
}

fmltc.UploadVideoFileDialog.prototype.prepareToUploadVideo = function(description, videoFile, createTimeMs) {
  const xhr = new XMLHttpRequest();
  const params = 'description=' + encodeURIComponent(description) +
      '&video_filename=' + encodeURIComponent(videoFile.name) +
      '&file_size=' + encodeURIComponent(videoFile.size) +
      '&content_type=' + encodeURIComponent(videoFile.type) +
      '&create_time_ms=' + createTimeMs;

  xhr.open('POST', '/prepareToUploadVideo', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToUploadVideo_onreadystatechange.bind(this, xhr, params,
      description, videoFile, createTimeMs);
  xhr.send(params);
};

fmltc.UploadVideoFileDialog.prototype.xhr_prepareToUploadVideo_onreadystatechange = function(xhr, params,
    description, videoFile, createTimeMs) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.video_uuid) {
        this.setState(fmltc.UploadVideoFileDialog.STATE_UPLOADING);
        this.uploadVideoFile(response.upload_url, response.video_uuid, description, videoFile, createTimeMs);
      } else {
        this.setState(fmltc.UploadVideoFileDialog.STATE_PREPARING_TO_UPLOAD_FAILED, response.message);
      }

    } else {
      console.log('Failure! /prepareToUploadVideo?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Will retry /prepareToUploadVideo?' + params + ' in 1 seconds.');
      setTimeout(this.prepareToUploadVideo.bind(this, description, videoFile, createTimeMs), 1000);
    }
  }
};

fmltc.UploadVideoFileDialog.prototype.uploadVideoFile = function(signedUrl, videoUuid, description, videoFile, createTimeMs) {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', signedUrl, true);
  xhr.setRequestHeader('Content-Type', videoFile.type);
  xhr.upload.onprogress = this.xhr_uploadVideoFile_onprogress.bind(this);
  xhr.onreadystatechange = this.xhr_uploadVideoFile_onreadystatechange.bind(this, xhr,
      videoUuid, description, videoFile, createTimeMs);
  xhr.send(videoFile);
};

fmltc.UploadVideoFileDialog.prototype.xhr_uploadVideoFile_onprogress = function(event) {
  this.uploadingProgress.value = event.loaded;
};

fmltc.UploadVideoFileDialog.prototype.xhr_uploadVideoFile_onreadystatechange = function(xhr,
    videoUuid, description, videoFile, createTimeMs) {
  if (xhr.readyState === 4) {
    xhr.upload.onprogress = null;
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      this.uploadingProgress.value = this.uploadingProgress.max;
      this.setState(fmltc.UploadVideoFileDialog.STATE_UPLOADING_FINISHED);
      setTimeout(this.doesVideoEntityExist.bind(this, videoUuid), 10000);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! uploading videoFile xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.setState(fmltc.UploadVideoFileDialog.STATE_UPLOADING_FAILED);
    }
  }
};

fmltc.UploadVideoFileDialog.prototype.doesVideoEntityExist = function(videoUuid) {
  const xhr = new XMLHttpRequest();
  const params = 'video_uuid=' + encodeURIComponent(videoUuid)
  xhr.open('POST', '/doesVideoEntityExist', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_doesVideoEntityExist_onreadystatechange.bind(this, xhr, params,
      videoUuid);
  xhr.send(params);
};

fmltc.UploadVideoFileDialog.prototype.xhr_doesVideoEntityExist_onreadystatechange = function(xhr, params,
    videoUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.video_entity_exists) {
        this.setState(fmltc.UploadVideoFileDialog.STATE_EXTRACTION_STARTING);
        this.onVideoUploaded(videoUuid);
        setTimeout(this.dismissButton_onclick.bind(this), 1000);
      } else {
        setTimeout(this.doesVideoEntityExist.bind(this, videoUuid), 5000);
      }

    } else {
      console.log('Failure! /doesVideoEntityExist?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Will retry /doesVideoEntityExist?' + params + ' in 5 seconds.');
      setTimeout(this.doesVideoEntityExist.bind(this, videoUuid), 5000);
    }
  }
};
