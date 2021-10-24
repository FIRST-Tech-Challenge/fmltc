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
  this.xButton = document.getElementById('uvfXButton');
  this.closeButton = document.getElementById('uvfCloseButton');
  this.videoFileInput = document.getElementById('uvfVideoFileInput');
  this.descriptionInput = document.getElementById('uvfDescriptionInput');
  this.uploadButton = document.getElementById('uvfUploadButton');
  this.uploadingState = document.getElementById('uvfUploadingState');
  this.uploadingProgressHeader = document.getElementById('uvfUploadingProgressHeader');
  this.uploadingProgress = document.getElementById('uvfUploadingProgress');
  this.uploadingFailedDiv = document.getElementById('uvfUploadingFailedDiv');
  // Bootstrap modal backdrop
  this.backdrop = document.getElementsByClassName('modal-backdrop')[0];

  this.videoFileInput.value = '';
  this.descriptionInput.value = '';

  this.xButton.onclick = this.closeButton.onclick = this.closeButton_onclick.bind(this);
  this.videoFileInput.onchange = this.videoFileInput_onchange.bind(this);
  this.descriptionInput.oninput = this.descriptionInput_oninput.bind(this);
  this.uploadButton.onclick = this.uploadButton_onclick.bind(this);

  this.state = -1;
  this.setState(fmltc.UploadVideoFileDialog.STATE_ZERO);
  this.dialog.style.display = 'block';
};

fmltc.UploadVideoFileDialog.STATE_ZERO = 0;
fmltc.UploadVideoFileDialog.STATE_PREPARING_TO_UPLOAD = 1;
fmltc.UploadVideoFileDialog.STATE_PREPARE_TO_UPLOAD_FAILED = 2;
fmltc.UploadVideoFileDialog.STATE_UPLOADING = 3;
fmltc.UploadVideoFileDialog.STATE_UPLOADING_FAILED = 4;
fmltc.UploadVideoFileDialog.STATE_UPLOADING_FINISHED = 5;
fmltc.UploadVideoFileDialog.STATE_EXTRACTION_STARTING = 6;
fmltc.UploadVideoFileDialog.STATE_UPLOADING_MAY_HAVE_FAILED = 7;

fmltc.UploadVideoFileDialog.prototype.setState = function(state, optMessage) {
  const oldState = this.state;
  this.state = state;

  this.updateUploadButton();

  if (this.state != oldState) {
    switch (this.state) {
      case fmltc.UploadVideoFileDialog.STATE_ZERO:
        // STATE_ZERO is used when the dialog first appears and also if the user chooses a different
        // file or modifies the description after /prepareToUploadVideo has failed.
        this.xButton.disabled = this.closeButton.disabled = false;
        this.videoFileInput.disabled = false;
        this.descriptionInput.disabled = false;
        this.uploadingState.innerHTML = '&nbsp;';
        this.uploadingProgressHeader.style.display = 'none';
        this.uploadingProgress.style.display = 'none';
        this.uploadingFailedDiv.style.display = 'none';
        break;
      case fmltc.UploadVideoFileDialog.STATE_PREPARING_TO_UPLOAD:
        this.xButton.disabled = this.closeButton.disabled = true;
        this.uploadingState.textContent = 'Preparing to upload the video file.';
        this.videoFileInput.disabled = true;
        this.descriptionInput.disabled = true;
        break;
      case fmltc.UploadVideoFileDialog.STATE_PREPARE_TO_UPLOAD_FAILED:
        this.xButton.disabled = this.closeButton.disabled = false;
        this.videoFileInput.disabled = false;
        this.descriptionInput.disabled = false;
        this.uploadingState.textContent = optMessage
            ? optMessage : 'Unable to upload video at this time. Please wait a few minutes and try again.';
        break;
      case fmltc.UploadVideoFileDialog.STATE_UPLOADING:
        this.xButton.disabled = this.closeButton.disabled = true;
        this.uploadingState.textContent = 'Uploading the video file.';
        this.uploadingProgressHeader.style.display = 'block';
        this.uploadingProgress.style.display = 'block';
        break;
      case fmltc.UploadVideoFileDialog.STATE_UPLOADING_FAILED:
        this.xButton.disabled = this.closeButton.disabled = false;
        this.uploadingState.textContent = 'Unable to upload the video file.';
        this.uploadingFailedDiv.style.display = 'block';
        break;
      case fmltc.UploadVideoFileDialog.STATE_UPLOADING_FINISHED:
        this.xButton.disabled = this.closeButton.disabled = true;
        this.uploadingState.textContent = 'Finished uploading the video file. Please wait for frame extraction to begin.';
        break;
      case fmltc.UploadVideoFileDialog.STATE_EXTRACTION_STARTING:
        this.xButton.disabled = this.closeButton.disabled = false;
        this.uploadingState.textContent = 'Starting to extract frames from the video file.';
        break;
      case fmltc.UploadVideoFileDialog.STATE_UPLOADING_MAY_HAVE_FAILED:
        this.xButton.disabled = this.closeButton.disabled = false;
        this.uploadingState.textContent = 'Unable to determine whether the video was uploaded. Please refresh and check the Videos tab.';
        this.uploadingFailedDiv.style.display = 'block';
        break;
    }
  }
};

