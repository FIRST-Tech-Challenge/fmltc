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
 * @fileoverview The class for utilities.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.Util');

/**
 * Class for utilities.
 * @constructor
 */
fmltc.Util = function(pageBasename, preferences, modelTrainerData, trainingEnabled) {
  this.pageBasename = pageBasename;
  this.preferences = preferences;
  this.modelTrainerData = modelTrainerData;
  this.trainingEnabled = trainingEnabled;

  this.currentTabContentId = '';
  this.tabClickListeners = [];

  this.initializeTabs();
};

fmltc.Util.prototype.setListVideos = function(listVideos) {
  this.listVideos = listVideos;
};

fmltc.Util.prototype.setListDatasets = function(listDatasets) {
  this.listDatasets = listDatasets;
};

fmltc.Util.prototype.getListDatasets = function() {
  return this.listDatasets;
};

fmltc.Util.prototype.setListModels = function(listModels) {
  this.listModels = listModels;
};

fmltc.Util.prototype.getTrainingEnabled = function() {
  return this.trainingEnabled;
};

fmltc.Util.prototype.getListModels = function() {
  return this.listModels;
};

fmltc.Util.prototype.getPreference = function(key, defaultValue) {
  if (key in this.preferences) {
    return this.preferences[key];
  }
  return defaultValue;
};

