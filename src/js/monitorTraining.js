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
  this.trainingScalarsHeading = document.getElementById('trainingScalarsHeading');
  this.evalScalarsDiv = document.getElementById('evalScalarsDiv');
  this.evalScalarsHeading = document.getElementById('evalScalarsHeading');
  this.firstPageButton = document.getElementById('firstPageButton');
  this.previousPageButton = document.getElementById('previousPageButton');
  this.nextPageButton = document.getElementById('nextPageButton');
  this.lastPageButton = document.getElementById('lastPageButton');
  this.currentPageSpan = document.getElementById('currentPageSpan');
  this.evalImagesDiv = document.getElementById('evalImagesDiv');
  this.modelLoader = document.getElementById('modelLoader');
  this.scalarsLoader = document.getElementById('scalarsLoader');
  this.imagesLoader = document.getElementById('imagesLoader');

  this.trainTimeIntervalId = 0;

  this.chartsLoaded = false;

  this.filledModelUI = false;

  this.trainingUpdated = '';
  this.evalUpdated = '';

  this.retrieveDataInProgressCounters = {};
  this.retrieveDataInProgressCounters['scalar'] = 0;
  this.retrieveDataInProgressCounters['image'] = 0;
  this.loaders = {};
  this.loaders['scalar'] = this.scalarsLoader;
  this.loaders['image'] = this.imagesLoader;

  this.trainingScalars = {};
  this.trainingScalars.job_type = 'train';
  this.trainingScalars.valueType = 'scalar';
  this.trainingScalars.maxItemsPerRequest = 50;
  this.trainingScalars.scalarsHeading = this.trainingScalarsHeading;
  this.trainingScalars.parentDiv = this.trainingScalarsDiv;
  this.trainingScalars.mapTagToSteps = {}; // map<tag, sortedArray<step>>
  this.trainingScalars.sortedTags = [];
  this.trainingScalars.mapTagToDiv = {}; // map<tag, div>
  this.trainingScalars.mapTagToLineChart = {}; // map<tag, LineChart>
  this.trainingScalars.mapTagToDataTable = {}; // map<tag, DataTable>
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are numbers
  this.trainingScalars.items = {};

  this.evalScalars = {};
  this.evalScalars.job_type = 'eval';
  this.evalScalars.valueType = 'scalar';
  this.evalScalars.maxItemsPerRequest = 50;
  this.evalScalars.scalarsHeading = this.evalScalarsHeading;
  this.evalScalars.parentDiv = this.evalScalarsDiv;
  this.evalScalars.mapTagToSteps = {}; // map<tag, sortedArray<step>>
  this.evalScalars.sortedTags = [];
  this.evalScalars.mapTagToDiv = {}; // map<tag, div>
  this.evalScalars.mapTagToLineChart = {}; // map<tag, LineChart>
  this.evalScalars.mapTagToDataTable = {}; // map<tag, DataTable>
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are numbers
  this.evalScalars.items = {};

  this.evalImages = {};
  this.evalImages.job_type = 'eval';
  this.evalImages.valueType = 'image';
  this.evalImages.maxItemsPerRequest = 20;
  this.evalImages.parentDiv = this.evalImagesDiv;
  this.evalImages.mapTagToSteps = {}; // map<tag, sortedArray<step>>
  this.evalImages.sortedTags = [];
  this.evalImages.currentPageIndex = 0;
  this.evalImages.pageDivs = [];
  this.evalImages.mapTagToDiv = {}; // map<tag, div>
  this.evalImages.mapTagToStepLabelDiv = {}; // map<tag, div>
  this.evalImages.mapTagToImgs = {}; // map<tag, map<step, img>>
  this.evalImages.mapTagToStepsNotRequestedYet = {}; // map<tag, array<step>>
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are objects with properties 'image_url', 'width', and
  // 'height'.
  this.evalImages.items = {};

  document.getElementById('descriptionSpan').textContent = this.modelEntity.description;

  this.refreshTimeoutId = 0;
  this.refreshStartTimeMs = 0;

  this.setRefreshIntervalRangeInputTitle();
  this.updateButtons();
  this.updateModelUI();
  this.retrieveData();

  google.charts.load('current', {'packages':['corechart']});
  google.charts.setOnLoadCallback(this.charts_onload.bind(this));

  this.tab_onresize(document.getElementById('imagesTabDiv'));
  this.util.addTabResizeListener(this.tab_onresize.bind(this));
  this.util.addTabClickListener(this.tab_onclick.bind(this));

  document.getElementById('dismissButton').onclick = this.dismissButton_onclick.bind(this);
  this.cancelTrainingButton.onclick = this.cancelTrainingButton_onclick.bind(this);
  this.refreshIntervalRangeInput.onchange = this.refreshIntervalRangeInput_onchange.bind(this);
  this.refreshButton.onclick = this.refreshButton_onclick.bind(this);
  this.firstPageButton.onclick = this.firstPageButton_onclick.bind(this);
  this.previousPageButton.onclick = this.previousPageButton_onclick.bind(this);
  this.nextPageButton.onclick = this.nextPageButton_onclick.bind(this);
  this.lastPageButton.onclick = this.lastPageButton_onclick.bind(this);
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
  let msSinceRefresh = Date.now() - this.refreshStartTimeMs;
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
  this.refreshStartTimeMs = Date.now();
  this.refreshButton.disabled = true;
  this.retrieveSummariesUpdated(0);
};

