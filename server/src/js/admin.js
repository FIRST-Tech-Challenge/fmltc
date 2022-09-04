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

  this.saveEndOfSeasonEntitiesButton = document.getElementById('saveEndOfSeasonEntitiesButton');
  this.seasonInput = document.getElementById('seasonInput');
  this.saveEndOfSeasonEntitiesResponse = document.getElementById('saveEndOfSeasonEntitiesResponse');
  this.saveEndOfSeasonEntitiesMonitorInfo = document.getElementById('saveEndOfSeasonEntitiesMonitorInfo');
  this.saveEndOfSeasonEntitiesActionUuid = document.getElementById('saveEndOfSeasonEntitiesActionUuid');
  this.saveEndOfSeasonEntitiesButton.onclick = this.saveEndOfSeasonEntitiesButton_onclick.bind(this);

  this.trainingEnabled = document.getElementById('trainingEnabled');
  this.useTpu = document.getElementById('useTpu');
  this.secureSessionCookies = document.getElementById('secureSessionCookies');
  this.samesiteSessionCookies = document.getElementById('samesiteSessionCookies');
  this.refreshConfigButton = document.getElementById('refreshConfigButton');
  this.refreshConfigButton.onclick = this.refreshConfigButton_onclick.bind(this);

  this.enableInputsAndButtons(true);
};

fmltc.Admin.prototype.enableInputsAndButtons = function(enable) {
  this.resetInput.disabled = !enable;
  this.resetButton.disabled = !enable;
  this.incrementInput.disabled = !enable;
  this.incrementButton.disabled = !enable;
  this.seasonInput.disabled = !enable;
  this.saveEndOfSeasonEntitiesButton.disabled = !enable;
  this.refreshConfigButton.disables = !enable;
};

fmltc.Admin.prototype.resetInput_onchange = function() {
  this.resetInput.value = Math.max(this.resetInput.min, Math.min(Math.round(this.resetInput.value), this.resetInput.max));
};

fmltc.Admin.prototype.resetButton_onclick = function() {
  this.enableInputsAndButtons(false);

  const xhr = new XMLHttpRequest();
  const params = 'reset_minutes=' + this.resetInput.value +
      '&date_time_string=' + encodeURIComponent(new Date().toLocaleString());
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
      this.resetActionUuid.textContent = response.action_uuid;
      this.resetMonitorInfo.style.display = 'block';

    } else {
      this.resetResponse.textContent = 'Failure - status: ' + xhr.status + ', statusText: ' + xhr.status;
    }
  }
};

fmltc.Admin.prototype.incrementInput_onchange = function() {
  this.incrementInput.value = Math.max(this.incrementInput.min, Math.min(Math.round(this.incrementInput.value), this.incrementInput.max));
};

fmltc.Admin.prototype.incrementButton_onclick = function() {
  this.enableInputsAndButtons(false);

  const xhr = new XMLHttpRequest();
  const params = 'increment_minutes=' + this.incrementInput.value +
      '&date_time_string=' + encodeURIComponent(new Date().toLocaleString());
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
      this.incrementActionUuid.textContent = response.action_uuid;
      this.incrementMonitorInfo.style.display = 'block';

    } else {
      this.incrementResponse.textContent = 'Failure - status: ' + xhr.status + ', statusText: ' + xhr.status;
    }
  }
};

fmltc.Admin.prototype.saveEndOfSeasonEntitiesButton_onclick = function() {
  this.enableInputsAndButtons(false);

  const xhr = new XMLHttpRequest();
  const params = 'season=' + this.seasonInput.value +
      '&date_time_string=' + encodeURIComponent(new Date().toLocaleString());
  xhr.open('POST', '/saveEndOfSeasonEntities', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_saveEndOfSeasonEntities_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.Admin.prototype.xhr_saveEndOfSeasonEntities_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.saveEndOfSeasonEntitiesActionUuid.textContent = response.action_uuid;
      this.saveEndOfSeasonEntitiesMonitorInfo.style.display = 'block';

    } else {
      this.saveEndOfSeasonEntitiesResponse.textContent = 'Failure - status: ' + xhr.status + ', statusText: ' + xhr.status;
    }
  }
};

fmltc.Admin.prototype.refreshConfigButton_onclick = function() {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/refreshConfig', true);
  xhr.onreadystatechange = this.xhr_refreshConfig_onreadystatechange.bind(this, xhr);
  xhr.send();
};

fmltc.Admin.prototype.capitalize = function(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

fmltc.Admin.prototype.xhr_refreshConfig_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      this.trainingEnabled.textContent = this.capitalize(response.training_enabled.toString());
      this.useTpu.textContent = this.capitalize(response.use_tpu.toString());
      this.secureSessionCookies.textContent = this.capitalize(response.secure_session_cookies.toString());
      this.samesiteSessionCookies.textContent = this.capitalize(response.samesite_session_cookies.toString());

    }
  }
};

