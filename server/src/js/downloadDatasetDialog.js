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
 * @fileoverview The class for a dialog that downloads a dataset.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.DownloadDatasetDialog');

goog.require('fmltc.Util');

/**
 * Class for a dialog that downloads a dataset.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.DownloadDatasetDialog = function(util, datasetEntity, downloadStartTime) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.datasetEntity = datasetEntity;
  this.downloadStartTime = downloadStartTime;

  this.dialog = document.getElementById('downloadDatasetDialog');
  this.backdrop = document.getElementsByClassName('modal-backdrop')[0];
  this.dismissButton = document.getElementById('ddDismissButton');
  this.partitionCountDiv = document.getElementById('ddPartitionCountDiv');
  this.partitionCountSpan = document.getElementById('ddPartitionCountSpan');
  this.progressDiv = document.getElementById('ddProgressDiv');
  this.finishedDiv = document.getElementById('ddFinishedDiv');

  this.partitionCount = 0;
  this.downloadStartedArray = [];
  this.downloadFinishedArray = [];
  this.zipProgressArray = [];
  this.zipProgressSpanArray = [];
  this.downloadProgressArray = [];
  this.downloadProgressSpanArray = [];

  document.getElementById('ddRecordCountSpan').textContent =
      String(this.datasetEntity.total_record_count);

  this.partitionCountDiv.style.visibility = 'hidden';
  this.progressDiv.style.visibility = 'hidden';
  this.progressDiv.innerHTML = ''; // Remove all children
  this.finishedDiv.style.visibility = 'hidden';
  this.dismissButton.disabled = true;

  this.dismissButton.onclick = this.dismissButton_onclick.bind(this);
  this.dialog.style.display = 'block';

  this.prepareToZipDataset();
};

fmltc.DownloadDatasetDialog.prototype.dismissButton_onclick = function() {
  this.downloadStartedArray = [];
  this.downloadFinishedArray = [];
  this.zipProgressArray = [];
  this.zipProgressSpanArray = [];
  this.downloadProgressArray = [];
  this.downloadProgressSpanArray = [];

  this.partitionCountDiv.style.visibility = 'hidden';
  this.progressDiv.style.visibility = 'hidden';
  this.progressDiv.innerHTML = ''; // Remove all children
  this.finishedDiv.style.visibility = 'hidden';

  // Clear event handlers.
  this.dismissButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
  this.backdrop.style.display = 'none';
};

fmltc.DownloadDatasetDialog.prototype.prepareToZipDataset = function() {
  const xhr = new XMLHttpRequest();
  const params = 'dataset_uuid=' + encodeURIComponent(this.datasetEntity.dataset_uuid);
  xhr.open('POST', '/prepareToZipDataset', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_prepareToZipDataset_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.DownloadDatasetDialog.prototype.xhr_prepareToZipDataset_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      this.partitionCount = response.partition_count;
      if (response.partition_count == 1) {
        this.partitionCountSpan.textContent = '1 zip file';
      } else {
        this.partitionCountSpan.textContent = String(response.partition_count) + ' separate zip files';
      }
      this.partitionCountDiv.style.visibility = 'visible';

      setTimeout(this.getDatasetZipStatus.bind(this, response.dataset_zip_uuid), 2000);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /prepareToZipDataset?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.DownloadDatasetDialog.prototype.getDatasetZipStatus = function(datasetZipUuid) {
  if (this.downloadStartedArray.length != 0) {
    // Check if all the downloads have finished. If so, we don't need to send /getDatasetZipStatus.
    let allDownloadsStarted = true;
    for (let partitionIndex = 0; partitionIndex < this.partitionCount; partitionIndex++) {
      if (!this.downloadStartedArray[partitionIndex]) {
        allDownloadsStarted = false;
        break;
      }
    }
    if (allDownloadsStarted) {
      return;
    }
  }

  const xhr = new XMLHttpRequest();
  const params =
      'dataset_zip_uuid=' + encodeURIComponent(datasetZipUuid) +
      '&partition_count=' + encodeURIComponent(this.partitionCount);
  xhr.open('POST', '/getDatasetZipStatus', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_getDatasetZipStatus_onreadystatechange.bind(this, xhr, params,
      datasetZipUuid);
  xhr.send(params);
};

fmltc.DownloadDatasetDialog.prototype.xhr_getDatasetZipStatus_onreadystatechange = function(xhr, params,
    datasetZipUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      if (this.downloadStartedArray.length == 0) {
        for (let partitionIndex = 0; partitionIndex < this.partitionCount; partitionIndex++) {
          this.downloadStartedArray[partitionIndex] = false;
          this.downloadFinishedArray[partitionIndex] = false;

          let div = document.createElement('div');
          const zipProgress = document.createElement('progress');
          zipProgress.value = 0;
          zipProgress.max = 1;
          this.zipProgressArray[partitionIndex] = zipProgress;
          div.appendChild(zipProgress);
          let zipProgressSpan = document.createElement('span');
          zipProgressSpan.textContent = this.makeZipProgressLabel(0);
          this.zipProgressSpanArray[partitionIndex] = zipProgressSpan;
          div.appendChild(zipProgressSpan);
          this.progressDiv.appendChild(div);

          div = document.createElement('div');
          const downloadProgress = document.createElement('progress');
          downloadProgress.value = 0;
          downloadProgress.max = 1;
          this.downloadProgressArray[partitionIndex] = downloadProgress;
          div.appendChild(downloadProgress);
          let downloadProgressSpan = document.createElement('span');
          downloadProgressSpan.textContent = this.makeDownloadProgressLabel(0);
          this.downloadProgressSpanArray[partitionIndex] = downloadProgressSpan;
          div.appendChild(downloadProgressSpan);
          this.progressDiv.appendChild(div);

          if (partitionIndex != this.partitionCount - 1) {
            this.progressDiv.appendChild(document.createElement('hr'));
          }
        }
        this.progressDiv.style.visibility = 'visible';
      }

      let allDownloadsStarted = true;
      for (let partitionIndex = 0; partitionIndex < this.partitionCount; partitionIndex++) {
        if (!this.downloadStartedArray[partitionIndex]) {
          this.zipProgressArray[partitionIndex].value = response.files_written_array[partitionIndex];
          this.zipProgressArray[partitionIndex].max = response.file_count_array[partitionIndex];
          this.zipProgressSpanArray[partitionIndex].textContent = this.makeZipProgressLabel(
              response.files_written_array[partitionIndex], response.file_count_array[partitionIndex]);

          if (response.is_ready_array[partitionIndex] && response.download_url_array[partitionIndex]) {
            this.downloadStartedArray[partitionIndex] = true;
            this.downloadDatasetZip(datasetZipUuid, partitionIndex, response.download_url_array[partitionIndex], 0);
          }
        }

        if (!this.downloadStartedArray[partitionIndex]) {
          allDownloadsStarted = false;
        }
      }

      if (!allDownloadsStarted) {
        setTimeout(this.getDatasetZipStatus.bind(this, datasetZipUuid), 2000);
      }

    } else {
      console.log('Failure! /getDatasetZipStatus?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      setTimeout(this.getDatasetZipStatus.bind(this, datasetZipUuid), 5000);
    }
  }
};

fmltc.DownloadDatasetDialog.prototype.makeZipProgressLabel = function(filesWritten, fileCount) {
  if (fileCount) {
    return ' Dataset files processed: ' + filesWritten + ' of ' + fileCount;
  } else {
    return ' Dataset files processed: ' + filesWritten;
  }
};

fmltc.DownloadDatasetDialog.prototype.downloadDatasetZip = function(
    datasetZipUuid, partitionIndex, downloadUrl, failureCount) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', downloadUrl, true);
  xhr.responseType = 'blob';
  xhr.onprogress = this.xhr_downloadDatasetZip_onprogress.bind(this, partitionIndex);
  xhr.onreadystatechange = this.xhr_downloadDatasetZip_onreadystatechange.bind(this, xhr,
      datasetZipUuid, partitionIndex, downloadUrl, failureCount, Date.now());
  xhr.send(null);
};

fmltc.DownloadDatasetDialog.prototype.xhr_downloadDatasetZip_onprogress = function(partitionIndex, event) {
  this.downloadProgressArray[partitionIndex].value = event.loaded;
  this.downloadProgressArray[partitionIndex].max = event.total;
  this.downloadProgressSpanArray[partitionIndex].textContent = this.makeDownloadProgressLabel(
      event.loaded, event.total);
};

fmltc.DownloadDatasetDialog.prototype.makeDownloadProgressLabel = function(loaded, total) {
  if (total) {
    return ' Bytes downloaded:  ' + new Number(loaded).toLocaleString() +
        ' of ' + new Number(total).toLocaleString();
  } else {
    return ' Bytes downloaded:  ' + new Number(loaded).toLocaleString();
  }
};

fmltc.DownloadDatasetDialog.prototype.xhr_downloadDatasetZip_onreadystatechange = function(xhr,
    datasetZipUuid, partitionIndex, downloadUrl, failureCount, xhrSendTime) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;
    xhr.onprogress = null;

    if (xhr.status === 200) {
      const anchor = document.createElement('a');
      anchor.href = window.URL.createObjectURL(xhr.response);
      anchor.download = 'dataset_' + this.util.getDateTimeString(this.downloadStartTime) +
          '_' + (partitionIndex + 1) + '_of_' + this.partitionCount + '.zip';
      anchor.click();

      this.downloadFinishedArray[partitionIndex] = true;

      let allDownloadsFinished = true;
      for (let partitionIndex = 0; partitionIndex < this.partitionCount; partitionIndex++) {
        if (!this.downloadFinishedArray[partitionIndex]) {
          allDownloadsFinished = false;
        }
      }
      if (allDownloadsFinished) {
        this.allDone(datasetZipUuid);
      } else {
        setTimeout(this.getDatasetZipStatus.bind(this, datasetZipUuid), 1000);
      }
    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry ' + downloadUrl + ' in ' + delay + ' seconds.');
        setTimeout(this.downloadDatasetZip.bind(this,
            datasetZipUuid, partitionIndex, downloadUrl, failureCount), delay * 1000);
      } else {
        // TODO(lizlooney): handle error properly.
        alert('Unable to download a dataset zip file.');
      }
    }
  }
};


fmltc.DownloadDatasetDialog.prototype.allDone = function(datasetZipUuid) {
  this.finishedDiv.style.visibility = 'visibile';

  // Delete the zip blobs from the server in 30 seconds.
  for (let partitionIndex = 0; partitionIndex < this.partitionCount; partitionIndex++) {
      setTimeout(this.deleteDatasetZip.bind(this,
          datasetZipUuid, partitionIndex, 0), 30000);
  }

  this.dismissButton.disabled = false;
  setTimeout(this.dismissButton_onclick.bind(this), 1000);
};

fmltc.DownloadDatasetDialog.prototype.deleteDatasetZip = function(datasetZipUuid, partitionIndex, failureCount) {
  const xhr = new XMLHttpRequest();
  const params =
      'dataset_zip_uuid=' + encodeURIComponent(datasetZipUuid) +
      '&partition_index=' + encodeURIComponent(partitionIndex);
  xhr.open('POST', '/deleteDatasetZip', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_deleteDatasetZip_onreadystatechange.bind(this, xhr, params,
      datasetZipUuid, partitionIndex, failureCount);
  xhr.send(params);
};

fmltc.DownloadDatasetDialog.prototype.xhr_deleteDatasetZip_onreadystatechange = function(xhr, params,
    datasetZipUuid, partitionIndex, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /deleteDatasetZip in ' + delay + ' seconds.');
        setTimeout(this.deleteDatasetZip.bind(this,
            datasetZipUuid, partitionIndex, failureCount), delay * 1000);
      } else {
        console.log('Unable to delete a dataset zip file.')
      }
    }
  }
};