fmltc.MonitorTraining.prototype.incrementRetrieveDataInProgressCounter = function(valueType) {
  if (this.retrieveDataInProgressCounters['scalar'] == 0 && this.retrieveDataInProgressCounters['image'] == 0) {
    this.retrieveDataStarting();
  }
  if (this.retrieveDataInProgressCounters[valueType] == 0) {
    this.loaders[valueType].style.visibility = 'visible';
  }
  this.retrieveDataInProgressCounters[valueType]++;
};

fmltc.MonitorTraining.prototype.retrieveDataStarting = function() {
};


fmltc.MonitorTraining.prototype.decrementRetrieveDataInProgressCounter = function(valueType) {
  this.retrieveDataInProgressCounters[valueType]--;
  if (this.retrieveDataInProgressCounters[valueType] == 0) {
    this.loaders[valueType].style.visibility = 'hidden';
  }
  if (this.retrieveDataInProgressCounters['scalar'] == 0 && this.retrieveDataInProgressCounters['image'] == 0) {
    this.retrieveDataFinished();
  }
};

fmltc.MonitorTraining.prototype.retrieveDataFinished = function() {
  if (!this.util.isTrainingDone(this.modelEntity)) {
    this.startRefreshTimer();
    this.refreshButton.disabled = false;
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
  xhr.onreadystatechange = this.xhr_retrieveSummariesUpdated_onreadystatechange.bind(this, xhr, params,
      failureCount);
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

        this.retrieveTagsAndSteps(this.evalImages, 0);
        this.retrieveTagsAndSteps(this.trainingScalars, 0);
        this.retrieveTagsAndSteps(this.evalScalars, 0);
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

fmltc.MonitorTraining.prototype.retrieveTagsAndSteps = function(o, failureCount) {
  if (failureCount == 0) {
    this.incrementRetrieveDataInProgressCounter(o.valueType);
  }

  const xhr = new XMLHttpRequest();
  const params =
      'model_uuid=' + encodeURIComponent(this.modelUuid) +
      '&job_type=' + encodeURIComponent(o.job_type) +
      '&value_type=' + encodeURIComponent(o.valueType);
  xhr.open('POST', '/retrieveTagsAndSteps', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveTagsAndSteps_onreadystatechange.bind(this, xhr, params,
      o, failureCount);
  xhr.send(params);
};

fmltc.MonitorTraining.prototype.xhr_retrieveTagsAndSteps_onreadystatechange = function(xhr, params,
    o, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      // Only look at the step and tag pairs that we don't already have items for.
      const newStepAndTagPairs = [];
      for (let i = 0; i < response.step_and_tag_pairs.length; i++) {
        const stepAndTagPair = response.step_and_tag_pairs[i];
        const key = this.makeKey(stepAndTagPair);
        if (key in o.items) {
          // We already have this item.
          continue;
        }
        newStepAndTagPairs.push(stepAndTagPair);
      }

      this.addToMapTagToSteps(newStepAndTagPairs, o.mapTagToSteps);

      const newMapTagToSteps = {};
      this.addToMapTagToSteps(newStepAndTagPairs, newMapTagToSteps);

      // Add the charts or images.
      if (o.valueType == 'scalar') {
        this.addCharts(o, newMapTagToSteps);
      } else /* if (o.valueType == 'image') */ {
        this.addImages(o, newMapTagToSteps);
      }

      let requestStepAndTagPairs = [];
      if (o.valueType == 'image') {
        for (let i = 0; i < newStepAndTagPairs.length; i++) {
          const stepAndTagPair = newStepAndTagPairs[i];
          const tag = stepAndTagPair.tag;
          if (this.util.isDisplayed(o.mapTagToDiv[tag], o.parentDiv)) {
            requestStepAndTagPairs.push(stepAndTagPair);
          } else {
            let steps; // array<step>
            if (tag in o.mapTagToStepsNotRequestedYet) {
              steps = o.mapTagToStepsNotRequestedYet[tag];
            } else {
              steps = [];
              o.mapTagToStepsNotRequestedYet[tag] = steps;
            }
            steps.push(stepAndTagPair.step);
          }
        }
      } else {
        for (let i = 0; i < newStepAndTagPairs.length; i++) {
          requestStepAndTagPairs.push(newStepAndTagPairs[i]);
        }
      }
      this.retrieveSummaryItemsInParallel(o, requestStepAndTagPairs, 2);

      this.decrementRetrieveDataInProgressCounter(o.valueType);

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveTagsAndSteps?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveTagsAndSteps.bind(this, o, failureCount), delay * 1000);
      } else {
        console.log('Unable to retrieve the tags and steps.');

        this.decrementRetrieveDataInProgressCounter(o.valueType);
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

    let steps; // array<step>
    if (tag in mapTagToSteps) {
      steps = mapTagToSteps[tag];
    } else {
      steps = [];
      mapTagToSteps[tag] = steps;
    }
    steps.push(step);
  }
  // Sort each array of steps.
  for (const tag in mapTagToSteps) {
    mapTagToSteps[tag].sort(this.util.compare.bind(this.util));
  }
};

fmltc.MonitorTraining.prototype.retrieveSummaryItemsInParallel = function(o, requestStepAndTagPairs, parallelization) {
  let requestStepAndTagPairsLater = requestStepAndTagPairs.slice(parallelization * o.maxItemsPerRequest);
  for (let i = 0; i < parallelization; i++) {
    const requestStepAndTagPairsNow = requestStepAndTagPairs.slice(o.maxItemsPerRequest * i, o.maxItemsPerRequest * (i + 1));
    if (requestStepAndTagPairsNow.length > 0) {
      this.retrieveSummaryItems(o, requestStepAndTagPairsNow, requestStepAndTagPairsLater, 0);
      // The later items are only attached to the first batch.
      requestStepAndTagPairsLater = [];
    }
  }
};

fmltc.MonitorTraining.prototype.retrieveSummaryItems = function(o, requestStepAndTagPairsNow, requestStepAndTagPairsLater, failureCount) {
  if (failureCount == 0) {
    this.incrementRetrieveDataInProgressCounter(o.valueType);
  }

  const xhr = new XMLHttpRequest();
  let params =
      'model_uuid=' + encodeURIComponent(this.modelUuid) +
      '&job_type=' + encodeURIComponent(o.job_type) +
      '&value_type=' + encodeURIComponent(o.valueType);
  for (let i = 0; i < requestStepAndTagPairsNow.length; i++) {
    params +=
        '&step' + i + '=' + requestStepAndTagPairsNow[i].step +
        '&tag' + i + '=' + requestStepAndTagPairsNow[i].tag;
  }
  xhr.open('POST', '/retrieveSummaryItems', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveSummaryItems_onreadystatechange.bind(this, xhr, params,
      o, requestStepAndTagPairsNow, requestStepAndTagPairsLater, failureCount);
  xhr.send(params);
};

fmltc.MonitorTraining.prototype.xhr_retrieveSummaryItems_onreadystatechange = function(xhr, params,
    o, requestStepAndTagPairsNow, requestStepAndTagPairsLater, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      for (let i = 0; i < response.summary_items.length; i++) {
        const item = response.summary_items[i];
        const key = this.makeKey(item);
        o.items[key] = item;
      }

      if (o.valueType == 'scalar') {
        for (let i = 0; i < response.summary_items.length; i++) {
          const item = response.summary_items[i];
          this.addScalarValue(o, item.tag, item.step, item.value);
        }
      } else /* if (o.valueType == 'image') */ {
        let delayForImage = 0;
        for (let i = 0; i < response.summary_items.length; i++) {
          const item = response.summary_items[i];
          this.addImageValue(o, item.tag, item.step, item.value, delayForImage);
          delayForImage += 10;
        }
      }

      // Request the next batch of summary items.
      if (requestStepAndTagPairsLater.length > 0) {
        this.retrieveSummaryItemsInParallel(o, requestStepAndTagPairsLater, 2);
      }

      this.decrementRetrieveDataInProgressCounter(o.valueType);

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveSummaryItems?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveSummaryItems.bind(this, o, requestStepAndTagPairsNow, requestStepAndTagPairsLater, failureCount), delay * 1000);
      } else {
        console.log('Unable to retrieve the summary values.');

        this.decrementRetrieveDataInProgressCounter(o.valueType);
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
      'train', this.modelEntity.cancel_requested, this.modelEntity.train_job_state);

  document.getElementById('numStepsCompletedTd').textContent =
      new Number(this.modelEntity.trained_steps).toLocaleString();

  if (this.modelEntity.train_job_elapsed_seconds > 0) {
    this.trainTimeTd.textContent =
        this.util.formatElapsedSeconds(this.modelEntity.train_job_elapsed_seconds);
  } else {
    this.estimateTrainTime();
  }

  document.getElementById('evalStateTd').textContent = this.util.formatJobState(
      'eval', this.modelEntity.cancel_requested, this.modelEntity.eval_job_state);

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

fmltc.MonitorTraining.prototype.addCharts = function(o, newMapTagToSteps) {
  if (!this.chartsLoaded) {
    // Try again in 1 second.
    console.log('Will retry addCharts in 1 second.');
    setTimeout(this.addCharts.bind(this, o, newMapTagToSteps), 1000);
    return [];
  }

  for (const tag in newMapTagToSteps) {
    if (!o.sortedTags.includes(tag)) {
      o.sortedTags.push(tag);
    }
  }
  o.sortedTags.sort(this.util.compareCaseInsensitive.bind(this.util));

  for (let iTag = 0; iTag < o.sortedTags.length; iTag++) {
    const tag = o.sortedTags[iTag];
    let divForTag;
    if (tag in o.mapTagToDiv) {
      // We've already added the div for this tag.
      divForTag = o.mapTagToDiv[tag];

    } else {
      // Create a div and DataTable for this tag.
      divForTag = document.createElement('div');
      divForTag.style.width = '800px';
      divForTag.style.height = '500px';
      o.parentDiv.appendChild(divForTag);
      o.mapTagToDiv[tag] = divForTag;
      o.mapTagToDataTable[tag] = new google.visualization.DataTable();
      o.mapTagToDataTable[tag].addColumn('number', 'Step');
      o.mapTagToDataTable[tag].addColumn('number', '');
      // If the scalars tab isn't visible, creating the LineChart here causes a bug where the
      // y-axis doesn't have any numbers. Instead, we create the LineChart in drawChart, only if
      // the scalars tab is visible.
    }
  }
};

fmltc.MonitorTraining.prototype.addScalarValue = function(o, tag, step, value) {
  if (! (tag in o.mapTagToDataTable)) {
    // Try again in 1 second.
    console.log('Will retry addScalarValue for tag ' + tag + ' in 1 second.');
    setTimeout(this.addScalarValue.bind(this, o, tag, step, value), 1000);
    return;
  }

  o.mapTagToDataTable[tag].addRow([step, value]);
  o.mapTagToDataTable[tag].sort([{column: 0}])
  this.drawChart(o, tag);
};

fmltc.MonitorTraining.prototype.drawChart = function(o, tag) {
  if (this.util.getCurrentTabDivId() != 'scalarsTabDiv') {
    // To prevent a bug where the y-axis numbers are not displayed on the chart, we don't create
    // the LineChart if the scalars tab is not visible.
    return;
  }
  if (! (tag in o.mapTagToLineChart)) {
    // Create the LineChart if we haven't already.
    o.mapTagToLineChart[tag] = new google.visualization.LineChart(o.mapTagToDiv[tag]);
  }
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
  o.mapTagToLineChart[tag].draw(o.mapTagToDataTable[tag], options);
  if (o.sortedTags[0] == tag) {
    o.scalarsHeading.style.display = 'block';
  }
};

fmltc.MonitorTraining.prototype.addImages = function(o, newMapTagToSteps) {
  // Create page divs.
  const pageCount = Math.ceil(Object.keys(o.mapTagToSteps).length / 10);
  while (o.pageDivs.length < pageCount) {
    i = o.pageDivs.length;
    const pageDiv = document.createElement('div');
    pageDiv.style.display = (i == o.currentPageIndex) ? 'block' : 'none';
    o.pageDivs.push(pageDiv);
    o.parentDiv.appendChild(pageDiv);
  }
  this.updatePageControls(o);

  for (const tag in newMapTagToSteps) {
    if (!o.sortedTags.includes(tag)) {
      o.sortedTags.push(tag);
    }
  }
  o.sortedTags.sort(this.compareImageTags.bind(this));

  for (let iTag = 0; iTag < o.sortedTags.length; iTag++) {
    const tag = o.sortedTags[iTag];

    let divForTag;
    let stepRangeInput;
    if (tag in o.mapTagToDiv) {
      // We've already added the div for this tag.
      divForTag = o.mapTagToDiv[tag];
      // Find the stepRangeInput.
      stepRangeInput = divForTag.getElementsByTagName('INPUT')[0];

    } else {
      const pageIndex = Math.floor(iTag / 10);
      const pageDiv = o.pageDivs[pageIndex];

      if (pageDiv.childElementCount > 0) {
        // Add a horizontal rule to separate from the previous image.
        pageDiv.appendChild(document.createElement('br'));
        pageDiv.appendChild(document.createElement('hr'));
        pageDiv.appendChild(document.createElement('br'));
      }

      divForTag = document.createElement('div');
      divForTag.style.height = '420px';
      pageDiv.appendChild(divForTag);
      o.mapTagToDiv[tag] = divForTag;

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
      o.mapTagToStepLabelDiv[tag] = stepLabelDiv;

      stepRangeInput.onchange = this.stepRangeInput_onchange.bind(this, o, tag);
    }

    let mapStepToImg;
    if (tag in o.mapTagToImgs) {
      mapStepToImg = o.mapTagToImgs[tag];
    } else {
      mapStepToImg = {};
      o.mapTagToImgs[tag] = mapStepToImg;
    }

    if (tag in newMapTagToSteps) {
      const newSortedSteps = newMapTagToSteps[tag];
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
    }

    // Set the stepRangeInput's max to the number of steps. (not just new steps, but all steps for
    // this tag)
    const sortedSteps = o.mapTagToSteps[tag];
    stepRangeInput.max = sortedSteps.length - 1;
  }
};

fmltc.MonitorTraining.prototype.compareImageTags = function(a, b) {
  if (a == b) {
    return 0;
  }
  let patt = /(.*)_([0-9]+)_([0-9]+)/;
  let aResult = a.match(patt);
  let bResult = b.match(patt);
  if (aResult && bResult && aResult.length == bResult.length) {
    for (let i = 1; i < aResult.length; i++) {
      let ar = aResult[i];
      let br = bResult[i];
      let result = (this.util.isNumeric(aResult[i]) && this.util.isNumeric(bResult[i]))
        ? this.util.compare(parseFloat(ar), parseFloat(br))
        : this.util.compareCaseInsensitive(ar, br);
      if (result != 0) {
        return result;
      }
    }
    return 0;
  } else {
    return this.util.compare(a, b);
  }
};

fmltc.MonitorTraining.prototype.stepRangeInput_onchange = function(o, tag) {
  const divForTag = o.mapTagToDiv[tag];
  const stepRangeInput = divForTag.getElementsByTagName('INPUT')[0];
  const stepLabelDiv = o.mapTagToStepLabelDiv[tag];
  const sortedSteps = o.mapTagToSteps[tag];

  const selectedIndex = stepRangeInput.value;
  const selectedStep = sortedSteps[selectedIndex];
  stepLabelDiv.textContent = 'Step: ' + new Number(selectedStep).toLocaleString();

  const mapStepToImg = o.mapTagToImgs[tag];
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

fmltc.MonitorTraining.prototype.addImageValue = function(o, tag, step, value, delayForImage) {
  if (! (tag in o.mapTagToImgs)) {
    // Try again in 1 second.
    console.log('Will retry addImageValue for tag ' + tag + ' in 1 second.');
    setTimeout(this.addImageValue.bind(this, o, tag, step, value, delayForImage), 1000);
    return;
  }

  setTimeout(this.retrieveImage.bind(this, o, tag, step, value, 0), delayForImage);
};

fmltc.MonitorTraining.prototype.retrieveImage = function(o, tag, step, value, failureCount) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', value.image_url, true);
  xhr.responseType = 'blob';
  xhr.onreadystatechange = this.xhr_retrieveImage_onreadystatechange.bind(this, xhr,
      o, tag, step, value, failureCount);
  xhr.send(null);
};

fmltc.MonitorTraining.prototype.xhr_retrieveImage_onreadystatechange = function(xhr,
    o, tag, step, value, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const mapStepToImg = o.mapTagToImgs[tag];
      const img = mapStepToImg[step];
      img.src = window.URL.createObjectURL(xhr.response);
      img.setAttribute('width', value.width / 3);
      img.setAttribute('height', value.height / 3);

      const sortedSteps = o.mapTagToSteps[tag];
      if (step == sortedSteps[sortedSteps.length-1]) {

        const divForTag = o.mapTagToDiv[tag];
        const stepRangeInput = divForTag.getElementsByTagName('INPUT')[0];
        stepRangeInput.value = stepRangeInput.max;
        this.stepRangeInput_onchange(o, tag);
      }

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry ' + value.image_url + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveImage.bind(this, o, tag, step, value, failureCount), delay * 1000);
      } else {
        // TODO(lizlooney): handle error properly.
        console.log('Unable to retrieve an image with url ' + value.image_url);
      }
    }
  }
};

