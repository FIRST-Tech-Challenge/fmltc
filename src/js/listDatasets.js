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
fmltc.ListDatasets = function(util) {
  /** @type {!fmltc.Util} */
  this.util = util;

  this.datasetsTable = document.getElementById('datasetsTable');
  this.datasetCheckboxAll = document.getElementById('datasetCheckboxAll');
  this.downloadDatasetButton = document.getElementById('downloadDatasetButton');
  this.startTrainingButton = document.getElementById('startTrainingButton');
  this.deleteDatasetsButton = document.getElementById('deleteDatasetsButton');

  this.headerRowCount = this.datasetsTable.rows.length;

  // Arrays with one element per dataset. Note that these need to be spliced when a dataset is
  // deleted.
  this.datasetEntityArray = [];
  this.checkboxes = [];

  this.waitCursor = false;
  this.deleteDatasetCounter = 0;

  this.retrieveDatasets();
  this.updateButtons();

  this.datasetCheckboxAll.onclick = this.datasetCheckboxAll_onclick.bind(this);
  this.downloadDatasetButton.onclick = this.downloadDatasetButton_onclick.bind(this);
  this.startTrainingButton.onclick = this.startTrainingButton_onclick.bind(this);
  this.deleteDatasetsButton.onclick = this.deleteDatasetsButton_onclick.bind(this);
};

fmltc.ListDatasets.prototype.retrieveDatasets = function() {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/retrieveDatasetList', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveDatasetList_onreadystatechange.bind(this, xhr);
  xhr.send();
};

fmltc.ListDatasets.prototype.xhr_retrieveDatasetList_onreadystatechange = function(xhr) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const datasetEntityArray = response.dataset_entities;
      for (let i = 0; i < datasetEntityArray.length; i++) {
        if (datasetEntityArray[i].dataset_completed) {
          this.addDataset(datasetEntityArray[i]);
        }
      }
      document.getElementById('datasetsLoader').style.visibility = 'hidden';

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /retrieveDatasetList? xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListDatasets.prototype.addDataset = function(datasetEntity) {
  const i = this.datasetEntityArray.length;
  this.datasetEntityArray.push(datasetEntity);

  const tr = this.datasetsTable.insertRow(-1);

  const checkboxTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
  const checkbox = document.createElement('input');
  this.checkboxes[i] = checkbox;
  checkbox.setAttribute('type', 'checkbox');
  checkbox.onclick = this.checkbox_onclick.bind(this);
  checkboxTd.appendChild(checkbox);

  const dateCreatedTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
  dateCreatedTd.textContent = new Date(datasetEntity.creation_time_ms).toLocaleString();

  const descriptionTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
  descriptionTd.textContent = datasetEntity.description;

  const videoFilenamesTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
  for (let i = 0; i < datasetEntity.video_filenames.length; i++) {
    const div = document.createElement('div');
    div.textContent = datasetEntity.video_filenames[i];
    videoFilenamesTd.appendChild(div);
  }

  const trainFrameCountTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
  trainFrameCountTd.setAttribute('align', 'right');
  trainFrameCountTd.textContent = new Number(datasetEntity.train_frame_count).toLocaleString();

  const trainNegativeFrameCountTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
  trainNegativeFrameCountTd.setAttribute('align', 'right');
  trainNegativeFrameCountTd.textContent = new Number(datasetEntity.train_negative_frame_count).toLocaleString();

  const evalFrameCountTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
  evalFrameCountTd.setAttribute('align', 'right');
  evalFrameCountTd.textContent = new Number(datasetEntity.eval_frame_count).toLocaleString();

  const evalNegativeFrameCountTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
  evalNegativeFrameCountTd.setAttribute('align', 'right');
  evalNegativeFrameCountTd.textContent = new Number(datasetEntity.eval_negative_frame_count).toLocaleString();

  const labelsTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
  for (let i = 0; i < datasetEntity.sorted_label_list.length; i++) {
    const div = document.createElement('div');
    div.textContent = datasetEntity.sorted_label_list[i];
    labelsTd.appendChild(div);
  }
};

fmltc.ListDatasets.prototype.addNewDataset = function(datasetEntity) {
  this.addDataset(datasetEntity);
}

fmltc.ListDatasets.prototype.datasetCheckboxAll_onclick = function() {
  this.util.checkAllOrNone(this.datasetCheckboxAll, this.checkboxes);
  this.updateButtons();
};

fmltc.ListDatasets.prototype.checkbox_onclick = function() {
  this.updateButtons();
};

fmltc.ListDatasets.prototype.deleteDatasetsButton_onclick = function() {
  const datasetUuids = this.getCheckedDatasetUuids();
  new fmltc.DeleteConfirmationDialog(this.util, 'Delete Datasets',
      'Are you sure you want to delete the selected datasets?',
			this.deleteDatasets.bind(this, datasetUuids));
};

