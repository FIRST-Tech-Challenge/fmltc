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
 * @fileoverview The class for monitoring the training of a model.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.MonitorTraining');

goog.require('fmltc.Util');


/**
 * Class for monitoring the training of a model.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.MonitorTraining = function(util, modelUuid, modelEntitiesByUuid, datasetEntitiesByUuid) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.modelUuid = modelUuid;
  this.modelEntity = modelEntitiesByUuid[modelUuid];
  this.modelEntitiesByUuid = modelEntitiesByUuid;
  this.datasetEntitiesByUuid = datasetEntitiesByUuid;

  this.activeTrainingDiv = document.getElementById('activeTrainingDiv');
  this.cancelTrainingButton = document.getElementById('cancelTrainingButton');
  this.refreshIntervalRangeInput = document.getElementById('refreshIntervalRangeInput');
  this.refreshButton = document.getElementById('refreshButton');
  this.trainTimeTd = document.getElementById('trainTimeTd');
  this.trainingScalarsDiv = document.getElementById('trainingScalarsDiv');
  this.evalScalarsDiv = document.getElementById('evalScalarsDiv');
  this.trainingImagesDiv = document.getElementById('trainingImagesDiv');
  this.evalImagesDiv = document.getElementById('evalImagesDiv');
  this.modelLoader = document.getElementById('modelLoader');
  this.scalarsLoader = document.getElementById('scalarsLoader');
  this.imagesLoader = document.getElementById('imagesLoader');

  this.trainTimeIntervalId = 0;

  this.chartsLoaded = false;

  this.filledModelUI = false;

  this.trainingUpdated = '';
  this.evalUpdated = '';

  this.retrieveScalarsInProgressCounter = 0;

  this.trainingScalars = {};
  this.trainingScalars.mapTagToSteps = {}; // map<tag, sortedArray<step>>
  this.trainingScalars.mapTagToDiv = {}; // map<tag, div>
  this.trainingScalars.mapTagToLineChart = {}; // map<tag, LineChart>
  this.trainingScalars.mapTagToDataTable = {}; // map<tag, DataTable>
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are numbers
  this.trainingScalars.items = {};

  this.evalScalars = {};
  this.evalScalars.mapTagToDiv = {}; // map<tag, div>
  this.evalScalars.mapTagToSteps = {}; // map<tag, sortedArray<step>>
  this.evalScalars.mapTagToLineChart = {}; // map<tag, LineChart>
  this.evalScalars.mapTagToDataTable = {}; // map<tag, DataTable>
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are numbers
  this.evalScalars.items = {};

  this.retrieveImagesInProgressCounter = 0;

  this.trainingImages = {};
  this.trainingImages.mapTagToSteps = {}; // map<tag, sortedArray<step>>
  this.trainingImages.mapTagToDiv = {}; // map<tag, div>
  this.trainingImages.mapTagToStepLabelDiv = {}; // map<tag, div>
  this.trainingImages.mapTagToImgs = {}; // map<tag, map<step, img>>
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are objects with properties 'image_url', 'width', and
  // 'height'.
  this.trainingImages.items = {};

  this.evalImages = {};
  this.evalImages.mapTagToSteps = {}; // map<tag, sortedArray<step>>
  this.evalImages.mapTagToDiv = {}; // map<tag, div>
  this.evalImages.mapTagToStepLabelDiv = {}; // map<tag, div>
  this.evalImages.mapTagToImgs = {}; // map<tag, map<step, img>>
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are objects with properties 'image_url', 'width', and
  // 'height'.
  this.evalImages.items = {};

  document.getElementById('descriptionSpan').textContent = this.modelEntity.description;

  this.refreshTimeoutId = 0;
  this.retrieveDataStartTimeMs = 0;

  this.setRefreshIntervalRangeInputTitle();
  this.updateButtons();
  this.updateModelUI();
  this.retrieveData();

  google.charts.load('current', {'packages':['corechart']});
  google.charts.setOnLoadCallback(this.charts_onload.bind(this));

  document.getElementById('dismissButton').onclick = this.dismissButton_onclick.bind(this);
  this.cancelTrainingButton.onclick = this.cancelTrainingButton_onclick.bind(this);
  this.refreshIntervalRangeInput.onchange = this.refreshIntervalRangeInput_onchange.bind(this);
  this.refreshButton.onclick = this.refreshButton_onclick.bind(this);
};

fmltc.MonitorTraining.prototype.dismissButton_onclick = function() {
  window.history.back();
};

fmltc.MonitorTraining.prototype.updateButtons = function() {
  let canCancelTraining = true;
  if (this.util.isTrainingDone(this.modelEntity)) {
    canCancelTraining = false;
  } else {
    if (this.modelEntity.cancel_requested) {
      canCancelTraining = false;
    }
  }

  this.cancelTrainingButton.disabled = !canCancelTraining;
};

fmltc.MonitorTraining.prototype.cancelTrainingButton_onclick = function() {
  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(this.modelUuid);
  xhr.open('POST', '/cancelTrainingModel', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_cancelTraining_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.MonitorTraining.prototype.xhr_cancelTraining_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      this.modelEntityUpdated(response.model_entity);

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /cancelTraining?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.MonitorTraining.prototype.setRefreshIntervalRangeInputTitle = function() {
  if (this.refreshIntervalRangeInput.value == 1) {
    this.refreshIntervalRangeInput.title = this.refreshIntervalRangeInput.value + ' minute';
  } else {
    this.refreshIntervalRangeInput.title = this.refreshIntervalRangeInput.value + ' minutes';
  }
};

fmltc.MonitorTraining.prototype.refreshIntervalRangeInput_onchange = function() {
  this.setRefreshIntervalRangeInputTitle();

  // If the refresh timer is pending, restart it.
  if (this.refreshTimeoutId) {
    clearTimeout(this.refreshTimeoutId);
    this.refreshTimeoutId = 0;
    this.startRefreshTimer();
  }
};

fmltc.MonitorTraining.prototype.startRefreshTimer = function() {
  let msSinceRefresh = Date.now() - this.retrieveDataStartTimeMs;
  let timeoutMs = Math.max(1, this.refreshIntervalRangeInput.value * 60 * 1000 - msSinceRefresh);
  this.refreshTimeoutId = setTimeout(this.refreshTimeout.bind(this), timeoutMs);
};

fmltc.MonitorTraining.prototype.refreshTimeout = function() {
  this.refreshTimeoutId = 0;
  this.retrieveData();
};

fmltc.MonitorTraining.prototype.refreshButton_onclick = function() {
  // If the refresh timer is pending, stop it.
  if (this.refreshTimeoutId) {
    clearInterval(this.refreshTimeoutId);
    this.refreshTimeoutId = 0;
  }

  this.retrieveData();
};

fmltc.MonitorTraining.prototype.charts_onload = function() {
  this.chartsLoaded = true;
};

fmltc.MonitorTraining.prototype.retrieveData = function() {
  this.retrieveDataStartTimeMs = Date.now();

  this.refreshButton.disabled = true;

  this.retrieveSummariesUpdated(0);
};

fmltc.MonitorTraining.prototype.retrieveDataFinished = function() {
  if (!this.util.isTrainingDone(this.modelEntity)) {
    this.startRefreshTimer();
    this.refreshButton.disabled = false;
  }
};

fmltc.MonitorTraining.prototype.incrementRetrieveDataInProgressCounter = function(valueType) {
  if (valueType == 'scalar') {
    if (this.retrieveScalarsInProgressCounter == 0) {
      this.scalarsLoader.style.visibility = 'visible';
    }
    this.retrieveScalarsInProgressCounter++;
  } else if (valueType == 'image') {
    if (this.retrieveImagesInProgressCounter == 0) {
      this.imagesLoader.style.visibility = 'visible';
    }
    this.retrieveImagesInProgressCounter++;
  }
};

fmltc.MonitorTraining.prototype.decrementRetrieveDataInProgressCounter = function(valueType) {
  if (valueType == 'scalar') {
    this.retrieveScalarsInProgressCounter--;
    if (this.retrieveScalarsInProgressCounter == 0) {
      this.scalarsLoader.style.visibility = 'hidden';
    }
  } else if (valueType == 'image') {
    this.retrieveImagesInProgressCounter--;
    if (this.retrieveImagesInProgressCounter == 0) {
      this.imagesLoader.style.visibility = 'hidden';
    }
  }
  if (this.retrieveScalarsInProgressCounter == 0 && this.retrieveImagesInProgressCounter == 0) {
    this.retrieveDataFinished();
  }
};

fmltc.MonitorTraining.prototype.retrieveSummariesUpdated = function(failureCount) {
  if (failureCount == 0) {
    this.incrementRetrieveDataInProgressCounter('scalar');
    this.incrementRetrieveDataInProgressCounter('image');
  }

  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(this.modelUuid);
  xhr.open('POST', '/retrieveSummariesUpdated', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveSummariesUpdated_onreadystatechange.bind(this, xhr, params, failureCount);
  xhr.send(params);
};

fmltc.MonitorTraining.prototype.xhr_retrieveSummariesUpdated_onreadystatechange = function(xhr, params,
    failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      this.modelEntityUpdated(response.model_entity);

      if (response.training_updated != this.trainingUpdated ||
          response.eval_updated != this.evalUpdated) {
        this.trainingUpdated = response.training_updated;
        this.evalUpdated = response.eval_updated;

        this.retrieveTagsAndSteps('training', 'scalar', 0);
        this.retrieveTagsAndSteps('eval', 'scalar', 0);
        this.retrieveTagsAndSteps('training', 'image', 0);
        this.retrieveTagsAndSteps('eval', 'image', 0);
      }

      this.decrementRetrieveDataInProgressCounter('scalar');
      this.decrementRetrieveDataInProgressCounter('image');

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveSummariesUpdated?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveSummariesUpdated.bind(this, failureCount), delay * 1000);
      } else {
        console.log('Unable to retrieve whether summaries have been updated.');

        this.decrementRetrieveDataInProgressCounter('scalar');
        this.decrementRetrieveDataInProgressCounter('image');
      }
    }
  }
};

fmltc.MonitorTraining.prototype.retrieveTagsAndSteps = function(job, valueType, failureCount) {
  if (failureCount == 0) {
    this.incrementRetrieveDataInProgressCounter(valueType);
  }

  const xhr = new XMLHttpRequest();
  const params =
      'model_uuid=' + encodeURIComponent(this.modelUuid) +
      '&job=' + encodeURIComponent(job) +
      '&value_type=' + encodeURIComponent(valueType);
  xhr.open('POST', '/retrieveTagsAndSteps', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveTagsAndSteps_onreadystatechange.bind(this, xhr, params,
      job, valueType, failureCount);
  xhr.send(params);
};

fmltc.MonitorTraining.prototype.xhr_retrieveTagsAndSteps_onreadystatechange = function(xhr, params,
    job, valueType, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      const o = (job == 'training')
          ? ((valueType == 'scalar') ? this.trainingScalars : this.trainingImages)
          : ((valueType == 'scalar') ? this.evalScalars : this.evalImages);

      // Remove the step and tag pairs that we already have items for.
      const step_and_tag_pairs = [];
      for (let i = 0; i < response.step_and_tag_pairs.length; i++) {
        const stepAndTagPair = response.step_and_tag_pairs[i];
        const key = this.makeKey(stepAndTagPair);
        if (key in o.items) {
          // We already have this item.
          continue;
        }
        step_and_tag_pairs.push(stepAndTagPair);
      }
      response.step_and_tag_pairs = step_and_tag_pairs;

      this.addToMapTagToSteps(response.step_and_tag_pairs, o.mapTagToSteps);

      const newMapTagToSteps = {};
      this.addToMapTagToSteps(response.step_and_tag_pairs, newMapTagToSteps);

      // Send requests to retrieve the summary items.
      // Image URLs have to be authenticated, which takes time. We can only get 10 at a time due to
      // the 30 second request limit.
      const maxItemsPerRequest = (valueType == 'image') ? 10 : 50;

      // Add the charts or images.
      var highPriorityStepAndTagPairs;
      if (valueType == 'scalar') {
        highPriorityStepAndTagPairs = this.addCharts(o, newMapTagToSteps,
            (job == 'training') ? this.trainingScalarsDiv : this.evalScalarsDiv, maxItemsPerRequest);
      } else /* if (valueType == 'image') */ {
        highPriorityStepAndTagPairs = this.addImages(o, newMapTagToSteps,
            (job == 'training') ? this.trainingImagesDiv : this.evalImagesDiv, maxItemsPerRequest);
      }

      // Send the requests for highPriorityStepAndTagPairs.
      const alreadyRequestedKeys = [];
      if (highPriorityStepAndTagPairs.length > 0) {
        this.retrieveSummaryItems(job, valueType, highPriorityStepAndTagPairs, 0);
        for (let i = 0; i < highPriorityStepAndTagPairs.length; i++) {
          alreadyRequestedKeys.push(this.makeKey(highPriorityStepAndTagPairs[i]));
        }
      }

      let requestStepAndTagPairs = [];
      for (let i = 0; i < response.step_and_tag_pairs.length; i++) {
        const stepAndTagPair = response.step_and_tag_pairs[i];

        const key = this.makeKey(stepAndTagPair);
        if (alreadyRequestedKeys.indexOf(key) != -1) {
          // We already requested this item because it is in highPriorityStepAndTagPairs.
          continue;
        }

        requestStepAndTagPairs.push(stepAndTagPair);
        if (requestStepAndTagPairs.length == maxItemsPerRequest) {
          this.retrieveSummaryItems(job, valueType, requestStepAndTagPairs, 0);
          requestStepAndTagPairs = [];
        }
      }

      if (requestStepAndTagPairs.length > 0) {
        this.retrieveSummaryItems(job, valueType, requestStepAndTagPairs, 0);
      }

      this.decrementRetrieveDataInProgressCounter(valueType);

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveTagsAndSteps?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveTagsAndSteps.bind(this, job, valueType, failureCount), delay * 1000);
      } else {
        console.log('Unable to retrieve the tags and steps.');

        this.decrementRetrieveDataInProgressCounter(valueType);
      }
    }
  }
};