fmltc.UploadVideoFileDialog.prototype.closeButton_onclick = function() {
  // Clear event handlers.
  this.videoFileInput.onchange = null;
  this.descriptionInput.oninput = null;
  this.xButton.onclick = this.closeButton.onclick = null;
  this.uploadButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
  this.backdrop.style.display = 'none';
};

fmltc.UploadVideoFileDialog.prototype.videoFileInput_onchange = function() {
  this.setState(fmltc.UploadVideoFileDialog.STATE_ZERO);
};

fmltc.UploadVideoFileDialog.prototype.descriptionInput_oninput = function() {
  this.setState(fmltc.UploadVideoFileDialog.STATE_ZERO);
};

fmltc.UploadVideoFileDialog.prototype.updateUploadButton = function() {
  if (this.state == fmltc.UploadVideoFileDialog.STATE_ZERO) {
    this.uploadButton.disabled = (
        this.videoFileInput.files.length == 0 ||
        this.descriptionInput.value.length == 0 ||
        this.descriptionInput.value.length > 30);
  } else {
    this.uploadButton.disabled = true;
  }
};

fmltc.UploadVideoFileDialog.prototype.uploadButton_onclick = function() {
  const description = this.descriptionInput.value;
  const videoFile = this.videoFileInput.files[0];
  const createTimeMs = Date.now();
  this.setState(fmltc.UploadVideoFileDialog.STATE_PREPARING_TO_UPLOAD);

  // Don't allow videos that are larger than 100 MB.
  // The value 100 * 1000 * 1000 should match the value used in app_engine.py.
  if (videoFile.size > 100 * 1000 * 1000) {
    this.setState(fmltc.UploadVideoFileDialog.STATE_PREPARE_TO_UPLOAD_FAILED,
        "The file is larger than 100 MB, which is the maximum size allowed.");
    return;
  }

  const thisUploadVideoFileDialog = this;
  const url = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.onerror = function(event) {
    thisUploadVideoFileDialog.setState(fmltc.UploadVideoFileDialog.STATE_PREPARE_TO_UPLOAD_FAILED,
        "The file is not a valid video file.");
    thisUploadVideoFileDialog.clearVideoElement(video);
  };
  video.onloadedmetadata = function(event) {
    const duration = video.duration;

    // Don't allow videos that are longer than 2 minutes.
    // The value 120 should match the value used in frame_extractor.py.
    if (duration > 120) {
      thisUploadVideoFileDialog.setState(fmltc.UploadVideoFileDialog.STATE_PREPARE_TO_UPLOAD_FAILED,
          "The video is longer than 2 minutes, which is the maximum duration allowed.");
      thisUploadVideoFileDialog.clearVideoElement(video);
      return;
    }

    thisUploadVideoFileDialog.clearVideoElement(video);

    thisUploadVideoFileDialog.uploadingProgress.value = 0;
    thisUploadVideoFileDialog.uploadingProgress.max = videoFile.size;
    thisUploadVideoFileDialog.prepareToUploadVideo(description, videoFile, createTimeMs, 0);
  };
  video.src = url;
};