fmltc.MonitorTraining.prototype.firstPageButton_onclick = function() {
  if (this.evalImages.currentPageIndex > 0) {
    this.evalImages.currentPageIndex = 0;
    this.currentPageIndexChanged();
  }
};

fmltc.MonitorTraining.prototype.previousPageButton_onclick = function() {
  if (this.evalImages.currentPageIndex > 0) {
    this.evalImages.currentPageIndex--;
    this.currentPageIndexChanged();
  }
};

fmltc.MonitorTraining.prototype.nextPageButton_onclick = function() {
  if (this.evalImages.currentPageIndex < this.evalImages.pageDivs.length-1) {
    this.evalImages.currentPageIndex++;
    this.currentPageIndexChanged();
  }
};

fmltc.MonitorTraining.prototype.lastPageButton_onclick = function() {
  if (this.evalImages.currentPageIndex < this.evalImages.pageDivs.length-1) {
    this.evalImages.currentPageIndex = this.evalImages.pageDivs.length-1;
    this.currentPageIndexChanged();
  }
};

fmltc.MonitorTraining.prototype.updatePageControls = function(o) {
  if (o.pageDivs.length == 0) {
    this.firstPageButton.disabled = true;
    this.previousPageButton.disabled = true;
    this.nextPageButton.disabled = true;
    this.lastPageButton.disabled = true;
  } else {
    this.firstPageButton.disabled = (o.currentPageIndex == 0);
    this.previousPageButton.disabled = (o.currentPageIndex == 0);
    this.nextPageButton.disabled = (o.currentPageIndex == o.pageDivs.length-1);
    this.lastPageButton.disabled = (o.currentPageIndex == o.pageDivs.length-1);
    this.currentPageSpan.textContent = 'Page ' + new Number(o.currentPageIndex + 1).toLocaleString() +
        ' of ' + new Number(o.pageDivs.length).toLocaleString();
  }
};

