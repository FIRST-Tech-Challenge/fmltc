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
  this.scalarsTabDiv = document.getElementById('scalarsTabDiv');
  this.imagesTabDiv = document.getElementById('imagesTabDiv');
  this.modelLoader = document.getElementById('modelLoader');
  this.scalarsLoader = document.getElementById('scalarsLoader');
  this.imagesLoader = document.getElementById('imagesLoader');

  this.trainTimeIntervalId = 0;

  this.chartsLoaded = false;
  this.scalarsTabDivVisible = false;
  this.scalarsTabDivUpdated = '';

  this.filledModelUI = false;

  this.trainingUpdated = '';
  this.evalUpdated = '';

  this.retrieveScalarsInProgressCounter = 0;
  this.trainingScalars = {};
  this.trainingScalars.tags = [];
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are numbers
  this.trainingScalars.items = {};
  this.evalScalars = {};
  this.evalScalars.tags = [];
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are numbers
  this.evalScalars.items = {};

  this.retrieveImagesInProgressCounter = 0;
  this.trainingImages = {};
  this.trainingImages.tags = [];
  // items has properties whose names are <step>_<tag> and values are objects with properties
  // 'step', 'tag', and 'value'. Values are objects with properties 'image_url', 'width', and
  // 'height'.
  this.trainingImages.items = {};
  this.evalImages = {};
  this.evalImages.tags = [];
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
  this.scalarsTabDivVisible = (this.util.getCurrentTabDivId() == 'scalarsTabDiv');
  this.util.addTabListener(this.onTabShown.bind(this));
  this.fillScalarsDiv();
};

