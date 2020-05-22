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

  this.downloadModelButton = document.getElementById('downloadModelButton');
  this.modelsTable = document.getElementById('modelsTable');

  this.headerRowCount = this.modelsTable.rows.length;

  // Arrays with one element per model. Note that these need to be spliced when a model is deleted.
  this.modelEntityArray = [];
  this.modelToBeDeleted = []
  this.checkboxes = [];
  this.trs = [];
  this.trainStateSpans = [];
  this.evalStateSpans = [];
  this.trainTimeSpans = [];

  this.totalTrainingMinutes = 0; // Updated when we get a response from /retrieveModelList
  this.remainingTrainingMinutes = 0; // Updated when we get a response from /retrieveModelList
  this.retrieveModels();
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

    this.modelToBeDeleted[i] = false;

    const tr = this.modelsTable.insertRow(-1);
    this.trs[i] = tr;

    const checkboxTd = tr.insertCell(-1);
    this.util.addClass(checkboxTd, 'cellWithBorder');
    const checkbox = document.createElement('input');
    this.checkboxes[i] = checkbox;
    checkbox.style.display = 'none';
    checkbox.disabled = true;
    checkbox.setAttribute('type', 'checkbox');
    checkbox.onclick = this.checkbox_onclick.bind(this);
    checkboxTd.appendChild(checkbox);

    const deleteTd = tr.insertCell(-1);
    this.util.addClass(deleteTd, 'cellWithBorder');
    const deleteButton = document.createElement('button');
    deleteButton.textContent = String.fromCodePoint(0x1F5D1); // wastebasket
    deleteButton.title = "Delete this model";
    deleteButton.onclick = this.deleteButton_onclick.bind(this, modelEntity.model_uuid);
    deleteTd.appendChild(deleteButton);

    const videoFilenamesTd = tr.insertCell(-1);
    this.util.addClass(videoFilenamesTd, 'cellWithBorder');
    for (let i = 0; i < modelEntity.video_filenames.length; i++) {
      const div = document.createElement('div');
      div.textContent = modelEntity.video_filenames[i];
      videoFilenamesTd.appendChild(div);
    }

    const dateCreatedTd = tr.insertCell(-1);
    this.util.addClass(dateCreatedTd, 'cellWithBorder');
    const dateCreatedSpan = document.createElement('span');
    dateCreatedSpan.textContent = new Date(modelEntity.creation_time_ms).toLocaleString();
    dateCreatedTd.appendChild(dateCreatedSpan);

    const trainStateTd = tr.insertCell(-1);
    this.util.addClass(trainStateTd, 'cellWithBorder');
    const trainStateSpan = document.createElement('span');
    this.trainStateSpans[i] = trainStateSpan;
    trainStateTd.appendChild(trainStateSpan);

    const evalStateTd = tr.insertCell(-1);
    this.util.addClass(evalStateTd, 'cellWithBorder');
    const evalStateSpan = document.createElement('span');
    this.evalStateSpans[i] = evalStateSpan;
    evalStateTd.appendChild(evalStateSpan);

    const trainTimeTd = tr.insertCell(-1);
    this.util.addClass(trainTimeTd, 'cellWithBorder');
    trainTimeTd.setAttribute('align', 'right');
    const trainTimeSpan = document.createElement('span');
    this.trainTimeSpans[i] = trainTimeSpan;
    trainTimeTd.appendChild(trainTimeSpan);
  }

  this.trainStateSpans[i].textContent = modelEntity.train_job_state;
  this.evalStateSpans[i].textContent = modelEntity.eval_job_state;

  if (modelEntity['train_job_elapsed_seconds'] > 0) {
    this.trainTimeSpans[i].textContent =
        this.util.formatElapsedSeconds(modelEntity.train_job_elapsed_seconds);
  }

  if (this.isTrainingDone(modelEntity)) {
    this.trs[i].className = 'trainingDone';
    this.checkboxes[i].disabled = false;
    this.checkboxes[i].style.display = 'inline-block';

    if (this.modelToBeDeleted[i]) {
      this.deleteModel(modelEntity.model_uuid);
    }
  } else {
    this.trs[i].className = 'trainingNotDone';
    setTimeout(this.retrieveModelEntity.bind(this, modelEntity.model_uuid), 60 * 1000);
  }
};

fmltc.ListModels.prototype.isTrainingDone = function(modelEntity) {
  return this.isJobDone(modelEntity.train_job_state) && this.isJobDone(modelEntity.eval_job_state);
};

fmltc.ListModels.prototype.isJobDone = function(state) {
  return state == '' || state == 'SUCCEEDED' || state == 'FAILED' || state == 'CANCELLED';
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

fmltc.ListModels.prototype.checkbox_onclick = function() {
  this.updateButtons();
};

fmltc.ListModels.prototype.deleteButton_onclick = function(modelUuid) {
  const i = this.indexOfModel(modelUuid);
  if (i == -1) {
    return;
  }

  this.util.setWaitCursor();

  if (this.isTrainingDone(this.modelEntityArray[i])) {
    this.deleteModel(modelUuid);
  } else {
    this.modelToBeDeleted[i] = true;
    this.cancelTraining(modelUuid);
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
    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /cancelTraining?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
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

    this.util.clearWaitCursor();

    if (xhr.status === 200) {
      const i = this.indexOfModel(modelUuid);
      if (i != -1) {
        this.modelsTable.deleteRow(i + this.headerRowCount);
        this.modelEntityArray.splice(i, 1);
        this.modelToBeDeleted.splice(i, 1);
        this.checkboxes[i].onclick = null;
        this.checkboxes.splice(i, 1);
        this.trs.splice(i, 1);
        this.trainStateSpans.splice(i, 1);
        this.evalStateSpans.splice(i, 1);
        this.trainTimeSpans.splice(i, 1);
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
  let countChecked = 0;
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (!this.checkboxes[i].disabled && this.checkboxes[i].checked) {
      countChecked++;
      if (countChecked > 1) {
        break;
      }
    }
  }

  this.downloadModelButton.disabled = true;
  // TODO(lizlooney): Implement downloading tflite model.
};
