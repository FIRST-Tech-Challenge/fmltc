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
fmltc.LabelVideo = function(util, videoEntity, videoFrameEntity0) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.videoUuid = videoEntity.video_uuid;

  this.startTime = Date.now();

  this.smallerImageButton = document.getElementById('smallerImageButton');
  this.largerImageButton = document.getElementById('largerImageButton');
  this.loadingProgress = document.getElementById('loadingProgress');
  this.bboxCanvas = document.getElementById('bboxCanvas');
  this.videoFrameImg = document.getElementById('videoFrameImg');
  this.currentFrameSpan = document.getElementById('currentFrameSpan');
  this.labelingAreaTable = document.getElementById('labelingAreaTable');
  this.labelingAreaSavingMessageDiv = document.getElementById('labelingAreaSavingMessageDiv');
  this.labelHintDiv = document.getElementById('labelHintDiv');
  this.firstFrameButton = document.getElementById('firstFrameButton');
  this.previousTenFrameButton = document.getElementById('previousTenFrameButton');
  this.previousFrameButton = document.getElementById('previousFrameButton');
  this.nextFrameButton = document.getElementById('nextFrameButton');
  this.nextTenFrameButton = document.getElementById('nextTenFrameButton');
  this.lastFrameButton = document.getElementById('lastFrameButton');
  this.ignoreFrameCheckbox = document.getElementById('ignoreFrameCheckbox');
  this.ignoreFrameSavingMessageSpan = document.getElementById('ignoreFrameSavingMessageSpan');
  this.ignoredFrameCountSpan = document.getElementById('ignoredFrameCountSpan');
  this.previousIgnoredFrameButton = document.getElementById('previousIgnoredFrameButton');
  this.nextIgnoredFrameButton = document.getElementById('nextIgnoredFrameButton');
  this.unlabeledFrameCountSpan = document.getElementById('unlabeledFrameCountSpan');
  this.previousUnlabeledFrameButton = document.getElementById('previousUnlabeledFrameButton');
  this.nextUnlabeledFrameButton = document.getElementById('nextUnlabeledFrameButton');
  this.playbackSpeedRangeInput = document.getElementById('playbackSpeedRangeInput');
  this.reversePlayPauseButton = document.getElementById('reversePlayPauseButton');
  this.forwardPlayPauseButton = document.getElementById('forwardPlayPauseButton');
  this.trackerSelect = document.getElementById('trackerSelect');
  this.trackingScaleInput = document.getElementById('trackingScaleInput');
  this.trackingStartButton = document.getElementById('trackingStartButton');
  this.trackingPauseButton = document.getElementById('trackingPauseButton');
  this.trackingContinueButton = document.getElementById('trackingContinueButton');
  this.trackingStopButton = document.getElementById('trackingStopButton');
  this.trackingMessageDiv = document.getElementById('trackingMessageDiv');

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

  this.ignoredFrameCount = 0;
  this.ignoredFrameCountSpan.textContent = String(this.ignoredFrameCount);
  this.unlabeledFrameCount = 0;
  this.unlabeledFrameCountSpan.textContent = String(this.unlabeledFrameCount);

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

  this.updateUI(true);
  this.setVideoEntity(videoEntity);
  this.videoFrameEntityLoaded(videoFrameEntity0, 0);

  // Retrieve the rest of the frames 100 at a time.
  let minFrameNumber = 1;
  let delayForEntities = 10;
  while (minFrameNumber < this.videoEntity.frame_count) {
    const maxFrameNumber = Math.min(minFrameNumber + 99, this.videoEntity.frame_count - 1);
    setTimeout(this.retrieveVideoFrameEntitiesWithImageUrls.bind(this, minFrameNumber, maxFrameNumber, 0), delayForEntities);
    minFrameNumber = maxFrameNumber + 1;
    delayForEntities += 10;
  }
};

fmltc.LabelVideo.MIN_CANVAS_WIDTH = 500;
fmltc.LabelVideo.MAX_CANVAS_WIDTH = 2000;