fmltc.MonitorTraining.prototype.currentPageIndexChanged = function() {
  const o = this.evalImages;
  for (let i = 0; i < o.pageDivs.length; i++) {
    o.pageDivs[i].style.display = (i == o.currentPageIndex) ? 'block' : 'none';
  }

  this.updatePageControls(o);

  // Request summary items if necessary.
  let requestStepAndTagPairs = [];
  for (let iTag = 0; iTag < o.sortedTags.length; iTag++) {
    const tag = o.sortedTags[iTag];
    if (tag in o.mapTagToStepsNotRequestedYet) {
      if (this.util.isDisplayed(o.mapTagToDiv[tag], o.parentDiv)) {
        const steps = o.mapTagToStepsNotRequestedYet[tag];
        for (let i = 0; i < steps.length; i++) {
          const stepAndTagPair = {};
          stepAndTagPair.tag = tag;
          stepAndTagPair.step = steps[i];
          requestStepAndTagPairs.push(stepAndTagPair);
        }
        steps.length = 0;
      }
    }
  }
  this.retrieveSummaryItemsInParallel(o, requestStepAndTagPairs, 2);
};

fmltc.MonitorTraining.prototype.tab_onresize = function(tabDiv) {
  if (tabDiv.id == 'imagesTabDiv') {
    const style = window.getComputedStyle(tabDiv, null);
    let remainingHeight = parseInt(style.getPropertyValue('height'));
    for (let i = 0; i < tabDiv.children.length; i++) {
      const child = tabDiv.children[i];
      if (child != this.evalImagesDiv) {
        remainingHeight -= child.offsetHeight;
      }
    }
    this.evalImagesDiv.style.height = remainingHeight + 'px';
  }
};

fmltc.MonitorTraining.prototype.tab_onclick = function(tabDivId) {
  if (tabDivId == 'scalarsTabDiv') {
    // For all scalar tags, if the LineChart hasn't already been created, call drawChart.
    const scalars = [this.trainingScalars, this.evalScalars];
    for (let i = 0; i < scalars.length; i++) {
      const o = scalars[i];
      for (const tag in o.mapTagToDiv) {
        if (tag in o.mapTagToLineChart) {
          // We've already created the LineChart. We don't need to call drawChart.
          continue;
        }
        this.drawChart(o, tag);
      }
    }
  }
};