fmltc.MonitorTraining.prototype.onTabShown = function(tabDivId) {
  this.scalarsTabDivVisible = (tabDivId == 'scalarsTabDiv');
  if (this.scalarsTabDivVisible) {
    this.fillScalarsDiv();
  }
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
      this.fillScalarsDiv();
      this.scalarsLoader.style.visibility = 'hidden';
    }
  } else if (valueType == 'image') {
    this.retrieveImagesInProgressCounter--;
    if (this.retrieveImagesInProgressCounter == 0) {
      this.fillImagesDiv();
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
      const maxRequestedItems = (valueType == 'image') ? 10 : 50;

      let requestStepAndTagPairs = [];

      for (let i = 0; i < response.step_and_tag_pairs.length; i++) {
        const stepAndTag = response.step_and_tag_pairs[i];
        const step = stepAndTag.step;
        const tag = stepAndTag.tag;
        const property = step + '_' + tag;
        if (property in o.items) {
          // We already have this item.
          continue;
        }

        requestStepAndTagPairs.push(stepAndTag);
        if (requestStepAndTagPairs.length == maxRequestedItems) {
          this.retrieveSummaryItems(job, valueType, requestStepAndTagPairs, 0);
          requestStepAndTagPairs = [];
        }
        if (!o.tags.includes(stepAndTag.tag)) {
          o.tags.push(stepAndTag.tag);
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
        const property = item.step + '_' + item.tag;
        o.items[property] = item;
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

fmltc.MonitorTraining.prototype.fillScalarsDiv = function() {
  if (this.retrieveScalarsInProgressCounter > 0) {
    return;
  }

  const updated = this.trainingUpdated + ', ' + this.evalUpdated;
  if (updated == this.scalarsTabDivUpdated) {
    return;
  }

  // TODO(lizlooney): remember the scroll position and restore it.
  this.scalarsTabDiv.innerHTML = ''; // Remove previous children.
  this.scalarsTabDivUpdated = '';

  if (!this.chartsLoaded) {
    return;
  }
  if (!this.scalarsTabDivVisible) {
    return;
  }

  this.addCharts(this.trainingScalars);
  this.addCharts(this.evalScalars);
  this.scalarsTabDivUpdated = updated;
};

fmltc.MonitorTraining.prototype.addCharts = function(scalars) {
  const mapTagToValues = this.mapTagToValues(scalars.items);

  scalars.tags.sort();
  for (let iTag = 0; iTag < scalars.tags.length; iTag++) {
    const tag = scalars.tags[iTag];
    if (!(tag in mapTagToValues)) {
      // This indicates that we failed to retrieve any items for this tag.
      continue;
    }

    const mapStepToValue = mapTagToValues[tag];
    const sortedSteps = [];
    for (const step in mapStepToValue) {
      sortedSteps.push(Number(step));
    }

    const chartDiv = document.createElement('div');
    chartDiv.style.width = '800px';
    chartDiv.style.height = '500px';
    this.scalarsTabDiv.appendChild(chartDiv);

    const data = new google.visualization.DataTable();
    data.addColumn('number', 'Step');
    data.addColumn('number', '');

    for (let iStep = 0; iStep < sortedSteps.length; iStep++) {
      const step = sortedSteps[iStep];
      const value = mapStepToValue[step];
      data.addRow([step, value]);
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

    var chart = new google.visualization.LineChart(chartDiv);
    chart.draw(data, options);
  }
};

fmltc.MonitorTraining.prototype.mapTagToValues = function(items) {
  const mapTagToValues = {}; // map<tag, map<step, value>>
  for (let property in items) {
    const item = items[property];
    const tag = item.tag;

    let mapStepToValue; // map<step, value>
    if (tag in mapTagToValues) {
      mapStepToValue = mapTagToValues[tag];
    } else {
      mapStepToValue = {};
      mapTagToValues[tag] = mapStepToValue;
    }
    mapStepToValue[item.step] = item.value;
  }
  return mapTagToValues;
};

fmltc.MonitorTraining.prototype.fillImagesDiv = function() {
  // TODO(lizlooney): remember the scroll position and restore it.
  this.imagesTabDiv.innerHTML = ''; // Remove previous children.
  this.addImages(this.trainingImages);
  this.addImages(this.evalImages);
};

fmltc.MonitorTraining.prototype.addImages = function(images) {
  let delayForImage = 0;

  const mapTagToValues = this.mapTagToValues(images.items);

  let needDelimiter = false;
  images.tags.sort();
  for (let iTag = 0; iTag < images.tags.length; iTag++) {
    const tag = images.tags[iTag];
    if (! (tag in mapTagToValues)) {
      // This indicates that we failed to retrieve any items for this tag.
      continue;
    }

    const mapStepToValue = mapTagToValues[tag];
    const sortedSteps = [];
    for (const step in mapStepToValue) {
      sortedSteps.push(Number(step));
    }

    if (needDelimiter) {
      this.imagesTabDiv.appendChild(document.createElement('br'));
      this.imagesTabDiv.appendChild(document.createElement('hr'));
      this.imagesTabDiv.appendChild(document.createElement('br'));
    }

    const label = document.createElement('div');
    label.textContent = tag;
    this.imagesTabDiv.appendChild(label);

    const stepRangeInput = document.createElement('input');
    stepRangeInput.setAttribute('type', 'range');
    stepRangeInput.min = 0;
    stepRangeInput.max = sortedSteps.length - 1;
    stepRangeInput.value = stepRangeInput.max;
    this.imagesTabDiv.appendChild(stepRangeInput);

    const stepDiv = document.createElement('div');
    this.imagesTabDiv.appendChild(stepDiv);

    const imgElements = [];
    for (let iStep = 0; iStep < sortedSteps.length; iStep++) {
      const step = sortedSteps[iStep];
      const value = mapStepToValue[step];
      const img = document.createElement('img');
      imgElements[iStep] = img;
      img.setAttribute('width', value.width / 3);
      img.setAttribute('height', value.height / 3);
      if (iStep == stepRangeInput.value) {
        stepDiv.textContent = 'Step: ' + new Number(step).toLocaleString();
        img.style.display = 'block';
      } else {
        img.style.display = 'none';
      }
      img.src = '//:0';
      setTimeout(this.retrieveImage.bind(this, img, value.image_url, 0), delayForImage);
      delayForImage += 10;
      this.imagesTabDiv.appendChild(img);
    }
    stepRangeInput.onchange = this.stepRangeInput_onchange.bind(this, sortedSteps, stepRangeInput, stepDiv, imgElements);
    needDelimiter = true;
  }
};

fmltc.MonitorTraining.prototype.stepRangeInput_onchange = function(sortedSteps, stepRangeInput, stepDiv, imgElements) {
  const iStep = stepRangeInput.value;
  const step = sortedSteps[iStep];
  stepDiv.textContent = 'Step: ' + new Number(step).toLocaleString();

  for (let i = 0; i < imgElements.length; i++) {
    imgElements[i].style.display = (i == iStep) ? 'block' : 'none';
  }
};

fmltc.MonitorTraining.prototype.retrieveImage = function(img, imageUrl, failureCount) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', imageUrl, true);
  xhr.responseType = 'blob';
  xhr.onreadystatechange = this.xhr_retrieveImage_onreadystatechange.bind(this, xhr,
      img, imageUrl, failureCount);
  xhr.send(null);
};

fmltc.MonitorTraining.prototype.xhr_retrieveImage_onreadystatechange = function(xhr,
    img, imageUrl, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      img.src = window.URL.createObjectURL(xhr.response);

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry ' + imageUrl + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveImage.bind(this, img, imageUrl, failureCount), delay * 1000);
      } else {
        // TODO(lizlooney): handle error properly.
        console.log('Unable to retrieve an image with url ' + imageUrl);
      }
    }
  }
};
