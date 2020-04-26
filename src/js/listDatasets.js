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
 * @fileoverview The class for listing datasets.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.ListDatasets');

goog.require('fmltc.Util');


/**
 * Class for listing datasets.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.ListDatasets = function(util, datasetEntityArray) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.datasetTable = document.getElementById('datasetTable');
  this.datasetCheckboxAll = document.getElementById('datasetCheckboxAll');
  this.downloadRecordsButton = document.getElementById('downloadRecordsButton');
  this.trainModelButton = document.getElementById('trainModelButton');

  this.headerRowCount = this.datasetTable.rows.length;

  this.datasetCheckboxAll.onclick = this.datasetCheckboxAll_onclick.bind(this);
  this.downloadRecordsButton.onclick = this.downloadRecordsButton_onclick.bind(this);
  this.trainModelButton.onclick = this.trainModelButton_onclick.bind(this);

  // Arrays with one element per dataset. Note that these need to be spliced in deleteButton_onclick.
  this.datasetEntityArray = datasetEntityArray;
  this.checkboxes = [];

  this.datasetCheckboxAll.style.visibility = (datasetEntityArray.length > 0)
      ? 'visible'
      : 'hidden';

  for (let i = 0; i < datasetEntityArray.length; i++) {
    const datasetEntity = datasetEntityArray[i];

    const tr = this.datasetTable.insertRow(-1);

    const checkboxTd = tr.insertCell(-1);
    const checkbox = document.createElement('input');
    this.checkboxes[i] = checkbox;
    checkbox.setAttribute('type', 'checkbox');
    checkbox.onclick = this.checkbox_onclick.bind(this);
    checkboxTd.appendChild(checkbox);

    const deleteTd = tr.insertCell(-1);
    const deleteButton = document.createElement('button');
    deleteButton.textContent = String.fromCodePoint(0x1F5D1); // wastebasket
    deleteButton.onclick = this.deleteButton_onclick.bind(this, datasetEntity.dataset_uuid);
    deleteTd.appendChild(deleteButton);

    const videoFilenameTd = tr.insertCell(-1);
    videoFilenameTd.appendChild(document.createTextNode(datasetEntity.video_filename));

    const dateCreatedTd = tr.insertCell(-1);
    const dateCreatedSpan = document.createElement('span');
    dateCreatedSpan.textContent = new Date(datasetEntity.creation_time_ms).toLocaleString();
    dateCreatedTd.appendChild(dateCreatedSpan);

    const trainFrameCountTd = tr.insertCell(-1);
    trainFrameCountTd.setAttribute('align', 'right');
    trainFrameCountTd.appendChild(document.createTextNode(new Number(datasetEntity.train_frame_count).toLocaleString()));

    const trainNegativeFrameCountTd = tr.insertCell(-1);
    trainNegativeFrameCountTd.setAttribute('align', 'right');
    trainNegativeFrameCountTd.appendChild(document.createTextNode(new Number(datasetEntity.train_negative_frame_count).toLocaleString()));

    const evalFrameCountTd = tr.insertCell(-1);
    evalFrameCountTd.setAttribute('align', 'right');
    evalFrameCountTd.appendChild(document.createTextNode(new Number(datasetEntity.eval_frame_count).toLocaleString()));

    const evalNegativeFrameCountTd = tr.insertCell(-1);
    evalNegativeFrameCountTd.setAttribute('align', 'right');
    evalNegativeFrameCountTd.appendChild(document.createTextNode(new Number(datasetEntity.eval_negative_frame_count).toLocaleString()));

    const labelsTd = tr.insertCell(-1);
    labelsTd.appendChild(document.createTextNode(datasetEntity.sorted_label_list));
  }

  const canTrainModel = this.canTrainModel();
  this.downloadRecordsButton.disabled = !canTrainModel;
  this.trainModelButton.disabled = !canTrainModel;
};

fmltc.ListDatasets.prototype.datasetCheckboxAll_onclick = function() {
  var anyChecked = false;
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      anyChecked = true;
      break;
    }
  }
  const check = !anyChecked;
  for (let i = 0; i < this.checkboxes.length; i++) {
    this.checkboxes[i].checked = check;
  }
  this.datasetCheckboxAll.checked = check;

  const canTrainModel = this.canTrainModel();
  this.downloadRecordsButton.disabled = !canTrainModel;
  this.trainModelButton.disabled = !canTrainModel;
};

fmltc.ListDatasets.prototype.checkbox_onclick = function() {
  const canTrainModel = this.canTrainModel();
  this.downloadRecordsButton.disabled = !canTrainModel;
  this.trainModelButton.disabled = !canTrainModel;
};


fmltc.ListDatasets.prototype.deleteButton_onclick = function(datasetUuid) {
  this.util.setWaitCursor();

  let i = this.indexOfDataset(datasetUuid);
  if (i != -1) {
    this.datasetTable.deleteRow(i + this.headerRowCount);
    this.datasetEntityArray.splice(i, 1);
    this.checkboxes.splice(i, 1);
    this.datasetCheckboxAll.style.visibility = (this.datasetEntityArray.length > 0)
        ? 'visible'
        : 'hidden';

    const xhr = new XMLHttpRequest();
    const params = 'dataset_uuid=' + encodeURIComponent(datasetUuid);
    xhr.open('POST', '/deleteDataset', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = this.xhr_deleteDataset_onreadystatechange.bind(this, xhr, params, datasetUuid);
    xhr.send(params);
  }
};

fmltc.ListDatasets.prototype.xhr_deleteDataset_onreadystatechange = function(xhr, params, datasetUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.util.clearWaitCursor();

    if (xhr.status === 200) {

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /deleteDataset?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListDatasets.prototype.indexOfDataset = function(datasetUuid) {
  for (let i = 0; i < this.datasetEntityArray.length; i++) {
    if (this.datasetEntityArray[i].dataset_uuid == datasetUuid) {
      return i;
    }
  }
  return -1;
};

fmltc.ListDatasets.prototype.canTrainModel = function() {
  let sortedLabelList = '';
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      if (!sortedLabelList) {
        sortedLabelList = this.datasetEntityArray[i].sorted_label_list;
      } else {
        if (sortedLabelList.length != this.datasetEntityArray[i].sorted_label_list.length) {
          return false;
        }
        for (let j = 0; j < sortedLabelList.length; j++) {
          if (sortedLabelList[j] != this.datasetEntityArray[i].sorted_label_list[j]) {
            return false;
          }
        }
      }
    }
  }
  return !!sortedLabelList;
};

fmltc.ListDatasets.prototype.getDatasetUuidsJson = function() {
  const datasetUuids = [];
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      datasetUuids.push(this.datasetEntityArray[i].dataset_uuid);
    }
  }
  return JSON.stringify(datasetUuids);
};

fmltc.ListDatasets.prototype.downloadRecordsButton_onclick = function() {
  this.util.setWaitCursor();

  const datasetUuidsJson = this.getDatasetUuidsJson();
  const downloadStartTime = Date.now();

  const xhr = new XMLHttpRequest();
  const params = 'dataset_uuids=' + encodeURIComponent(datasetUuidsJson);
  xhr.open('POST', '/prepareToZipDataset', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToZipDataset_onreadystatechange.bind(this, xhr, params, downloadStartTime);
  xhr.send(params);
};

fmltc.ListDatasets.prototype.xhr_prepareToZipDataset_onreadystatechange = function(xhr, params, downloadStartTime) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.util.callHttpPerformAction(response.action_parameters, 0);
      setTimeout(this.getDatasetZipStatus.bind(this, downloadStartTime, response.dataset_zip_uuid), 5000);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /prepareToZipDatasetping?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListDatasets.prototype.getDatasetZipStatus = function(downloadStartTime, datasetZipUuid) {
  const xhr = new XMLHttpRequest();
  const params = 'dataset_zip_uuid=' + encodeURIComponent(datasetZipUuid);
  xhr.open('POST', '/getDatasetZipStatus', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_getDatasetZipStatus_onreadystatechange.bind(this, xhr, params, downloadStartTime, datasetZipUuid);
  xhr.send(params);
};

fmltc.ListDatasets.prototype.xhr_getDatasetZipStatus_onreadystatechange = function(xhr, params, downloadStartTime, datasetZipUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const datasetZipStatus = JSON.parse(xhr.responseText);

      if (datasetZipStatus.isReady && datasetZipStatus.url) {
        console.log('dataset zip is ready.');
        this.retrieveDatasetZip(downloadStartTime, datasetZipUuid, datasetZipStatus.url, 0);
      } else {
        console.log('dataset zip is not ready.');
        setTimeout(this.getDatasetZipStatus.bind(this, downloadStartTime, datasetZipUuid), 5000);
      }

    } else {
      console.log('Failure! /getDatasetZipStatus?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      setTimeout(this.getDatasetZipStatus.bind(this, downloadStartTime, datasetZipUuid), 5000);
    }
  }
};

fmltc.ListDatasets.prototype.retrieveDatasetZip = function(downloadStartTime, datasetZipUuid, url, retryCount) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'blob';
  xhr.onreadystatechange = this.xhr_retrieveDatasetZip_onreadystatechange.bind(this, xhr, downloadStartTime, datasetZipUuid, url, retryCount);
  xhr.send(null);
};

fmltc.ListDatasets.prototype.xhr_retrieveDatasetZip_onreadystatechange = function(xhr, downloadStartTime, datasetZipUuid, url, retryCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const anchor = document.createElement('a');
      anchor.href = window.URL.createObjectURL(xhr.response);
      anchor.download = 'dataset_' + this.util.getDateTimeString(downloadStartTime) + '.zip';
      anchor.click();

      this.deleteDatasetZip(datasetZipUuid);

    } else {

      console.log('Failure! ' + url + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      if (retryCount < 5) {
        console.log('Will retry ' + url + ' in 1 seconds.');
        setTimeout(this.retrieveDatasetZip.bind(this, downloadStartTime, datasetZipUuid, url, retryCount + 1), 1000);
      } else {
        // TODO(lizlooney): handle error properly. For now we delete the zip.
        alert('Unable to download the dataset zip file.');
        this.deleteDatasetZip(datasetZipUuid);
      }
    }
  }
};

fmltc.ListDatasets.prototype.deleteDatasetZip = function(datasetZipUuid) {
  const xhr = new XMLHttpRequest();
  const params = 'dataset_zip_uuid=' + encodeURIComponent(datasetZipUuid);
  xhr.open('POST', '/deleteDatasetZip', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_deleteDatasetZip_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.ListDatasets.prototype.xhr_deleteDatasetZip_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.util.clearWaitCursor();

    if (xhr.status === 200) {

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /deleteDatasetZip?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};



fmltc.ListDatasets.prototype.trainModelButton_onclick = function() {
  const datasetUuidsJson = this.getDatasetUuidsJson();
  const modelStartTime = Date.now();

  const xhr = new XMLHttpRequest();
  const params = 'dataset_uuids=' + encodeURIComponent(datasetUuidsJson);
  xhr.open('POST', '/prepareToTrainModel', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToTrainModel_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.ListDatasets.prototype.xhr_prepareToTrainModel_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      console.log('Success! /prepareToTrainModel');
      const response = JSON.parse(xhr.responseText);
      this.util.callHttpPerformAction(response.action_parameters, 0);
      // TODO(lizlooney): check status of response.model_uuid

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /prepareToTrainModel?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};
