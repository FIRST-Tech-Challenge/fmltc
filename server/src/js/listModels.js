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
 * @fileoverview The class for listing models.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.ListModels');

goog.require('fmltc.Util');

/**
 * Class for listing models.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.ListModels = function(util) {
  /** @type {!fmltc.Util} */
  this.util = util;

  this.dRemainingTrainingMinutesSpan = document.getElementById('dRemainingTrainingMinutesSpan');
  this.mRemainingTrainingMinutesSpan = document.getElementById('mRemainingTrainingMinutesSpan');
  this.modelsListDiv = document.getElementById('modelsListDiv');
  this.modelsTable = document.getElementById('modelsTable');
  this.modelCheckboxAll = document.getElementById('modelCheckboxAll');
  this.trainMoreButton = document.getElementById('trainMoreButton');
  this.downloadTFLiteButton = document.getElementById('downloadTFLiteButton');
  this.stopTrainingButton = document.getElementById('stopTrainingButton');
  this.deleteModelsButton = document.getElementById('deleteModelsButton');

  this.headerRowCount = this.modelsTable.rows.length;

  // Arrays with one element per model. Note that these need to be spliced when a model is deleted.
  this.modelEntityArray = [];
  this.maybeRestartMonitorTrainingTime = []
  this.trs = [];
  this.checkboxes = [];
  this.trainStateTds = [];
  this.trainedStepsTds = [];
  this.trainTimeTds = [];
  this.trainingDone = [];

  this.trainTimeIntervalId = 0;

  this.waitCursor = false;
  this.deleteModelCounter = 0;

  this.remainingTrainingMinutes = 0; // Updated when we get a response from /retrieveModelEntities
  this.retrieveModelEntities();
  this.updateButtons();

  this.modelCheckboxAll.onclick = this.modelCheckboxAll_onclick.bind(this);
  this.trainMoreButton.onclick = this.trainMoreButton_onclick.bind(this);
  this.downloadTFLiteButton.onclick = this.downloadTFLiteButton_onclick.bind(this);
  this.stopTrainingButton.onclick = this.stopTrainingButton_onclick.bind(this);
  this.deleteModelsButton.onclick = this.deleteModelsButton_onclick.bind(this);
};

fmltc.ListModels.prototype.retrieveModelEntities = function() {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/retrieveModelEntities', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveModelEntities_onreadystatechange.bind(this, xhr);
  xhr.send();
};