fmltc.MonitorTraining.prototype.makeKey = function(stepAndTagPair) {
  return stepAndTagPair.step + '_' + stepAndTagPair.tag;
};

fmltc.MonitorTraining.prototype.addToMapTagToSteps = function(stepAndTagPairs, mapTagToSteps) {
  // map<tag, array<step>>
  for (let i = 0; i < stepAndTagPairs.length; i++) {
    const stepAndTagPair = stepAndTagPairs[i];
    const step = stepAndTagPair.step;
    const tag = stepAndTagPair.tag;

    let arrayStep; // array<step>
    if (tag in mapTagToSteps) {
      arrayStep = mapTagToSteps[tag];
    } else {
      arrayStep = [];
      mapTagToSteps[tag] = arrayStep;
    }
    arrayStep.push(step);
  }
  // Sort each array of steps.
  for (const tag in mapTagToSteps) {
    mapTagToSteps[tag].sort(this.util.compare.bind(this.util));
  }
};

fmltc.MonitorTraining.prototype.retrieveSummaryItems = function(job, valueType, requestStepAndTagPairs, failureCount) {
  if (failureCount == 0) {
    this.incrementRetrieveDataInProgressCounter(valueType);
  }

  const xhr = new XMLHttpRequest();
  let params =
      'model_uuid=' + encodeURIComponent(this.modelUuid) +
      '&job=' + encodeURIComponent(job) +
      '&value_type=' + encodeURIComponent(valueType);
  for (let i = 0; i < requestStepAndTagPairs.length; i++) {
    params +=
        '&step' + i + '=' + requestStepAndTagPairs[i].step +
        '&tag' + i + '=' + requestStepAndTagPairs[i].tag;
  }
  xhr.open('POST', '/retrieveSummaryItems', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveSummaryItems_onreadystatechange.bind(this, xhr, params,
      job, valueType, requestStepAndTagPairs, failureCount);
  xhr.send(params);
};

fmltc.MonitorTraining.prototype.xhr_retrieveSummaryItems_onreadystatechange = function(xhr, params,
    job, valueType, requestStepAndTagPairs, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      const o = (job == 'training')
          ? ((valueType == 'scalar') ? this.trainingScalars : this.trainingImages)
          : ((valueType == 'scalar') ? this.evalScalars : this.evalImages);

      for (let i = 0; i < response.summary_items.length; i++) {
        const item = response.summary_items[i];
        const key = this.makeKey(item);
        o.items[key] = item;
      }

      if (valueType == 'scalar') {
        for (let i = 0; i < response.summary_items.length; i++) {
          const item = response.summary_items[i];
          this.addScalarValue(o, item.tag, item.step, item.value);
        }
      } else /* if (valueType == 'image') */ {
        let delayForImage = 0;
        for (let i = 0; i < response.summary_items.length; i++) {
          const item = response.summary_items[i];
          this.addImageValue(o, item.tag, item.step, item.value, delayForImage);
          delayForImage += 10;
        }
      }

      this.decrementRetrieveDataInProgressCounter(valueType);

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveSummaryItems?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveSummaryItems.bind(this, job, valueType, requestStepAndTagPairs, failureCount), delay * 1000);
      } else {
        console.log('Unable to retrieve the summary values.');

        this.decrementRetrieveDataInProgressCounter(valueType);
      }
    }
  }
};

