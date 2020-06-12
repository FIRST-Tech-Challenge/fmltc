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
 * @constructor
 */
fmltc.ListVideos = function(util) {
  /** @type {!fmltc.Util} */
  this.util = util;

  this.videosListDiv = document.getElementById('videosListDiv');
  this.videosTable = document.getElementById('videosTable');
  this.videoCheckboxAll = document.getElementById('videoCheckboxAll');
  this.produceDatasetButton = document.getElementById('produceDatasetButton');
  this.deleteVideosButton = document.getElementById('deleteVideosButton');

  this.headerRowCount = this.videosTable.rows.length;

  // Arrays with one element per video. Note that these need to be spliced when a video is deleted.
  this.videoEntityArray = [];
  this.frameExtractionComplete = [];
  this.trs = [];
  this.checkboxes = [];
  this.descriptionTds = [];
  this.dimensionsTds = [];
  this.durationTds = [];
  this.framesPerSecondTds = [];
  this.frameCountTds = [];
  this.extractedFrameCountTds = [];
  this.excludedFrameCountTds = [];

  this.waitCursor = false;
  this.deleteVideoCounter = 0;

  this.retrieveVideos();

  this.updateButtons();

  const uploadVideoFileButton = document.getElementById('uploadVideoFileButton');
  uploadVideoFileButton.onclick = this.uploadVideoFileButton_onclick.bind(this);
  this.videoCheckboxAll.onclick = this.videoCheckboxAll_onclick.bind(this);
  this.produceDatasetButton.onclick = this.produceDatasetButton_onclick.bind(this);
  this.deleteVideosButton.onclick = this.deleteVideosButton_onclick.bind(this);
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

    this.frameExtractionComplete[i] = false;

    const tr = this.videosTable.insertRow(-1);
    this.trs[i] = tr;

    const checkboxTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    const checkbox = document.createElement('input');
    this.checkboxes[i] = checkbox;
    checkbox.setAttribute('type', 'checkbox');
    checkbox.onclick = this.checkbox_onclick.bind(this);
    checkboxTd.appendChild(checkbox);

    const dateUploadedTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    dateUploadedTd.textContent = new Date(videoEntity.upload_time_ms).toLocaleString();

    const descriptionTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    this.descriptionTds[i] = descriptionTd;
    descriptionTd.appendChild(document.createTextNode(videoEntity.description));

    const videoFilenameTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    videoFilenameTd.appendChild(document.createTextNode(videoEntity.video_filename));

    const fileSizeTd = this.util.insertCellWithClass(tr, 'cellWithBorder');
    fileSizeTd.setAttribute('align', 'right');
    fileSizeTd.textContent = new Number(videoEntity.file_size).toLocaleString();

    this.dimensionsTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');

    this.durationTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');
    this.durationTds[i].setAttribute('align', 'right');

    this.framesPerSecondTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');
    this.framesPerSecondTds[i].setAttribute('align', 'right');

    this.frameCountTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');
    this.frameCountTds[i].setAttribute('align', 'right');

    this.extractedFrameCountTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');
    this.extractedFrameCountTds[i].setAttribute('align', 'right');

    this.excludedFrameCountTds[i] = this.util.insertCellWithClass(tr, 'cellWithBorder');
    this.excludedFrameCountTds[i].setAttribute('align', 'right');
  }

  let frameExtractionComplete = true;
  if ('width' in videoEntity && 'height' in videoEntity) {
    this.dimensionsTds[i].textContent = videoEntity.width + ' x ' + videoEntity.height;
  } else {
    frameExtractionComplete = false;
  }
  if ('frame_count' in videoEntity && 'fps' in videoEntity) {
    this.durationTds[i].textContent = this.util.formatElapsedSeconds(videoEntity.frame_count / videoEntity.fps)
  } else {
    frameExtractionComplete = false;
  }
  if ('fps' in videoEntity) {
    this.framesPerSecondTds[i].textContent = videoEntity.fps.toFixed(0);
  } else {
    frameExtractionComplete = false;
  }
  if ('frame_count' in videoEntity) {
    this.frameCountTds[i].textContent = videoEntity.frame_count;
    if (videoEntity.extracted_frame_count != videoEntity.frame_count) {
      frameExtractionComplete = false;
    }
  } else {
    frameExtractionComplete = false;
  }
  this.extractedFrameCountTds[i].textContent = videoEntity.extracted_frame_count;
  if ('included_frame_count' in videoEntity) {
    this.excludedFrameCountTds[i].textContent =
        (videoEntity.extracted_frame_count - videoEntity.included_frame_count);
  }
  if (frameExtractionComplete) {
    this.frameExtractionComplete[i] = true;
    this.trs[i].className = 'frameExtractionComplete';
    // Make the description link to the labelVideo page, if it isn't already a link
    const descriptionElement = this.descriptionTds[i].childNodes[0];
    if (descriptionElement.nodeName != 'A') {           // A for Anchor
      const descriptionA = document.createElement('a'); // a for anchor
      const url = 'labelVideo?video_uuid=' + encodeURIComponent(videoEntity.video_uuid);
      descriptionA.setAttribute('href', url);
      descriptionA.appendChild(document.createTextNode(videoEntity.description));
      this.descriptionTds[i].replaceChild(descriptionA, descriptionElement);
    }

  } else if (this.didFrameExtractionFailToStart(videoEntity)) {
    this.triggerFrameExtraction(videoEntity.video_uuid);

  } else if (this.isFrameExtractionStalled(videoEntity)) {
    this.triggerFrameExtraction(videoEntity.video_uuid);

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
  this.util.checkAllOrNone(this.videoCheckboxAll, this.checkboxes);
  this.updateButtons();
};

