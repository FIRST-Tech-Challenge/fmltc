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
 * @fileoverview The class representing an x,y point.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.Point');

/**
 * Class for a point.
 * @constructor
 */
fmltc.Point = function() {
  this.x = 0;
  this.y = 0;
};

/**
 * Assigns the fields of this Point to the coordinates of the given mouse event.
 * @param {Event} e Mouse event.
 * @param {Element} element The Element whose upper-left corner is considered the origin.
 * @param {number} scale The scale of the element's context.
 */
fmltc.Point.prototype.fromMouseEvent = function(e, element, scale, xMax, yMax) {
  this.x = e.pageX;
  this.y = e.pageY;
  while (element) {
    this.x -= element.offsetLeft;
    this.y -= element.offsetTop;
    element = element.offsetParent;
  }
  this.x = Math.max(0, Math.min(xMax, Math.round(this.x / scale)));
  this.y = Math.max(0, Math.min(yMax, Math.round(this.y / scale)));
};

/**
 * Assigns the fields of this Point to the fields of the given Point.
 * @param {fmltc.Point} other The other point.
 */
fmltc.Point.prototype.fromAnotherPoint = function(other) {
  this.x = other.x;
  this.y = other.y;
};