fmltc.LabelVideo.prototype.setVideoEntity = function(videoEntity) {
  this.videoEntity = videoEntity;

  this.minIgnoredFrameNumber = videoEntity.frame_count;
  this.maxIgnoredFrameNumber = -1;
  this.minUnlabeledFrameNumber = videoEntity.frame_count;
  this.maxUnlabeledFrameNumber = -1;

  this.trackingAlreadyInProgress = this.videoEntity.tracking_in_progress;

  this.loadingProgress.value++;
  this.loadingProgress.max = 1 + 2 * this.videoEntity.frame_count;

  document.getElementById('descriptionSpan').textContent = this.videoEntity.description;
  document.getElementById('videoFrameCountSpan').textContent = String(this.videoEntity.frame_count);

  this.rescaleCanvas();
  window.addEventListener('resize', this.repositionCanvas.bind(this));

  window.onbeforeunload = this.window_onbeforeunload.bind(this);
  this.smallerImageButton.onclick = this.smallerImageButton_onclick.bind(this);
  this.largerImageButton.onclick = this.largerImageButton_onclick.bind(this);
  this.bboxCanvas.onmousedown = this.bboxCanvas_onmousedown.bind(this);
  this.bboxCanvas.onmousemove = this.bboxCanvas_onmousemove.bind(this);
  this.bboxCanvas.onmouseleave = this.bboxCanvas_onmouseleave.bind(this);
  this.bboxCanvas.onmouseup = this.bboxCanvas_onmouseup.bind(this);
  this.firstFrameButton.onclick = this.firstFrameButton_onclick.bind(this);
  this.previousTenFrameButton.onclick = this.previousTenFrameButton_onclick.bind(this);
  this.previousFrameButton.onclick = this.previousFrameButton_onclick.bind(this);
  this.nextFrameButton.onclick = this.nextFrameButton_onclick.bind(this);
  this.nextTenFrameButton.onclick = this.nextTenFrameButton_onclick.bind(this);
  this.lastFrameButton.onclick = this.lastFrameButton_onclick.bind(this);
  this.ignoreFrameCheckbox.onclick = this.ignoreFrameCheckbox_onclick.bind(this);
  this.previousIgnoredFrameButton.onclick = this.previousIgnoredFrameButton_onclick.bind(this);
  this.nextIgnoredFrameButton.onclick = this.nextIgnoredFrameButton_onclick.bind(this);
  this.previousUnlabeledFrameButton.onclick = this.previousUnlabeledFrameButton_onclick.bind(this);
  this.nextUnlabeledFrameButton.onclick = this.nextUnlabeledFrameButton_onclick.bind(this);
  this.reversePlayPauseButton.onclick = this.reversePlayPauseButton_onclick.bind(this);
  this.forwardPlayPauseButton.onclick = this.forwardPlayPauseButton_onclick.bind(this);
  this.trackingScaleInput.onchange = this.trackingScaleInput_onchange.bind(this);
  this.trackingStartButton.onclick = this.trackingStartButton_onclick.bind(this);
  this.trackingPauseButton.onclick = this.trackingPauseButton_onclick.bind(this);
  this.trackingContinueButton.onclick = this.trackingContinueButton_onclick.bind(this);
  this.trackingStopButton.onclick = this.trackingStopButton_onclick.bind(this);

  this.updateUI(true);
};

fmltc.LabelVideo.prototype.window_onbeforeunload = function() {
  this.saveBboxes();
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

  this.redrawBboxes(false);
};

fmltc.LabelVideo.prototype.redrawBboxes = function(updateCanvasPosition) {
  if (updateCanvasPosition) {
    this.repositionCanvas();
    return;
  }

  this.bboxCanvasCtx.clearRect(0, 0, this.videoEntity.width, this.videoEntity.height);

  if (this.bboxes[this.currentFrameNumber] && this.videoFrameImage[this.currentFrameNumber]) {
    for (let i = 0; i < this.bboxes[this.currentFrameNumber].length; i++) {
      this.bboxes[this.currentFrameNumber][i].draw(this.bboxCanvasCtx, this.canvasScale, false /*true*/);
    }
  }
};

