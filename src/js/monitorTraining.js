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
fmltc.MonitorTraining = function(util, modelEntity) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.modelEntity = modelEntity;
  this.modelUuid = modelEntity.model_uuid;

  this.dismissButton = document.getElementById('dismissButton');
  this.activeTrainingDiv = document.getElementById('activeTrainingDiv');
  this.cancelTrainingButton = document.getElementById('cancelTrainingButton');
  this.refreshIntervalRangeInput = document.getElementById('refreshIntervalRangeInput');
  this.refreshButton = document.getElementById('refreshButton');
  this.modelTabDiv = document.getElementById('modelTabDiv');
  this.dateCreatedTd = document.getElementById('dateCreatedTd');
  this.descriptionTd = document.getElementById('descriptionTd');
  this.videoFilenamesTd = document.getElementById('videoFilenamesTd');
  this.trainFrameCountTd = document.getElementById('trainFrameCountTd');
  this.trainNegativeFrameCountTd = document.getElementById('trainNegativeFrameCountTd');
  this.trainLabelCountsTable = document.getElementById('trainLabelCountsTable');
  this.evalFrameCountTd = document.getElementById('evalFrameCountTd');
  this.evalNegativeFrameCountTd = document.getElementById('evalNegativeFrameCountTd');
  this.evalLabelCountsTable = document.getElementById('evalLabelCountsTable');
  this.startingCheckpointTd = document.getElementById('startingCheckpointTd');
  this.previousTrainingStepsTd = document.getElementById('previousTrainingStepsTd');
  this.numTrainingStepsTd = document.getElementById('numTrainingStepsTd');
  this.totalTrainingStepsTd = document.getElementById('totalTrainingStepsTd');
  this.trainStateTd = document.getElementById('trainStateTd');
  this.evalStateTd = document.getElementById('evalStateTd');
  this.trainTimeTd = document.getElementById('trainTimeTd');
  this.scalarsTabDiv = document.getElementById('scalarsTabDiv');
  this.imagesTabDiv = document.getElementById('imagesTabDiv');

  this.chartsLoaded = false;

  this.filledModelUI = false;

  this.modelLoader = document.getElementById('modelLoader');

  this.refreshButtonDisabledCounter = 0;

  this.data = {};
  this.data.scalars = this.createDataStructure(true, false, document.getElementById('scalarsLoader'));
  this.data.images = this.createDataStructure(false, true, document.getElementById('imagesLoader'));

  document.getElementById('descriptionSpan').textContent = this.modelEntity.description;

  this.refreshIntervalRangeInput.title = this.refreshIntervalRangeInput.value + ' minutes';

  this.updateModelUI();
  this.retrieveData();

  google.charts.load('current', {'packages':['corechart']});
  google.charts.setOnLoadCallback(this.charts_onload.bind(this));

  this.dismissButton.onclick = this.dismissButton_onclick.bind(this);
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

      this.modelEntity = response.model_entity;
      this.modelEntityUpdated();

    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /cancelTraining?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
};

fmltc.MonitorTraining.prototype.refreshIntervalRangeInput_onchange = function() {
  this.refreshIntervalRangeInput.title = this.refreshIntervalRangeInput.value + ' minutes';

  if (this.intervalId) {
    clearInterval(this.intervalId);
    this.intervalId = setInterval(this.retrieveData.bind(this), this.refreshIntervalRangeInput.value * 60 * 1000);
  }
};

fmltc.MonitorTraining.prototype.refreshButton_onclick = function() {
  // call refreshIntervalRangeInput_onchange to reset the interval timer.
  this.refreshIntervalRangeInput_onchange();
  this.retrieveData();
};

fmltc.MonitorTraining.prototype.createDataStructure = function(retrieveScalars, retrieveImages, loader) {
  const dataStructure = {};
  dataStructure.retrieveScalars = retrieveScalars;
  dataStructure.retrieveImages = retrieveImages;
  dataStructure.loader = loader;
  dataStructure.training = {};
  dataStructure.training.updated = '';
  dataStructure.training.sortedSteps = [];
  dataStructure.training.sortedTags = [];
  dataStructure.training.summaries = [];
  dataStructure.eval = {};
  dataStructure.eval.updated = '';
  dataStructure.eval.sortedSteps = [];
  dataStructure.eval.sortedTags = [];
  dataStructure.eval.summaries = [];
  return dataStructure;
};

fmltc.MonitorTraining.prototype.charts_onload = function() {
  this.chartsLoaded = true;

  if (this.data.scalars.training.updated != '' ||
      this.data.scalars.eval.updated != '') {
    this.updateSummariesUI(this.data.scalars);
  }
  if (this.data.images.training.updated != '' ||
      this.data.images.eval.updated != '') {
    this.updateSummariesUI(this.data.images);
  }
};

fmltc.MonitorTraining.prototype.retrieveData = function() {
  this.retrieveSummaries(this.data.scalars, 0);
  this.retrieveSummaries(this.data.images, 0);
};