fmltc.ListVideos.prototype.checkbox_onclick = function() {
  this.updateButtons();
};

fmltc.ListVideos.prototype.updateButtons = function() {
  const countChecked = this.util.countChecked(this.checkboxes);
  let frameExtractionIsNotComplete = false;
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      if (!this.frameExtractionComplete[i]) {
        frameExtractionIsNotComplete = true;
      }
    }
  }
  this.produceDatasetButton.disabled = this.waitCursor || countChecked == 0 || frameExtractionIsNotComplete;
  // TODO(lizlooney): Allow videos with incomplete frame extraction to be deleted (we'll need to
  // cancel the frame extraction).
  this.deleteVideosButton.disabled = this.waitCursor || countChecked == 0 || frameExtractionIsNotComplete;
};


fmltc.ListVideos.prototype.deleteVideosButton_onclick = function() {
  const videoUuids = this.getCheckedVideoUuids();
  new fmltc.DeleteConfirmationDialog(this.util, 'Delete Videos',
      'Are you sure you want to delete the selected videos?',
      this.deleteVideos.bind(this, videoUuids));
};

fmltc.ListVideos.prototype.deleteVideos = function(videoUuids) {
  this.waitCursor = true;
  this.util.setWaitCursor();
  this.updateButtons();

  this.deleteVideoCounter = 0;
  for (let i = 0; i < videoUuids.length; i++) {
    const videoUuid = videoUuids[i];
    const xhr = new XMLHttpRequest();
    const params = 'video_uuid=' + encodeURIComponent(videoUuid);
    xhr.open('POST', '/deleteVideo', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = this.xhr_deleteVideo_onreadystatechange.bind(this, xhr, params,
        videoUuid);
    xhr.send(params);
    this.deleteVideoCounter++;
  }
};

fmltc.ListVideos.prototype.xhr_deleteVideo_onreadystatechange = function(xhr, params,
    videoUuid) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.deleteVideoCounter--;
    if (this.deleteVideoCounter == 0) {
      this.util.clearWaitCursor();
      this.waitCursor = false;
      this.updateButtons();
    }

    if (xhr.status === 200) {
      const i = this.indexOfVideo(videoUuid);
      if (i != -1) {
        this.videosTable.deleteRow(i + this.headerRowCount);
        this.videoEntityArray.splice(i, 1);
        this.frameExtractionComplete.splice(i, 1);
        this.checkboxes[i].onclick = null
        this.checkboxes.splice(i, 1);
        this.trs.splice(i, 1);
        this.videoFilenameTds.splice(i, 1);
        this.dimensionsTds.splice(i, 1);
        this.durationTds.splice(i, 1);
        this.framesPerSecondTds.splice(i, 1);
        this.frameCountTds.splice(i, 1);
        this.extractedFrameCountTds.splice(i, 1);
        this.excludedFrameCountTds.splice(i, 1);
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

fmltc.ListVideos.prototype.triggerFrameExtraction = function(videoUuid) {
  const i = this.indexOfVideo(videoUuid);
  if (i != -1) {
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

fmltc.ListVideos.prototype.getCheckedVideoUuids = function() {
  const videoUuids = [];
  for (let i = 0; i < this.checkboxes.length; i++) {
    if (this.checkboxes[i].checked) {
      videoUuids.push(this.videoEntityArray[i].video_uuid);
    }
  }
  return videoUuids;
};

fmltc.ListVideos.prototype.produceDatasetButton_onclick = function() {
  new fmltc.ProduceDatasetDialog(this.util, this.getCheckedVideoUuids(),
      this.onDatasetProduced.bind(this));
};

fmltc.ListVideos.prototype.onDatasetProduced = function(datasetEntity) {
  this.util.getListDatasets().addNewDataset(datasetEntity);
  this.util.showDatasetsTab();
};
