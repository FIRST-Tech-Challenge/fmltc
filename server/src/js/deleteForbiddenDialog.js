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
 * @fileoverview The class for a dialog that produces a dataset.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.DeleteForbiddenDialog');

goog.require('fmltc.Util');

/**
 * Class for a dialog that tells the user that a delete operation is forbidden.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.DeleteForbiddenDialog = function(util, title, message, list) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.dialog = document.getElementById('deleteForbiddenDialog');
  this.backdrop = document.getElementsByClassName('modal-backdrop')[0];
  this.okButton = document.getElementById('dfOKButton');

  document.getElementById('dfTitleDiv').textContent = title;
  document.getElementById('dfMessageDiv').textContent = message;
  if (list) {
    const listDiv = document.getElementById('dfListDiv');
    listDiv.innerHTML = ''; // Remove previous children.
    for (let i = 0; i < list.length; i++) {
      const div = document.createElement('div');
      div.textContent = list[i];
      listDiv.append(div);
    }
  }

  this.okButton.onclick = this.okButton_onclick.bind(this);
  this.dialog.style.display = 'block';
};

fmltc.DeleteForbiddenDialog.prototype.okButton_onclick = function() {
  // Clear event handlers.
  this.okButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
  if (this.backdrop) {
    this.backdrop.style.display = 'none';
  }
};