fmltc.MonitorTraining.prototype.modelEntityUpdated = function(newModelEntity) {
  this.modelEntity = newModelEntity;

  this.updateButtons();
  this.updateModelUI();

  this.activeTrainingDiv.style.display = this.util.isTrainingDone(this.modelEntity)
      ? 'none' : 'inline-block';
};

fmltc.MonitorTraining.prototype.updateModelUI = function() {
  if (!this.filledModelUI) {
    // This block fills in the parts that don't change.
    document.getElementById('dateCreatedTd').textContent =
        new Date(this.modelEntity.create_time_ms).toLocaleString();

    document.getElementById('originalModelTd').textContent =
        this.modelEntity.original_starting_model;

    let addedDatasetUuids = this.modelEntity.dataset_uuids.slice();
    if (this.modelEntity.original_starting_model != this.modelEntity.starting_model) {
      document.getElementById('previousModelTd').textContent =
          this.modelEntity.user_visible_starting_model;

      const previousModelEntity = this.modelEntitiesByUuid[this.modelEntity.starting_model];
      document.getElementById('previousTrainingStepsTd').textContent =
          new Number(previousModelEntity.total_training_steps).toLocaleString();

      addedDatasetUuids = addedDatasetUuids.filter(function(datasetUuid) {
        return !previousModelEntity.dataset_uuids.includes(datasetUuid);
      });

      const previousDatasetsTd = document.getElementById('previousDatasetsTd');
      for (let i = 0; i < previousModelEntity.dataset_uuids.length; i++) {
        const previousDatasetUuid = previousModelEntity.dataset_uuids[i];
        const previousDatasetEntity = this.datasetEntitiesByUuid[previousDatasetUuid];
        const div = document.createElement('div');
        div.textContent = previousDatasetEntity.description;
        previousDatasetsTd.appendChild(div);
      }

    } else {
      this.util.deleteRowById('previousModelTr');
      this.util.deleteRowById('previousTrainingStepsTr');
      this.util.deleteRowById('previousDatasetsTr');
    }

    const addedDatasetsTd = document.getElementById('addedDatasetsTd');
    for (let i = 0; i < addedDatasetUuids.length; i++) {
      const addedDatasetEntity = this.datasetEntitiesByUuid[addedDatasetUuids[i]];
      const div = document.createElement('div');
      div.textContent = addedDatasetEntity.description;
      addedDatasetsTd.appendChild(div);
    }

    document.getElementById('trainFrameCountTd').textContent =
        new Number(this.modelEntity.train_frame_count).toLocaleString();
    document.getElementById('trainNegativeFrameCountTd').textContent =
        new Number(this.modelEntity.train_negative_frame_count).toLocaleString();
    const trainLabelCountsTable = document.getElementById('trainLabelCountsTable');
    for (const label in this.modelEntity.train_dict_label_to_count) {
      const tr = trainLabelCountsTable.insertRow(-1);
      let td = tr.insertCell(-1);
      td.textContent = label;
      td = tr.insertCell(-1);
      td.textContent = new Number(this.modelEntity.train_dict_label_to_count[label]).toLocaleString();
    }

    document.getElementById('numTrainingStepsTd').textContent =
        new Number(this.modelEntity.num_training_steps).toLocaleString();

    document.getElementById('evalFrameCountTd').textContent =
        new Number(this.modelEntity.eval_frame_count).toLocaleString();
    document.getElementById('evalNegativeFrameCountTd').textContent =
        new Number(this.modelEntity.eval_negative_frame_count).toLocaleString();
    const evalLabelCountsTable = document.getElementById('evalLabelCountsTable');
    for (const label in this.modelEntity.eval_dict_label_to_count) {
      const tr = evalLabelCountsTable.insertRow(-1);
      let td = tr.insertCell(-1);
      td.textContent = label;
      td = tr.insertCell(-1);
      td.textContent = new Number(this.modelEntity.eval_dict_label_to_count[label]).toLocaleString();
    }

    this.filledModelUI = true;
  }

  document.getElementById('trainStateTd').textContent = this.util.formatJobState(
      this.modelEntity.cancel_requested, this.modelEntity.train_job_state);

  if (this.modelEntity.train_job_elapsed_seconds > 0) {
    this.trainTimeTd.textContent =
        this.util.formatElapsedSeconds(this.modelEntity.train_job_elapsed_seconds);
  } else {
    this.estimateTrainTime();
  }

  document.getElementById('evalStateTd').textContent = this.util.formatJobState(
      this.modelEntity.cancel_requested, this.modelEntity.eval_job_state);

  this.modelLoader.style.visibility = 'hidden';
};

