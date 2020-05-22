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

  this.headerRowCount = this.modelsTable.rows.length;

  // Arrays with one element per model. Note that these need to be spliced in deleteButton_onclick.
  this.modelEntityArray = [];
  this.checkboxes = [];
  this.trs = [];
  this.stateSpans = [];

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
      const modelEntityArray = response.model_entities;
      for (let i = 0; i < modelEntityArray.length; i++) {
        this.onModelEntityUpdated(modelEntityArray[i]);
      }

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /retrieveModelList? xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
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

    const stateTd = tr.insertCell(-1);
    this.util.addClass(stateTd, 'cellWithBorder');
    const stateSpan = document.createElement('span');
    this.stateSpans[i] = stateSpan;
    stateTd.appendChild(stateSpan);
  }

  this.stateSpans[i].textContent = modelEntity.train_job_state;

  const isDone = (
      modelEntity.train_job_state == 'SUCCEEDED' ||
      modelEntity.train_job_state == 'FAILED' ||
      modelEntity.train_job_state == 'CANCELLED');

  if (isDone) {
    this.trs[i].className = 'trainingDone';
    this.checkboxes[i].disabled = false;
    this.checkboxes[i].style.display = 'inline-block';
  } else {
    this.trs[i].className = 'trainingNotDone';
    // TODO(lizlooney): Make the timeout configurable in the UI.
    setTimeout(this.retrieveModelEntity.bind(this, modelEntity.model_uuid, true), 60 * 1000);
  }
};

fmltc.ListModels.prototype.retrieveModelEntity = function(modelUuid, checkDeleted) {
  if (checkDeleted && this.indexOfModel(modelUuid) == -1) {
    // The model was deleted.
    return;
  }

  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(modelUuid);
  xhr.open('POST', '/retrieveModel', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveModelEntity_onreadystatechange.bind(this, xhr, params,
      modelUuid, checkDeleted);
  xhr.send(params);
};

fmltc.ListModels.prototype.xhr_retrieveModelEntity_onreadystatechange = function(xhr, params,
    modelUuid, checkDeleted) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (checkDeleted && this.indexOfModel(modelUuid) == -1) {
      // This model was deleted.
      return;
    }

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const modelEntity = response.model_entity;
      this.onModelEntityUpdated(modelEntity);

    } else {
      // TODO(lizlooney): handle error properly. Currently we try again in 60 seconds, but that
      // might not be the best idea.
      console.log('Failure! /retrieveModel?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Will retry /retrieveModel?' + params + ' in 60 seconds.');
      setTimeout(this.retrieveModelEntity.bind(this, modelUuid, checkDeleted), 60000);
    }
  }
};

fmltc.ListModels.prototype.addNewModel = function(modelEntity) {
  this.onModelEntityUpdated(modelEntity);
}

fmltc.ListModels.prototype.checkbox_onclick = function() {
  this.updateButtons();
};

fmltc.ListModels.prototype.deleteButton_onclick = function(modelUuid) {
  this.util.setWaitCursor();

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
        this.checkboxes[i].onclick = null;
        this.checkboxes.splice(i, 1);
        this.trs.splice(i, 1);
        this.stateSpans.splice(i, 1);
      }

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /deleteModel?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
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

  // TODO(lizlooney): Update buttons. There should be a button for downloading the tflite model.
};
