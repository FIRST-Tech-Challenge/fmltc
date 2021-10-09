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
goog.provide('fmltc.DeleteConfirmationDialog');

goog.require('fmltc.Util');

/**
 * Class for a dialog that allows the user to confirm (or reject) a delete operation.
 * @param {!fmltc.Util} util The utility instance
 * @constructor
 */
fmltc.DeleteConfirmationDialog = function(util, title, message, onYes) {
  /** @type {!fmltc.Util} */
  this.util = util;
  this.onYes = onYes;
  this.dialog = document.getElementById('deleteConfirmationDialog');
  this.backdrop = document.getElementsByClassName('modal-backdrop')[0];
  this.xButton = document.getElementById('dcXButton');
  this.noButton = document.getElementById('dcNoButton');
  this.yesButton = document.getElementById('dcYesButton');

  document.getElementById('dcTitleDiv').textContent = title;
  document.getElementById('dcMessageDiv').textContent = message;

  this.xButton.onclick = this.noButton.onclick = this.noButton_onclick.bind(this);
  this.yesButton.onclick = this.yesButton_onclick.bind(this);
  this.dialog.style.display = 'block';
};

fmltc.DeleteConfirmationDialog.prototype.noButton_onclick = function() {
  this.dismiss();
};

fmltc.DeleteConfirmationDialog.prototype.yesButton_onclick = function() {
  this.dismiss();
  this.onYes();
};

fmltc.DeleteConfirmationDialog.prototype.dismiss = function() {
  // Clear event handlers.
  this.xButton.onclick = this.noButton.onclick = null;
  this.yesButton.onclick = null;

  // Hide the dialog.
  this.dialog.style.display = 'none';
  if (this.backdrop) {
    this.backdrop.style.display = 'none';
  }
};
