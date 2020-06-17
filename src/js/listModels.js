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

  this.modelsTable = document.getElementById('modelsTable');
  this.modelCheckboxAll = document.getElementById('modelCheckboxAll');
  this.trainMoreButton = document.getElementById('trainMoreButton');
  this.downloadTFLiteButton = document.getElementById('downloadTFLiteButton');
  this.cancelTrainingButton = document.getElementById('cancelTrainingButton');
  this.deleteModelsButton = document.getElementById('deleteModelsButton');

  this.headerRowCount = this.modelsTable.rows.length;

  // Arrays with one element per model. Note that these need to be spliced when a model is deleted.
  this.modelEntityArray = [];
  this.trs = [];
  this.checkboxes = [];
  this.trainStateTds = [];
  this.evalStateTds = [];
  this.trainTimeTds = [];
  this.trainingDone = [];

  this.trainTimeIntervalId = 0;

  this.waitCursor = false;
  this.deleteModelCounter = 0;

  this.totalTrainingMinutes = 0;     // Updated when we get a response from /retrieveModelList
  this.remainingTrainingMinutes = 0; // Updated when we get a response from /retrieveModelList
  this.retrieveModels();
  this.updateButtons();

  this.modelCheckboxAll.onclick = this.modelCheckboxAll_onclick.bind(this);
  this.trainMoreButton.onclick = this.trainMoreButton_onclick.bind(this);
  this.downloadTFLiteButton.onclick = this.downloadTFLiteButton_onclick.bind(this);
  this.cancelTrainingButton.onclick = this.cancelTrainingButton_onclick.bind(this);
  this.deleteModelsButton.onclick = this.deleteModelsButton_onclick.bind(this);
};

fmltc.ListModels.prototype.retrieveModels = function() {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/retrieveModelList', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveModelList_onreadystatechange.bind(this, xhr);
  xhr.send();
};

fmltc.ListModels.prototype.xhr_retrieveModelList_onreadystatechange = function(xhr) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.totalTrainingMinutes = Math.floor(response.total_training_minutes);
      this.remainingTrainingMinutes = Math.floor(response.remaining_training_minutes);
      const modelEntityArray = response.model_entities;
      for (let i = 0; i < modelEntityArray.length; i++) {
        this.onModelEntityUpdated(modelEntityArray[i]);
      }
      document.getElementById('modelsLoader').style.visibility = 'hidden';

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /retrieveModelList?' +
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

    const tr = this.modelsTable.insertRow(-1);
    this.trs[i] = tr;

    const checkboxTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    const checkbox = document.createElement('input');
    this.checkboxes[i] = checkbox;
    checkbox.setAttribute('type', 'checkbox');
    checkbox.onclick = this.checkbox_onclick.bind(this);
    checkboxTd.appendChild(checkbox);

    const dateCreatedTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    dateCreatedTd.textContent = new Date(modelEntity.creation_time_ms).toLocaleString();

    // Make the description link to the monitorTraining page.
    const descriptionTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    const descriptionA = document.createElement('a'); // a for anchor
    const url = 'monitorTraining?model_uuid=' + encodeURIComponent(modelEntity.model_uuid);
    const descriptionTextNode = document.createTextNode(modelEntity.description);
    descriptionA.setAttribute('href', url);
    descriptionA.appendChild(descriptionTextNode);
    descriptionTd.appendChild(descriptionA);

    const originalStartingModelTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    originalStartingModelTd.textContent = modelEntity.original_starting_model;

    const videoFilenamesTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    for (let i = 0; i < modelEntity.video_filenames.length; i++) {
      const div = document.createElement('div');
      div.textContent = modelEntity.video_filenames[i];
      videoFilenamesTd.appendChild(div);
    }

    const totalTrainingStepsTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    totalTrainingStepsTd.setAttribute('align', 'right');
    totalTrainingStepsTd.textContent = modelEntity.total_training_steps;

    this.trainStateTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');

    this.evalStateTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');

    this.trainTimeTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');
    this.trainTimeTds[i].setAttribute('align', 'right');
  }

  this.trainStateTds[i].textContent = this.util.formatJobState(
      modelEntity.cancel_requested, modelEntity.train_job_state);
  this.evalStateTds[i].textContent = this.util.formatJobState(
      modelEntity.cancel_requested, modelEntity.eval_job_state);

  if (modelEntity.train_job_elapsed_seconds > 0) {
    this.trainTimeTds[i].textContent =
        this.util.formatElapsedSeconds(modelEntity.train_job_elapsed_seconds);
  }

  if (this.util.isTrainingDone(modelEntity)) {
    this.trs[i].className = 'trainingDone';
    this.trainingDone[i] = true;
    this.clearTrainTimeIntervalIfNecessary();

  } else {
    this.trs[i].className = 'trainingNotDone';
    this.trainingDone[i] = false;
    setTimeout(this.retrieveModelEntity.bind(this, modelEntity.model_uuid), 60 * 1000);
    if (!this.trainTimeIntervalId) {
      this.trainTimeIntervalId = setInterval(this.updateTrainTime.bind(this), 500);
    }
  }


  this.updateButtons();
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