fmltc.LabelVideo.prototype.updateUI = function(setTrackingMessageDivText) {
  if (!this.videoEntity ||
      this.bboxes[this.currentFrameNumber] == undefined) {
    this.firstFrameButton.disabled = true;
    this.previousTenFrameButton.disabled = true;
    this.previousFrameButton.disabled = true;
    this.nextFrameButton.disabled = true;
    this.nextTenFrameButton.disabled = true;
    this.lastFrameButton.disabled = true;
    this.ignoreFrameCheckbox.disabled = true;
    this.previousIgnoredFrameButton.disabled = true;
    this.nextIgnoredFrameButton.disabled = true;
    this.previousUnlabeledFrameButton.disabled = true;
    this.nextUnlabeledFrameButton.disabled = true;
    this.playbackSpeedRangeInput.disabled = true;
    this.reversePlayPauseButton.disabled = true;
    this.forwardPlayPauseButton.disabled = true;
    this.disableLabelingArea(true);
    this.trackingScaleInput.disabled = true;
    this.trackerSelect.disabled = true;
    this.trackingStartButton.disabled = true;
    this.trackingPauseButton.disabled = true;
    this.trackingContinueButton.disabled = true;
    this.trackingStopButton.disabled = true;
    return;
  }

  if (setTrackingMessageDivText) {
    if (this.bboxes[this.currentFrameNumber].length == 0) {
      this.trackingMessageDiv.textContent = 'To enable tracking, draw bounding boxes on this frame.';
    } else {
      this.trackingMessageDiv.textContent = '';
    }
  }

  if (this.missingLabelNames(this.bboxes[this.currentFrameNumber])) {
    this.util.showElement(this.labelHintDiv);
    this.firstFrameButton.disabled = true;
    this.previousTenFrameButton.disabled = true;
    this.previousFrameButton.disabled = true;
    this.nextFrameButton.disabled = true;
    this.nextTenFrameButton.disabled = true;
    this.lastFrameButton.disabled = true;
    this.ignoreFrameCheckbox.disabled = true;
    this.previousIgnoredFrameButton.disabled = true;
    this.nextIgnoredFrameButton.disabled = true;
    this.previousUnlabeledFrameButton.disabled = true;
    this.nextUnlabeledFrameButton.disabled = true;
    this.playbackSpeedRangeInput.disabled = true;
    this.reversePlayPauseButton.disabled = true;
    this.forwardPlayPauseButton.disabled = true;
    this.disableLabelingArea(false);
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
    this.ignoreFrameCheckbox.disabled = true;
    this.previousIgnoredFrameButton.disabled = true;
    this.nextIgnoredFrameButton.disabled = true;
    this.previousUnlabeledFrameButton.disabled = true;
    this.nextUnlabeledFrameButton.disabled = true;
    this.playbackSpeedRangeInput.disabled = true;
    this.reversePlayPauseButton.disabled = (this.playingDirection == 1);
    this.forwardPlayPauseButton.disabled = (this.playingDirection == -1);
    this.disableLabelingArea(true);
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
    this.ignoreFrameCheckbox.disabled = true;
    this.previousIgnoredFrameButton.disabled = true;
    this.nextIgnoredFrameButton.disabled = true;
    this.previousUnlabeledFrameButton.disabled = true;
    this.nextUnlabeledFrameButton.disabled = true;
    this.playbackSpeedRangeInput.disabled = true;
    this.reversePlayPauseButton.disabled = true;
    this.forwardPlayPauseButton.disabled = true;
    this.trackingScaleInput.disabled = true;
    this.trackerSelect.disabled = true;
    this.trackingStartButton.disabled = true;
    this.disableLabelingArea(!this.trackingPaused || this.trackingWaitingForBboxes);
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
    this.ignoreFrameCheckbox.disabled = (
        this.loadedFrameEntityCount < this.videoEntity.frame_count);
    this.previousIgnoredFrameButton.disabled = (
        this.loadedFrameEntityCount < this.videoEntity.frame_count ||
        this.currentFrameNumber <= this.minIgnoredFrameNumber);
    this.nextIgnoredFrameButton.disabled = (
        this.loadedFrameEntityCount < this.videoEntity.frame_count ||
        this.currentFrameNumber >= this.maxIgnoredFrameNumber);
    this.previousUnlabeledFrameButton.disabled = (
        this.loadedFrameEntityCount < this.videoEntity.frame_count ||
        this.currentFrameNumber <= this.minUnlabeledFrameNumber);
    this.nextUnlabeledFrameButton.disabled = (
        this.loadedFrameEntityCount < this.videoEntity.frame_count ||
        this.currentFrameNumber >= this.maxUnlabeledFrameNumber);
    this.playbackSpeedRangeInput.disabled = false;
    this.reversePlayPauseButton.disabled = (this.currentFrameNumber == 0);
    this.forwardPlayPauseButton.disabled = (this.currentFrameNumber == this.videoEntity.frame_count - 1);
    this.disableLabelingArea(false);
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

fmltc.LabelVideo.prototype.disableLabelingArea = function(disabled) {
  for (let i = this.labelingAreaTable.rows.length - 1; i >= 1; i--) {
    const row = this.labelingAreaTable.rows[i];
    this.disableRecursively(row, disabled);
  }
};

fmltc.LabelVideo.prototype.disableRecursively = function(element, disabled) {
  if (element.nodeName == 'INPUT') {
    element.disabled = disabled;
  } else if (element.nodeName == 'BUTTON') {
    element.disabled = disabled;
  }
  for (let i = 0; i < element.childNodes.length; i++) {
    this.disableRecursively(element.childNodes[i], disabled);
  }
};

fmltc.LabelVideo.prototype.loadFailure = function() {
  this.loadFailed = true;
  document.getElementById('loadingFailedSpan').style.display = 'inline';
};

fmltc.LabelVideo.prototype.retrieveVideoFrameEntitiesWithImageUrls = function(minFrameNumber, maxFrameNumber, failureCount) {
  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&min_frame_number=' + encodeURIComponent(minFrameNumber) +
      '&max_frame_number=' + encodeURIComponent(maxFrameNumber);
  xhr.open('POST', '/retrieveVideoFrameEntitiesWithImageUrls', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveVideoFrameEntitiesWithImageUrls_onreadystatechange.bind(this, xhr, params,
      minFrameNumber, maxFrameNumber, failureCount);
  xhr.send(params);
};

fmltc.LabelVideo.prototype.xhr_retrieveVideoFrameEntitiesWithImageUrls_onreadystatechange = function(xhr, params,
    minFrameNumber, maxFrameNumber, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const videoFrameEntityArray = response.video_frame_entities;

      for (let i = 0; i < videoFrameEntityArray.length; i++) {
        this.videoFrameEntityLoaded(videoFrameEntityArray[i]);
      }

    } else {
      failureCount++;
      if (failureCount < 2) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveVideoFrameEntitiesWithImageUrls?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveVideoFrameEntitiesWithImageUrls.bind(this, minFrameNumber, maxFrameNumber, failureCount), delay * 1000);
      } else {
        this.loadFailure();
      }
    }

    this.updateUI(true);
  }
};