fmltc.ListDatasets.prototype.deleteDatasets = function(datasetUuids) {
  this.waitCursor = true;
  this.util.setWaitCursor();
  this.updateButtons();

  this.deleteDatasetCounter = 0;
  for (let i = 0; i < datasetUuids.length; i++) {
    const datasetUuid = datasetUuids[i];
    const xhr = new XMLHttpRequest();
    const params = 'dataset_uuid=' + encodeURIComponent(datasetUuid);
    xhr.open('POST', '/deleteDataset', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = this.xhr_deleteDataset_onreadystatechange.bind(this, xhr, params,
        datasetUuid);
    xhr.send(params);
    this.deleteDatasetCounter++;
  }
};

fmltc.ListDatasets.prototype.xhr_deleteDataset_onreadystatechange = function(xhr, params,
    datasetUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.deleteDatasetCounter--;
    if (this.deleteDatasetCounter == 0) {
      this.util.clearWaitCursor();
      this.waitCursor = false;
      this.updateButtons();
    }

    if (xhr.status === 200) {
      const i = this.indexOfDataset(datasetUuid);
      if (i != -1) {
        this.datasetsTable.deleteRow(i + this.headerRowCount);
        this.datasetEntityArray.splice(i, 1);
        this.checkboxes[i].onclick = null;
        this.checkboxes.splice(i, 1);
        this.updateButtons();
      }

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /deleteDataset?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
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

fmltc.ListDatasets.prototype.updateButtons = function() {
  let countChecked = 0;
  let labelsMatch = true;
  let labels = null;
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      countChecked++;
      if (labels == null) {
        labels = this.datasetEntityArray[i].sorted_label_list;
      } else if (this.util.sortedLabelListsEqual(labels, this.datasetEntityArray[i].sorted_label_list)) {
        labelsMatch = false;
      }
    }
  }

  this.downloadDatasetButton.disabled = this.waitCursor || countChecked != 1;
  this.startTrainingButton.disabled = this.waitCursor || countChecked == 0 || !labelsMatch;
  this.deleteDatasetsButton.disabled = this.waitCursor || countChecked == 0;
};

fmltc.ListDatasets.prototype.getCheckedDatasetUuids = function() {
  const datasetUuids = [];
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      datasetUuids.push(this.datasetEntityArray[i].dataset_uuid);
    }
  }
  return datasetUuids;
};

fmltc.ListDatasets.prototype.downloadDatasetButton_onclick = function() {
  this.waitCursor = true;
  this.util.setWaitCursor();
  this.updateButtons();

  const datasetUuid = this.getCheckedDatasetUuids()[0];
  const downloadStartTime = Date.now();

  const xhr = new XMLHttpRequest();
  const params = 'dataset_uuid=' + encodeURIComponent(datasetUuid);
  xhr.open('POST', '/prepareToZipDataset', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToZipDataset_onreadystatechange.bind(this, xhr, params,
      downloadStartTime);
  xhr.send(params);
};

fmltc.ListDatasets.prototype.xhr_prepareToZipDataset_onreadystatechange = function(xhr, params,
    downloadStartTime) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.util.callHttpPerformAction(response.action_parameters, 0);
      const partitionIndex = 0;
      setTimeout(this.getDatasetZipStatus.bind(this,
          downloadStartTime, response.dataset_zip_uuid, response.partition_count, partitionIndex), 30000);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /prepareToZipDataset?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListDatasets.prototype.getDatasetZipStatus = function(downloadStartTime, datasetZipUuid, partitionCount, partitionIndex) {
  const xhr = new XMLHttpRequest();
  const params =
      'dataset_zip_uuid=' + encodeURIComponent(datasetZipUuid) +
      '&partition_index=' + encodeURIComponent(partitionIndex);
  xhr.open('POST', '/getDatasetZipStatus', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_getDatasetZipStatus_onreadystatechange.bind(this, xhr, params,
      downloadStartTime, datasetZipUuid, partitionCount, partitionIndex);
  xhr.send(params);
};

fmltc.ListDatasets.prototype.xhr_getDatasetZipStatus_onreadystatechange = function(xhr, params,
    downloadStartTime, datasetZipUuid, partitionCount, partitionIndex) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      if (response.is_ready && response.download_url) {
        this.downloadDatasetZip(downloadStartTime, datasetZipUuid, partitionCount, partitionIndex, response.download_url, 0);
        partitionIndex++;
        if (partitionIndex < partitionCount) {
          // Get the next partition.
          setTimeout(this.getDatasetZipStatus.bind(this,
              downloadStartTime, datasetZipUuid, partitionCount, partitionIndex), 1000);
        }
      } else {
        setTimeout(this.getDatasetZipStatus.bind(this,
            downloadStartTime, datasetZipUuid, partitionCount, partitionIndex), 5000);
      }

    } else {
      console.log('Failure! /getDatasetZipStatus?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      setTimeout(this.getDatasetZipStatus.bind(this, downloadStartTime, datasetZipUuid), 5000);
    }
  }
};

