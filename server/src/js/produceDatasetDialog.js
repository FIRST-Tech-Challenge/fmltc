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
  this.dismissButton = document.getElementById('pdDismissButton');
  this.descriptionInput = document.getElementById('pdDescriptionInput');
  this.trainPercentInput = document.getElementById('pdTrainPercentInput');
  this.evalPercentInput = document.getElementById('pdEvalPercentInput');
  this.startButton = document.getElementById('pdStartButton');
  this.progressDiv = document.getElementById('pdProgressDiv');
  this.progress = document.getElementById('pdProgress');
  this.progressSpan = document.getElementById('pdProgressSpan');
  this.finishedDiv = document.getElementById('pdFinishedDiv');
  this.failedDiv = document.getElementById('pdFailedDiv');
  // Bootstrap modal backdrop
  this.backdrop = document.getElementsByClassName('modal-backdrop')[0];

  this.startDatasetInProgress = false;

  this.dismissButton.disabled = false;
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
  this.progressDiv.style.visibility = 'hidden';
  this.finishedDiv.style.display = 'none';
  this.failedDiv.style.display = 'none';

  this.dismissButton.onclick = this.dismissButton_onclick.bind(this);
  this.trainPercentInput.onchange = this.trainPercentInput_onchange.bind(this);
  this.evalPercentInput.onchange = this.evalPercentInput_onchange.bind(this);
  this.descriptionInput.oninput = this.descriptionInput_oninput.bind(this);
  this.startButton.onclick = this.startButton_onclick.bind(this);
  this.dialog.style.display = 'block';
};

fmltc.ProduceDatasetDialog.prototype.dismissButton_onclick = function() {
  // Clear event handlers.
  this.dismissButton.onclick = null;
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
};

fmltc.ProduceDatasetDialog.prototype.updateStartButton = function() {
  this.startButton.disabled = (
      this.startDatasetInProgress ||
      Number(this.trainPercentInput.value) < Number(this.trainPercentInput.min) ||
      Number(this.trainPercentInput.value) > Number(this.trainPercentInput.max) ||
      Number(this.evalPercentInput.value) < Number(this.evalPercentInput.min) ||
      Number(this.evalPercentInput.value) > Number(this.evalPercentInput.max) ||
      this.descriptionInput.value.length == 0 ||
      this.descriptionInput.value.length > 30);
};

fmltc.ProduceDatasetDialog.prototype.trainPercentInput_onchange = function() {
  this.trainPercentInput.value = Math.max(this.trainPercentInput.min, Math.min(this.trainPercentInput.value, this.trainPercentInput.max));
  this.evalPercentInput.value = 100 - this.trainPercentInput.value;
  this.updateStartButton();
};

fmltc.ProduceDatasetDialog.prototype.evalPercentInput_onchange = function() {
  this.evalPercentInput.value = Math.max(this.evalPercentInput.min, Math.min(this.evalPercentInput.value, this.evalPercentInput.max));
  this.trainPercentInput.value = 100 - this.evalPercentInput.value;
  this.updateStartButton();
};

fmltc.ProduceDatasetDialog.prototype.startButton_onclick = function() {
  this.dismissButton.disabled = true;
  this.descriptionInput.disabled = true;
  this.trainPercentInput.disabled = true;
  this.evalPercentInput.disabled = true;

  this.progress.value = this.progressStartValue;
  this.progress.max = this.progressMaxValue;
  this.progressSpan.textContent = this.makeProgressLabel(0);
  this.progressDiv.style.visibility = 'visible';

  this.startDatasetInProgress = true;
  this.updateStartButton();

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
      setTimeout(this.retrieveDatasetEntity.bind(this, response.dataset_uuid), 1000);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /prepareToStartDatasetProduction?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.startDatasetInProgress = false;
      this.updateStartButton();
      this.progressDiv.style.visibility = 'hidden';
      this.failedDiv.style.display = 'block';
    }
  }
};

fmltc.ProduceDatasetDialog.prototype.retrieveDatasetEntity = function(datasetUuid) {
  const xhr = new XMLHttpRequest();
  const params = 'dataset_uuid=' + encodeURIComponent(datasetUuid);
  xhr.open('POST', '/retrieveDatasetEntity', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveDatasetEntity_onreadystatechange.bind(this, xhr, params,
      datasetUuid);
  xhr.send(params);
};

fmltc.ProduceDatasetDialog.prototype.xhr_retrieveDatasetEntity_onreadystatechange = function(xhr, params,
    datasetUuid) {
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

        this.dismissButton.disabled = false;
        this.descriptionInput.disabled = false;
        this.trainPercentInput.disabled = false;
        this.evalPercentInput.disabled = false;

        this.onDatasetProduced(datasetEntity);
        setTimeout(this.dismissButton_onclick.bind(this), 1000);

      } else {
        this.progress.value = this.progressStartValue + response.frames_written;
        this.progressSpan.textContent = this.makeProgressLabel(response.frames_written);

        setTimeout(this.retrieveDatasetEntity.bind(this, datasetUuid), 2000);
      }
    } else {
      // TODO(lizlooney): handle error properly. Currently we try again in 5 seconds, but that
      // might not be the best idea.
      console.log('Failure! /retrieveDatasetEntity?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Will retry /retrieveDatasetEntity?' + params + ' in 5 seconds.');
      setTimeout(this.retrieveDatasetEntity.bind(this, datasetUuid), 5000);
    }
  }
};
