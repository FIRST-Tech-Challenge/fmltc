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
  this.uploadButton = document.getElementById('uvfUploadButton');
  this.uploadingH3 = document.getElementById('uvfUploadingH3');
  this.uploadingProgress = document.getElementById('uvfUploadingProgress');
  this.uploadingFinishedDiv = document.getElementById('uvfUploadingFinishedDiv');
  this.uploadingFailedDiv = document.getElementById('uvfUploadingFailedDiv');

  this.videoFile = null;
  this.videoUuid = '';
  this.uploadStartTime = 0;
  this.uploadFinished = false;
  this.uploadFailed = false;

  this.videoFileInput.onchange = this.videoFileInput_onchange.bind(this);
  this.dismissButton.onclick = this.dismissButton_onclick.bind(this);
  this.uploadButton.onclick = this.uploadButton_onclick.bind(this);

  this.setState(fmltc.UploadVideoFileDialog.STATE_ZERO);
};

fmltc.UploadVideoFileDialog.STATE_ZERO = 0;
fmltc.UploadVideoFileDialog.STATE_FILE_CHOSEN = 1;
fmltc.UploadVideoFileDialog.STATE_UPLOADING = 2;
fmltc.UploadVideoFileDialog.STATE_UPLOADING_FAILED = 3;
fmltc.UploadVideoFileDialog.STATE_UPLOADING_FINISHED = 4;

fmltc.UploadVideoFileDialog.prototype.setState = function(state) {
  this.state = state;
  switch (this.state) {
    case fmltc.UploadVideoFileDialog.STATE_ZERO:
      this.videoFileInput.value = '';
      this.videoFileInput.disabled = false;
      this.dismissButton.disabled = false;
      this.uploadButton.disabled = true;
      this.uploadingH3.style.visibility = 'hidden';
      this.uploadingProgress.style.visibility = 'hidden';
      this.uploadingFinishedDiv.style.display = 'none';
      this.uploadingFailedDiv.style.display = 'none';
      this.dialog.style.display = 'block';
      break;
    case fmltc.UploadVideoFileDialog.STATE_FILE_CHOSEN:
      this.uploadButton.disabled = false;
      break;
    case fmltc.UploadVideoFileDialog.STATE_UPLOADING:
      this.dismissButton.disabled = true;
      this.uploadButton.disabled = true;
      this.uploadingH3.style.visibility = 'visible';
      this.uploadingProgress.style.visibility = 'visible';
      this.videoFileInput.disabled = true;
      break;
    case fmltc.UploadVideoFileDialog.STATE_UPLOADING_FAILED:
      this.dismissButton.disabled = false;
      this.uploadingFailedDiv.style.display = 'block';
      break;
    case fmltc.UploadVideoFileDialog.STATE_UPLOADING_FINISHED:
      this.dismissButton.disabled = false;
      this.uploadingFinishedDiv.style.display = 'block';
      break;
  }
};

fmltc.UploadVideoFileDialog.prototype.dismissButton_onclick = function() {
  // Clear fields.
  this.videoFile = null;
  this.videoUuid = '';

  // Clear event handlers.
  this.videoFileInput.onchange = null;
  this.dismissButton.onclick = null;
  this.uploadButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
};

fmltc.UploadVideoFileDialog.prototype.videoFileInput_onchange = function() {
  if (this.videoFileInput.files.length == 0) {
    this.setState(fmltc.UploadVideoFileDialog.ZERO);
  } else {
    this.videoFile = this.videoFileInput.files[0];
    this.setState(fmltc.UploadVideoFileDialog.STATE_FILE_CHOSEN);
  }
};

fmltc.UploadVideoFileDialog.prototype.uploadButton_onclick = function() {
  this.uploadStartTime = Date.now();

  // The progress bar is set based on the size of the file, but is updated based on elapsed time.
  this.uploadingProgress.value = 0;
  this.uploadingProgress.max = Math.max(5, this.videoFile.size / 650000);
  this.setState(fmltc.UploadVideoFileDialog.STATE_UPLOADING);
  this.updateUploadingProgress();

  this.prepareToUploadVideo();
}

fmltc.UploadVideoFileDialog.prototype.updateUploadingProgress = function() {
  if (!this.uploadFinished && !this.uploadFailed) {
    const elapsedSeconds = (Date.now() - this.uploadStartTime) / 1000;
    this.uploadingProgress.value = Math.min(elapsedSeconds, this.uploadingProgress.max * 0.99);
    if (this.uploadingProgress.value < this.uploadingProgress.max * 0.99) {
      setTimeout(this.updateUploadingProgress.bind(this), 200);
    }
  }
};

fmltc.UploadVideoFileDialog.prototype.prepareToUploadVideo = function() {
  const xhr = new XMLHttpRequest();
  const params =
      'video_filename=' + encodeURIComponent(this.videoFile.name) +
      '&file_size=' + encodeURIComponent(this.videoFile.size) +
      '&content_type=' + encodeURIComponent(this.videoFile.type) +
      '&upload_time_ms=' + this.uploadStartTime;
  xhr.open('POST', '/prepareToUploadVideo', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToUploadVideo_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.UploadVideoFileDialog.prototype.xhr_prepareToUploadVideo_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.uploadVideoFile(response.upload_url, response.video_uuid);
      this.util.callHttpPerformAction(response.action_parameters, 0);

    } else {
      // TODO(lizlooney): handle error properly. We should retry
      console.log('Failure! /prepareToUploadVideo?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Will retry /prepareToUploadVideo?' + params + ' in 1 seconds.');
      setTimeout(this.prepareToUploadVideo.bind(this), 1000);
    }
  }
};

fmltc.UploadVideoFileDialog.prototype.uploadVideoFile = function(signedUrl, videoUuid) {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', signedUrl, true);
  xhr.setRequestHeader('Content-Type', this.videoFile.type);
  xhr.onreadystatechange = this.xhr_uploadVideoFile_onreadystatechange.bind(this, xhr,
      videoUuid);
  xhr.send(this.videoFile);
};

fmltc.UploadVideoFileDialog.prototype.xhr_uploadVideoFile_onreadystatechange = function(xhr,
    videoUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      this.uploadingProgress.value = this.uploadingProgress.max;
      this.uploadFinished = true;
      this.setState(fmltc.UploadVideoFileDialog.STATE_UPLOADING_FINISHED);
      this.onVideoUploaded(videoUuid);
      setTimeout(this.dismissButton_onclick.bind(this), 1000);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! uploading videoFile xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.uploadFailed = true;
      this.setState(fmltc.UploadVideoFileDialog.STATE_UPLOADING_FAILED);
    }
  }
};