fmltc.LabelVideo.prototype.videoFrameEntityLoaded = function(videoFrameEntity) {
  frameNumber = videoFrameEntity.frame_number;
  const previousIgnoreFrame = this.videoFrameEntity[frameNumber]
      ? !this.videoFrameEntity[frameNumber].include_frame_in_dataset : false;
  const previousUnlabeledFrame = this.videoFrameEntity[frameNumber]
      ? this.isUnlabeled(this.videoFrameEntity[frameNumber].bboxes_text) : false;

  const ignoreFrame = this.isIgnored(videoFrameEntity.include_frame_in_dataset);
  const unlabeledFrame = this.isUnlabeled(videoFrameEntity.bboxes_text);

  this.updateFrameCounts(frameNumber, previousIgnoreFrame, ignoreFrame,
      previousUnlabeledFrame, unlabeledFrame);
  this.videoFrameEntity[frameNumber] = videoFrameEntity;
  this.bboxes[frameNumber] = this.convertTextToBboxes(videoFrameEntity.bboxes_text);

  this.loadedFrameEntityCount++;
  this.loadingProgress.value++;

  setTimeout(this.retrieveVideoFrameImage.bind(this, frameNumber, videoFrameEntity.image_url, 0), 0);

  if (frameNumber == this.currentFrameNumber) {
    this.refillLabelingArea();
    this.redrawBboxes(true);
  }
};

fmltc.LabelVideo.prototype.updateFrameCounts = function(frameNumber,
    previousIgnoreFrame, ignoreFrame,
    previousUnlabeledFrame, unlabeledFrame) {
  if (previousIgnoreFrame != ignoreFrame) {
    if (ignoreFrame) {
      this.ignoredFrameCount++;
      // Since this frame is now ignored, we may need to update minIgnoredFrameNumber and
      // maxIgnoredFrameNumber.
      if (frameNumber < this.minIgnoredFrameNumber) {
        this.minIgnoredFrameNumber = frameNumber;
      }
      if (frameNumber > this.maxIgnoredFrameNumber) {
        this.maxIgnoredFrameNumber = frameNumber;
      }
    } else {
      this.ignoredFrameCount--;
      // Since this frame is now labeled, we may need to update minIgnoredFrameNumber and
      // maxIgnoredFrameNumber.
      if (frameNumber == this.minIgnoredFrameNumber) {
        this.minIgnoredFrameNumber = this.findNextIgnoredFrameNumber(frameNumber + 1)
      }
      if (frameNumber == this.maxIgnoredFrameNumber) {
        this.maxIgnoredFrameNumber = this.findPreviousIgnoredFrameNumber(frameNumber - 1)
      }
    }
    this.ignoredFrameCountSpan.textContent = String(this.ignoredFrameCount);
  }
  if (previousUnlabeledFrame != unlabeledFrame) {
    if (unlabeledFrame) {
      this.unlabeledFrameCount++;
      // Since this frame is now unlabeled, we may need to update minUnlabeledFrameNumber and
      // maxUnlabeledFrameNumber.
      if (frameNumber < this.minUnlabeledFrameNumber) {
        this.minUnlabeledFrameNumber = frameNumber;
      }
      if (frameNumber > this.maxUnlabeledFrameNumber) {
        this.maxUnlabeledFrameNumber = frameNumber;
      }
    } else {
      this.unlabeledFrameCount--;
      // Since this frame is now labeled, we may need to update minUnlabeledFrameNumber and
      // maxUnlabeledFrameNumber.
      if (frameNumber == this.minUnlabeledFrameNumber) {
        this.minUnlabeledFrameNumber = this.findNextUnlabeledFrameNumber(frameNumber + 1)
      }
      if (frameNumber == this.maxUnlabeledFrameNumber) {
        this.maxUnlabeledFrameNumber = this.findPreviousUnlabeledFrameNumber(frameNumber - 1)
      }
    }
    this.unlabeledFrameCountSpan.textContent = String(this.unlabeledFrameCount);
  }
};