fmltc.Util.prototype.setPreference = function(key, value) {
  if (this.preferences[key] == value) {
    return;
  }
  this.preferences[key] = value;

  const xhr = new XMLHttpRequest();
  const params =
      'key=' + encodeURIComponent(key) +
      '&value=' + encodeURIComponent(value);
  xhr.open('POST', '/setUserPreference', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.send(params);
};

fmltc.Util.prototype.setWaitCursor = function() {
  this.setWaitCursor_(document.body, true);
};

fmltc.Util.prototype.hasWaitCursor = function(element) {
  return element.classList && element.classList.contains('waitCursor');
};

fmltc.Util.prototype.clearWaitCursor = function() {
  this.setWaitCursor_(document.body, false);
};

fmltc.Util.prototype.setWaitCursor_ = function(element, wait) {
  if (wait) {
    this.addClass(element, 'waitCursor');
  } else {
    this.removeClass(element, 'waitCursor');
  }
  for (let i = 0; i < element.childNodes.length; i++) {
    this.setWaitCursor_(element.childNodes[i], wait);
  }
};

fmltc.Util.prototype.hideElement = function(element) {
  this.addClass(element, 'hidden');
};

fmltc.Util.prototype.showElement = function(element) {
  this.removeClass(element, 'hidden');
};

fmltc.Util.prototype.addClass = function(element, classname) {
  if (element.classList) {
    element.classList.add(classname);
  }
}

fmltc.Util.prototype.removeClass = function(element, classname) {
  if (element.classList) {
    element.classList.remove(classname);
  }
}

fmltc.Util.prototype.getDateTimeString = function(millis) {
  const d = new Date(millis);
  const year = String(d.getFullYear());
  let month = d.getMonth() + 1;
  if (month < 10) {
    month = '0' + month;
  }
  let day = d.getDate();
  if (day < 10) {
    day = '0' + day;
  }
  let hours = d.getHours();
  if (hours < 10) {
    hours = '0' + hours;
  }
  let minutes = d.getMinutes();
  if (minutes < 10) {
    minutes = '0' + minutes;
  }
  let seconds = d.getSeconds();
  if (seconds < 10) {
    seconds = '0' + seconds;
  }
  return year + month + day +
      '_' +
      hours + minutes + seconds;
}

fmltc.Util.prototype.initializeTabs = function() {
  const tabButtons = document.getElementsByClassName('tabButton');
  for (let i = 0; i < tabButtons.length; i++) {
    const tabButton = tabButtons[i];
    if (tabButton.getAttribute('role') == 'tab' && tabButton.getAttribute('aria-controls')) {
      // This is a new tab button. It uses aria-controls.
      const tabName = tabButton.id;
      tabButton.onclick = this.tabButton_onclick.bind(this, tabName);
    }
  }

  if (this.pageBasename == 'root') {
    this.showLastViewedTab();
  }
};

fmltc.Util.prototype.showLastViewedTab = function() {
  switch (this.pageBasename) {
    case 'root':
      this.showTab(this.getPreference('root.currentTab', 'videosTab'));
      break;
    case 'monitorTraining':
      this.showTab(this.getPreference('monitorTraining.currentTab', 'modelTab'));
      break;
  }
};

fmltc.Util.prototype.addTabClickListener = function(tabClickListener) {
  this.tabClickListeners.push(tabClickListener);
};

fmltc.Util.prototype.getCurrentTabContentId = function() {
  return this.currentTabContentId;
};

fmltc.Util.prototype.showVideosTab = function() {
  this.showTab('videosTab');
};

fmltc.Util.prototype.showDatasetsTab = function() {
  this.showTab('datasetsTab');
};

fmltc.Util.prototype.showModelsTab = function() {
  this.showTab('modelsTab');
};

fmltc.Util.prototype.tabButton_onclick = function(tabName) {
  this.setPreference(this.pageBasename + '.currentTab', tabName);

  this.currentTabContentId = tabName + 'Content';
  for (let i = 0; i < this.tabClickListeners.length; i++) {
    this.tabClickListeners[i](this.currentTabContentId);
  }
};

fmltc.Util.prototype.showTab = function(tabName) {
  const tabButton = document.getElementById(tabName);
  if (tabButton) {
    tabButton.click();
  }
};

fmltc.Util.prototype.calculateSecondsSince = function(dateString) {
  return (Date.now() - Date.parse(dateString)) / 1000;
};

fmltc.Util.prototype.formatElapsedSeconds = function(elapsedSeconds) {
  const hours = Math.floor(elapsedSeconds / 3600);
  elapsedSeconds -= hours * 3600;
  const minutes = Math.floor(elapsedSeconds / 60);
  elapsedSeconds -= minutes * 60;
  const seconds = Math.round(elapsedSeconds);
  if (hours > 0) {
    return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }
  return minutes + ':' + String(seconds).padStart(2, '0');
};

fmltc.Util.prototype.checkAllOrNone = function(checkboxAll, checkboxes) {
  if (checkboxes.length == 0) {
    return;
  }

  let anyChecked = false;
  for (let i = 0; i < checkboxes.length; i++) {
    if (checkboxes[i].checked) {
      anyChecked = true;
      break;
    }
  }
  const check = !anyChecked;
  for (let i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = check;
  }
  checkboxAll.checked = check;
};

fmltc.Util.prototype.countChecked = function(checkboxes) {
  let countChecked = 0;
  for (let i = 0; i < checkboxes.length; i++) {
    if (checkboxes[i].checked) {
      countChecked++;
    }
  }
  return countChecked;
};

fmltc.Util.prototype.insertCellWithClass = function(tr, clazz) {
  const td = tr.insertCell(-1);
  this.addClass(td, clazz);
  return td;
};

fmltc.Util.prototype.getBatchSize = function(startingModel, trainFrameCount) {
  // The following code matches the code in function __get_batch_size in model_trainer.py.
  let batchSize = this.modelTrainerData.batch_sizes[startingModel];
  while (batchSize > trainFrameCount && batchSize >= 2) {
    batchSize /= 2;
  }
  return batchSize;
};

fmltc.Util.prototype.isTrainingDone = function(modelEntity) {
  return this.isJobDone(modelEntity.train_job_state) && (
      this.isJobDone(modelEntity.eval_job_state ||
      modelEntity.eval_job_state == 'CANCELLING'));
};

fmltc.Util.prototype.isJobDone = function(jobState) {
  return (
      jobState == '' ||
      jobState == 'SUCCEEDED' ||
      jobState == 'FAILED' ||
      jobState == 'CANCELLED');
};

fmltc.Util.prototype.isStateChangingSoon = function(cancelRequested, jobState) {
  return (
      jobState == 'STATE_UNSPECIFIED' ||
      jobState == 'QUEUED' ||
      jobState == 'PREPARING' ||
      jobState == 'CANCELLING' ||
      this.isStateCancelRequested(cancelRequested, jobState));
};

fmltc.Util.prototype.isStateCancelRequested = function(cancelRequested, jobState) {
  return cancelRequested && jobState != 'CANCELLING' && !this.isJobDone(jobState);
};

fmltc.Util.prototype.formatJobState = function(jobType, modelEntity) {
  const jobState = (jobType == 'train') ? modelEntity.train_job_state : modelEntity.eval_job_state;

  if (jobType == 'train' && modelEntity.cancel_requested &&
      jobState != 'CANCELLING' && !this.isJobDone(jobState)) {
    // The job hasn't responded to our request to cancel it.
    return 'STOP REQUESTED';
  }

  if (jobState == 'CANCELLING') {
    // Until the job is stopped, we don't know for sure whether there will be a checkpoint or not,
    // so we show STOPPING.
    return 'STOPPING';
  }

  if (jobState == 'CANCELLED') {
    // We only show CANCELLED if the user cancelled it before any checkpoints were made.
    if (jobType == 'train' &&
        modelEntity.cancel_requested &&
        !this.modelHasCheckpoint(modelEntity)) {
      return 'CANCELLED';
    } else {
      return 'STOPPED';
    }
  }

  if (jobType == 'train' && jobState == 'FAILED' && (
      modelEntity.train_error_message.indexOf('TPU resources are insufficient') != -1 ||
      modelEntity.train_error_message.indexOf('Please try a different region') != -1)) {
    return 'TRY_AGAIN_LATER';
  }

  return jobState;
};

fmltc.Util.prototype.modelHasCheckpoint = function(modelEntity) {
  return modelEntity.trained_checkpoint_path != '' && this.isModelTensorFlow2(modelEntity);
};

fmltc.Util.prototype.isModelTensorFlow2 = function(modelEntity) {
  return 'tensorflow_version' in modelEntity && modelEntity.tensorflow_version == '2';
};

fmltc.Util.prototype.sortedLabelListsEqual = function(a1, a2) {
  if (a1.length != a2.length) {
    return false;
  }
  for (let i = 0; i < a1.length; i++) {
    if (a1[i] !== a2[i]) {
      return false;
    }
  }
  return true;
};

fmltc.Util.prototype.getTable = function(tr) {
  let table = tr.parentNode;
  while (table && table.tagName != 'TABLE') {
    table = table.parentNode;
  }
  return table;
};

fmltc.Util.prototype.deleteRowById = function(id) {
  const tr = document.getElementById(id);
  this.getTable(tr).deleteRow(tr.rowIndex);
};

fmltc.Util.prototype.isNumeric = function(s) {
  return !isNaN(parseFloat(s)) && isFinite(s);
};

fmltc.Util.prototype.compare = function(a, b) {
  return (a > b) ? 1 : ((a < b) ? -1 : 0);
};

fmltc.Util.prototype.compareCaseInsensitive = function(a, b) {
  a = a.toUpperCase();
  b = b.toUpperCase();
  return (a > b) ? 1 : ((a < b) ? -1 : 0);
};

fmltc.Util.prototype.isDisplayed = function(element, stopBeforeElement) {
  let e = element;
  while (e && e != stopBeforeElement) {
    if (e.style.display == 'none') {
      return false;
    }
    e = e.parentElement;
  }
  return true;
};

fmltc.Util.prototype.isVisible = function(element) {
  const rect = element.getBoundingClientRect();
  const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
  if (rect.bottom < 0) {
    // Element is above.
    return false;
  }
  if (rect.top >= viewHeight) {
    // Element is below.
    return false;
  }
  return true;
};