fmltc.ListModels.prototype.xhr_retrieveModelEntities_onreadystatechange = function(xhr) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.updateRemainingTrainingMinutes(response.remaining_training_minutes);
      const modelEntityArray = response.model_entities;
      for (let i = 0; i < modelEntityArray.length; i++) {
        this.onModelEntityUpdated(modelEntityArray[i]);
      }
      document.getElementById('modelsLoader').style.visibility = 'hidden';

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /retrieveModelEntities?' +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListModels.prototype.onModelEntityUpdated = function(modelEntity) {
  let i = this.indexOfModel(modelEntity.model_uuid);
  if (i != -1) {
    this.modelEntityArray[i] = modelEntity;
  } else {
    i = this.modelEntityArray.length;
    this.modelEntityArray.push(modelEntity);

    this.maybeRestartMonitorTrainingTime[i] = 0;

    const tr = this.modelsTable.insertRow(-1);
    this.trs[i] = tr;

    const checkboxTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    const checkbox = document.createElement('input');
    this.checkboxes[i] = checkbox;
    checkbox.setAttribute('type', 'checkbox');
    checkbox.onclick = this.checkbox_onclick.bind(this);
    checkboxTd.appendChild(checkbox);

    const dateCreatedTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    dateCreatedTd.textContent = new Date(modelEntity.create_time_ms).toLocaleString();

    const descriptionTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    const descriptionTextNode = document.createTextNode(modelEntity.description);
    if (this.util.isModelTensorFlow2(modelEntity)) {
      // Make the description link to the monitorTraining page.
      const descriptionA = document.createElement('a'); // a for anchor
      const url = 'monitorTraining?model_uuid=' + encodeURIComponent(modelEntity.model_uuid);
      descriptionA.setAttribute('href', url);
      descriptionA.appendChild(descriptionTextNode);
      descriptionTd.appendChild(descriptionA);
    } else {
      descriptionTd.appendChild(descriptionTextNode);
    }

    const originalStartingModelTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    originalStartingModelTd.textContent = modelEntity.original_starting_model;

    const numTrainingStepsTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    numTrainingStepsTd.setAttribute('align', 'right');
    numTrainingStepsTd.textContent = new Number(modelEntity.num_training_steps).toLocaleString();

    this.trainStateTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');

    this.trainedStepsTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');
    this.trainedStepsTds[i].setAttribute('align', 'right');

    this.trainTimeTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');
    this.trainTimeTds[i].setAttribute('align', 'right');

    if (this.modelEntityArray.length == 1) {
      this.modelsListDiv.style.display = 'block';
    }
  }

  this.trainStateTds[i].textContent = this.util.formatJobState(
      'train', modelEntity);

  this.trainedStepsTds[i].textContent =
      new Number(modelEntity.trained_steps).toLocaleString();

  if (modelEntity.train_job_elapsed_seconds > 0) {
    this.trainTimeTds[i].textContent =
        this.util.formatElapsedSeconds(modelEntity.train_job_elapsed_seconds);
  }

  if (this.needToRestartMonitorTraining(modelEntity)) {
    this.maybeRestartMonitorTraining(modelEntity.model_uuid);
  }

  if (this.util.isTrainingDone(modelEntity)) {
    this.trs[i].className = 'trainingDone';
    this.trainingDone[i] = true;
    this.clearTrainTimeIntervalIfNecessary();

    if ('monitor_training_finished' in modelEntity &&
        !modelEntity.monitor_training_finished) {
      // Retrieve the model entity in 1 minute.
      setTimeout(this.retrieveModelEntity.bind(this, modelEntity.model_uuid, 0), 60 * 1000);
    }

  } else {
    this.trs[i].className = 'trainingNotDone';
    this.trainingDone[i] = false;

    // Retrieve the model entity in 1 minute.
    setTimeout(this.retrieveModelEntity.bind(this, modelEntity.model_uuid, 0), 60 * 1000);
    if (!this.trainTimeIntervalId) {
      this.trainTimeIntervalId = setInterval(this.updateTrainTime.bind(this), 500);
    }
  }


  this.updateButtons();
};

fmltc.ListModels.prototype.needToRestartMonitorTraining = function(modelEntity) {
  if (! ('monitor_training_active_time_ms' in modelEntity &&
         'monitor_training_finished' in modelEntity &&
         'monitor_training_triggered_time_ms' in modelEntity)) {
    return false;
  }
  if (modelEntity.monitor_training_finished) {
    return false;
  }
  if (modelEntity.monitor_training_triggered_time_ms != 0 &&
      modelEntity.monitor_training_active_time_ms == 0) {
    // Monitor training was triggered, but it hasn't started.
    const minutesSinceMonitorTrainingWasTriggered = (Date.now() - modelEntity.monitor_training_triggered_time_ms) / 60000;
    if (minutesSinceMonitorTrainingWasTriggered > 3) {
      // It's been 3 minutes since it was triggered. It probably failed to start.
      return true;
    }
  }
  if (modelEntity.monitor_training_active_time_ms != 0) {
    // Frame extraction started.
    const minutesSinceMonitorTrainingWasActive = (Date.now() - modelEntity.monitor_training_active_time_ms) / 60000;
    if (minutesSinceMonitorTrainingWasActive > 3) {
      // It's been 3 minutes since it was active. It probably died.
      return true;
    }
  }

  return false;
};