fmltc.MonitorTraining.prototype.estimateTrainTime = function() {
  if (this.modelEntity.train_job_elapsed_seconds == 0) {
    if ('train_job_start_time' in this.modelEntity) {
      this.trainTimeTd.textContent = this.util.formatElapsedSeconds(
          this.util.calculateSecondsSince(this.modelEntity.train_job_start_time));
    }

    // Make sure we have a timer going to update the estimate every half second.
    if (!this.trainTimeIntervalId) {
      this.trainTimeIntervalId = setInterval(this.estimateTrainTime.bind(this), 500);
    }
  } else {
    // Clear the timer. We don't need it anymore.
    if (this.trainTimeIntervalId) {
      clearInterval(this.trainTimeIntervalId);
      this.trainTimeIntervalId = 0;
    }
  }
};

fmltc.MonitorTraining.prototype.addCharts = function(scalars, newMapTagToSteps, parentDiv, maxVisible) {
  if (!this.chartsLoaded) {
    // Try again in 1 second.
    console.log('Will retry addCharts in 1 second.');
    setTimeout(this.addCharts.bind(this, scalars, newMapTagToSteps, parentDiv, maxVisible), 1000);
    return [];
  }

  var highPriorityStepAndTagPairs = [];
  for (const tag in newMapTagToSteps) {
    let divForTag;
    if (tag in scalars.mapTagToDiv) {
      // We've already added the div for this tag.
      divForTag = scalars.mapTagToDiv[tag];

    } else {
      // Create a chart for this tag.
      divForTag = document.createElement('div');
      divForTag.style.width = '800px';
      divForTag.style.height = '500px';
      parentDiv.appendChild(divForTag);
      scalars.mapTagToDiv[tag] = divForTag;
      scalars.mapTagToLineChart[tag] = new google.visualization.LineChart(divForTag);
      scalars.mapTagToDataTable[tag] = new google.visualization.DataTable();
      scalars.mapTagToDataTable[tag].addColumn('number', 'Step');
      scalars.mapTagToDataTable[tag].addColumn('number', '');
      this.drawChart(scalars, tag);
    }

    if (this.util.getCurrentTabDivId() == 'scalarsTabDiv') {
      // Fill highPriorityStepAndTagPairs with the tags/steps that should be requested first because
      // they are visible.
      if (highPriorityStepAndTagPairs.length < maxVisible) {
        if (this.util.isVisible(divForTag)) {
          // Add the all new steps for this tag.
          const newSortedSteps = newMapTagToSteps[tag];
          for (let iStep = 0; iStep < newSortedSteps.length; iStep++) {
            const stepAndTagPair = {'step': newSortedSteps[iStep], 'tag': tag};
            highPriorityStepAndTagPairs.push(stepAndTagPair);
            if (highPriorityStepAndTagPairs.length == maxVisible) {
              break;
            }
          }
        }
      }
    }
  }
  return highPriorityStepAndTagPairs;
};

