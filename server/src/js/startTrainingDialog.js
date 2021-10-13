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
 * @fileoverview The class for a dialog that starts training.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.StartTrainingDialog');

goog.require('fmltc.Util');

/**
 * Class for a dialog that starts training.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.StartTrainingDialog = function(
    util, totalTrainingMinutes, remainingTrainingMinutes, datasetUuids, onTrainingStarted) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.datasetUuids = datasetUuids;

  this.onTrainingStarted = onTrainingStarted;
  this.dialog = document.getElementById('startTrainingDialog');
  this.backdrop = document.getElementsByClassName('modal-backdrop')[0];
  this.xButton = document.getElementById('stXButton');
  this.closeButton = document.getElementById('stCloseButton');
  this.maxRunningMinutesInput = document.getElementById('stMaxRunningMinutesInput');
  this.totalTrainingMinutesSpan = document.getElementById('stTotalTrainingMinutesSpan');
  this.remainingTrainingMinutesSpan = document.getElementById('stRemainingTrainingMinutesSpan');
  this.startingModelSelect = document.getElementById('stStartingModelSelect');
  this.numTrainingStepsInput = document.getElementById('stNumTrainingStepsInput');
  this.descriptionInput = document.getElementById('stDescriptionInput');
  this.startButton = document.getElementById('stStartButton');
  this.inProgressDiv = document.getElementById('stInProgressDiv');
  this.successDiv = document.getElementById('stSuccessDiv');
  this.failedDiv = document.getElementById('stFailedDiv');

  this.startTrainingInProgress = false;

  this.maxRunningMinutesInput.min = Math.min(10, remainingTrainingMinutes);
  this.maxRunningMinutesInput.max = remainingTrainingMinutes;
  this.maxRunningMinutesInput.value = Math.min(60, remainingTrainingMinutes);

  if (this.startingModelSelect.options.length == 0) {
    const startingModels = this.util.startingModels;
    for (let i = 0; i < startingModels.length; i++) {
      const option = document.createElement('option');
      option.text = startingModels[i];
      this.startingModelSelect.add(option);
    }
  }

  // The following min/max numbers (100 and 4000) should match the min/max values in root.html.
  this.numTrainingStepsInput.min = 100;
  this.numTrainingStepsInput.max = 4000;
  this.numTrainingStepsInput.value = 2000;

  this.descriptionInput.value = '';

  this.updateStartButton();
  this.totalTrainingMinutesSpan.textContent = String(totalTrainingMinutes);
  this.remainingTrainingMinutesSpan.textContent = String(remainingTrainingMinutes);
  this.inProgressDiv.style.display = 'none';
  this.successDiv.style.display = 'none';
  this.failedDiv.style.display = 'none';

  this.xButton.onclick = this.closeButton.onclick = this.closeButton_onclick.bind(this);
  this.numTrainingStepsInput.onchange = this.numTrainingStepsInput_onchange.bind(this);
  this.maxRunningMinutesInput.onchange = this.maxRunningMinutesInput_onchange.bind(this);
  this.descriptionInput.oninput = this.descriptionInput_oninput.bind(this);
  this.startButton.onclick = this.startButton_onclick.bind(this);
  this.dialog.style.display = 'block';
};

fmltc.StartTrainingDialog.prototype.closeButton_onclick = function() {
  // Clear event handlers.
  this.xButton.onclick = this.closeButton.onclick = null;
  this.descriptionInput.oninput = null;
  this.startButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
  this.backdrop.style.display = 'none';
};

fmltc.StartTrainingDialog.prototype.numTrainingStepsInput_onchange = function() {
  this.numTrainingStepsInput.value = Math.max(this.numTrainingStepsInput.min, Math.min(this.numTrainingStepsInput.value, this.numTrainingStepsInput.max));
  this.updateStartButton();
};

fmltc.StartTrainingDialog.prototype.maxRunningMinutesInput_onchange = function() {
  this.maxRunningMinutesInput.value = Math.max(this.maxRunningMinutesInput.min, Math.min(this.maxRunningMinutesInput.value, this.maxRunningMinutesInput.max));
  this.updateStartButton();
};

fmltc.StartTrainingDialog.prototype.descriptionInput_oninput = function() {
  this.updateStartButton();
};

fmltc.StartTrainingDialog.prototype.updateStartButton = function() {
  this.startButton.disabled = (
      this.startTrainingInProgress ||
      Number(this.numTrainingStepsInput.value) < Number(this.numTrainingStepsInput.min) ||
      Number(this.numTrainingStepsInput.value) > Number(this.numTrainingStepsInput.max) ||
      Number(this.maxRunningMinutesInput.value) < Number(this.maxRunningMinutesInput.min) ||
      Number(this.maxRunningMinutesInput.value) > Number(this.maxRunningMinutesInput.max) ||
      this.descriptionInput.value.length == 0 ||
      this.descriptionInput.value.length > 30);
};

fmltc.StartTrainingDialog.prototype.startButton_onclick = function() {
  this.util.setWaitCursor();

  this.inProgressDiv.style.display = 'block';

  this.startTrainingInProgress = true;
  this.updateStartButton();

  const datasetUuidsJson = JSON.stringify(this.datasetUuids);

  const startingModel = this.startingModelSelect.options[this.startingModelSelect.selectedIndex].value;

  const xhr = new XMLHttpRequest();
  const params =
      'description=' + encodeURIComponent(this.descriptionInput.value) +
      '&dataset_uuids=' + encodeURIComponent(datasetUuidsJson) +
      '&starting_model=' + encodeURIComponent(startingModel) +
      '&max_running_minutes=' + this.maxRunningMinutesInput.value +
      '&num_training_steps=' + this.numTrainingStepsInput.value +
      '&create_time_ms=' + Date.now();
  xhr.open('POST', '/startTrainingModel', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_startTrainingModel_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.StartTrainingDialog.prototype.xhr_startTrainingModel_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      //console.log('Success! /startTrainingModel');
      const response = JSON.parse(xhr.responseText);
      const remainingTrainingMinutes = Math.floor(response.remaining_training_minutes);
      const modelEntity = response.model_entity;

      this.startTrainingInProgress = false;
      this.updateStartButton();
      this.inProgressDiv.style.display = 'none';
      this.successDiv.style.display = 'block';
      this.util.clearWaitCursor();

      this.onTrainingStarted(remainingTrainingMinutes, modelEntity);
      setTimeout(this.closeButton_onclick.bind(this), 1000);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /startTrainingModel?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.startTrainingInProgress = false;
      this.updateStartButton();
      this.inProgressDiv.style.display = 'none';
      this.failedDiv.style.display = 'block';
    }
  }
};