fmltc.LabelVideo.prototype.retrieveVideoFrameImage = function(frameNumber, imageUrl, failureCount) {
  const xhr = new XMLHttpRequest();
  // Normally the imageUrl is the URL to download the image from cloud storage. If it's missing we
  // will request the image from the server.
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

      if (this.loadingProgress.value == this.loadingProgress.max) {
        const elapsedTime = Date.now() - this.startTime;
        console.log('Loading all frames took ' + elapsedTime + ' ms');
      }

      if (frameNumber == this.currentFrameNumber) {
        this.updateVideoFrameImg();
        this.redrawBboxes(true);
      }

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Error occurred when retrieving the image for frame ' + frameNumber + '.\n' +
            'xhr.status is ' + xhr.status + '.\n' +
            'Will retry ' + imageUrl + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveVideoFrameImage.bind(this, frameNumber, imageUrl, failureCount), delay * 1000);
      } else {
        this.loadFailure();
      }
    }

    this.updateUI(true);
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

fmltc.LabelVideo.prototype.isIgnored = function(includeFrameInDataset) {
  return !includeFrameInDataset;
};

fmltc.LabelVideo.prototype.isUnlabeled = function(bboxesText) {
  return bboxesText == '';
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
    this.labelingAreaSavingMessageDiv.textContent = '';
    return bboxesText;
  }

  this.labelingAreaSavingMessageDiv.style.color = '#0d6efd';
  this.labelingAreaSavingMessageDiv.textContent = ''; // 'Saving...';

  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&frame_number=' + encodeURIComponent(this.currentFrameNumber) +
      '&bboxes_text=' + encodeURIComponent(bboxesText);
  xhr.open('POST', '/storeVideoFrameBboxesText', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_storeVideoFrameBboxesText_onreadystatechange.bind(this, xhr, params,
      this.currentFrameNumber, previousBboxesText, bboxesText);
  xhr.send(params);
  return bboxesText;
};

fmltc.LabelVideo.prototype.xhr_storeVideoFrameBboxesText_onreadystatechange = function(xhr, params,
    frameNumber, previousBboxesText, bboxesText) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      this.labelingAreaSavingMessageDiv.textContent = '';
      const ignoreFrame = this.isIgnored(this.videoFrameEntity[frameNumber].include_frame_in_dataset);
      const previousUnlabeledFrame = this.isUnlabeled(previousBboxesText);
      const unlabeledFrame = this.isUnlabeled(bboxesText);
      this.updateFrameCounts(frameNumber, ignoreFrame, ignoreFrame,
          previousUnlabeledFrame, unlabeledFrame);
      this.videoFrameEntity[frameNumber].bboxes_text = bboxesText;

    } else {
      this.labelingAreaSavingMessageDiv.style.color = 'red';
      this.labelingAreaSavingMessageDiv.textContent = 'Saving failed.';

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

  this.ignoreFrameCheckbox.checked =
      !this.videoFrameEntity[this.currentFrameNumber].include_frame_in_dataset;

  const fields = ['x1', 'y1', 'x2', 'y2', 'label'];
  const types = ['number', 'number', 'number', 'number', 'text'];
  const widths = ['7ch', '7ch', '7ch', '7ch', '113px'];

  let lastLabelInput = null;
  for (let i = 0; i < this.bboxes[this.currentFrameNumber].length; i++) {
    const box = this.bboxes[this.currentFrameNumber][i];
    const tr = this.labelingAreaTable.insertRow(-1);
    for (let f = 0; f < fields.length; f++) {
      const field = fields[f];
      const td = this.util.insertCellWithClass(tr, 'cellWithBorderLeftPadding');
      const input = document.createElement('input');
      this.util.addClass(input, 'inputWithoutBorder');
      this.util.addClass(input, 'text-16');
      if (types[f] == 'number') {
        this.util.addClass(input, 'rightText');
      }
      input.setAttribute('type', types[f]);
      input.style.width = widths[f];
      input.value = box[field];
      input.oninput = this.bboxFieldInput_oninput.bind(this, i, input, field);
      td.appendChild(input);
      lastLabelInput = input
    }
    td = this.util.insertCellWithClass(tr, 'cellWithBorderLeftPadding');
    const deleteButton = document.createElement('button');
    this.util.addClass(deleteButton, 'material-icons');
    this.util.addClass(deleteButton, 'text-16');
    this.util.addClass(deleteButton, 'buttonWithoutBorder');
    deleteButton.textContent = 'delete';
    deleteButton.title = 'Delete this box';
    deleteButton.onclick = this.deleteButton_onclick.bind(this, tr);
    td.appendChild(deleteButton);
  }

  if (optLastLabelInputFocus && lastLabelInput) {
    lastLabelInput.focus();
  }
};

fmltc.LabelVideo.prototype.removeEventHandlers = function(element) {
  if (element.nodeName == 'INPUT') {
    element.oninput = null;
  } else if (element.nodeName == 'BUTTON') {
    element.onclick = null;
  }
  for (let i = 0; i < element.childNodes.length; i++) {
    this.removeEventHandlers(element.childNodes[i]);
  }
};

