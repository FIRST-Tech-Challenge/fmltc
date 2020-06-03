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

  this.summariesDiv = document.getElementById('summariesDiv');

  this.retrieveSummaries(0);
}

fmltc.MonitorTraining.prototype.retrieveSummaries = function(failureCount) {
  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(this.modelUuid);
  xhr.open('POST', '/retrieveSummaries', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_retrieveSummaries_onreadystatechange.bind(this, xhr, params,
      failureCount);
  console.log('Sending /retrieveSummaries?' + params);
  xhr.send(params);
};

fmltc.MonitorTraining.prototype.xhr_retrieveSummaries_onreadystatechange = function(xhr, params,
    failureCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      console.log('Success /retrieveSummaries?' + params);

      this.modelEntity = response.model_entity;
      this.training_summaries = response.training_summaries;
      this.eval_summaries = response.eval_summaries;
      this.fillSummariesDiv(response.eval_summaries);

    } else {
      failureCount++;
      if (failureCount < 5) {
        const delay = Math.pow(2, failureCount);
        console.log('Will retry /retrieveSummaries?' + params + ' in ' + delay + ' seconds.');
        setTimeout(this.retrieveSummaries.bind(this, failureCount), delay * 1000);
      } else {
        // TODO(lizlooney): handle error properly.
        alert('Unable to retrieve the summaries.');
      }
    }
  }
};

fmltc.MonitorTraining.prototype.fillSummariesDiv = function(summaries) {
  let delayForImage = 0;
  for (let i = 0; i < summaries.length; i++) {
    const summary = summaries[i];
    const summaryDiv = document.createElement('div');
    const dl = document.createElement('dl');
    for (const key in summary) {
      const dt = document.createElement('dt');
      dt.textContent = key;
      dl.appendChild(dt);
      const dd = document.createElement('dd');
      if (key == 'values') {
        this.fillValues(dd, summary[key], delayForImage);
        delayForImage += 10;
      } else {
        dd.textContent = summary[key];
      }
      dl.appendChild(dd);
    }
    summaryDiv.appendChild(dl);
    this.summariesDiv.appendChild(summaryDiv);
    this.summariesDiv.appendChild(document.createElement('hr'));
  }
};

fmltc.MonitorTraining.prototype.fillValues = function(parent, values, delayForImage) {
  const dl = document.createElement('dl');
  for (const key in values) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    dl.appendChild(dt);
    const dd = document.createElement('dd');
    if (typeof values[key] == 'object') {
      const image = values[key];
      const img = document.createElement('img');
      img.setAttribute('width', image.width / 4);
      img.setAttribute('height', image.height / 4);
      img.src = '//:0';
      setTimeout(this.retrieveImage.bind(this, img, image.image_url, 0), delayForImage);
      dd.appendChild(img);
    } else {
      dd.textContent = String(values[key]);
    }
    dl.appendChild(dd);
  }
  parent.appendChild(dl);
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
      //if (failureCount < 5) {
      //  const delay = Math.pow(2, failureCount);
      //  console.log('Will retry ' + imageUrl + ' in ' + delay + ' seconds.');
      //  setTimeout(this.retrieveImage.bind(this, img, imageUrl, failureCount), delay * 1000);
      //} else {
        // TODO(lizlooney): handle error properly.
        console.log('Unable to retrieve an image with url ' + imageUrl);
      //}
    }
  }
};

