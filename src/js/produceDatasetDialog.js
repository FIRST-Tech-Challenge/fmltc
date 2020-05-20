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
 * Class for a dialog that uploads a video file.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.ProduceDatasetDialog = function(util, videoUuids, onDatasetProduced) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.videoUuids = videoUuids;
  this.onDatasetProduced = onDatasetProduced;
  this.dialog = document.getElementById('produceDatasetDialog');
  this.dismissButton = document.getElementById('pdDismissButton');
  this.trainPercentInput = document.getElementById('pdTrainPercentInput');
  this.evalPercentInput = document.getElementById('pdEvalPercentInput');
  this.startButton = document.getElementById('pdStartButton');
  this.pdInProgressDiv = document.getElementById('pdInProgressDiv');
  this.pdFinishedDiv = document.getElementById('pdFinishedDiv');
  this.pdFailedDiv = document.getElementById('pdFailedDiv');

  this.datasetInProgress = false;

  this.trainPercentInput.value = 80;
  this.evalPercentInput.value = 100 - this.trainPercentInput.value;
  this.updateStartButton();
  this.pdInProgressDiv.style.visibility = 'hidden';
  this.pdFinishedDiv.style.visibility = 'hidden';
  this.pdFailedDiv.style.visibility = 'hidden';

  this.dismissButton.onclick = this.dismissButton_onclick.bind(this);
  this.trainPercentInput.onchange = this.trainPercentInput_onchange.bind(this);
  this.evalPercentInput.onchange = this.evalPercentInput_onchange.bind(this);
  this.startButton.onclick = this.startButton_onclick.bind(this);
  this.dialog.style.display = 'block';
};

fmltc.ProduceDatasetDialog.prototype.dismissButton_onclick = function() {
  // Clear event handlers.
  this.dismissButton.onclick = null;
  this.trainPercentInput.onchange = null;
  this.evalPercentInput.onchange = null;
  this.startButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
};

fmltc.ProduceDatasetDialog.prototype.updateStartButton = function() {
  this.startButton.disabled = (this.datasetInProgress ||
      this.evalPercentInput.value < 0 ||
      this.evalPercentInput.value > 100);
};

fmltc.ProduceDatasetDialog.prototype.trainPercentInput_onchange = function() {
  this.evalPercentInput.value = 100 - this.trainPercentInput.value;
  this.updateStartButton();
};

fmltc.ProduceDatasetDialog.prototype.evalPercentInput_onchange = function() {
  this.trainPercentInput.value = 100 - this.evalPercentInput.value;
  this.updateStartButton();
};

fmltc.ProduceDatasetDialog.prototype.startButton_onclick = function() {
  this.pdInProgressDiv.style.visibility = 'visible';

  this.datasetInProgress = true;
  this.updateStartButton();

  const videoUuidsJson = JSON.stringify(this.videoUuids);

  const xhr = new XMLHttpRequest();
  const params =
      'video_uuids=' + encodeURIComponent(videoUuidsJson) +
      '&eval_percent=' + this.evalPercentInput.value +
      '&start_time_ms=' + Date.now();
  xhr.open('POST', '/prepareToStartDatasetProduction', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToStartDatasetProduction_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.ProduceDatasetDialog.prototype.xhr_prepareToStartDatasetProduction_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.util.callHttpPerformAction(response.action_parameters, 0);
      const datasetUuid = response.dataset_uuid;
      setTimeout(this.retrieveDatasetEntity.bind(this, datasetUuid), 20000);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /prepareToStartDatasetProduction?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.datasetInProgress = false;
      this.updateStartButton();
      this.pdInProgressDiv.style.visibility = 'hidden';
      this.pdFailedDiv.style.visibility = 'visible';
    }
  }
};

fmltc.ProduceDatasetDialog.prototype.retrieveDatasetEntity = function(datasetUuid) {
  const xhr = new XMLHttpRequest();
  const params = 'dataset_uuid=' + encodeURIComponent(datasetUuid);
  xhr.open('POST', '/retrieveDataset', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveDataset_onreadystatechange.bind(this, xhr, params,
      datasetUuid);
  xhr.send(params);
};

fmltc.ProduceDatasetDialog.prototype.xhr_retrieveDataset_onreadystatechange = function(xhr, params,
    datasetUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const datasetEntity = response.dataset_entity;

      if (datasetEntity.dataset_completed) {
        this.datasetInProgress = false;
        this.updateStartButton();
        this.pdInProgressDiv.style.visibility = 'hidden';
        this.pdFinishedDiv.style.visibility = 'visible';
        this.onDatasetProduced(datasetEntity);
        setTimeout(this.dismissButton_onclick.bind(this), 1000);

      } else {
        setTimeout(this.retrieveDatasetEntity.bind(this, datasetUuid), 1000);
      }
    } else {
      // TODO(lizlooney): handle error properly. Currently we try again in 3 seconds, but that
      // might not be the best idea.
      console.log('Failure! /retrieveDataset?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Will retry /retrieveDataset?' + params + ' in 3 seconds.');
      setTimeout(this.retrieveDatasetEntity.bind(this, datasetUuid), 3000);
    }
  }
};