fmltc.UploadVideoFileDialog.prototype.clearVideoElement = function(video) {
  video.onerror = null;
  video.onloadedmetadata = null;
  video.src = '';
};

fmltc.UploadVideoFileDialog.prototype.prepareToUploadVideo = function(description, videoFile, createTimeMs, failureCount) {
  const xhr = new XMLHttpRequest();
  const params = 'description=' + encodeURIComponent(description) +
      '&video_filename=' + encodeURIComponent(videoFile.name) +
      '&file_size=' + encodeURIComponent(videoFile.size) +
      '&content_type=' + encodeURIComponent(videoFile.type) +
      '&create_time_ms=' + createTimeMs;

  xhr.open('POST', '/prepareToUploadVideo', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToUploadVideo_onreadystatechange.bind(this, xhr, params,
      description, videoFile, createTimeMs, failureCount);
  xhr.send(params);
};

fmltc.UploadVideoFileDialog.prototype.xhr_prepareToUploadVideo_onreadystatechange = function(xhr, params,
    description, videoFile, createTimeMs, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.video_uuid) {
        this.setState(fmltc.UploadVideoFileDialog.STATE_UPLOADING);
        this.uploadVideoFile(response.upload_url, response.video_uuid, description, videoFile, createTimeMs);
      } else {
        this.setState(fmltc.UploadVideoFileDialog.STATE_PREPARE_TO_UPLOAD_FAILED, response.message);
      }

    } else {
      failureCount++;
      if (failureCount < 2 && xhr.status != 400) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /prepareToUploadVideo?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.prepareToUploadVideo.bind(this, description, videoFile, createTimeMs, failureCount), delay * 1000);
      } else {
        this.setState(fmltc.UploadVideoFileDialog.STATE_PREPARE_TO_UPLOAD_FAILED);
      }
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
      setTimeout(this.doesVideoEntityExist.bind(this, videoUuid, 0), 10000);

    } else {
      console.log('Failure! uploading videoFile xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.setState(fmltc.UploadVideoFileDialog.STATE_UPLOADING_FAILED);
    }
  }
};

fmltc.UploadVideoFileDialog.prototype.doesVideoEntityExist = function(videoUuid, failureCount) {
  const xhr = new XMLHttpRequest();
  const params = 'video_uuid=' + encodeURIComponent(videoUuid)
  xhr.open('POST', '/doesVideoEntityExist', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_doesVideoEntityExist_onreadystatechange.bind(this, xhr, params,
      videoUuid, failureCount);
  xhr.send(params);
};

fmltc.UploadVideoFileDialog.prototype.xhr_doesVideoEntityExist_onreadystatechange = function(xhr, params,
    videoUuid, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.video_entity_exists) {
        this.setState(fmltc.UploadVideoFileDialog.STATE_EXTRACTION_STARTING);
        this.onVideoUploaded(videoUuid);
        setTimeout(this.closeButton_onclick.bind(this), 1000);
      } else {
        setTimeout(this.doesVideoEntityExist.bind(this, videoUuid, 0), 5000);
      }

    } else {
      failureCount++;
      if (failureCount < 2) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /doesVideoEntityExist?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.doesVideoEntityExist.bind(this, videoUuid, failureCount), delay * 1000);
      } else {
        this.setState(fmltc.UploadVideoFileDialog.STATE_UPLOADING_MAY_HAVE_FAILED);
      }
    }
  }
};