fmltc.MonitorTraining.prototype.addScalarValue = function(scalars, tag, step, value) {
  if (! (tag in scalars.mapTagToDataTable)) {
    // Try again in 1 second.
    console.log('Will retry addScalarValue for tag ' + tag + ' in 1 second.');
    setTimeout(this.addScalarValue.bind(this, scalars, tag, step, value), 1000);
    return;
  }

  scalars.mapTagToDataTable[tag].addRow([step, value]);
  scalars.mapTagToDataTable[tag].sort([{column: 0}])
  this.drawChart(scalars, tag);
};

fmltc.MonitorTraining.prototype.drawChart = function(scalars, tag) {
  const options = {
    width: 800,
    height: 500,
    hAxis: {
      minValue: 0,
      maxValue: this.modelEntity.num_training_steps,
      title: 'Step'
    },
    vAxis: {
      title: ' ',
    },
    legend: 'none',
    lineWidth: 4,
    pointSize: 6,
    interpolateNulls: true,
    title: tag,
    titleTextStyle: {
      fontName: 'Roboto',
      fontSize: 24,
      bold: true,
    },
  };
  scalars.mapTagToLineChart[tag].draw(scalars.mapTagToDataTable[tag], options);
};

fmltc.MonitorTraining.prototype.addImages = function(images, newMapTagToSteps, parentDiv, maxVisible) {
  const tags = [];
  for (const tag in newMapTagToSteps) {
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  tags.sort(this.compareImageTags.bind(this));

  var highPriorityStepAndTagPairs = [];

  for (let iTag = 0; iTag < tags.length; iTag++) {
    const tag = tags[iTag];
    const newSortedSteps = newMapTagToSteps[tag];

    let divForTag;
    let stepRangeInput;
    if (tag in images.mapTagToDiv) {
      // We've already added the div for this tag.
      divForTag = images.mapTagToDiv[tag];
      // Find the stepRangeInput.
      stepRangeInput = divForTag.getElementsByTagName('INPUT')[0];

    } else {
      if (parentDiv.childElementCount > 0) {
        // Add a horizontal rule to separate from the previous image.
        parentDiv.appendChild(document.createElement('br'));
        parentDiv.appendChild(document.createElement('hr'));
        parentDiv.appendChild(document.createElement('br'));
      }

      divForTag = document.createElement('div');
      divForTag.style.height = '420px';
      parentDiv.appendChild(divForTag);
      images.mapTagToDiv[tag] = divForTag;

      // Add a div to show the tag.
      const label = document.createElement('div');
      label.textContent = tag;
      divForTag.appendChild(label);

      // Add a range input so the user can select the step.
      stepRangeInput = document.createElement('input');
      stepRangeInput.setAttribute('type', 'range');
      stepRangeInput.min = 0;
      divForTag.appendChild(stepRangeInput);

      // Add a div to show which step is selected.
      const stepLabelDiv = document.createElement('div');
      divForTag.appendChild(stepLabelDiv);
      images.mapTagToStepLabelDiv[tag] = stepLabelDiv;

      stepRangeInput.onchange = this.stepRangeInput_onchange.bind(this, images, tag);
    }

    let mapStepToImg;
    if (tag in images.mapTagToImgs) {
      mapStepToImg = images.mapTagToImgs[tag];
    } else {
      mapStepToImg = {};
      images.mapTagToImgs[tag] = mapStepToImg;
    }

    for (let iStep = 0; iStep < newSortedSteps.length; iStep++) {
      const step = newSortedSteps[iStep];
      if (step in mapStepToImg) {
        // We already have an img for this step.
        continue;
      }

      // Create an img for this step.
      const img = document.createElement('img');
      img.src = '//:0';
      img.style.display = 'none';
      divForTag.appendChild(img);
      mapStepToImg[step] = img;
    }

    // Set the stepRangeInput's max to the number of steps. (not just new steps, but all steps for
    // this tag)
    const sortedSteps = images.mapTagToSteps[tag];
    stepRangeInput.max = sortedSteps.length - 1;

    if (this.util.getCurrentTabDivId() == 'imagesTabDiv') {
      // Fill highPriorityStepAndTagPairs with the tags/steps that should be requested first because
      // they are visible.
      if (highPriorityStepAndTagPairs.length < maxVisible) {
        if (this.util.isVisible(divForTag)) {
          // Add the largest new step for this tag.
          const stepAndTagPair = {'step': newSortedSteps[newSortedSteps.length-1], 'tag': tag};
          highPriorityStepAndTagPairs.push(stepAndTagPair);
        }
      }
    }
  }

  return highPriorityStepAndTagPairs;
};

fmltc.MonitorTraining.prototype.compareImageTags = function(a, b) {
  if (a == b) {
    return 0;
  }
  let patt = /([^/]*)\/([0-9]+)\/([0-9]+)/;
  let aResult = a.match(patt);
  let bResult = b.match(patt);
  if (aResult && bResult && aResult.length == bResult.length) {
    for (let i = 1; i < aResult.length; i++) {
      let ar = aResult[i];
      let br = bResult[i];
      if (this.util.isNumeric(aResult[i]) && this.util.isNumeric(bResult[i])) {
        ar = parseFloat(ar);
        br = parseFloat(br);
      }
      let result = this.util.compare(ar, br);
      if (result != 0) {
        return result;
      }
    }
    return 0;
  } else {
    return this.util.compare(a, b);
  }
};

fmltc.MonitorTraining.prototype.stepRangeInput_onchange = function(images, tag) {
  const divForTag = images.mapTagToDiv[tag];
  const stepRangeInput = divForTag.getElementsByTagName('INPUT')[0];
  const stepLabelDiv = images.mapTagToStepLabelDiv[tag];
  const sortedSteps = images.mapTagToSteps[tag];

  const selectedIndex = stepRangeInput.value;
  const selectedStep = sortedSteps[selectedIndex];
  stepLabelDiv.textContent = 'Step: ' + new Number(selectedStep).toLocaleString();

  const mapStepToImg = images.mapTagToImgs[tag];
  let found = false;
  for (let i = 0; i < sortedSteps.length; i++) {
    const step = sortedSteps[i];
    const img = mapStepToImg[step];
    if (i == selectedIndex && img.src != '//:0') {
      img.style.display = 'block';
      found = true;
    } else {
      img.style.display = 'none';
    }
  }
  if (found) {
    divForTag.style.height = '';
  }
};

fmltc.MonitorTraining.prototype.addImageValue = function(images, tag, step, value, delayForImage) {
  if (! (tag in images.mapTagToImgs)) {
    // Try again in 1 second.
    console.log('Will retry addImageValue for tag ' + tag + ' in 1 second.');
    setTimeout(this.addImageValue.bind(this, images, tag, step, value, delayForImage), 1000);
    return;
  }

  setTimeout(this.retrieveImage.bind(this, images, tag, step, value, 0), delayForImage);
};

fmltc.MonitorTraining.prototype.retrieveImage = function(images, tag, step, value, failureCount) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', value.image_url, true);
  xhr.responseType = 'blob';
  xhr.onreadystatechange = this.xhr_retrieveImage_onreadystatechange.bind(this, xhr,
      images, tag, step, value, failureCount);
  xhr.send(null);
};

fmltc.MonitorTraining.prototype.xhr_retrieveImage_onreadystatechange = function(xhr,
    images, tag, step, value, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const mapStepToImg = images.mapTagToImgs[tag];
      const img = mapStepToImg[step];
      img.src = window.URL.createObjectURL(xhr.response);
      img.setAttribute('width', value.width / 3);
      img.setAttribute('height', value.height / 3);

      const sortedSteps = images.mapTagToSteps[tag];
      if (step == sortedSteps[sortedSteps.length-1]) {

        const divForTag = images.mapTagToDiv[tag];
        const stepRangeInput = divForTag.getElementsByTagName('INPUT')[0];
        stepRangeInput.value = stepRangeInput.max;
        this.stepRangeInput_onchange(images, tag);
      }

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry ' + value.image_url + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveImage.bind(this, images, tag, step, value, failureCount), delay * 1000);
      } else {
        // TODO(lizlooney): handle error properly.
        console.log('Unable to retrieve an image with url ' + value.image_url);
      }
    }
  }
};