fmltc.LabelVideo.prototype.bboxFieldInput_oninput = function(i, input, field) {
  if (i < this.bboxes[this.currentFrameNumber].length) {
    const box = this.bboxes[this.currentFrameNumber][i];
    box[field] = input.value;
    this.redrawBboxes(true);
    this.saveBboxes();
  }
  this.updateUI(true);
};

fmltc.LabelVideo.prototype.deleteButton_onclick = function(tr) {
  const i = tr.rowIndex - 1;
  if (i < this.bboxes[this.currentFrameNumber].length) {
    this.bboxes[this.currentFrameNumber].splice(i, 1);
    this.refillLabelingArea();
    this.redrawBboxes(true);
    this.updateUI(true);
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
  this.refillLabelingArea();
  this.redrawBboxes(true);
  this.updateUI(true);
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

fmltc.LabelVideo.prototype.ignoreFrameCheckbox_onclick = function() {
  if (this.videoFrameEntity[this.currentFrameNumber] == undefined) {
    return;
  }
  const previousIgnoreFrame = this.isIgnored(this.videoFrameEntity[this.currentFrameNumber].include_frame_in_dataset);
  const ignoreFrame = this.ignoreFrameCheckbox.checked;
  if (ignoreFrame == previousIgnoreFrame) {
    // Don't save them if they haven't changed.
    this.ignoreFrameSavingMessageSpan.textContent = '';
    return;
  }

  this.ignoreFrameSavingMessageSpan.style.color = '#0d6efd';
  this.ignoreFrameSavingMessageSpan.textContent = ''; // 'Saving...';

  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&frame_number=' + encodeURIComponent(this.currentFrameNumber) +
      '&include_frame_in_dataset=' + encodeURIComponent(!ignoreFrame);
  xhr.open('POST', '/storeVideoFrameIncludeInDataset', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_storeVideoFrameIncludeInDataset_onreadystatechange.bind(this, xhr, params,
      this.currentFrameNumber, previousIgnoreFrame, ignoreFrame);
  xhr.send(params);
};

fmltc.LabelVideo.prototype.xhr_storeVideoFrameIncludeInDataset_onreadystatechange = function(xhr, params,
    frameNumber, previousIgnoreFrame, ignoreFrame) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      this.ignoreFrameSavingMessageSpan.textContent = '';
      const unlabeledFrame = this.isUnlabeled(this.videoFrameEntity[frameNumber].bboxes_text);
      this.updateFrameCounts(frameNumber, previousIgnoreFrame, ignoreFrame,
          unlabeledFrame, unlabeledFrame);
      this.videoFrameEntity[frameNumber].include_frame_in_dataset = !ignoreFrame;

    } else {
      this.ignoreFrameSavingMessageSpan.style.color = 'red';
      this.ignoreFrameSavingMessageSpan.textContent = 'Saving failed.';

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

fmltc.LabelVideo.prototype.previousIgnoredFrameButton_onclick = function() {
  const i = this.findPreviousIgnoredFrameNumber(this.currentFrameNumber - 1);
  if (i >= 0) {
    this.goToFrame(i);
  }
};

fmltc.LabelVideo.prototype.findPreviousIgnoredFrameNumber = function(start) {
  for (let i = start; i >= 0; i--) {
    if (this.isIgnored(this.videoFrameEntity[i].include_frame_in_dataset)) {
      return i;
    }
  }
  return -1;
};

fmltc.LabelVideo.prototype.nextIgnoredFrameButton_onclick = function() {
  const i = this.findNextIgnoredFrameNumber(this.currentFrameNumber + 1);
  if (i < this.videoEntity.frame_count) {
    this.goToFrame(i);
  }
};

fmltc.LabelVideo.prototype.findNextIgnoredFrameNumber = function(start) {
  for (let i = start; i < this.videoEntity.frame_count; i++) {
    if (this.isIgnored(this.videoFrameEntity[i].include_frame_in_dataset)) {
      return i;
    }
  }
  return this.videoEntity.frame_count;
};

fmltc.LabelVideo.prototype.previousUnlabeledFrameButton_onclick = function() {
  const i = this.findPreviousUnlabeledFrameNumber(this.currentFrameNumber - 1);
  if (i >= 0) {
    this.goToFrame(i);
  }
};

fmltc.LabelVideo.prototype.findPreviousUnlabeledFrameNumber = function(start) {
  for (let i = start; i >= 0; i--) {
    if (this.isUnlabeled(this.videoFrameEntity[i].bboxes_text)) {
      return i;
    }
  }
  return -1;
};

fmltc.LabelVideo.prototype.nextUnlabeledFrameButton_onclick = function() {
  const i = this.findNextUnlabeledFrameNumber(this.currentFrameNumber + 1);
  if (i < this.videoEntity.frame_count) {
    this.goToFrame(i);
  }
};

fmltc.LabelVideo.prototype.findNextUnlabeledFrameNumber = function(start) {
  for (let i = start; i < this.videoEntity.frame_count; i++) {
    if (this.isUnlabeled(this.videoFrameEntity[i].bboxes_text)) {
      return i;
    }
  }
  return this.videoEntity.frame_count;
};

fmltc.LabelVideo.prototype.reversePlayPauseButton_onclick = function() {
  this.saveBboxes();

  this.playing = !this.playing;
  this.reversePlayPauseButton.textContent = (this.playing) ? 'pause' : 'play_arrow';
  this.updateUI(true);

  if (this.playing) {
    this.playingDirection = -1;
    this.playingIntervalMs = Math.round(1000 / this.playbackSpeedRangeInput.value);
    this.advanceFrame();
  }
};

fmltc.LabelVideo.prototype.forwardPlayPauseButton_onclick = function() {
  this.saveBboxes();

  this.playing = !this.playing;
  this.forwardPlayPauseButton.textContent = (this.playing) ? 'pause' : 'play_arrow';
  this.updateUI(true);

  if (this.playing) {
    this.playingDirection = 1;
    this.playingIntervalMs = Math.round(1000 / this.playbackSpeedRangeInput.value);
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
        this.reversePlayPauseButton.textContent = 'play_arrow';
        this.forwardPlayPauseButton.textContent = 'play_arrow';
        this.updateUI(true);
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
    if (this.bboxes[this.currentFrameNumber].length >= this.util.limitData.MAX_BOUNDING_BOX_PER_FRAME) {
      return;
    }
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
      if (this.bboxes[this.currentFrameNumber].length >= 10) {
        this.bboxCanvas.style.cursor = 'default';
      } else {
        this.bboxCanvas.style.cursor = 'crosshair';
      }
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
    this.redrawBboxes(true);

  } else if (this.resizingBbox) {
    // Erase the previous temporary box.
    this.bboxCanvasCtx.globalCompositeOperation = 'destination-out';
    this.resizingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);
    this.bboxCanvasCtx.globalCompositeOperation = 'source-over';
    // Abort the resize.
    this.resizingBbox = null;
    this.redrawBboxes(true);
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
    this.updateUI(true);
    // Stop defining.
    this.definingBbox = null;
    this.refillLabelingArea(true);
    this.redrawBboxes(true);
    this.saveBboxes();

  } else if (this.resizingBbox) {
    // Erase the previous temporary box.
    this.bboxCanvasCtx.globalCompositeOperation = 'destination-out';
    this.resizingBbox.draw(this.bboxCanvasCtx, this.canvasScale, false);
    this.bboxCanvasCtx.globalCompositeOperation = 'source-over';
    // Save the resized box.
    this.bboxes[this.currentFrameNumber][this.resizingBboxIndex].setXYFromAnotherBox(this.resizingBbox);
    // Stop resizing
    this.resizingBbox = null;
    this.refillLabelingArea();
    this.redrawBboxes(true);
    this.saveBboxes();
  }
};


fmltc.LabelVideo.prototype.trackingScaleInput_onchange = function() {
  this.trackingScaleInput.value = Math.max(this.trackingScaleInput.min, Math.min(this.trackingScaleInput.value, this.trackingScaleInput.max));
};


fmltc.LabelVideo.prototype.trackingStartButton_onclick = function() {
  this.trackingMessageDiv.textContent = 'Preparing to start tracking. Please be patient.';
  this.trackingInProgress = true;
  this.trackingPaused = false;
  this.trackingWaitingForBboxes = true;
  this.trackingInitFrameNumber = this.currentFrameNumber;
  this.trackingFinalFrameNumber = this.videoEntity.frame_count - 1;
  this.util.setWaitCursor();
  this.updateUI(false);

  const bboxesText = this.saveBboxes();
  const trackingScale = Math.max(this.trackingScaleInput.min, Math.min(this.trackingScaleInput.value, this.trackingScaleInput.max));

  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&init_frame_number=' + encodeURIComponent(this.currentFrameNumber) +
      '&init_bboxes_text=' + encodeURIComponent(bboxesText) +
      '&tracker_name=' + encodeURIComponent(this.trackerSelect.options[this.trackerSelect.selectedIndex].value) +
      '&scale=' + encodeURIComponent(trackingScale);
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
      if (response.tracker_uuid) {
        this.trackerUuid = response.tracker_uuid;
        setTimeout(this.retrieveTrackedBboxes.bind(this, initFrameNumber + 1, 0), 1000);
        setTimeout(this.trackingClientStillAlive.bind(this), 30 * 1000);

      } else {
        // Show response.message to the user.
        this.trackingMessageDiv.textContent = response.message;
        this.util.clearWaitCursor();
        this.trackingInProgress = false;
        this.trackingPaused = false;
        this.trackingWaitingForBboxes = false;
        this.updateUI(false);
      }

    } else {
      // TODO(lizlooney): handle error properly.
      console.log('Failure! /prepareToStartTracking?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.util.clearWaitCursor();
      this.trackingInProgress = false;
      this.trackingPaused = false;
      this.trackingWaitingForBboxes = false;
      this.trackingMessageDiv.textContent = 'Unable to start tracking.';
      this.updateUI(false);
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

fmltc.LabelVideo.prototype.retrieveTrackedBboxes = function(frameNumber, failureCount) {
  const xhr = new XMLHttpRequest();
  const params =
      'video_uuid=' + encodeURIComponent(this.videoUuid) +
      '&tracker_uuid=' + encodeURIComponent(this.trackerUuid) +
      '&retrieve_frame_number=' + encodeURIComponent(frameNumber);
  xhr.open('POST', '/retrieveTrackedBboxes', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveTrackedBboxes_onreadystatechange.bind(this, xhr, params,
      frameNumber, failureCount);
  xhr.send(params);
  this.trackingRequestSent();
};

fmltc.LabelVideo.prototype.xhr_retrieveTrackedBboxes_onreadystatechange = function(xhr, params,
    frameNumber, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.tracker_failed) {
        this.util.clearWaitCursor();
        this.trackingInProgress = false;
        this.trackingPaused = false;
        this.trackingWaitingForBboxes = false;
        // Restart tracking.
        alert('Tracker failed. It will be restarted after you dismiss this alert.')
        setTimeout(this.trackingStartButton_onclick.bind(this), 1000);

      } else if (response.frame_number == frameNumber) {
        const bboxesText = response.bboxes_text;
        const previousUnlabeledFrame = this.isUnlabeled(this.videoFrameEntity[frameNumber].bboxes_text);
        const unlabeledFrame = this.isUnlabeled(bboxesText);
        const ignoreFrame = !this.videoFrameEntity[frameNumber].include_frame_in_dataset;
        this.updateFrameCounts(frameNumber, ignoreFrame, ignoreFrame,
            previousUnlabeledFrame, unlabeledFrame);
        this.videoFrameEntity[frameNumber].bboxes_text = bboxesText;
        this.bboxes[frameNumber] = this.convertTextToBboxes(this.videoFrameEntity[frameNumber].bboxes_text);

        this.trackingWaitingForBboxes = false;
        if (frameNumber == this.trackingInitFrameNumber + 1) {
          this.util.clearWaitCursor();
        }
        this.goToFrame(frameNumber);

        if (this.trackingPaused) {
          this.trackingMessageDiv.textContent = 'Paused.';
        } else {
          this.trackingMessageDiv.textContent =
              'Frame ' + (frameNumber + 1) + ' boxes updated by tracker.';
          this.sendContinueTracking(0);
        }

      } else {
        // The tracked bboxes are not ready yet. Try again in a moment.
        setTimeout(this.retrieveTrackedBboxes.bind(this, frameNumber, 0), 100);
      }

    } else {
      failureCount++;
      if (failureCount < 2) {
        const delay = Math.pow(2, failureCount);
        setTimeout(this.retrieveTrackedBboxes.bind(this, frameNumber, failureCount), delay * 1000);
      } else {
        this.util.clearWaitCursor();
        this.trackingInProgress = false;
        this.trackingPaused = false;
        this.trackingWaitingForBboxes = false;
        this.trackingMessageDiv.textContent = 'Tracking has stopped unexpectedly.';
      }
    }
    this.updateUI(false);
  }
};

fmltc.LabelVideo.prototype.trackingPauseButton_onclick = function() {
  this.trackingMessageDiv.textContent = 'Pausing...';
  this.trackingPaused = true;
  this.updateUI(false);
};

fmltc.LabelVideo.prototype.trackingContinueButton_onclick = function() {
  this.trackingMessageDiv.textContent = 'Continuing...';
  this.trackingPaused = false;
  this.sendContinueTracking(0);
};

fmltc.LabelVideo.prototype.sendContinueTracking = function(failureCount) {
  this.trackingWaitingForBboxes = true;
  this.updateUI(false);

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
        retrieveFrameNumber, 0);
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
      this.trackingInProgress = false;
      this.trackingPaused = false;
      this.trackingWaitingForBboxes = false;
      this.trackingMessageDiv.textContent = 'Tracking has finished.';
      this.updateUI(false);

    } else {
      failureCount++;
      if (failureCount < 2) {
        const delay = Math.pow(2, failureCount);
        setTimeout(this.sendContinueTracking.bind(this, failureCount), delay * 1000);
      }
    }
  }
};

fmltc.LabelVideo.prototype.trackingStopButton_onclick = function() {
  this.trackingMessageDiv.textContent = 'Stopping...';

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
      this.trackingMessageDiv.textContent = 'Stopped.';
      this.updateUI(false);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /stopTracking?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};
