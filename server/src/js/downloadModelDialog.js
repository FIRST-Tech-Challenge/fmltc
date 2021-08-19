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
 * @fileoverview The class for a dialog that downloads a model.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.DownloadModelDialog');

goog.require('fmltc.Util');

/**
 * Class for a dialog that downloads a model.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.DownloadModelDialog = function(util, modelUuid, downloadStartTime, onModelReady) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.modelUuid = modelUuid;
  this.downloadStartTime = downloadStartTime;
  this.onModelReady = onModelReady;

  this.dialog = document.getElementById('downloadModelDialog');
  this.dismissButton = document.getElementById('dmDismissButton');

  this.dismissButton.disabled = true;

  this.dismissButton.onclick = this.dismissButton_onclick.bind(this);
  this.dialog.style.display = 'block';

  setTimeout(this.getTFLiteDownloadUrl.bind(this), 5000);
};

fmltc.DownloadModelDialog.prototype.getTFLiteDownloadUrl = function() {
  const xhr = new XMLHttpRequest();
  const params = 'model_uuid=' + encodeURIComponent(this.modelUuid);
  xhr.open('POST', '/getTFLiteDownloadUrl', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_getTFLiteDownloadUrl_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.DownloadModelDialog.prototype.xhr_getTFLiteDownloadUrl_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.exists) {
        this.dismissButton.disabled = false;
        this.onModelReady(this.downloadStartTime, response.download_url);
        setTimeout(this.dismissButton_onclick.bind(this), 1000);

      } else {
        setTimeout(this.getTFLiteDownloadUrl.bind(this, this.modelUuid, this.downloadStartTime), 5000);
      }

    } else {
      console.log('Failure! /getTFLiteDownloadUrl?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      setTimeout(this.getTFLiteDownloadUrl.bind(this, this.modelUuid, this.downloadStartTime), 5000);
    }
  }
};

fmltc.DownloadModelDialog.prototype.dismissButton_onclick = function() {
  // Clear event handlers.
  this.dismissButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
};