fmltc.MonitorTraining.prototype.retrieveSummaries = function(dataStructure, failureCount) {
  this.refreshButtonDisabledCounter++;
  this.refreshButton.disabled = (this.refreshButtonDisabledCounter > 0);

  const xhr = new XMLHttpRequest();
  const params =
      'model_uuid=' + encodeURIComponent(this.modelUuid) +
      '&retrieve_scalars=' + encodeURIComponent(dataStructure.retrieveScalars) +
      '&retrieve_images=' + encodeURIComponent(dataStructure.retrieveImages);
  xhr.open('POST', '/retrieveSummaries', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveSummaries_onreadystatechange.bind(this, xhr, params,
      dataStructure, failureCount);
  xhr.send(params);
};

fmltc.MonitorTraining.prototype.xhr_retrieveSummaries_onreadystatechange = function(xhr, params,
    dataStructure, failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    this.refreshButtonDisabledCounter--;
    this.refreshButton.disabled = (this.refreshButtonDisabledCounter > 0);

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      this.modelEntity = response.model_entity;
      this.modelEntityUpdated();

      if (response.training_updated != dataStructure.training.updated ||
          response.eval_updated != dataStructure.eval.updated) {
        dataStructure.training.updated = response.training_updated;
        dataStructure.training.sortedTags = response.training_sorted_tags;
        dataStructure.training.sortedSteps = response.training_sorted_steps;
        dataStructure.training.summaries = response.training_summaries;

        dataStructure.eval.updated = response.eval_updated;
        dataStructure.eval.sortedTags = response.eval_sorted_tags;
        dataStructure.eval.sortedSteps = response.eval_sorted_steps;
        dataStructure.eval.summaries = response.eval_summaries;

        if (this.chartsLoaded) {
          this.updateSummariesUI(dataStructure);
        }
      }

    } else {
      failureCount++;
      if (!this.intervalId && failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveSummaries?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveSummaries.bind(this, dataStructure, failureCount), delay * 1000);
      } else {
        console.log('Unable to retrieve the summaries.');
      }
    }
  }
};

fmltc.MonitorTraining.prototype.modelEntityUpdated = function() {
  this.updateButtons();

  this.updateModelUI();

  if (this.util.isTrainingDone(this.modelEntity)) {
    this.activeTrainingDiv.style.display = 'none';
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  } else {
    this.activeTrainingDiv.style.display = 'inline-block';
    if (!this.intervalId) {
      this.intervalId = setInterval(this.retrieveData.bind(this), this.refreshIntervalRangeInput.value * 60 * 1000);
    }
  }
};

fmltc.MonitorTraining.prototype.updateModelUI = function() {
  if (!this.filledModelUI) {
    this.dateCreatedTd.textContent = new Date(this.modelEntity.creation_time_ms).toLocaleString();

    this.descriptionTd.textContent = this.modelEntity.description;

    for (let i = 0; i < this.modelEntity.video_filenames.length; i++) {
      const div = document.createElement('div');
      div.textContent = this.modelEntity.video_filenames[i];
      this.videoFilenamesTd.appendChild(div);
    }
    this.trainFrameCountTd.textContent = new Number(this.modelEntity.train_frame_count).toLocaleString();
    this.trainNegativeFrameCountTd.textContent = new Number(this.modelEntity.train_negative_frame_count).toLocaleString();
    for (const label in this.modelEntity.train_dict_label_to_count) {
      const tr = this.trainLabelCountsTable.insertRow(-1);
      let td = tr.insertCell(-1);
      td.textContent = label;
      td = tr.insertCell(-1);
      td.textContent = new Number(this.modelEntity.train_dict_label_to_count[label]).toLocaleString();
    }

    this.evalFrameCountTd.textContent = new Number(this.modelEntity.eval_frame_count).toLocaleString();
    this.evalNegativeFrameCountTd.textContent = new Number(this.modelEntity.eval_negative_frame_count).toLocaleString();
    for (const label in this.modelEntity.eval_dict_label_to_count) {
      const tr = this.evalLabelCountsTable.insertRow(-1);
      let td = tr.insertCell(-1);
      td.textContent = label;
      td = tr.insertCell(-1);
      td.textContent = new Number(this.modelEntity.eval_dict_label_to_count[label]).toLocaleString();
    }

    this.startingCheckpointTd.textContent = this.modelEntity.user_visible_starting_checkpoint;

    this.previousTrainingStepsTd.textContent = new Number(this.modelEntity.previous_training_steps).toLocaleString();
    this.numTrainingStepsTd.textContent = new Number(this.modelEntity.num_training_steps).toLocaleString();
    this.totalTrainingStepsTd.textContent = new Number(this.modelEntity.total_training_steps).toLocaleString();

    this.filledModelUI = true;
  }

  this.trainStateTd.textContent = this.util.formatJobState(
      this.modelEntity.cancel_requested, this.modelEntity.train_job_state);
  this.evalStateTd.textContent = this.util.formatJobState(
      this.modelEntity.cancel_requested, this.modelEntity.eval_job_state);

  if (this.modelEntity['train_job_elapsed_seconds'] > 0) {
    this.trainTimeTd.textContent =
        this.util.formatElapsedSeconds(this.modelEntity.train_job_elapsed_seconds);
  }

  this.modelLoader.style.visibility = 'hidden';
};