fmltc.ListModels.prototype.maybeRestartMonitorTraining = function(modelUuid) {
  const i = this.indexOfModel(modelUuid);
  if (i != -1) {
    // Check this.maybeRestartMonitorTrainingTime[i] so we don't send more than one /maybeRestartMonitorTraining
    // request before we get the response with the updated monitor_training_triggered_time_ms.
    if (this.maybeRestartMonitorTrainingTime[i] > 0) {
      const minutesSince = (Date.now() - this.maybeRestartMonitorTrainingTime[i]) / 60000;
      if (minutesSince < 3) {
        return;
      }
    }
    this.maybeRestartMonitorTrainingTime[i] = Date.now();

    const xhr = new XMLHttpRequest();
    const params = 'model_uuid=' + encodeURIComponent(modelUuid);
    xhr.open('POST', '/maybeRestartMonitorTraining', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = this.xhr_maybeRestartMonitorTraining_onreadystatechange.bind(this, xhr, params,
        modelUuid);
    xhr.send(params);
  }
};

fmltc.ListModels.prototype.xhr_maybeRestartMonitorTraining_onreadystatechange = function(xhr, params,
    modelUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.restarted) {
        // Retrieve the model entity in 5 minutes.
        setTimeout(this.retrieveModelEntity.bind(this, modelUuid, 0), 5 * 60 * 1000);
      }

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /maybeRestartMonitorTraining?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListModels.prototype.updateTrainTime = function() {
  for (let i = 0; i < this.trainingDone.length; i++) {
    if (!this.trainingDone[i]) {
      if (this.modelEntityArray[i] &&
          this.modelEntityArray[i].train_job_elapsed_seconds == 0) {
        if ('train_job_start_time' in this.modelEntityArray[i]) {
          this.trainTimeTds[i].textContent = this.util.formatElapsedSeconds(
              this.util.calculateSecondsSince(this.modelEntityArray[i].train_job_start_time));
        }
      }
    }
  }
};

fmltc.ListModels.prototype.clearTrainTimeIntervalIfNecessary = function() {
  if (this.trainTimeIntervalId) {
    let allTrainingDone = true;
    for (let i = 0; i < this.trainingDone.length; i++) {
      if (!this.trainingDone[i]) {
        allTrainingDone = false;
        break;
      }
    }
    if (allTrainingDone) {
      clearInterval(this.trainTimeIntervalId);
      this.trainTimeIntervalId = 0;
    }
  }
};


fmltc.ListModels.prototype.retrieveModelEntity = function(modelUuid, failureCount) {
  if (this.indexOfModel(modelUuid) == -1) {
    // This model was deleted.
    return;
  }

  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(modelUuid);
  xhr.open('POST', '/retrieveModelEntity', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveModelEntity_onreadystatechange.bind(this, xhr, params,
      modelUuid, failureCount);
  xhr.send(params);
};

fmltc.ListModels.prototype.xhr_retrieveModelEntity_onreadystatechange = function(xhr, params,
    modelUuid, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (this.indexOfModel(modelUuid) == -1) {
      // This model was deleted.
      return;
    }

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.updateRemainingTrainingMinutes(response.remaining_training_minutes);
      const modelEntity = response.model_entity;
      this.onModelEntityUpdated(modelEntity);

    } else {
      failureCount++;
      if (failureCount < 2) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveModelEntity?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveModelEntity.bind(this, modelUuid, failureCount), delay * 1000);
      } else {
        console.log('Unable to retrieve model entity.');
      }
    }
  }
};

fmltc.ListModels.prototype.addNewModel = function(remainingTrainingMinutes, modelEntity) {
  this.updateRemainingTrainingMinutes(remainingTrainingMinutes);
  this.onModelEntityUpdated(modelEntity);
};

fmltc.ListModels.prototype.modelCheckboxAll_onclick = function() {
  this.util.checkAllOrNone(this.modelCheckboxAll, this.checkboxes);
  this.updateButtons();
};

fmltc.ListModels.prototype.checkbox_onclick = function() {
  this.updateButtons();
};

fmltc.ListModels.prototype.stopTrainingButton_onclick = function() {
  const modelUuids = this.getCheckedModelUuids();
  for (let i = 0; i < modelUuids.length; i++) {
    const modelUuid = modelUuids[i];
    const index = this.indexOfModel(modelUuid);
    if (index != -1) {
      if (!this.util.isTrainingDone(this.modelEntityArray[index])) {
        this.stopTraining(modelUuid);
      }
    }
  }
};

