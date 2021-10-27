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
 * @fileoverview The class for metrics.
 * @author lizlooney@google.com (Liz Looney)
 */
'use strict';
goog.provide('fmltc.Metrics');


/**
 * Class for metrics.
 * @constructor
 */
fmltc.Metrics = function(entityCountsEntities, timeMs) {
  this.entityCountsEntities = entityCountsEntities;

  const time = document.getElementById('time');
  time.textContent = new Date(timeMs);

  google.charts.load('current', {'packages':['corechart']});
  google.charts.setOnLoadCallback(this.charts_onload.bind(this));
};

fmltc.Metrics.prototype.charts_onload = function() {
  this.addChart('team_count', 'chartForTeamEntities', 'Team Entities');
  this.addChart('video_count', 'chartForVideoEntities', 'Video Entities');
  this.addChart('video_frame_count', 'chartForVideoFrameEntities', 'VideoFrame Entities');
  this.addChart('dataset_count', 'chartForDatasetEntities', 'Dataset Entities');
  this.addChart('dataset_record_count', 'chartForDatasetRecordEntities', 'DatasetRecord Entities');
  this.addChart('model_count', 'chartForModelEntities', 'Model Entities');
  this.addChart('model_summary_items_count', 'chartForModelSummaryItemsEntities', 'ModelSummaryItems Entities');
};

fmltc.Metrics.prototype.addChart = function(entityField, divId, title) {
  const dataTable = new google.visualization.DataTable();
  dataTable.addColumn('datetime', 'Date/Time');
  dataTable.addColumn('number', 'Entities');

  for (let i = 0; i < this.entityCountsEntities.length; i++) {
    const entityCountsEntity = this.entityCountsEntities[i];
    const time = new Date(entityCountsEntity['time_ms'])
    dataTable.addRow([time, entityCountsEntity[entityField]])
  }
  dataTable.sort([{column: 0}]);

  const div = document.getElementById(divId);
  const lineChart = new google.visualization.LineChart(div);
  const options = {
    width: 1200,
    height: 500,
    hAxis: {
      title: 'Date/Time'
    },
    vAxis: {
      minValue: 0,
      title: 'Entities',
    },
    legend: 'none',
    lineWidth: 4,
    pointSize: 6,
    interpolateNulls: true,
    title: title,
    titleTextStyle: {
      fontName: 'Roboto',
      fontSize: 24,
      bold: true,
    },
  };
  lineChart.draw(dataTable, options);
};