fmltc.MonitorTraining.prototype.updateSummariesUI = function(dataStructure) {
  dataStructure.loader.style.visibility = 'visible';

  if (dataStructure.retrieveScalars) {
    // TODO(lizlooney): remember the scroll position and restore it.
    this.scalarsTabDiv.innerHTML = ''; // Remove previous children.
    // TODO(lizlooney): Sometimes the graphs end up too small. I'm not sure why, but maybe it
    // happends if the scalars tab isn't the active tab?
    // Figure out why.
    this.fillScalarsDiv(dataStructure.training);
    this.fillScalarsDiv(dataStructure.eval);
  }

  if (dataStructure.retrieveImages) {
    // TODO(lizlooney): remember the scroll position and restore it.
    this.imagesTabDiv.innerHTML = ''; // Remove previous children.
    this.fillImagesDiv(dataStructure.training);
    this.fillImagesDiv(dataStructure.eval);
  }

  dataStructure.loader.style.visibility = 'hidden';
};

fmltc.MonitorTraining.prototype.fillScalarsDiv = function(jobData) {
  const sortedTags = jobData.sortedTags;
  const sortedSteps = jobData.sortedSteps;
  const summaries = jobData.summaries;
  const mapTagToValues = {}

  for (let i = 0; i < summaries.length; i++) {
    const summary = summaries[i];
    const values = summary.values;
    for (const tag in values) {
      if (typeof values[tag] != 'number') {
        continue;
      }
      let mapStepToValue;
      if (tag in mapTagToValues) {
        mapStepToValue = mapTagToValues[tag];
      } else {
        mapStepToValue = {};
        mapTagToValues[tag] = mapStepToValue;
      }
      mapStepToValue[summary.step] = values[tag];
    }
  }

  for (let iTag = 0; iTag < sortedTags.length; iTag++) {
    const tag = sortedTags[iTag];
    if (tag in mapTagToValues) {
      const mapStepToValue = mapTagToValues[tag];
      const chartDiv = document.createElement('div');
      chartDiv.style.width = '800px';
      chartDiv.style.height = '500px';
      this.scalarsTabDiv.appendChild(chartDiv);

      const data = new google.visualization.DataTable();
      data.addColumn('number', 'Step');
      data.addColumn('number', '');
      for (let iStep = 0; iStep < sortedSteps.length; iStep++) {
        const step = sortedSteps[iStep];
        data.addRow([step, mapStepToValue[step]]);
      }
      const options = {
        width: 800,
        height: 500,
        hAxis: {
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
  }
};

fmltc.MonitorTraining.prototype.fillImagesDiv = function(jobData) {
  const sortedTags = jobData.sortedTags;
  const sortedSteps = jobData.sortedSteps;
  const summaries = jobData.summaries;
  const mapTagToImages = {};

  let delayForImage = 0;
  for (let i = 0; i < summaries.length; i++) {
    const summary = summaries[i];
    const values = summary.values;
    for (const tag in values) {
      if (typeof values[tag] != 'object' ||
          !('image_url' in values[tag])) {
        continue;
      }
      let mapStepToImage;
      if (tag in mapTagToImages) {
        mapStepToImage = mapTagToImages[tag];
      } else {
        mapStepToImage = {};
        mapTagToImages[tag] = mapStepToImage;
      }
      mapStepToImage[summary.step] = values[tag];
    }
  }

  for (let iTag = 0; iTag < sortedTags.length; iTag++) {
    const tag = sortedTags[iTag];
    if (tag in mapTagToImages) {
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
      const mapStepToImage = mapTagToImages[tag];
      for (let iStep = 0; iStep < sortedSteps.length; iStep++) {
        const step = sortedSteps[iStep];
        const image = mapStepToImage[step];
        const img = document.createElement('img');
        imgElements[iStep] = img;
        img.setAttribute('width', image.width / 3);
        img.setAttribute('height', image.height / 3);
        if (iStep == stepRangeInput.value) {
          stepDiv.textContent = 'Step: ' + new Number(step).toLocaleString();
          img.style.display = 'block';
        } else {
          img.style.display = 'none';
        }
        img.src = '//:0';
        setTimeout(this.retrieveImage.bind(this, img, image.image_url, 0), delayForImage);
        delayForImage += 10;
        this.imagesTabDiv.appendChild(img);
      }
      stepRangeInput.onchange = this.stepRangeInput_onchange.bind(this, sortedSteps, stepRangeInput, stepDiv, imgElements);
      if (iTag + 1 < sortedTags.length) {
        this.imagesTabDiv.appendChild(document.createElement('br'));
        this.imagesTabDiv.appendChild(document.createElement('hr'));
        this.imagesTabDiv.appendChild(document.createElement('br'));
      }
    }
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