fmltc.ListModels.prototype.stopTraining = function(modelUuid) {
  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(modelUuid);
  xhr.open('POST', '/stopTrainingModel', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_stopTraining_onreadystatechange.bind(this, xhr, params,
      modelUuid);
  xhr.send(params);
};

fmltc.ListModels.prototype.xhr_stopTraining_onreadystatechange = function(xhr, params,
    modelUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      //console.log('Success! /stopTrainingModel');
      const response = JSON.parse(xhr.responseText);

      const modelEntity = response.model_entity;
      this.onModelEntityUpdated(modelEntity);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /stopTraining?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListModels.prototype.deleteModelsButton_onclick = function() {
  const modelUuids = this.getCheckedModelUuids();
  new fmltc.DeleteConfirmationDialog(this.util, 'Delete Models',
      'Are you sure you want to delete the selected models?',
      this.canDeleteModels.bind(this, modelUuids));
};

fmltc.ListModels.prototype.canDeleteModels = function(modelUuids) {
  this.waitCursor = true;
  this.util.setWaitCursor();
  this.updateButtons();

  const modelUuidsJson = JSON.stringify(modelUuids);

  const xhr = new XMLHttpRequest();
  const params = 'model_uuids=' + encodeURIComponent(modelUuidsJson);
  xhr.open('POST', '/canDeleteModels', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_canDeleteModels_onreadystatechange.bind(this, xhr, params,
      modelUuids);
  xhr.send(params);
};

fmltc.ListModels.prototype.xhr_canDeleteModels_onreadystatechange = function(xhr, params,
    modelUuids) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.util.clearWaitCursor();
    this.waitCursor = false;
    this.updateButtons();

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.can_delete_models) {
        this.deleteModels(modelUuids);
      } else {
        const title = 'Delete Models';
        const message = 'The selected models cannot be deleted.';
        new fmltc.DeleteForbiddenDialog(this.util, title, message, response.messages);
      }
    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /canDeleteModels?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListModels.prototype.deleteModels = function(modelUuids) {
  this.waitCursor = true;
  this.util.setWaitCursor();
  this.updateButtons();

  this.deleteModelCounter = 0;
  for (let i = 0; i < modelUuids.length; i++) {
    const modelUuid = modelUuids[i];
    const index = this.indexOfModel(modelUuid);
    if (index != -1) {
      if (this.util.isTrainingDone(this.modelEntityArray[index])) {
        this.deleteModel(modelUuid);
        this.deleteModelCounter++;
      }
    }
  }
};

fmltc.ListModels.prototype.deleteModel = function(modelUuid) {
  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(modelUuid);
  xhr.open('POST', '/deleteModel', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_deleteModel_onreadystatechange.bind(this, xhr, params,
      modelUuid);
  xhr.send(params);
};

fmltc.ListModels.prototype.xhr_deleteModel_onreadystatechange = function(xhr, params,
    modelUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.deleteModelCounter--;
    if (this.deleteModelCounter == 0) {
      this.util.clearWaitCursor();
      this.waitCursor = false;
    }

    if (xhr.status === 200) {
      const i = this.indexOfModel(modelUuid);
      if (i != -1) {
        this.modelsTable.deleteRow(i + this.headerRowCount);
        this.modelEntityArray.splice(i, 1);
        this.maybeRestartMonitorTrainingTime.splice(i, 1);
        this.trs.splice(i, 1);
        this.checkboxes[i].onclick = null;
        this.checkboxes.splice(i, 1);
        this.trainStateTds.splice(i, 1);
        this.trainedStepsTds.splice(i, 1);
        this.trainTimeTds.splice(i, 1);
        this.updateButtons();
        if (this.modelEntityArray.length == 0) {
          this.modelsListDiv.style.display = 'none';
        }
      }

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /deleteModel?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListModels.prototype.indexOfModel = function(modelUuid) {
  for (let i = 0; i < this.modelEntityArray.length; i++) {
    if (this.modelEntityArray[i].model_uuid == modelUuid) {
      return i;
    }
  }
  return -1;
};

fmltc.ListModels.prototype.updateButtons = function() {
  const countChecked = this.util.countChecked(this.checkboxes);
  let canTrainMore = true;
  let canDownloadTFLite = true;
  let canStopTraining = true;
  let canDeleteModels = true;
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      if (this.util.isTrainingDone(this.modelEntityArray[i])) {
        canStopTraining = false;
        if (!this.util.modelHasCheckpoint(this.modelEntityArray[i])) {
          canTrainMore = false;
          canDownloadTFLite = false;
        }
      } else {
        canTrainMore = false;
        canDownloadTFLite = false;
        canDeleteModels = false;
        if (this.modelEntityArray[i].cancel_requested) {
          canStopTraining = false;
        }
      }
    }
  }

  this.trainMoreButton.disabled = !this.util.getTrainingEnabled() || this.waitCursor || countChecked != 1 || !canTrainMore;
  this.downloadTFLiteButton.disabled = this.waitCursor || countChecked != 1 || !canDownloadTFLite;
  this.stopTrainingButton.disabled = this.waitCursor || countChecked != 1 || !canStopTraining;
  this.deleteModelsButton.disabled = this.waitCursor || countChecked == 0 || !canDeleteModels;
};

fmltc.ListModels.prototype.getCheckedModelUuids = function() {
  const modelUuids = [];
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      modelUuids.push(this.modelEntityArray[i].model_uuid);
    }
  }
  return modelUuids;
};

fmltc.ListModels.prototype.getCheckedModelEntities = function() {
  const modelEntities = [];
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      modelEntities.push(this.modelEntityArray[i]);
    }
  }
  return modelEntities;
};

