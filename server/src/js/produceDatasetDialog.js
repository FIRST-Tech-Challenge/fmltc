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
 * @fileoverview The class for a dialog that produces a dataset.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.ProduceDatasetDialog');

goog.require('fmltc.Util');

/**
 * Class for a dialog that produces a dataset.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.ProduceDatasetDialog = function(util, videoUuids, totalFrameCount, onDatasetProduced) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.videoUuids = videoUuids;
  this.totalFrameCount = totalFrameCount;
  this.onDatasetProduced = onDatasetProduced;
  this.dialog = document.getElementById('produceDatasetDialog');
  this.xButton = document.getElementById('pdXButton');
  this.closeButton = document.getElementById('pdCloseButton');
  this.descriptionInput = document.getElementById('pdDescriptionInput');
  this.trainPercentInput = document.getElementById('pdTrainPercentInput');
  this.evalPercentInput = document.getElementById('pdEvalPercentInput');
  this.startButton = document.getElementById('pdStartButton');
  this.stateDiv = document.getElementById('pdStateDiv');
  this.progressDiv = document.getElementById('pdProgressDiv');
  this.progress = document.getElementById('pdProgress');
  this.progressSpan = document.getElementById('pdProgressSpan');
  this.finishedDiv = document.getElementById('pdFinishedDiv');
  // Bootstrap modal backdrop
  this.backdrop = document.getElementsByClassName('modal-backdrop')[0];

  this.startDatasetInProgress = false;

  this.xButton.disabled = this.closeButton.disabled = false;
  this.descriptionInput.disabled = false;
  this.trainPercentInput.disabled = false;
  this.evalPercentInput.disabled = false;

  // Pick percent values so that (by default) there aren't more than 100 eval images.
  if (totalFrameCount * 0.2 < 100) {
    this.trainPercentInput.value = 80;
  } else if (totalFrameCount * 0.1 < 100) {
    this.trainPercentInput.value = 90;
  } else {
    this.trainPercentInput.value = Math.min(99, Math.ceil(100 - 10000 / totalFrameCount));
  }
  this.evalPercentInput.value = 100 - this.trainPercentInput.value;
  this.descriptionInput.value = '';

  this.progressStartValue = 0.10 * this.totalFrameCount;
  this.progressMaxValue = this.totalFrameCount + this.progressStartValue;

  this.updateStartButton();
  this.stateDiv.innerHTML = '&nbsp;';
  this.progressDiv.style.visibility = 'hidden';
  this.finishedDiv.style.display = 'none';

  this.xButton.onclick = this.closeButton.onclick = this.closeButton_onclick.bind(this);
  this.trainPercentInput.onchange = this.trainPercentInput_onchange.bind(this);
  this.evalPercentInput.onchange = this.evalPercentInput_onchange.bind(this);
  this.descriptionInput.oninput = this.descriptionInput_oninput.bind(this);
  this.startButton.onclick = this.startButton_onclick.bind(this);
  this.dialog.style.display = 'block';
};

fmltc.ProduceDatasetDialog.prototype.closeButton_onclick = function() {
  // Clear event handlers.
  this.xButton.onclick = this.closeButton.onclick = null;
  this.descriptionInput.oninput = null;
  this.trainPercentInput.onchange = null;
  this.evalPercentInput.onchange = null;
  this.startButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
  this.backdrop.style.display = 'none';
};

fmltc.ProduceDatasetDialog.prototype.descriptionInput_oninput = function() {
  this.updateStartButton();
  this.stateDiv.innerHTML = '&nbsp;';
};

fmltc.ProduceDatasetDialog.prototype.updateStartButton = function() {
  this.startButton.disabled = (
      this.startDatasetInProgress ||
      Number(this.trainPercentInput.value) < Number(this.trainPercentInput.min) ||
      Number(this.trainPercentInput.value) > Number(this.trainPercentInput.max) ||
      Number(this.evalPercentInput.value) < Number(this.evalPercentInput.min) ||
      Number(this.evalPercentInput.value) > Number(this.evalPercentInput.max) ||
      this.descriptionInput.value.length == 0 ||
      this.descriptionInput.value.length > this.util.limitData['MAX_DESCRIPTION_LENGTH']);
};

fmltc.ProduceDatasetDialog.prototype.trainPercentInput_onchange = function() {
  this.trainPercentInput.value = Math.max(this.trainPercentInput.min, Math.min(this.trainPercentInput.value, this.trainPercentInput.max));
  this.evalPercentInput.value = 100 - this.trainPercentInput.value;
  this.updateStartButton();
  this.stateDiv.innerHTML = '&nbsp;';
};

fmltc.ProduceDatasetDialog.prototype.evalPercentInput_onchange = function() {
  this.evalPercentInput.value = Math.max(this.evalPercentInput.min, Math.min(this.evalPercentInput.value, this.evalPercentInput.max));
  this.trainPercentInput.value = 100 - this.evalPercentInput.value;
  this.updateStartButton();
  this.stateDiv.innerHTML = '&nbsp;';
};

fmltc.ProduceDatasetDialog.prototype.startButton_onclick = function() {
  this.xButton.disabled = this.closeButton.disabled = true;
  this.descriptionInput.disabled = true;
  this.trainPercentInput.disabled = true;
  this.evalPercentInput.disabled = true;

  this.startDatasetInProgress = true;
  this.updateStartButton();
  this.stateDiv.innerHTML = '&nbsp;';

  const videoUuidsJson = JSON.stringify(this.videoUuids);

  const xhr = new XMLHttpRequest();
  const params =
      'description=' + encodeURIComponent(this.descriptionInput.value) +
      '&video_uuids=' + encodeURIComponent(videoUuidsJson) +
      '&eval_percent=' + this.evalPercentInput.value +
      '&create_time_ms=' + Date.now();
  xhr.open('POST', '/prepareToStartDatasetProduction', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToStartDatasetProduction_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.ProduceDatasetDialog.prototype.makeProgressLabel = function(framesWritten) {
    return ' Video frames processed: ' + framesWritten + ' of ' + this.totalFrameCount;
};

fmltc.ProduceDatasetDialog.prototype.xhr_prepareToStartDatasetProduction_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.dataset_uuid) {
        this.progress.value = this.progressStartValue;
        this.progress.max = this.progressMaxValue;
        this.progressSpan.textContent = this.makeProgressLabel(0);
        this.progressDiv.style.visibility = 'visible';
        setTimeout(this.retrieveDatasetEntity.bind(this, response.dataset_uuid, 0), 1000);
      } else {
        // Show the message to the user.
        this.stateDiv.textContent = response.message;

        this.xButton.disabled = this.closeButton.disabled = false;
        this.descriptionInput.disabled = false;
        this.trainPercentInput.disabled = false;
        this.evalPercentInput.disabled = false;

        this.startDatasetInProgress = false;
        this.updateStartButton();
      }

    } else {
      this.stateDiv.textContent =
          'Unable to produce the dataset at this time. Please wait a few minutes and try again.';

      this.xButton.disabled = this.closeButton.disabled = false;
      this.descriptionInput.disabled = false;
      this.trainPercentInput.disabled = false;
      this.evalPercentInput.disabled = false;

      this.startDatasetInProgress = false;
      this.updateStartButton();
    }
  }
};

fmltc.ProduceDatasetDialog.prototype.retrieveDatasetEntity = function(datasetUuid, failureCount) {
  const xhr = new XMLHttpRequest();
  const params = 'dataset_uuid=' + encodeURIComponent(datasetUuid);
  xhr.open('POST', '/retrieveDatasetEntity', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveDatasetEntity_onreadystatechange.bind(this, xhr, params,
      datasetUuid, failureCount);
  xhr.send(params);
};

fmltc.ProduceDatasetDialog.prototype.xhr_retrieveDatasetEntity_onreadystatechange = function(xhr, params,
    datasetUuid, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const datasetEntity = response.dataset_entity;

      if (datasetEntity.dataset_completed) {
        this.startDatasetInProgress = false;
        this.startButton.onclick = null;
        this.updateStartButton();
        this.progress.value = this.progress.max;
        this.progressDiv.style.visibility = 'hidden';
        this.finishedDiv.style.display = 'block';

        this.xButton.disabled = this.closeButton.disabled = false;
        this.descriptionInput.disabled = false;
        this.trainPercentInput.disabled = false;
        this.evalPercentInput.disabled = false;

        this.onDatasetProduced(datasetEntity);
        setTimeout(this.closeButton_onclick.bind(this), 1000);

      } else {
        this.progress.value = this.progressStartValue + response.frames_written;
        this.progressSpan.textContent = this.makeProgressLabel(response.frames_written);

        setTimeout(this.retrieveDatasetEntity.bind(this, datasetUuid, 0), 2000);
      }
    } else {
      failureCount++;
      if (failureCount < 2) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveDatasetEntity?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveDatasetEntity.bind(this, datasetUuid, failureCount), delay * 1000);
      } else {
        console.log('Unable to retrieve dataset entity.');
      }
    }
  }
};
