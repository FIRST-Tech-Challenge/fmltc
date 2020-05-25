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
 * @fileoverview The class for listing videos.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.ListVideos');

goog.require('fmltc.ProduceDatasetDialog');
goog.require('fmltc.ListDatasets');
goog.require('fmltc.Util');


/**
 * Class for listing videos.
 * @param {!fmltc.Util} util The utility instance
 * @param {!fmltc.ListDatasets} listDatasets The ListDatasets instance
 * @constructor
 */
fmltc.ListVideos = function(util, listDatasets) {
  /** @type {!fmltc.Util} */
  this.util = util;
  /** @type {!fmltc.ListDatasets} */
  this.listDatasets = listDatasets;

  this.videosListDiv = document.getElementById('videosListDiv');
  this.videosTable = document.getElementById('videosTable');
  this.videoCheckboxAll = document.getElementById('videoCheckboxAll');
  this.produceDatasetButton = document.getElementById('produceDatasetButton');

  this.headerRowCount = this.videosTable.rows.length;

  // Arrays with one element per video. Note that these need to be spliced when a video is deleted.
  this.videoEntityArray = [];
  this.checkboxes = [];
  this.lastTimeVideoEntityChanged = [];
  this.trs = [];
  this.deleteButtons = [];
  this.triggerFrameExtractionButtons = [];
  this.videoFilenameTds = [];
  this.dimensionsSpans = [];
  this.durationSpans = [];
  this.framesPerSecondSpans = [];
  this.frameCountSpans = [];
  this.extractedFrameCountSpans = [];
  this.excludedFrameCountSpans = [];

  this.retrieveVideos();

  this.updateProduceDatasetButton();

  const uploadVideoFileButton = document.getElementById('uploadVideoFileButton');
  uploadVideoFileButton.onclick = this.uploadVideoFileButton_onclick.bind(this);
  this.videoCheckboxAll.onclick = this.videoCheckboxAll_onclick.bind(this);
  this.produceDatasetButton.onclick = this.produceDatasetButton_onclick.bind(this);
};

fmltc.ListVideos.prototype.retrieveVideos = function() {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/retrieveVideoList', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveVideoList_onreadystatechange.bind(this, xhr);
  xhr.send();
};

fmltc.ListVideos.prototype.xhr_retrieveVideoList_onreadystatechange = function(xhr) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const videoEntityArray = response.video_entities;
      for (let i = 0; i < videoEntityArray.length; i++) {
        this.onVideoEntityUpdated(videoEntityArray[i]);
      }
      if (this.videoEntityArray.length > 0) {
        this.videosListDiv.style.display = 'block';
      }

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /retrieveVideoList? xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};


