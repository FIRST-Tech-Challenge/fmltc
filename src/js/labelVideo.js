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
 * @fileoverview The class for labeling a video.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.LabelVideo');

goog.require('fmltc.Box');
goog.require('fmltc.Point');
goog.require('fmltc.Util');


/**
 * Class for labeling a video.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.LabelVideo = function(util, videoEntity) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.videoUuid = videoEntity.video_uuid;

  // Retrieve the first frame.
  this.retrieveVideoFramesWithImageUrls(0, 0, 0);

  this.dismissButton = document.getElementById('dismissButton');
  this.smallerImageButton = document.getElementById('smallerImageButton');
  this.largerImageButton = document.getElementById('largerImageButton');
  this.loadingProgress = document.getElementById('loadingProgress');
  this.bboxCanvas = document.getElementById('bboxCanvas');
  this.videoFrameImg = document.getElementById('videoFrameImg');
  this.includedFrameCountDiv = document.getElementById('includedFrameCountDiv');
  this.includedFrameCountSpan = document.getElementById('includedFrameCountSpan');
  this.negativeFrameCountDiv = document.getElementById('negativeFrameCountDiv');
  this.negativeFrameCountSpan = document.getElementById('negativeFrameCountSpan');
  this.currentFrameSpan = document.getElementById('currentFrameSpan');
  this.includeFrameInDatasetCheckbox = document.getElementById('includeFrameInDatasetCheckbox');
  this.labelingAreaTable = document.getElementById('labelingAreaTable');
  this.drawHintDiv = document.getElementById('drawHintDiv');
  this.labelHintDiv = document.getElementById('labelHintDiv');
  this.firstFrameButton = document.getElementById('firstFrameButton');
  this.previousTenFrameButton = document.getElementById('previousTenFrameButton');
  this.previousFrameButton = document.getElementById('previousFrameButton');
  this.nextFrameButton = document.getElementById('nextFrameButton');
  this.nextTenFrameButton = document.getElementById('nextTenFrameButton');
  this.lastFrameButton = document.getElementById('lastFrameButton');
  this.previousNegativeFrameButton = document.getElementById('previousNegativeFrameButton');
  this.nextNegativeFrameButton = document.getElementById('nextNegativeFrameButton');
  this.playbackSpeedInput = document.getElementById('playbackSpeedInput');
  this.reversePlayPauseButton = document.getElementById('reversePlayPauseButton');
  this.forwardPlayPauseButton = document.getElementById('forwardPlayPauseButton');
  this.trackerSelect = document.getElementById('trackerSelect');
  this.trackingScaleInput = document.getElementById('trackingScaleInput');
  this.trackingStartButton = document.getElementById('trackingStartButton');
  this.trackingPauseButton = document.getElementById('trackingPauseButton');
  this.trackingContinueButton = document.getElementById('trackingContinueButton');
  this.trackingStopButton = document.getElementById('trackingStopButton');
  this.trackingStoppedDiv = document.getElementById('trackingStoppedDiv');
  this.trackingFinishedDiv = document.getElementById('trackingFinishedDiv');
  this.trackingFailedDiv = document.getElementById('trackingFailedDiv');

  this.button1 = document.getElementById('button1');
  this.button2 = document.getElementById('button2');
  this.button3 = document.getElementById('button3');
  this.button4 = document.getElementById('button4');
  this.button5 = document.getElementById('button5');
  this.button6 = document.getElementById('button6');

  this.loadingProgress.value = 0;

  this.bboxCanvasCtx = this.bboxCanvas.getContext('2d');
  this.canvasScale = 1;

  this.videoEntity = null;

  this.canvasWidth = Number(this.util.getPreference('canvasWidth', 800));
  this.smallerImageButton.disabled = (this.canvasWidth <= fmltc.LabelVideo.MIN_CANVAS_WIDTH);
  this.largerImageButton.disabled = (this.canvasWidth >= fmltc.LabelVideo.MAX_CANVAS_WIDTH);

  this.videoFrameImage = [];
  this.videoFrameEntity = [];
  this.bboxes = [];
  this.loadedFrameEntityCount = 0;
  this.loadFailed = false;
  this.currentFrameNumber = 0;
  this.currentFrameSpan.textContent = String(this.currentFrameNumber + 1);

  this.includedFrameCount = 0;
  this.negativeFrameCount = 0;
  this.includedFrameCountSpan.textContent = String(this.includedFrameCount);
  this.negativeFrameCountSpan.textContent = String(this.negativeFrameCount);

  this.retryingGoToFrame = false;

  this.playing = false;
  this.playingDirection = 1;
  this.playingIntervalMs = 0;

  this.definingBbox = null;
  this.resizingBbox = null;
  this.resizingBboxIndex = 0;
  this.resizingBboxHotspot = 0;
  this.point1 = new fmltc.Point();
  this.point2 = new fmltc.Point();

  this.trackingAlreadyInProgress = false;
  this.trackingInProgress = false;
  this.trackingPaused = false;
  this.trackingWaitingForBboxes = false;
  this.trackingInitFrameNumber = 0;
  this.trackingFinalFrameNumber = 0;
  this.trackerUuid = '';
  this.trackingRequestSentTime = 0;

  this.updateUI();
  this.setVideoEntity(videoEntity);
};

fmltc.LabelVideo.MIN_CANVAS_WIDTH = 500;
fmltc.LabelVideo.MAX_CANVAS_WIDTH = 2000;

fmltc.LabelVideo.prototype.setVideoEntity = function(videoEntity) {
  if ('frame_count' in videoEntity &&
      'extracted_frame_count' in videoEntity &&
      videoEntity.extracted_frame_count == videoEntity.frame_count) {
    this.videoEntity = videoEntity;

    this.minNegativeFrameNumber = videoEntity.frame_count;
    this.maxNegativeFrameNumber = -1;

    this.trackingAlreadyInProgress = this.videoEntity.tracking_in_progress;

    this.loadingProgress.value++;
    this.loadingProgress.max = 1 + 2 * this.videoEntity.frame_count;

    document.getElementById('videoFilenameSpan').textContent = this.videoEntity.video_filename;
    document.getElementById('videoFrameCountSpan').textContent = String(this.videoEntity.frame_count);

    this.rescaleCanvas();
    window.addEventListener('resize', this.repositionCanvas.bind(this));

    this.dismissButton.onclick = this.dismissButton_onclick.bind(this);
    this.smallerImageButton.onclick = this.smallerImageButton_onclick.bind(this);
    this.largerImageButton.onclick = this.largerImageButton_onclick.bind(this);
    this.bboxCanvas.onmousedown = this.bboxCanvas_onmousedown.bind(this);
    this.bboxCanvas.onmousemove = this.bboxCanvas_onmousemove.bind(this);
    this.bboxCanvas.onmouseleave = this.bboxCanvas_onmouseleave.bind(this);
    this.bboxCanvas.onmouseup = this.bboxCanvas_onmouseup.bind(this);
    this.includeFrameInDatasetCheckbox.onclick = this.includeFrameInDatasetCheckbox_onclick.bind(this);
    this.firstFrameButton.onclick = this.firstFrameButton_onclick.bind(this);
    this.previousTenFrameButton.onclick = this.previousTenFrameButton_onclick.bind(this);
    this.previousFrameButton.onclick = this.previousFrameButton_onclick.bind(this);
    this.nextFrameButton.onclick = this.nextFrameButton_onclick.bind(this);
    this.nextTenFrameButton.onclick = this.nextTenFrameButton_onclick.bind(this);
    this.lastFrameButton.onclick = this.lastFrameButton_onclick.bind(this);
    this.previousNegativeFrameButton.onclick = this.previousNegativeFrameButton_onclick.bind(this);
    this.nextNegativeFrameButton.onclick = this.nextNegativeFrameButton_onclick.bind(this);
    this.reversePlayPauseButton.onclick = this.reversePlayPauseButton_onclick.bind(this);
    this.forwardPlayPauseButton.onclick = this.forwardPlayPauseButton_onclick.bind(this);
    this.trackingStartButton.onclick = this.trackingStartButton_onclick.bind(this);
    this.trackingPauseButton.onclick = this.trackingPauseButton_onclick.bind(this);
    this.trackingContinueButton.onclick = this.trackingContinueButton_onclick.bind(this);
    this.trackingStopButton.onclick = this.trackingStopButton_onclick.bind(this);

    this.updateUI();

  } else {
    setTimeout(this.retrieveVideoEntity.bind(this, 0), 1000);
  }
};

fmltc.LabelVideo.prototype.dismissButton_onclick = function() {
  window.history.back();
};

fmltc.LabelVideo.prototype.smallerImageButton_onclick = function() {
  if (this.canvasWidth > fmltc.LabelVideo.MIN_CANVAS_WIDTH) {
    this.canvasWidth = Math.max(fmltc.LabelVideo.MIN_CANVAS_WIDTH, this.canvasWidth - 100);
    this.smallerImageButton.disabled = (this.canvasWidth <= fmltc.LabelVideo.MIN_CANVAS_WIDTH);
    this.largerImageButton.disabled = (this.canvasWidth >= fmltc.LabelVideo.MAX_CANVAS_WIDTH);
    this.rescaleCanvas();
    this.util.setPreference('canvasWidth', this.canvasWidth);
  }
};

fmltc.LabelVideo.prototype.largerImageButton_onclick = function() {
  if (this.canvasWidth < fmltc.LabelVideo.MAX_CANVAS_WIDTH) {
    this.canvasWidth = Math.min(fmltc.LabelVideo.MAX_CANVAS_WIDTH, this.canvasWidth + 100);
    this.smallerImageButton.disabled = (this.canvasWidth <= fmltc.LabelVideo.MIN_CANVAS_WIDTH);
    this.largerImageButton.disabled = (this.canvasWidth >= fmltc.LabelVideo.MAX_CANVAS_WIDTH);
    this.rescaleCanvas();
    this.util.setPreference('canvasWidth', this.canvasWidth);
  }
};

fmltc.LabelVideo.prototype.rescaleCanvas = function() {
  this.canvasScale = this.canvasWidth / this.videoEntity.width;
  this.videoFrameImg.style.width = (this.videoEntity.width * this.canvasScale) + 'px';
  this.videoFrameImg.style.height = (this.videoEntity.height * this.canvasScale) + 'px';
  this.repositionCanvas();
};

fmltc.LabelVideo.prototype.repositionCanvas = function() {
  // Position bboxCanvas over videoFrameImg.
  let x = 0;
  let y = 0;
  let element = this.videoFrameImg;
  do {
    x += element.offsetLeft;
    y += element.offsetTop;
    element = element.offsetParent;
  } while (element);
  this.videoFrameImg.style.zIndex = '1';
  this.bboxCanvas.style.left = x + 'px';
  this.bboxCanvas.style.top = y + 'px';
  this.bboxCanvas.width = this.videoEntity.width;
  this.bboxCanvas.height = this.videoEntity.height;
  this.bboxCanvas.style.width = this.videoFrameImg.offsetWidth + 'px';
  this.bboxCanvas.style.height = this.videoFrameImg.offsetHeight + 'px';
  this.bboxCanvas.style.zIndex = '2';

  this.redrawBboxes();
};

fmltc.LabelVideo.prototype.redrawBboxes = function() {
  this.bboxCanvasCtx.clearRect(0, 0, this.videoEntity.width, this.videoEntity.height);

  if (this.bboxes[this.currentFrameNumber] && this.videoFrameImage[this.currentFrameNumber]) {
    for (let i = 0; i < this.bboxes[this.currentFrameNumber].length; i++) {
      this.bboxes[this.currentFrameNumber][i].draw(this.bboxCanvasCtx, this.canvasScale, true);
    }
  }
};

fmltc.LabelVideo.prototype.updateUI = function() {
  if (!this.videoEntity ||
      this.bboxes[this.currentFrameNumber] == undefined) {
    this.firstFrameButton.disabled = true;
    this.previousTenFrameButton.disabled = true;
    this.previousFrameButton.disabled = true;
    this.nextFrameButton.disabled = true;
    this.nextTenFrameButton.disabled = true;
    this.lastFrameButton.disabled = true;
    this.previousNegativeFrameButton.disabled = true;
    this.nextNegativeFrameButton.disabled = true;
    this.playbackSpeedInput.disabled = true;
    this.reversePlayPauseButton.disabled = true;
    this.forwardPlayPauseButton.disabled = true;
    this.includeFrameInDatasetCheckbox.disabled = true;
    // TODO(lizlooney): Disable the bbox/label input boxes.
    this.trackingScaleInput.disabled = true;
    this.trackerSelect.disabled = true;
    this.trackingStartButton.disabled = true;
    this.trackingPauseButton.disabled = true;
    this.trackingContinueButton.disabled = true;
    this.trackingStopButton.disabled = true;
    return;
  }

  if (this.bboxes[this.currentFrameNumber].length == 0) {
    this.util.showElement(this.drawHintDiv);
  } else {
    this.util.hideElement(this.drawHintDiv);
  }

  if (this.missingLabelNames(this.bboxes[this.currentFrameNumber])) {
    this.util.showElement(this.labelHintDiv);
    this.firstFrameButton.disabled = true;
    this.previousTenFrameButton.disabled = true;
    this.previousFrameButton.disabled = true;
    this.nextFrameButton.disabled = true;
    this.nextTenFrameButton.disabled = true;
    this.lastFrameButton.disabled = true;
    this.previousNegativeFrameButton.disabled = true;
    this.nextNegativeFrameButton.disabled = true;
    this.playbackSpeedInput.disabled = true;
    this.reversePlayPauseButton.disabled = true;
    this.forwardPlayPauseButton.disabled = true;
    this.includeFrameInDatasetCheckbox.disabled = true;
    // TODO(lizlooney): Disable the bbox/label input boxes.
    this.trackingScaleInput.disabled = true;
    this.trackerSelect.disabled = true;
    this.trackingStartButton.disabled = true;
    this.trackingPauseButton.disabled = true;
    this.trackingContinueButton.disabled = true;
    this.trackingStopButton.disabled = true;
    return;
  }
  this.util.hideElement(this.labelHintDiv);

  if (this.playing) {
    this.firstFrameButton.disabled = true;
    this.previousTenFrameButton.disabled = true;
    this.previousFrameButton.disabled = true;
    this.nextFrameButton.disabled = true;
    this.nextTenFrameButton.disabled = true;
    this.lastFrameButton.disabled = true;
    this.previousNegativeFrameButton.disabled = true;
    this.nextNegativeFrameButton.disabled = true;
    this.playbackSpeedInput.disabled = true;
    this.reversePlayPauseButton.disabled = (this.playingDirection == 1);
    this.forwardPlayPauseButton.disabled = (this.playingDirection == -1);
    this.includeFrameInDatasetCheckbox.disabled = true;
    // TODO(lizlooney): Disable the bbox/label input boxes.
    this.trackingScaleInput.disabled = true;
    this.trackerSelect.disabled = true;
    this.trackingStartButton.disabled = true;
    this.trackingPauseButton.disabled = true;
    this.trackingContinueButton.disabled = true;
    this.trackingStopButton.disabled = true;

  } else if (this.trackingInProgress) {
    this.firstFrameButton.disabled = true;
    this.previousTenFrameButton.disabled = true;
    this.previousFrameButton.disabled = true;
    this.nextFrameButton.disabled = true;
    this.nextTenFrameButton.disabled = true;
    this.lastFrameButton.disabled = true;
    this.previousNegativeFrameButton.disabled = true;
    this.nextNegativeFrameButton.disabled = true;
    this.playbackSpeedInput.disabled = true;
    this.reversePlayPauseButton.disabled = true;
    this.forwardPlayPauseButton.disabled = true;
    this.includeFrameInDatasetCheckbox.disabled = true;
    this.trackingScaleInput.disabled = true;
    this.trackerSelect.disabled = true;
    this.trackingStartButton.disabled = true;
    // TODO(lizlooney): Disable the bbox/label input boxes based on (!this.trackingPaused || this.trackingWaitingForBboxes)
    this.trackingPauseButton.disabled = this.trackingPaused; // (this.trackingPaused || this.trackingWaitingForBboxes);
    this.trackingContinueButton.disabled = (!this.trackingPaused || this.trackingWaitingForBboxes);
    this.trackingStopButton.disabled = (!this.trackingPaused || this.trackingWaitingForBboxes);

  } else {
    this.firstFrameButton.disabled = (this.currentFrameNumber == 0);
    this.previousTenFrameButton.disabled = (this.currentFrameNumber == 0);
    this.previousFrameButton.disabled = (this.currentFrameNumber == 0);
    this.nextFrameButton.disabled = (this.currentFrameNumber == this.videoEntity.frame_count - 1);
    this.nextTenFrameButton.disabled = (this.currentFrameNumber == this.videoEntity.frame_count - 1);
    this.lastFrameButton.disabled = (this.currentFrameNumber == this.videoEntity.frame_count - 1);
    this.previousNegativeFrameButton.disabled = (
        this.loadedFrameEntityCount < this.videoEntity.frame_count ||
        this.currentFrameNumber <= this.minNegativeFrameNumber);
    this.nextNegativeFrameButton.disabled = (
        this.loadedFrameEntityCount < this.videoEntity.frame_count ||
        this.currentFrameNumber >= this.maxNegativeFrameNumber);
    this.playbackSpeedInput.disabled = false;
    this.reversePlayPauseButton.disabled = (this.currentFrameNumber == 0);
    this.forwardPlayPauseButton.disabled = (this.currentFrameNumber == this.videoEntity.frame_count - 1);
    this.includeFrameInDatasetCheckbox.disabled = false;
    // TODO(lizlooney): Disable the bbox/label input boxes.
    this.trackingScaleInput.disabled = false;
    this.trackerSelect.disabled = false;
    this.trackingStartButton.disabled = (
        this.trackingAlreadyInProgress ||
        this.loadedFrameEntityCount < this.videoEntity.frame_count ||
        this.bboxes[this.currentFrameNumber].length == 0 ||             // no bounding boxes on current frame
        this.currentFrameNumber == this.videoEntity.frame_count - 1);   // already on last frame
    this.trackingPauseButton.disabled = true;
    this.trackingContinueButton.disabled = true;
    this.trackingStopButton.disabled = true;
  }
};

fmltc.LabelVideo.prototype.retrieveVideoEntity = function(failureCount) {
  const xhr = new XMLHttpRequest();
  const params = 'video_uuid=' + encodeURIComponent(this.videoUuid);
  xhr.open('POST', '/retrieveVideo', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveVideo_onreadystatechange.bind(this, xhr, params,
      failureCount);
  xhr.send(params);
};

fmltc.LabelVideo.prototype.xhr_retrieveVideo_onreadystatechange = function(xhr, params,
    failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const videoEntity = response.video_entity;
      this.setVideoEntity(videoEntity);

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveVideo?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveVideoEntity.bind(this, failureCount), delay * 1000);
      } else {
        this.loadFailure();
      }
    }
  }
};

fmltc.LabelVideo.prototype.loadFailure = function() {
  this.loadFailed = true;
  document.getElementById('loadingFailedSpan').style.display = 'inline';
};

fmltc.LabelVideo.prototype.retrieveVideoFrameImage = function(frameNumber, imageUrl, failureCount) {
  const xhr = new XMLHttpRequest();
  if (!imageUrl) {
    imageUrl = '/retrieveVideoFrameImage?video_uuid=' + encodeURIComponent(this.videoUuid) +
        '&frame_number=' + encodeURIComponent(frameNumber);
  }
  xhr.open('GET', imageUrl, true);
  xhr.responseType = 'blob';
  xhr.onreadystatechange = this.xhr_retrieveVideoFrameImage_onreadystatechange.bind(this, xhr,
      frameNumber, imageUrl, failureCount);
  xhr.send(null);
};

fmltc.LabelVideo.prototype.xhr_retrieveVideoFrameImage_onreadystatechange = function(xhr,
    frameNumber, imageUrl, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      this.videoFrameImage[frameNumber] = window.URL.createObjectURL(xhr.response);
      this.loadingProgress.value++;

      if (frameNumber == this.currentFrameNumber) {
        this.updateVideoFrameImg();
        this.redrawBboxes();
      }

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry ' + imageUrl + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveVideoFrameImage.bind(this, frameNumber, imageUrl, failureCount), delay * 1000);
      } else {
        this.loadFailure();
      }
    }

    this.updateUI();
  }
};

fmltc.LabelVideo.prototype.retrieveVideoFramesWithImageUrls = function(minFrameNumber, maxFrameNumber, failureCount) {
  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&min_frame_number=' + encodeURIComponent(minFrameNumber) +
      '&max_frame_number=' + encodeURIComponent(maxFrameNumber);
  xhr.open('POST', '/retrieveVideoFramesWithImageUrls', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveVideoFramesWithImageUrls_onreadystatechange.bind(this, xhr, params,
      minFrameNumber, maxFrameNumber, failureCount);
  xhr.send(params);
};

fmltc.LabelVideo.prototype.xhr_retrieveVideoFramesWithImageUrls_onreadystatechange = function(xhr, params,
    minFrameNumber, maxFrameNumber, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const videoFrameEntityArray = response.video_frame_entities;

      for (let i = 0; i < videoFrameEntityArray.length; i++) {
        const videoFrameEntity = videoFrameEntityArray[i];
        const frameNumber = videoFrameEntity.frame_number;

        if (frameNumber == 0) {
          // Retrieve the rest of the frames 100 at a time.
          let nextMinFrameNumber = 1;
          let delayForEntities = 10;
          while (nextMinFrameNumber < this.videoEntity.frame_count) {
            const nextMaxFrameNumber = Math.min(nextMinFrameNumber + 99, this.videoEntity.frame_count - 1);
            setTimeout(this.retrieveVideoFramesWithImageUrls.bind(this, nextMinFrameNumber, nextMaxFrameNumber, 0), delayForEntities);
            nextMinFrameNumber = nextMaxFrameNumber + 1;
            delayForEntities += 10;
          }
        }

        this.setVideoFrameEntity(frameNumber, videoFrameEntity);
        this.loadedFrameEntityCount++;
        if (this.loadedFrameEntityCount == this.videoEntity.frame_count) {
          this.includedFrameCountDiv.style.visibility = 'visible';
          this.negativeFrameCountDiv.style.visibility = 'visible';
        }
        this.loadingProgress.value++;
        let delayForImage = i + 10;
        setTimeout(this.retrieveVideoFrameImage.bind(this, frameNumber, videoFrameEntity.image_url, 0), delayForImage);

        if (frameNumber == this.currentFrameNumber) {
          this.redrawBboxes();
          this.refillLabelingArea();
        }
      }

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveVideoFramesWithImageUrls?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveVideoFramesWithImageUrls.bind(this, minFrameNumber, maxFrameNumber, failureCount), delay * 1000);
      } else {
        this.loadFailure();
      }
    }

    this.updateUI();
  }
};

fmltc.LabelVideo.prototype.setVideoFrameEntity = function(frameNumber, videoFrameEntity) {
  const previousIncludeFrameInDataset = this.videoFrameEntity[frameNumber]
      ? this.videoFrameEntity[frameNumber].include_frame_in_dataset : false;
  const previousBboxesText = this.videoFrameEntity[frameNumber]
      ? this.videoFrameEntity[frameNumber].bboxes_text : '';

  const includeFrameInDataset = videoFrameEntity.include_frame_in_dataset;
  const bboxesText = videoFrameEntity.bboxes_text;

  this.updateFrameCounts(frameNumber, previousIncludeFrameInDataset, previousBboxesText,
      includeFrameInDataset, bboxesText);
  this.videoFrameEntity[frameNumber] = videoFrameEntity;
  this.bboxes[frameNumber] = this.convertTextToBboxes(videoFrameEntity.bboxes_text);
};

fmltc.LabelVideo.prototype.updateFrameCounts = function(frameNumber,
    previousIncludeFrameInDataset, previousBboxesText,
    includeFrameInDataset, bboxesText) {
  if (previousIncludeFrameInDataset) {
    // This frame was included in the includedFrameCount.
    if (!includeFrameInDataset) {
      // This frame is now not included in the includedFrameCount.
      this.includedFrameCount--;
      this.includedFrameCountSpan.textContent = String(this.includedFrameCount);
    }
  } else {
    // This frame was not included in the includedFrameCount.
    if (includeFrameInDataset) {
      // This frame is now included in the includedFrameCount.
      this.includedFrameCount++;
      this.includedFrameCountSpan.textContent = String(this.includedFrameCount);
    }
  }
  if (previousIncludeFrameInDataset && previousBboxesText == '') {
    // This frame was included in the negativeFrameCount.
    if (!includeFrameInDataset || bboxesText != '') {
      // This frame is now not included in the negativeFrameCount.
      this.negativeFrameCount--;
      this.negativeFrameCountSpan.textContent = String(this.negativeFrameCount);
      if (frameNumber == this.minNegativeFrameNumber) {
        this.minNegativeFrameNumber = this.findNextNegativeFrameNumber(frameNumber + 1)
      }
      if (frameNumber == this.maxNegativeFrameNumber) {
        this.maxNegativeFrameNumber = this.findPreviousNegativeFrameNumber(frameNumber - 1)
      }
    }
  } else {
    // This frame was not included in the negativeFrameCount.
    if (includeFrameInDataset && bboxesText == '') {
      // This frame is now included in the negativeFrameCount.
      this.negativeFrameCount++;
      this.negativeFrameCountSpan.textContent = String(this.negativeFrameCount);
      if (frameNumber < this.minNegativeFrameNumber) {
        this.minNegativeFrameNumber = frameNumber;
      }
      if (frameNumber > this.maxNegativeFrameNumber) {
        this.maxNegativeFrameNumber = frameNumber;
      }
    }
  }
};

fmltc.LabelVideo.prototype.convertTextToBboxes = function(bboxesText) {
  const bboxes = [];
  if (bboxesText) {
    const bboxesLines = bboxesText.split('\n');
    for (let i = 0; i < bboxesLines.length; i++) {
      if (!bboxesLines[i]) {
        continue;
      }
      const tokens = bboxesLines[i].split(',');
      if (tokens.length == 5) {
        bboxes[i] = new fmltc.Box(
            Number(tokens[0]), Number(tokens[1]), Number(tokens[2]), Number(tokens[3]), tokens[4]);
      } else {
        console.log('Failed to split line into 5 tokens: "' + bboxesLines[i] + '".');
      }
    }
  }
  return bboxes;
};

fmltc.LabelVideo.prototype.convertBboxesToText = function(bboxes) {
  let bboxesText = '';
  for (let i = 0; i < bboxes.length; i++) {
    const box = bboxes[i];
    const x1 = Math.min(box.x1, box.x2);
    const y1 = Math.min(box.y1, box.y2);
    const x2 = Math.max(box.x1, box.x2);
    const y2 = Math.max(box.y1, box.y2);
    bboxesText += x1 + ',' + y1 + ',' + x2 + ',' + y2 + ',' + box.label + '\n';
  }
  return bboxesText;
};

fmltc.LabelVideo.prototype.missingLabelNames = function(bboxes) {
  if (bboxes) {
    for (let i = 0; i < bboxes.length; i++) {
      if (!bboxes[i].label) {
        return true;
      }
    }
  }
  return false;
};

fmltc.LabelVideo.prototype.saveBboxes = function() {
  if (this.bboxes[this.currentFrameNumber] == undefined ||
      this.videoFrameEntity[this.currentFrameNumber] == undefined) {
    return '';
  }
  const previousBboxesText = this.videoFrameEntity[this.currentFrameNumber].bboxes_text;
  const bboxesText = this.convertBboxesToText(this.bboxes[this.currentFrameNumber]);
  if (bboxesText == previousBboxesText) {
    // Don't save them if they haven't changed.
    return bboxesText;
  }

  const includeFrameInDataset = this.videoFrameEntity[this.currentFrameNumber].include_frame_in_dataset;
  this.updateFrameCounts(this.currentFrameNumber, includeFrameInDataset, previousBboxesText,
      includeFrameInDataset, bboxesText);
  this.videoFrameEntity[this.currentFrameNumber].bboxes_text = bboxesText;

  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&frame_number=' + encodeURIComponent(this.currentFrameNumber) +
      '&bboxes_text=' + encodeURIComponent(bboxesText);
  xhr.open('POST', '/storeVideoFrameBboxesText', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_storeVideoFrameBboxesText_onreadystatechange.bind(this, xhr, params,
      this.currentFrameNumber);
  xhr.send(params);
  return bboxesText;
};

fmltc.LabelVideo.prototype.xhr_storeVideoFrameBboxesText_onreadystatechange = function(xhr, params,
    frame_number) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /storeVideoFrameBboxesText?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.LabelVideo.prototype.updateVideoFrameImg = function() {
  if (this.videoFrameImage[this.currentFrameNumber]) {
    this.videoFrameImg.src = this.videoFrameImage[this.currentFrameNumber];
  } else {
    this.videoFrameImg.src = '//:0';
  }
};

fmltc.LabelVideo.prototype.refillLabelingArea = function(optLastLabelInputFocus) {
  // Remove all rows except the first one, which contains the column headers.
  for (let i = this.labelingAreaTable.rows.length - 1; i >= 1; i--) {
    const row = this.labelingAreaTable.rows[i];
    this.removeEventHandlers(row);
    this.labelingAreaTable.deleteRow(i);
  }

  if (this.bboxes[this.currentFrameNumber] == undefined) {
    return;
  }

  this.includeFrameInDatasetCheckbox.checked =
      this.videoFrameEntity[this.currentFrameNumber].include_frame_in_dataset;

  const fields = ['x1', 'y1', 'x2', 'y2', 'label'];
  const types = ['number', 'number', 'number', 'number', 'text'];
  const widths = ['7ch', '7ch', '7ch', '7ch', '10ch'];

  let lastLabelInput = null;
  for (let i = 0; i < this.bboxes[this.currentFrameNumber].length; i++) {
    const box = this.bboxes[this.currentFrameNumber][i];
    const tr = this.labelingAreaTable.insertRow(-1);
    for (let f = 0; f < fields.length; f++) {
      const field = fields[f];
      const td = tr.insertCell(-1);
      const input = document.createElement('input');
      input.setAttribute('type', types[f]);
      input.style.width = widths[f];
      input.value = box[field];
      input.onchange = this.bboxFieldInput_onchange.bind(this, i, input, field);
      td.appendChild(input);
      lastLabelInput = input
    }
    td = tr.insertCell(-1);
    const deleteButton = document.createElement('button');
    deleteButton.textContent = String.fromCodePoint(0x1F5D1); // wastebasket
    deleteButton.title = "Delete this box";
    deleteButton.onclick = this.deleteButton_onclick.bind(this, i);
    td.appendChild(deleteButton);
  }

  if (optLastLabelInputFocus && lastLabelInput) {
    lastLabelInput.focus();
  }
};

fmltc.LabelVideo.prototype.removeEventHandlers = function(element) {
  if (element.nodeName == 'INPUT') {
    element.onchange = null;
  } else if (element.nodeName == 'BUTTON') {
    element.onclick = null;
  }
  for (let i = 0; i < element.childNodes.length; i++) {
    this.removeEventHandlers(element.childNodes[i]);
  }
};

fmltc.LabelVideo.prototype.bboxFieldInput_onchange = function(i, input, field) {
  if (i < this.bboxes[this.currentFrameNumber].length) {
    const box = this.bboxes[this.currentFrameNumber][i];
    box[field] = input.value;
    this.redrawBboxes();
  }
  this.updateUI();
};

fmltc.LabelVideo.prototype.deleteButton_onclick = function(i) {
  if (i < this.bboxes[this.currentFrameNumber].length) {
    this.bboxes[this.currentFrameNumber].splice(i, 1);
    this.redrawBboxes();
    this.refillLabelingArea();
    this.updateUI();
    this.saveBboxes();
  }
};

fmltc.LabelVideo.prototype.needToRetryGoToFrame = function(frameNumber) {
  // Check if video frame entity is not loaded yet.
  if (this.videoFrameEntity[frameNumber] == undefined) {
    return true;
  }
  return false;
};

fmltc.LabelVideo.prototype.goToFrame = function(frameNumber) {
  if (this.needToRetryGoToFrame(frameNumber)) {
    this.retryingGoToFrame = true;
    setTimeout(this.goToFrameRetry.bind(this, frameNumber, 0), 1000);
    return false;
  }

  this.saveBboxes();

  if (this.retryingGoToFrame) {
    this.retryingGoToFrame = false;

    if (this.playing) {
      setTimeout(this.advanceFrame.bind(this), this.playingIntervalMs);
    }
  }

  this.currentFrameNumber = frameNumber;
  this.currentFrameSpan.textContent = String(this.currentFrameNumber + 1);
  this.updateVideoFrameImg();
  this.redrawBboxes();
  this.refillLabelingArea();
  this.updateUI();
  return true;
};

fmltc.LabelVideo.prototype.goToFrameRetry = function(frameNumber, retryCount) {
  if (this.retryingGoToFrame) {
    if (this.needToRetryGoToFrame(frameNumber)) {
      if (retryCount < 20) {
        setTimeout(this.goToFrameRetry.bind(this, frameNumber,  retryCount + 1), 1000);
      } else {
        // TODO(lizlooney): What should we do if we've retried 20 times?
      }
    } else {
      this.goToFrame(frameNumber);
    }
  }
};

fmltc.LabelVideo.prototype.includeFrameInDatasetCheckbox_onclick = function() {
  if (this.videoFrameEntity[this.currentFrameNumber] == undefined) {
    return;
  }
  const previousIncludeFrameInDataset = this.videoFrameEntity[this.currentFrameNumber].include_frame_in_dataset;
  const includeFrameInDataset = this.includeFrameInDatasetCheckbox.checked;
  if (includeFrameInDataset == previousIncludeFrameInDataset) {
    // Don't save them if they haven't changed.
    return;
  }

  const bboxesText = this.videoFrameEntity[this.currentFrameNumber].bboxes_text;
  this.updateFrameCounts(this.currentFrameNumber, previousIncludeFrameInDataset, bboxesText,
      includeFrameInDataset, bboxesText);
  this.videoFrameEntity[this.currentFrameNumber].include_frame_in_dataset = includeFrameInDataset;

  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&frame_number=' + encodeURIComponent(this.currentFrameNumber) +
      '&include_frame_in_dataset=' + encodeURIComponent(includeFrameInDataset);
  xhr.open('POST', '/storeVideoFrameIncludeInDataset', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_storeVideoFrameIncludeInDataset_onreadystatechange.bind(this, xhr, params,
      this.currentFrameNumber);
  xhr.send(params);
};

fmltc.LabelVideo.prototype.xhr_storeVideoFrameIncludeInDataset_onreadystatechange = function(xhr, params,
    frame_number) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;
    if (xhr.status === 200) {
    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /storeVideoFrameIncludeInDataset?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};


fmltc.LabelVideo.prototype.firstFrameButton_onclick = function() {
  this.goToFrame(0);
};

fmltc.LabelVideo.prototype.previousTenFrameButton_onclick = function() {
  this.goToFrame(Math.max(0, this.currentFrameNumber - 10));
};

fmltc.LabelVideo.prototype.previousFrameButton_onclick = function() {
  this.goToFrame(this.currentFrameNumber - 1);
};

fmltc.LabelVideo.prototype.nextFrameButton_onclick = function() {
  this.goToFrame(this.currentFrameNumber + 1);
};

fmltc.LabelVideo.prototype.nextTenFrameButton_onclick = function() {
  this.goToFrame(Math.min(this.currentFrameNumber + 10, this.videoEntity.frame_count - 1));
};

fmltc.LabelVideo.prototype.lastFrameButton_onclick = function() {
  this.goToFrame(this.videoEntity.frame_count - 1);
};

fmltc.LabelVideo.prototype.previousNegativeFrameButton_onclick = function() {
  const i = this.findPreviousNegativeFrameNumber(this.currentFrameNumber - 1);
  if (i >= 0) {
    this.goToFrame(i);
  }
};

fmltc.LabelVideo.prototype.findPreviousNegativeFrameNumber = function(start) {
  for (let i = start; i >= 0; i++) {
    if (this.videoFrameEntity[i].bboxes_text == '') {
      return i;
    }
  }
  return -1;
};

fmltc.LabelVideo.prototype.nextNegativeFrameButton_onclick = function() {
  const i = this.findNextNegativeFrameNumber(this.currentFrameNumber + 1);
  if (i < this.videoEntity.frame_count) {
    this.goToFrame(i);
  }
};

fmltc.LabelVideo.prototype.findNextNegativeFrameNumber = function(start) {
  for (let i = start; i < this.videoEntity.frame_count; i++) {
    if (this.videoFrameEntity[i].bboxes_text == '') {
      return i;
    }
  }
  return this.videoEntity.frame_count;
};


fmltc.LabelVideo.prototype.reversePlayPauseButton_onclick = function() {
  this.saveBboxes();

  this.playing = !this.playing;
  this.updateUI();

  if (this.playing) {
    this.playingDirection = -1;
    this.playingIntervalMs = Math.round(1000 / this.playbackSpeedInput.value);
    this.advanceFrame();
  }
};

fmltc.LabelVideo.prototype.forwardPlayPauseButton_onclick = function() {
  this.saveBboxes();

  this.playing = !this.playing;
  this.updateUI();

  if (this.playing) {
    this.playingDirection = 1;
    this.playingIntervalMs = Math.round(1000 / this.playbackSpeedInput.value);
    this.advanceFrame();
  }
};

fmltc.LabelVideo.prototype.advanceFrame = function() {
  if (this.playing) {
    const frameNumber = this.currentFrameNumber + this.playingDirection;
    const success = this.goToFrame(frameNumber);
    if (success) {
      const allDone = (this.playingDirection == -1)
          ? (frameNumber == 0)
          : (frameNumber == this.videoEntity.frame_count - 1);
      if (allDone) {
        this.playing = false;
        this.updateUI();
      } else {
        setTimeout(this.advanceFrame.bind(this), this.playingIntervalMs);
      }
    }
  }
};

fmltc.LabelVideo.prototype.bboxCanvas_onmousedown = function(e) {
  if (this.playing ||
      (this.trackingInProgress && (!this.trackingPaused || this.trackingWaitingForBboxes)) ||
      this.bboxes[this.currentFrameNumber] == undefined) {
    return;
  }

  this.point1.fromMouseEvent(e, this.bboxCanvas, this.canvasScale);

  let hotspot = 0;
  let i = 0;
  while (i < this.bboxes[this.currentFrameNumber].length) {
    hotspot = this.bboxes[this.currentFrameNumber][i].getResizeHotspot(this.point1, this.canvasScale);
    if (hotspot) {
      break;
    }
    i++;
  }
  if (hotspot) {
    // Start resizing an existing box.
    this.resizingBboxIndex = i;
    this.resizingBboxHotspot = hotspot;
    // Note if the user is editing the label and then clicks on a resize hotspot, this.resizeingBbox
    // won't contain the updated label.
    this.resizingBbox = this.bboxes[this.currentFrameNumber][i].duplicate();
    // Since the box already exists, we don't need to draw it here.
  } else {
    // Start defining a new box.
    this.definingBbox = new fmltc.Box(this.point1.x, this.point1.y, this.point1.x, this.point1.y, '');
    // Draw the box.
    this.definingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);
  }
};

fmltc.LabelVideo.prototype.bboxCanvas_onmousemove = function(e) {
  if (this.playing ||
      (this.trackingInProgress && (!this.trackingPaused || this.trackingWaitingForBboxes)) ||
      this.bboxes[this.currentFrameNumber] == undefined) {
    if (this.util.hasWaitCursor(this.bboxCanvas)) {
      // TODO(lizlooney): let the default handler do its thing.
    } else {
      this.bboxCanvas.style.cursor = 'auto';
    }
    return;
  }

  if (this.definingBbox) {
    // Erase the previous box.
    this.bboxCanvasCtx.globalCompositeOperation = 'destination-out';
    this.definingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);
    this.bboxCanvasCtx.globalCompositeOperation = 'source-over';
    // Adjust the box.
    this.point2.fromMouseEvent(e, this.bboxCanvas, this.canvasScale);
    this.definingBbox.set(this.point1.x, this.point1.y, this.point2.x, this.point2.y);
    // Draw the new box.
    this.definingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);

  } else if (this.resizingBbox) {
    // Erase the previous box.
    this.bboxCanvasCtx.globalCompositeOperation = 'destination-out';
    this.resizingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);
    this.bboxCanvasCtx.globalCompositeOperation = 'source-over';
    // Adjust the box
    this.point2.fromMouseEvent(e, this.bboxCanvas, this.canvasScale);
    this.resizingBbox.resize(this.resizingBboxHotspot, this.point2.x - this.point1.x, this.point2.y - this.point1.y);
    this.point1.fromAnotherPoint(this.point2);
    // Draw the new box.
    this.resizingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);

  } else {
    // If the mouse is on a resize hotspot of an existing box, show a resize cursor.
    this.point1.fromMouseEvent(e, this.bboxCanvas, this.canvasScale);
    let hotspot = 0;
    for (let i = 0; i < this.bboxes[this.currentFrameNumber].length; i++) {
      hotspot = this.bboxes[this.currentFrameNumber][i].getResizeHotspot(this.point1, this.canvasScale);
      if (hotspot) {
        this.bboxCanvas.style.cursor = 'nwse-resize';
        break;
      }
    }
    // If not on a resize hotspot, show a crosshair cursor.
    if (!hotspot) {
      this.bboxCanvas.style.cursor = 'crosshair';
    }
  }
};

fmltc.LabelVideo.prototype.bboxCanvas_onmouseleave = function(e) {
  if (this.definingBbox) {
    // Erase the previous temporary box.
    this.bboxCanvasCtx.globalCompositeOperation = 'destination-out';
    this.definingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);
    this.bboxCanvasCtx.globalCompositeOperation = 'source-over';
    // Abort the new box.
    this.definingBbox = null;
    this.redrawBboxes();

  } else if (this.resizingBbox) {
    // Erase the previous temporary box.
    this.bboxCanvasCtx.globalCompositeOperation = 'destination-out';
    this.resizingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);
    this.bboxCanvasCtx.globalCompositeOperation = 'source-over';
    // Abort the resize.
    this.resizingBbox = null;
    this.redrawBboxes();
  }
};

fmltc.LabelVideo.prototype.bboxCanvas_onmouseup = function(e) {
  if (this.definingBbox) {
    // Erase the previous temporary box.
    this.bboxCanvasCtx.globalCompositeOperation = 'destination-out';
    this.definingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);
    this.bboxCanvasCtx.globalCompositeOperation = 'source-over';
    // Save the box.
    if (!this.definingBbox.isEmpty()) {
      this.bboxes[this.currentFrameNumber].push(this.definingBbox);
    }
    this.updateUI();
    // Stop defining.
    this.definingBbox = null;
    this.redrawBboxes();
    this.refillLabelingArea(true);

  } else if (this.resizingBbox) {
    // Erase the previous temporary box.
    this.bboxCanvasCtx.globalCompositeOperation = 'destination-out';
    this.resizingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);
    this.bboxCanvasCtx.globalCompositeOperation = 'source-over';
    // Save the resized box.
    this.bboxes[this.currentFrameNumber][this.resizingBboxIndex].setXYFromAnotherBox(this.resizingBbox);
    // Stop resizing
    this.resizingBbox = null;
    this.redrawBboxes();
    this.refillLabelingArea();
  }
};

fmltc.LabelVideo.prototype.trackingStartButton_onclick = function() {
  this.trackingFinishedDiv.style.visibility = 'hidden';
  this.trackingFailedDiv.style.visibility = 'hidden';
  this.trackingStoppedDiv.style.visibility = 'hidden';
  this.trackingInProgress = true;
  this.trackingPaused = false;
  this.trackingWaitingForBboxes = true;
  this.trackingInitFrameNumber = this.currentFrameNumber;
  this.trackingFinalFrameNumber = this.videoEntity.frame_count - 1;
  this.util.setWaitCursor();
  this.updateUI();

  const bboxesText = this.saveBboxes();

  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&init_frame_number=' + encodeURIComponent(this.currentFrameNumber) +
      '&init_bboxes_text=' + encodeURIComponent(bboxesText) +
      '&tracker_name=' + encodeURIComponent(this.trackerSelect.options[this.trackerSelect.selectedIndex].value) +
      '&scale=' + encodeURIComponent(this.trackingScaleInput.value);
  xhr.open('POST', '/prepareToStartTracking', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToStartTracking_onreadystatechange.bind(this, xhr, params,
      this.currentFrameNumber);
  xhr.send(params);
  this.trackingRequestSent();
};

fmltc.LabelVideo.prototype.xhr_prepareToStartTracking_onreadystatechange = function(xhr, params,
    initFrameNumber) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.trackerUuid = response.tracker_uuid;
      this.util.callHttpPerformAction(response.action_parameters, 0);

      setTimeout(this.retrieveTrackedBboxes.bind(this, initFrameNumber + 1, 0, 0), 1000);

      setTimeout(this.trackingClientStillAlive.bind(this), 30 * 1000);

    } else {
      // TODO(lizlooney): handle error properly.
      console.log('Failure! /prepareToStartTracking?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.util.clearWaitCursor();
      this.trackingInProgress = false;
      this.trackingPaused = false;
      this.trackingWaitingForBboxes = false;
      this.trackingFailedDiv.style.visibility = 'visible';
      this.updateUI();
    }
  }
};

fmltc.LabelVideo.prototype.trackingRequestSent = function() {
  this.trackingRequestSentTime = Date.now();
};

fmltc.LabelVideo.prototype.trackingClientStillAlive = function() {
  if (this.trackingInProgress) {
    if ((Date.now() - this.trackingRequestSentTime) >= 30 * 1000) {
      const xhr = new XMLHttpRequest();
      const params =
          'video_uuid=' + encodeURIComponent(this.videoUuid) +
          '&tracker_uuid=' + encodeURIComponent(this.trackerUuid);
      xhr.open('POST', '/trackingClientStillAlive', true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.onreadystatechange = this.xhr_trackingClientStillAlive_onreadystatechange.bind(this, xhr, params);
      xhr.send(params);
      this.trackingRequestSent();
    }
    setTimeout(this.trackingClientStillAlive.bind(this), 30 * 1000);
  }
};

fmltc.LabelVideo.prototype.xhr_trackingClientStillAlive_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /trackingClientStillAlive?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.LabelVideo.prototype.retrieveTrackedBboxes = function(frameNumber, retryCount, failureCount) {
  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&tracker_uuid=' + encodeURIComponent(this.trackerUuid) +
      '&retrieve_frame_number=' + encodeURIComponent(frameNumber);
  xhr.open('POST', '/retrieveTrackedBboxes', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveTrackedBboxes_onreadystatechange.bind(this, xhr, params,
      frameNumber, retryCount, failureCount);
  xhr.send(params);
  this.trackingRequestSent();
};

fmltc.LabelVideo.prototype.xhr_retrieveTrackedBboxes_onreadystatechange = function(xhr, params,
    frameNumber, retryCount, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.tracker_failed) {
        console.log('response.tracker_failed is true. Tracker probably timed out or was interrupted.');
        this.util.clearWaitCursor();
        this.trackingInProgress = false;
        this.trackingPaused = false;
        this.trackingWaitingForBboxes = false;
        // Restart tracking.
        setTimeout(this.trackingStartButton_onclick.bind(this), 1000);

      } else if (response.frame_number == frameNumber) {
        const bboxesText = response.bboxes_text;
        const previousBboxesText = this.videoFrameEntity[frameNumber].bboxes_text;
        const includeFrameInDataset = this.videoFrameEntity[frameNumber].include_frame_in_dataset;
        this.updateFrameCounts(frameNumber, includeFrameInDataset, previousBboxesText,
            includeFrameInDataset, bboxesText);
        this.videoFrameEntity[frameNumber].bboxes_text = bboxesText;
        this.bboxes[frameNumber] = this.convertTextToBboxes(this.videoFrameEntity[frameNumber].bboxes_text);

        this.trackingWaitingForBboxes = false;
        if (frameNumber == this.trackingInitFrameNumber + 1) {
          this.util.clearWaitCursor();
        }
        this.goToFrame(frameNumber);

        if (!this.trackingPaused) {
          this.sendContinueTracking(0);
        }

      } else {
        // The tracked bboxes are not ready yet. Try again in a moment.
        setTimeout(this.retrieveTrackedBboxes.bind(this, frameNumber, retryCount + 1, 0), 100);
      }

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        setTimeout(this.retrieveTrackedBboxes.bind(this, frameNumber, retryCount + 1, failureCount), delay * 1000);
      } else {
        this.util.clearWaitCursor();
        this.trackingInProgress = false;
        this.trackingPaused = false;
        this.trackingWaitingForBboxes = false;
        this.trackingFailedDiv.style.visibility = 'visible';
      }
    }
    this.updateUI();
  }
};

fmltc.LabelVideo.prototype.trackingPauseButton_onclick = function() {
  this.trackingPaused = true;
  this.updateUI();
};

fmltc.LabelVideo.prototype.trackingContinueButton_onclick = function() {
  this.trackingPaused = false;
  this.sendContinueTracking(0);
};

fmltc.LabelVideo.prototype.sendContinueTracking = function(failureCount) {
  this.trackingWaitingForBboxes = true;
  this.updateUI();

  this.videoFrameEntity[this.currentFrameNumber].bboxes_text =
      this.convertBboxesToText(this.bboxes[this.currentFrameNumber]);

  const xhr = new XMLHttpRequest();
  let params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&tracker_uuid=' + encodeURIComponent(this.trackerUuid) +
      '&frame_number=' + encodeURIComponent(this.currentFrameNumber) +
      '&bboxes_text=' + encodeURIComponent(this.videoFrameEntity[this.currentFrameNumber].bboxes_text);
  xhr.open('POST', '/continueTracking', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  if (this.currentFrameNumber < this.trackingFinalFrameNumber) {
    const retrieveFrameNumber = this.currentFrameNumber + 1;
    params += '&retrieve_frame_number=' + encodeURIComponent(retrieveFrameNumber);
    xhr.onreadystatechange = this.xhr_retrieveTrackedBboxes_onreadystatechange.bind(this, xhr, params,
        retrieveFrameNumber, 0, 0);
  } else {
    xhr.onreadystatechange = this.xhr_continueTracking_onreadystatechange.bind(this, xhr, params,
        failureCount);
  }
  xhr.send(params);
  this.trackingRequestSent();
};

fmltc.LabelVideo.prototype.xhr_continueTracking_onreadystatechange = function(xhr, params,
    failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      // This callback is only used when we are finishing tracking.
      this.trackingInProgress = false;
      this.trackingPaused = false;
      this.trackingWaitingForBboxes = false;
      this.trackingFinishedDiv.style.visibility = 'visible';
      this.updateUI();

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        setTimeout(this.sendContinueTracking.bind(this, failureCount), delay * 1000);
      }
    }
  }
};

fmltc.LabelVideo.prototype.trackingStopButton_onclick = function() {
  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&tracker_uuid=' + encodeURIComponent(this.trackerUuid);
  xhr.open('POST', '/stopTracking', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_stopTracking_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.LabelVideo.prototype.xhr_stopTracking_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      this.trackingInProgress = false;
      this.trackingPaused = false;
      this.trackingWaitingForBboxes = false;
      this.trackingStoppedDiv.style.visibility = 'visible';
      this.updateUI();

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /stopTracking?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};
