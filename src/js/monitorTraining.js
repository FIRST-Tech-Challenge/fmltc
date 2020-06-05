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
fmltc.MonitorTraining = function(util, modelUuid) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.modelUuid = modelUuid;

  this.scalarsTabDiv = document.getElementById('scalarsTabDiv');
  this.imagesTabDiv = document.getElementById('imagesTabDiv');

  this.chartsLoaded = false;

  this.data = {};
  this.data.scalars = this.createDataStructure(true, false, document.getElementById('scalarsLoader'));
  this.data.images = this.createDataStructure(false, true, document.getElementById('imagesLoader'));

  this.retrieveSummaries(this.data.scalars, 0);
  this.retrieveSummaries(this.data.images, 0);

  google.charts.load('current', {'packages':['corechart']});
  google.charts.setOnLoadCallback(this.charts_onload.bind(this));
}

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
    this.updateUI(this.data.scalars);
  }
  if (this.data.images.training.updated != '' ||
      this.data.images.eval.updated != '') {
    this.updateUI(this.data.images);
  }
};

fmltc.MonitorTraining.prototype.retrieveSummaries = function(dataStructure, failureCount) {
  dataStructure.loader.style.visibility = 'visible';
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
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      this.modelEntity = response.model_entity;

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
          this.updateUI(dataStructure);
        }
      }

      // TODO(lizlooney): if the jobs are not done, call retrieveSummaries again in 5 (?) minutes.

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveSummaries?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveSummaries.bind(this, dataStructure, failureCount), delay * 1000);
      } else {
        // TODO(lizlooney): handle error properly.
        alert('Unable to retrieve the summaries.');
      }
    }
  }
};

fmltc.MonitorTraining.prototype.updateUI = function(dataStructure) {
  if (dataStructure.retrieveScalars) {
    this.scalarsTabDiv.innerHTML = ''; // Remove previous children.
    this.fillScalarsDiv(dataStructure.training);
    this.fillScalarsDiv(dataStructure.eval);
  }

  if (dataStructure.retrieveImages) {
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
        hAxis: {
          title: 'Step'
        },
        vAxis: {
          title: ''
        },
        legend: 'none',
        lineWidth: 4,
        interpolateNulls: true,
        title: tag,
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

      const stepInput = document.createElement('input');
      stepInput.setAttribute('type', 'range');
      stepInput.min = 0;
      stepInput.max = sortedSteps.length - 1;
      stepInput.value = stepInput.max;
      this.imagesTabDiv.appendChild(stepInput);

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
        if (iStep == stepInput.value) {
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
      stepInput.onchange = this.stepInput_onchange.bind(this, sortedSteps, stepInput, stepDiv, imgElements);
      this.imagesTabDiv.appendChild(document.createElement('br'));
      this.imagesTabDiv.appendChild(document.createElement('hr'));
      this.imagesTabDiv.appendChild(document.createElement('br'));
    }
  }
};

fmltc.MonitorTraining.prototype.stepInput_onchange = function(sortedSteps, stepInput, stepDiv, imgElements) {
  const iStep = stepInput.value;
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

