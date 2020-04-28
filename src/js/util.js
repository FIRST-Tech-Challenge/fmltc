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
fmltc.Util = function(httpPerformActionUrl, preferences) {
  this.httpPerformActionUrl = httpPerformActionUrl;
  this.preferences = preferences;
};

fmltc.Util.prototype.getPreference = function(key, defaultValue) {
  if (key in this.preferences) {
    return this.preferences[key];
  }
  return defaultValue;
};

fmltc.Util.prototype.setPreference = function(key, value) {
  this.preferences[key] = value;

  const xhr = new XMLHttpRequest();
  const params =
      'key=' + encodeURIComponent(key) +
      '&value=' + encodeURIComponent(value);
  xhr.open('POST', '/setUserPreference', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = this.xhr_setUserPreference_onreadystatechange.bind(this, xhr);
  xhr.send(params);
};

fmltc.Util.prototype.xhr_setUserPreference_onreadystatechange = function(xhr, params) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      console.log('Success! /setUserPreferences');
    } else {
      // TODO(lizlooney): handle error properly
      console.log('Failure! /setUserPreferences?' + params + ' xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
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

fmltc.Util.prototype.callHttpPerformAction = function(actionParameters, retryCount) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', this.httpPerformActionUrl, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onreadystatechange = this.xhr_httpPerformAction_onreadystatechange.bind(this, xhr, actionParameters, retryCount);
  xhr.send(JSON.stringify(actionParameters));
};

fmltc.Util.prototype.xhr_httpPerformAction_onreadystatechange = function(xhr, actionParameters, retryCount) {
  if (xhr.readyState === 4) {
    xhr.onreadystatechange = null;

    if (xhr.status === 200) {
      // Success.
    } else {
      // TODO(lizlooney): handle error properly. Currently we try again, but that might not be the best idea.
      console.log('Failure! calling http_perform_action xhr.status is ' + xhr.status + '. xhr.statusText is ' + xhr.statusText);
      console.log('actionParameters is ' + JSON.stringify(actionParameters));
      //if (retryCount < 3) {
      //  console.log('Will retry http_perform_action in 1 second.');
      //  setTimeout(this.callHttpPerformAction.bind(this, actionParameters, retryCount + 1), 1000);
      //}
    }
  }
};
