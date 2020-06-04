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
fmltc.Util = function(pageBasename, httpPerformActionUrl, preferences) {
  this.pageBasename = pageBasename;
  this.httpPerformActionUrl = httpPerformActionUrl;
  this.preferences = preferences;

  this.initializeTabs();
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
  xhr.onreadystatechange = this.xhr_setUserPreference_onreadystatechange.bind(this, xhr, params);
  xhr.send(params);
};

fmltc.Util.prototype.xhr_setUserPreference_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      //console.log('Success! /setUserPreferences');
    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /setUserPreferences?' + params +
          ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
    }
  }
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

fmltc.Util.prototype.callHttpPerformAction = function(actionParameters, retryCount, onSuccess) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', this.httpPerformActionUrl, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onreadystatechange = this.xhr_httpPerformAction_onreadystatechange.bind(this, xhr,
      actionParameters, retryCount, onSuccess);
  console.log('Sending action "' + actionParameters.action_name + '".')
  xhr.send(JSON.stringify(actionParameters));
};

fmltc.Util.prototype.xhr_httpPerformAction_onreadystatechange = function(xhr,
    actionParameters, retryCount, onSuccess) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      // Success.
      console.log('Action "' + actionParameters.action_name + '" was successful.');
      if (onSuccess) {
        onSuccess();
      }

    } else {
      // TODO(lizlooney): handle error properly. Currently we try again, but that might not be the best idea.
      console.log('Failure! calling http_perform_action xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('Action ' + actionParameters.action_name + ' failed.')
      //if (retryCount < 3) {
      //  console.log('Will retry http_perform_action in 1 second.');
      //  setTimeout(this.callHttpPerformAction.bind(this, actionParameters, retryCount + 1), 1000);
      //}
    }
  }
};

fmltc.Util.prototype.initializeTabs = function() {
  let foundTabs = false;
  const tabButtons = document.getElementsByClassName('tabButton');
  for (let i = 0; i < tabButtons.length; i++) {
    const id = tabButtons[i].id;
    // The id should end with Button.
    if (!id.endsWith('Button')) {
      console.log('Error: tabButton with id "' + id + '" should end with "Button".');
    }
    foundTabs = true;
    const idPrefix = id.substring(0, id.length - 'Button'.length);
    tabButtons[i].onclick = this.tabDiv_onclick.bind(this, idPrefix);
  }

  if (foundTabs) {
    this.showLastViewedTab();
  }
};

fmltc.Util.prototype.showLastViewedTab = function() {
  switch (this.pageBasename) {
    case 'root':
      this.tabDiv_onclick(this.getPreference('root.currentTab', 'videosTab'));
      break;
    case 'monitorTraining':
      this.tabDiv_onclick(this.getPreference('monitorTraining.currentTab', 'scalarsTab'));
      break;
  }
};

fmltc.Util.prototype.showVideosTab = function() {
  this.tabDiv_onclick('videosTab');
};

fmltc.Util.prototype.showDatasetsTab = function() {
  this.tabDiv_onclick('datasetsTab');
};

fmltc.Util.prototype.showModelsTab = function() {
  this.tabDiv_onclick('modelsTab');
};

fmltc.Util.prototype.tabDiv_onclick = function(idPrefix) {
  // Hide all the tabDivs.
  const tabDivs = document.getElementsByClassName('tabDiv');
  for (let i = 0; i < tabDivs.length; i++) {
    tabDivs[i].style.display = 'none';
  }

  // Remove the class "active" from all tabButtons.
  const tabButtons = document.getElementsByClassName('tabButton');
  for (let i = 0; i < tabButtons.length; i++) {
    tabButtons[i].className = tabButtons[i].className.replace(' active', '');
  }

  // Show the current tabDiv, and add an 'active' class to the current tabButton.
  document.getElementById(idPrefix + 'Div').style.display = 'block';
  document.getElementById(idPrefix + 'Button').className += ' active';
  this.setPreference(this.pageBasename + '.currentTab', idPrefix);
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