fmltc.ListModels.prototype.retrieveModelEntity = function(modelUuid) {
  if (this.indexOfModel(modelUuid) == -1) {
    // This model was deleted.
    return;
  }

  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(modelUuid);
  xhr.open('POST', '/retrieveModel', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveModelEntity_onreadystatechange.bind(this, xhr, params,
      modelUuid);
  xhr.send(params);
};

fmltc.ListModels.prototype.xhr_retrieveModelEntity_onreadystatechange = function(xhr, params,
    modelUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    const i = this.indexOfModel(modelUuid);
    if (i == -1) {
      // This model was deleted.
      return;
    }

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.remainingTrainingMinutes = Math.floor(response.remaining_training_minutes);
      const modelEntity = response.model_entity;
      this.onModelEntityUpdated(modelEntity);

    } else {
      // TODO(lizlooney): handle error properly. Currently we try again in 60 seconds, but that
      // might not be the best idea.
      console.log('Failure! /retrieveModel?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Will retry /retrieveModel?' + params + ' in 60 seconds.');
      setTimeout(this.retrieveModelEntity.bind(this, modelUuid), 60000);
    }
  }
};

fmltc.ListModels.prototype.addNewModel = function(remainingTrainingMinutes, modelEntity) {
  this.remainingTrainingMinutes = remainingTrainingMinutes;
  this.onModelEntityUpdated(modelEntity);
}

fmltc.ListModels.prototype.modelCheckboxAll_onclick = function() {
  this.util.checkAllOrNone(this.modelCheckboxAll, this.checkboxes);
  this.updateButtons();
};

fmltc.ListModels.prototype.checkbox_onclick = function() {
  this.updateButtons();
};

fmltc.ListModels.prototype.cancelTrainingButton_onclick = function() {
  const modelUuids = this.getCheckedModelUuids();
  for (let i = 0; i < modelUuids.length; i++) {
    const modelUuid = modelUuids[i];
    const index = this.indexOfModel(modelUuid);
    if (index != -1) {
      if (!this.util.isTrainingDone(this.modelEntityArray[index])) {
        this.cancelTraining(modelUuid);
      }
    }
  }
};

fmltc.ListModels.prototype.cancelTraining = function(modelUuid) {
  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(modelUuid);
  xhr.open('POST', '/cancelTrainingModel', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_cancelTraining_onreadystatechange.bind(this, xhr, params,
      modelUuid);
  xhr.send(params);
};

fmltc.ListModels.prototype.xhr_cancelTraining_onreadystatechange = function(xhr, params,
    modelUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      console.log('Success! /cancelTrainingModel');
      const response = JSON.parse(xhr.responseText);

      const modelEntity = response.model_entity;
      this.onModelEntityUpdated(modelEntity);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /cancelTraining?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListModels.prototype.deleteModelsButton_onclick = function() {
  const modelUuids = this.getCheckedModelUuids();
  new fmltc.DeleteConfirmationDialog(this.util, 'Delete Models',
      'Are you sure you want to delete the selected models?',
      this.startToDeleteModels.bind(this, modelUuids));
};

fmltc.ListModels.prototype.startToDeleteModels = function(modelUuids) {
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
        this.trs.splice(i, 1);
        this.checkboxes[i].onclick = null;
        this.checkboxes.splice(i, 1);
        this.trainStateTds.splice(i, 1);
        this.evalStateTds.splice(i, 1);
        this.trainTimeTds.splice(i, 1);
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
  let canCancelTraining = true;
  let canDeleteModels = true;
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      if (this.util.isTrainingDone(this.modelEntityArray[i])) {
        canCancelTraining = false;

        if (this.modelEntityArray[i].train_job_state != 'SUCCEEDED') {
          canTrainMore = false;
          canDownloadTFLite = false;
        }
        if (this.modelEntityArray[i].trained_checkpoint_path == '') {
          canTrainMore = false;
          canDownloadTFLite = false;
        }
      } else {
        canTrainMore = false;
        canDownloadTFLite = false;
        canDeleteModels = false;
        if (this.modelEntityArray[i].cancel_requested) {
          canCancelTaraining = false;
        }
      }
    }
  }

  this.trainMoreButton.disabled = this.waitCursor || countChecked != 1 || !canTrainMore;
  this.downloadTFLiteButton.disabled = this.waitCursor || countChecked != 1 || !canDownloadTFLite;
  this.cancelTrainingButton.disabled = this.waitCursor || countChecked != 1 || !canCancelTraining;
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
      this.util, this.totalTrainingMinutes, this.remainingTrainingMinutes,
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
  this.createTFLiteGraphPb(modelUuid, downloadStartTime);
};

fmltc.ListModels.prototype.createTFLiteGraphPb = function(modelUuid, downloadStartTime) {
  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(modelUuid);
  xhr.open('POST', '/createTFLiteGraphPb', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_createTFLiteGraphPb_onreadystatechange.bind(this, xhr, params,
      modelUuid, downloadStartTime);
  xhr.send(params);
};

fmltc.ListModels.prototype.xhr_createTFLiteGraphPb_onreadystatechange = function(xhr, params,
    modelUuid, downloadStartTime) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      this.createTFLite(modelUuid, downloadStartTime);
    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /createTFLiteGraphPb?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      this.util.clearWaitCursor();
      this.waitCursor = false;
      this.updateButtons();
    }
  }
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
      this.downloadTFLite(downloadStartTime, response.download_url, 0);
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
      if (failureCount < 5) {
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