fmltc.ListVideos.prototype.onVideoEntityUpdated = function(videoEntity) {
  let i = this.indexOfVideo(videoEntity.video_uuid);
  if (i != -1) {
    this.videoEntityArray[i] = videoEntity;
  } else {
    i = this.videoEntityArray.length;
    this.videoEntityArray.push(videoEntity);

    const tr = this.videosTable.insertRow(-1);
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
    this.deleteButtons[i] = deleteButton;
    deleteButton.textContent = String.fromCodePoint(0x1F5D1); // wastebasket
    deleteButton.title = "Delete this video";
    deleteButton.style.display = 'none';
    deleteButton.disabled = true;
    deleteButton.onclick = this.deleteButton_onclick.bind(this, videoEntity.video_uuid);
    deleteTd.appendChild(deleteButton);
    const triggerFrameExtractionButton = document.createElement('button');
    this.triggerFrameExtractionButtons[i] = triggerFrameExtractionButton;
    triggerFrameExtractionButton.textContent = String.fromCodePoint(0x1F6E0); // hammer and wrench
    triggerFrameExtractionButton.title = "Restart frame extraction for this video";
    triggerFrameExtractionButton.style.display = 'none';
    triggerFrameExtractionButton.disabled = true;
    triggerFrameExtractionButton.onclick = this.triggerFrameExtractionButton_onclick.bind(this, videoEntity.video_uuid);
    deleteTd.appendChild(triggerFrameExtractionButton);

    const videoFilenameTd = tr.insertCell(-1);
    this.util.addClass(videoFilenameTd, 'cellWithBorder');
    this.videoFilenameTds[i] = videoFilenameTd
    videoFilenameTd.appendChild(document.createTextNode(videoEntity.video_filename));

    const dateUploadedTd = tr.insertCell(-1);
    this.util.addClass(dateUploadedTd, 'cellWithBorder');
    const dateUploadedSpan = document.createElement('span');
    dateUploadedSpan.textContent = new Date(videoEntity.upload_time_ms).toLocaleString();
    dateUploadedTd.appendChild(dateUploadedSpan);

    const fileSizeTd = tr.insertCell(-1);
    this.util.addClass(fileSizeTd, 'cellWithBorder');
    fileSizeTd.setAttribute('align', 'right');
    const fileSizeSpan = document.createElement('span');
    fileSizeSpan.textContent = new Number(videoEntity.file_size).toLocaleString()
    fileSizeTd.appendChild(fileSizeSpan);

    const dimensionsTd = tr.insertCell(-1);
    this.util.addClass(dimensionsTd, 'cellWithBorder');
    const dimensionsSpan = document.createElement('span');
    this.dimensionsSpans[i] = dimensionsSpan;
    dimensionsTd.appendChild(dimensionsSpan);

    const durationTd = tr.insertCell(-1);
    this.util.addClass(durationTd, 'cellWithBorder');
    durationTd.setAttribute('align', 'right');
    const durationSpan = document.createElement('span');
    this.durationSpans[i] = durationSpan;
    durationTd.appendChild(durationSpan);

    const framesPerSecondTd = tr.insertCell(-1);
    this.util.addClass(framesPerSecondTd, 'cellWithBorder');
    framesPerSecondTd.setAttribute('align', 'right');
    const framesPerSecondSpan = document.createElement('span');
    this.framesPerSecondSpans[i] = framesPerSecondSpan;
    framesPerSecondTd.appendChild(framesPerSecondSpan);

    const frameCountTd = tr.insertCell(-1);
    this.util.addClass(frameCountTd, 'cellWithBorder');
    frameCountTd.setAttribute('align', 'right');
    const frameCountSpan = document.createElement('span');
    this.frameCountSpans[i] = frameCountSpan;
    frameCountTd.appendChild(frameCountSpan);

    const extractedFrameCountTd = tr.insertCell(-1);
    this.util.addClass(extractedFrameCountTd, 'cellWithBorder');
    extractedFrameCountTd.setAttribute('align', 'right');
    const extractedFrameCountSpan = document.createElement('span');
    this.extractedFrameCountSpans[i] = extractedFrameCountSpan;
    extractedFrameCountTd.appendChild(extractedFrameCountSpan);

    const excludedFrameCountTd = tr.insertCell(-1);
    this.util.addClass(excludedFrameCountTd, 'cellWithBorder');
    excludedFrameCountTd.setAttribute('align', 'right');
    const excludedFrameCountSpan = document.createElement('span');
    this.excludedFrameCountSpans[i] = excludedFrameCountSpan;
    excludedFrameCountTd.appendChild(excludedFrameCountSpan);
  }

  let frameExtractionComplete = true;
  if ('width' in videoEntity && 'height' in videoEntity) {
    this.dimensionsSpans[i].textContent = videoEntity.width + ' x ' + videoEntity.height;
  } else {
    frameExtractionComplete = false;
  }
  if ('frame_count' in videoEntity && 'fps' in videoEntity) {
    this.durationSpans[i].textContent = this.util.formatElapsedSeconds(videoEntity.frame_count / videoEntity.fps)
  } else {
    frameExtractionComplete = false;
  }
  if ('fps' in videoEntity) {
    this.framesPerSecondSpans[i].textContent = videoEntity.fps.toFixed(0);
  } else {
    frameExtractionComplete = false;
  }
  if ('frame_count' in videoEntity) {
    this.frameCountSpans[i].textContent = videoEntity.frame_count;
    if (videoEntity.extracted_frame_count != videoEntity.frame_count) {
      frameExtractionComplete = false;
    }
  } else {
    frameExtractionComplete = false;
  }
  this.extractedFrameCountSpans[i].textContent = videoEntity.extracted_frame_count;
  if ('included_frame_count' in videoEntity) {
    this.excludedFrameCountSpans[i].textContent =
        (videoEntity.extracted_frame_count - videoEntity.included_frame_count);
  }
  if (frameExtractionComplete) {
    this.trs[i].className = 'frameExtractionComplete';
    this.checkboxes[i].disabled = false;
    this.checkboxes[i].style.display = 'inline-block';
    this.deleteButtons[i].disabled = false;
    this.deleteButtons[i].style.display = 'inline-block';
    // Make the video filename a link to the labelVideo page, if it isn't already a link
    const videoFilenameElement = this.videoFilenameTds[i].childNodes[0];
    if (videoFilenameElement.nodeName != 'A') { // A for Anchor
      const videoFilenameA = document.createElement('a'); // a for anchor
      const url = 'labelVideo?video_uuid=' + encodeURIComponent(videoEntity.video_uuid);
      videoFilenameA.setAttribute('href', url);
      videoFilenameA.appendChild(document.createTextNode(videoEntity.video_filename));
      this.videoFilenameTds[i].replaceChild(videoFilenameA, videoFilenameElement);
    }

  } else if (this.didFrameExtractionFailToStart(videoEntity)) {
    this.triggerFrameExtractionButton_onclick(videoEntity.video_uuid);

  } else if (this.isFrameExtractionStalled(videoEntity)) {
    this.triggerFrameExtractionButton_onclick(videoEntity.video_uuid);

  } else {
    this.trs[i].className = 'frameExtractionIncomplete';
    setTimeout(this.retrieveVideoEntity.bind(this, videoEntity.video_uuid, true), 1000);
  }
};