fmltc.ListDatasets.prototype.downloadDatasetZip = function(
    downloadStartTime, datasetZipUuid, partitionCount, partitionIndex, downloadUrl, failureCount) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', downloadUrl, true);
  xhr.responseType = 'blob';
  xhr.onreadystatechange = this.xhr_downloadDatasetZip_onreadystatechange.bind(this, xhr,
      downloadStartTime, datasetZipUuid, partitionCount, partitionIndex, downloadUrl, failureCount);
  xhr.send(null);
};

fmltc.ListDatasets.prototype.xhr_downloadDatasetZip_onreadystatechange = function(xhr,
    downloadStartTime, datasetZipUuid, partitionCount, partitionIndex, downloadUrl, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const anchor = document.createElement('a');
      anchor.href = window.URL.createObjectURL(xhr.response);
      anchor.download = 'dataset_' + this.util.getDateTimeString(downloadStartTime) +
          '_' + (partitionIndex + 1) + '_of_' + partitionCount + '.zip';
      anchor.click();

      setTimeout(this.deleteDatasetZip.bind(this,
          datasetZipUuid, partitionCount, partitionIndex, 0), 30000);

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry ' + downloadUrl + ' in ' + delay + ' seconds.');
        setTimeout(this.downloadDatasetZip.bind(this,
            downloadStartTime, datasetZipUuid, partitionCount, partitionIndex,
            downloadUrl, failureCount), delay * 1000);
      } else {
        // TODO(lizlooney): handle error properly. For now we delete the zip.
        alert('Unable to download a dataset zip file.');
        this.deleteDatasetZip(datasetZipUuid, partitionCount, partitionIndex, 0);
      }
    }
  }
};

fmltc.ListDatasets.prototype.deleteDatasetZip = function(datasetZipUuid, partitionCount, partitionIndex, failureCount) {
  const xhr = new XMLHttpRequest();
  const params =
      'dataset_zip_uuid=' + encodeURIComponent(datasetZipUuid) +
      '&partition_index=' + encodeURIComponent(partitionIndex);
  xhr.open('POST', '/deleteDatasetZip', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_deleteDatasetZip_onreadystatechange.bind(this, xhr, params,
      datasetZipUuid, partitionCount, partitionIndex, failureCount);
  xhr.send(params);
};

fmltc.ListDatasets.prototype.xhr_deleteDatasetZip_onreadystatechange = function(xhr, params,
    datasetZipUuid, partitionCount, partitionIndex, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      if (partitionIndex == partitionCount - 1) {
        this.util.clearWaitCursor();
        this.waitCursor = false;
        this.updateButtons();
      }

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /deleteDatasetZip in ' + delay + ' seconds.');
        setTimeout(this.deleteDatasetZip.bind(this,
            datasetZipUuid, partitionCount, partitionIndex, failureCount), delay * 1000);
      } else {
        // TODO(lizlooney): handle error properly
        console.log('Unable to delete a dataset zip file.')
        if (partitionIndex == partitionCount - 1) {
          this.util.clearWaitCursor();
          this.waitCursor = false;
          this.updateButtons();
        }
      }
    }
  }
};

fmltc.ListDatasets.prototype.startTrainingButton_onclick = function() {
  const datasetUuids = this.getCheckedDatasetUuids();
  const listModels = this.util.getListModels();
  new fmltc.StartTrainingDialog(
      this.util, listModels.totalTrainingMinutes, listModels.remainingTrainingMinutes,
      datasetUuids, this.onTrainingStarted.bind(this));
};

fmltc.ListDatasets.prototype.onTrainingStarted = function(remainingTrainingMinutes, modelEntity) {
  this.util.getListModels().addNewModel(remainingTrainingMinutes, modelEntity);
  this.util.showModelsTab();
};

fmltc.ListDatasets.prototype.getDatasetsWithLabels = function(sorted_label_list) {
  const datasetEntities = []
  for (let i = 0; i < this.datasetEntityArray.length; i++) {
    if (this.util.sortedLabelListsEqual(sorted_label_list, this.datasetEntityArray[i].sorted_label_list)) {
      datasetEntities.push(this.datasetEntityArray[i]);
    }
  }
  return datasetEntities;
};