fmltc.ListModels.prototype.trainMoreButton_onclick = function() {
  const modelEntity = this.getCheckedModelEntities()[0];

  const datasetEntities = this.util.getListDatasets().getDatasetsWithLabels(modelEntity.sorted_label_list);

  new fmltc.TrainMoreDialog(
      this.util, this.remainingTrainingMinutes,
      modelEntity, datasetEntities, this.onTrainingStarted.bind(this));
};

fmltc.ListModels.prototype.onTrainingStarted = function(remainingTrainingMinutes, modelEntity) {
  this.addNewModel(remainingTrainingMinutes, modelEntity);
};

fmltc.ListModels.prototype.downloadTFLiteButton_onclick = function() {
  this.util.setWaitCursor();
  this.waitCursor = true;
  this.updateButtons();

  const modelUuid = this.getCheckedModelUuids()[0];
  const downloadStartTime = Date.now();
  this.createTFLite(modelUuid, downloadStartTime);
};

fmltc.ListModels.prototype.createTFLite = function(modelUuid, downloadStartTime) {
  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(modelUuid);
  xhr.open('POST', '/createTFLite', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_createTFLite_onreadystatechange.bind(this, xhr, params,
      modelUuid, downloadStartTime);
  xhr.send(params);
};

fmltc.ListModels.prototype.xhr_createTFLite_onreadystatechange = function(xhr, params,
    modelUuid, downloadStartTime) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.exists) {
        this.downloadTFLite(downloadStartTime, response.download_url, 0);
      } else {
        new fmltc.DownloadModelDialog(this.util, modelUuid, downloadStartTime,
            this.onModelReady.bind(this));
      }

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /createTFLite?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.util.clearWaitCursor();
      this.waitCursor = false;
      this.updateButtons();
    }
  }
};

fmltc.ListModels.prototype.onModelReady = function(downloadStartTime, downloadUrl) {
  this.downloadTFLite(downloadStartTime, downloadUrl, 0);
};

fmltc.ListModels.prototype.downloadTFLite = function(downloadStartTime, downloadUrl, failureCount) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', downloadUrl, true);
  xhr.responseType = 'blob';
  xhr.onreadystatechange = this.xhr_downloadTFLite_onreadystatechange.bind(this, xhr,
      downloadStartTime, downloadUrl, failureCount);
  xhr.send(null);
};

fmltc.ListModels.prototype.xhr_downloadTFLite_onreadystatechange = function(xhr,
    downloadStartTime, downloadUrl, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.util.clearWaitCursor();
    this.waitCursor = false;
    this.updateButtons();

    if (xhr.status === 200) {
      const anchor = document.createElement('a');
      anchor.href = window.URL.createObjectURL(xhr.response);
      anchor.download = 'model_' + this.util.getDateTimeString(downloadStartTime) + '.tflite';
      anchor.click();

    } else {
      failureCount++;
      if (failureCount < 2) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry ' + downloadUrl + ' in ' + delay + ' seconds.');
        setTimeout(this.downloadTFLite.bind(this,
            downloadStartTime, downloadUrl, failureCount), delay * 1000);
      } else {
        // TODO(lizlooney): handle error properly.
        alert('Unable to download the TFLite model.');
      }
    }
  }
};

fmltc.ListModels.prototype.updateRemainingTrainingMinutes = function(remainingTrainingMinutes) {
  this.remainingTrainingMinutes = Math.floor(remainingTrainingMinutes);
  this.dRemainingTrainingMinutesSpan.textContent = String(this.remainingTrainingMinutes);
  this.mRemainingTrainingMinutesSpan.textContent = String(this.remainingTrainingMinutes);
};