fmltc.ListVideos.prototype.didFrameExtractionFailToStart = function(videoEntity) {
  if (videoEntity.frame_extractor_triggered_time_utc_ms != 0 &&
      videoEntity.frame_extractor_active_time_utc_ms == 0) {
    const minutesSinceFrameExtractorWasTriggered = (Date.now() - videoEntity.frame_extractor_triggered_time_utc_ms) / 60000;
    if (minutesSinceFrameExtractorWasTriggered > 3) {
      return true;
    }
  }
  return false;
};

fmltc.ListVideos.prototype.isFrameExtractionStalled = function(videoEntity) {
  if (videoEntity.frame_extractor_active_time_utc_ms != 0) {
    const minutesSinceFrameExtractorWasActive = (Date.now() - videoEntity.frame_extractor_active_time_utc_ms) / 60000;
    if (minutesSinceFrameExtractorWasActive > 3) {
      return true;
    }
  }
  return false;
};

fmltc.ListVideos.prototype.retrieveVideoEntity = function(videoUuid, checkDeleted) {
  if (checkDeleted && this.indexOfVideo(videoUuid) == -1) {
    // The video was deleted.
    return;
  }

  const xhr = new XMLHttpRequest();
  const params = 'video_uuid=' + encodeURIComponent(videoUuid);
  xhr.open('POST', '/retrieveVideo', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveVideo_onreadystatechange.bind(this, xhr, params,
      videoUuid, checkDeleted);
  xhr.send(params);
};

fmltc.ListVideos.prototype.xhr_retrieveVideo_onreadystatechange = function(xhr, params,
    videoUuid, checkDeleted) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (checkDeleted && this.indexOfVideo(videoUuid) == -1) {
      // This video was deleted.
      return;
    }

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const videoEntity = response.video_entity;
      this.onVideoEntityUpdated(videoEntity);
      if (this.videoEntityArray.length > 0) {
        this.videosListDiv.style.display = 'block';
      }

    } else {
      // TODO(lizlooney): handle error properly. Currently we try again in 3 seconds, but that
      // might not be the best idea.
      console.log('Failure! /retrieveVideo?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Will retry /retrieveVideo?' + params + ' in 3 seconds.');
      setTimeout(this.retrieveVideoEntity.bind(this, videoUuid, checkDeleted), 3000);
    }
  }
};

fmltc.ListVideos.prototype.uploadVideoFileButton_onclick = function() {
  new fmltc.UploadVideoFileDialog(this.util, this.onVideoUploaded.bind(this));
};

fmltc.ListVideos.prototype.onVideoUploaded = function(videoUuid) {
  this.retrieveVideoEntity(videoUuid, false);
};

fmltc.ListVideos.prototype.videoCheckboxAll_onclick = function() {
  var anyChecked = false;
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (!this.checkboxes[i].disabled) {
      if (this.checkboxes[i].checked) {
        anyChecked = true;
        break;
      }
    }
  }
  const check = !anyChecked;
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (!this.checkboxes[i].disabled) {
      this.checkboxes[i].checked = check;
    }
  }
  this.videoCheckboxAll.checked = check;

  this.updateProduceDatasetButton();
};

