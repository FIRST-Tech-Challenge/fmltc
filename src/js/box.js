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
 * @fileoverview The class representing a bounding box used to label objects.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.Box');

goog.require('fmltc.Point');

/**
 * Class for a bounding box.
 * @param {number} x1 The first x value.
 * @param {number} y1 The first y value.
 * @param {number} x2 The second x value.
 * @param {number} y2 The second y value.
 * @param {string} label The label for the box.
 * @constructor
 */
fmltc.Box = function(x1, y1, x2, y2, label) {
  this.set(x1, y1, x2, y2, label);
};

/**
 * Creates a new Box with the same values as this box.
 */
fmltc.Box.prototype.duplicate = function() {
  return new fmltc.Box(this.x1, this.y1, this.x2, this.y2, this.label);
};

/**
 * Sets this box to the given coordinates.
 * @param {number} x1 The first x value.
 * @param {number} y1 The first y value.
 * @param {number} x2 The second x value.
 * @param {number} y2 The second y value.
 * @param {string} label The label for the box.
 */
fmltc.Box.prototype.set = function(x1, y1, x2, y2, label) {
  this.x1 = Math.min(x1, x2);
  this.y1 = Math.min(y1, y2);
  this.x2 = Math.max(x1, x2);
  this.y2 = Math.max(y1, y2);
  this.label = (label == undefined) ? '' : label;
};


/**
 * Assigns the x1, y1, x2, and y2 fields of this Box to the x1, y1, x2, and y2 fields of the given Box.
 * @param {fmltc.Box} other The other box.
 */
fmltc.Box.prototype.setXYFromAnotherBox = function(other) {
  this.set(other.x1, other.y1, other.x2, other.y2, this.label);
};

/**
 * Resizes this box according to the given hotspot and the given deltas.
 * @param {number} hotspot 1 for the upper-left hotspot, 2 for the lower-right hotspot.
 * @param {number} dx The x delta.
 * @param {number} dy The y delta.
 */
fmltc.Box.prototype.resize = function(hotspot, dx, dy) {
  if (hotspot == 1) {
    // Upper-left corner.
    this.x1 += dx;
    this.y1 += dy;
  } else if (hotspot == 2) {
    // Lower-right corner.
    this.x2 += dx;
    this.y2 += dy;
  }
};

/**
 * Draws this box onto the given 2d context.
 * @param {CanvasRenderingContext2D} ctx The canvas context to draw with.
 */
fmltc.Box.prototype.draw = function(ctx, scale, drawLabel) {
  ctx.lineWidth = Math.round(2 / scale);
  ctx.strokeStyle = '#00FF00';
  ctx.strokeRect(this.x1, this.y1, this.x2 - this.x1, this.y2 - this.y1);
  // Draw the resize hotspots.
  ctx.fillStyle = '#000000';
  const halfHotspot = Math.round(2 / scale);
  const wholeHotspot = 2 * halfHotspot;
  ctx.fillRect(this.x1 - halfHotspot, this.y1 - halfHotspot, wholeHotspot, wholeHotspot);
  ctx.fillRect(this.x2 - halfHotspot, this.y2 - halfHotspot, wholeHotspot, wholeHotspot);
  if (drawLabel && this.label) {
    ctx.fillStyle = '#00FF00';
    ctx.font = Math.round(30 / scale) + 'px Georgia';
    const dim = ctx.measureText(this.label);
    ctx.fillText(this.label, this.x1 + 2, (this.y1 + this.y2 + dim.actualBoundingBoxAscent) / 2);
  }
};

/**
 * Returns the hotspot that the given point is on.
 * @param {fmltc.Point} point The point to consider.
 * @return {number} 1 for the upper-left hotspot, 2 for the lower-right hotspot, 0 for no hotspot.
 */
fmltc.Box.prototype.getResizeHotspot = function(point, scale) {
  const size = Math.round(4  / scale);
  if (Math.abs(point.y - this.y1) < size &&
      Math.abs(point.x - this.x1) < size) {
    // Upper-left corner.
    return 1;
  }
  if (Math.abs(point.y - this.y2) < size &&
      Math.abs(point.x - this.x2) < size) {
    // Lower-right corner.
    return 2;
  }
  return 0;
};

/**
 * Returns true if the box is empty.
 */
fmltc.Box.prototype.isEmpty = function() {
  return this.x1 == this.x2 && this.y1 == this.y2;
};
