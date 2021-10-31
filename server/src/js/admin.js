/**
 * @license
 * Copyright 2021 Google LLC
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
 * @fileoverview The class for administration.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.Admin');


/**
 * Class for administration.
 * @constructor
 */
fmltc.Admin = function() {
  this.resetButton = document.getElementById('resetButton');
  this.resetInput = document.getElementById('resetInput');
  this.resetResponse = document.getElementById('resetResponse');
  this.resetMonitorInfo = document.getElementById('resetMonitorInfo');
  this.resetActionUuid = document.getElementById('resetActionUuid');
  this.resetInput.onchange = this.resetInput_onchange.bind(this);
  this.resetButton.onclick = this.resetButton_onclick.bind(this);

  this.incrementButton = document.getElementById('incrementButton');
  this.incrementInput = document.getElementById('incrementInput');
  this.incrementResponse = document.getElementById('incrementResponse');
  this.incrementMonitorInfo = document.getElementById('incrementMonitorInfo');
  this.incrementActionUuid = document.getElementById('incrementActionUuid');
  this.incrementInput.onchange = this.incrementInput_onchange.bind(this);
  this.incrementButton.onclick = this.incrementButton_onclick.bind(this);

  this.enableInputsAndButtons(true);
};

fmltc.Admin.prototype.enableInputsAndButtons = function(enable) {
  this.resetInput.disabled = !enable;
  this.resetButton.disabled = !enable;
  this.incrementInput.disabled = !enable;
  this.incrementButton.disabled = !enable;
};

fmltc.Admin.prototype.resetInput_onchange = function() {
  this.resetInput.value = Math.max(this.resetInput.min, Math.min(this.resetInput.value, this.resetInput.max));
};

fmltc.Admin.prototype.resetButton_onclick = function() {
  this.enableInputsAndButtons(false);

  const xhr = new XMLHttpRequest();
  const params = 'reset_minutes=' + this.resetInput.value;
  xhr.open('POST', '/resetRemainingTrainingMinutes', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_resetRemainingTrainingMinutes_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.Admin.prototype.xhr_resetRemainingTrainingMinutes_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.resetResponse.textContent = 'The action to reset the remaining_training_minutes field ' +
          'in all team entities has been triggered.';
      this.resetActionUuid.textContent = response.action_uuid;
      this.resetMonitorInfo.style.display = 'block';

    } else {
      this.resetResponse.textContent = 'Failure - status: ' + xhr.status + ', statusText: ' + xhr.status;
    }
  }
};

fmltc.Admin.prototype.incrementInput_onchange = function() {
  this.incrementInput.value = Math.max(this.incrementInput.min, Math.min(this.incrementInput.value, this.incrementInput.max));
};

fmltc.Admin.prototype.incrementButton_onclick = function() {
  this.enableInputsAndButtons(false);

  const xhr = new XMLHttpRequest();
  const params = 'increment_minutes=' + this.incrementInput.value;
  xhr.open('POST', '/incrementRemainingTrainingMinutes', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_incrementRemainingTrainingMinutes_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.Admin.prototype.xhr_incrementRemainingTrainingMinutes_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.incrementResponse.textContent = 'The action to increment the remaining_training_minutes field ' +
          'in all team entities has been triggered.';
      this.incrementActionUuid.textContent = response.action_uuid;
      this.incrementMonitorInfo.style.display = 'block';

    } else {
      this.incrementResponse.textContent = 'Failure - status: ' + xhr.status + ', statusText: ' + xhr.status;
    }
  }
};