fmltc.ListVideos.prototype.checkbox_onclick = function() {
  this.updateProduceDatasetButton();
};

fmltc.ListVideos.prototype.updateProduceDatasetButton = function() {
  var disabled = true;
  if (!this.datasetInProgress) {
    for (let i = 0; i < this.checkboxes.length; i++) {
      if (!this.checkboxes[i].disabled) {
        if (this.checkboxes[i].checked) {
          disabled = false;
          break;
        }
      }
    }
  }
  this.produceDatasetButton.disabled = disabled;
};


fmltc.ListVideos.prototype.deleteButton_onclick = function(videoUuid) {
  this.util.setWaitCursor();

  const xhr = new XMLHttpRequest();
  const params = 'video_uuid=' + encodeURIComponent(videoUuid);
  xhr.open('POST', '/deleteVideo', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_deleteVideo_onreadystatechange.bind(this, xhr, params,
      videoUuid);
  xhr.send(params);
};

fmltc.ListVideos.prototype.xhr_deleteVideo_onreadystatechange = function(xhr, params,
    videoUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.util.clearWaitCursor();

    if (xhr.status === 200) {
      const i = this.indexOfVideo(videoUuid);
      if (i != -1) {
        this.videosTable.deleteRow(i + this.headerRowCount);
        this.videoEntityArray.splice(i, 1);
        this.checkboxes[i].onclick = null
        this.checkboxes.splice(i, 1);
        this.trs.splice(i, 1);
        this.deleteButtons[i].onclick = null;
        this.deleteButtons.splice(i, 1);
        this.triggerFrameExtractionButtons[i].onclick = null;
        this.triggerFrameExtractionButtons.splice(i, 1);
        this.videoFilenameTds.splice(i, 1);
        this.dimensionsSpans.splice(i, 1);
        this.durationSpans.splice(i, 1);
        this.framesPerSecondSpans.splice(i, 1);
        this.frameCountSpans.splice(i, 1);
        this.extractedFrameCountSpans.splice(i, 1);
        this.excludedFrameCountSpans.splice(i, 1);
        if (this.videoEntityArray.length == 0) {
          this.videosListDiv.style.display = 'none';
        }
      }

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /deleteVideo?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListVideos.prototype.triggerFrameExtractionButton_onclick = function(videoUuid) {
  const i = this.indexOfVideo(videoUuid);
  if (i != -1) {
    this.triggerFrameExtractionButtons[i].disabled = true;
    this.triggerFrameExtractionButtons[i].style.display = 'none';

    const xhr = new XMLHttpRequest();
    const params = 'video_uuid=' + encodeURIComponent(videoUuid);
    xhr.open('POST', '/triggerFrameExtraction', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = this.xhr_triggerFrameExtraction_onreadystatechange.bind(this, xhr, params,
        videoUuid);
    xhr.send(params);
  }
};

fmltc.ListVideos.prototype.xhr_triggerFrameExtraction_onreadystatechange = function(xhr, params,
    videoUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.util.callHttpPerformAction(response.action_parameters, 0);
      const i = this.indexOfVideo(videoUuid);
      if (i != -1) {
        this.trs[i].className = 'frameExtractionIncomplete';
      }
      setTimeout(this.retrieveVideoEntity.bind(this, videoUuid, true), 1000);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /triggerFrameExtraction?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.ListVideos.prototype.indexOfVideo = function(videoUuid) {
  for (let i = 0; i < this.videoEntityArray.length; i++) {
    if (this.videoEntityArray[i].video_uuid == videoUuid) {
      return i;
    }
  }
  return -1;
};

fmltc.ListVideos.prototype.getVideoUuids = function() {
  const videoUuids = [];
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (!this.checkboxes[i].disabled) {
      if (this.checkboxes[i].checked) {
        videoUuids.push(this.videoEntityArray[i].video_uuid);
      }
    }
  }
  return videoUuids;
};

fmltc.ListVideos.prototype.produceDatasetButton_onclick = function() {
  new fmltc.ProduceDatasetDialog(this.util, this.getVideoUuids(),
      this.onDatasetProduced.bind(this));
};

fmltc.ListVideos.prototype.onDatasetProduced = function(datasetEntity) {
  this.listDatasets.addNewDataset(datasetEntity);
  this.util.showDatasetsTab();
};
