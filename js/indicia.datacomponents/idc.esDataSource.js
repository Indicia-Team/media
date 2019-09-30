/**
 * @file
 * Data source cmoponent for linking controls to Elasticsearch.
 *
 * Indicia, the OPAL Online Recording Toolkit.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see http://www.gnu.org/licenses/gpl.html.
 *
 * @author Indicia Team
 * @license http://www.gnu.org/licenses/gpl.html GPL 3.0
 * @link https://github.com/indicia-team/client_helpers
 */

var IdcEsDataSource;

(function enclose() {
  'use strict';
  var $ = jQuery;

  /**
   * Constructor for an IdcEsDataSource.
   *
   * @param object settings
   *   Datasource settings.
   */
  IdcEsDataSource = function (settings) {
    var ds = this;
    ds.settings = settings;
    // Prepare a structure to store the output plugins linked to this source.
    ds.outputs = {};
    $.each(indiciaData.outputPluginClasses, function eachPluginClass() {
      ds.outputs[this] = [];
    });
    // Make a collection of the output controls linked to this data source.
    $.each($('.idc-output'), function eachOutput() {
      var el = this;
      if (Object.prototype.hasOwnProperty.call(el.settings.source, ds.settings.id)) {
        $.each(indiciaData.outputPluginClasses, function eachPluginClass(i, pluginClass) {
          var controlName = pluginClass.replace(/^idc/, '');
          controlName = controlName.charAt(0).toLowerCase() + controlName.substr(1);
          if ($(el).hasClass('idc-output-' + controlName)) {
            ds.outputs[pluginClass].push(el);
          }
        });
      }
    });
    // Does this datasource get a filter setting from a selected row in any grid(s)?
    if (ds.settings.filterSourceGrid && ds.settings.filterSourceField && ds.settings.filterField) {
      // Can be a single string or an array if several grids.
      if (typeof ds.settings.filterSourceGrid === 'string') {
        ds.settings.filterSourceGrid = [ds.settings.filterSourceGrid];
      }
      if (typeof ds.settings.filterSourceField === 'string') {
        ds.settings.filterSourceField = [ds.settings.filterSourceField];
      }
      if (typeof ds.settings.filterField === 'string') {
        ds.settings.filterField = [ds.settings.filterField];
      }
      // Hook up row select event handlers to filter the source.
      $.each(ds.settings.filterSourceGrid, function eachGrid(idx) {
        $('#' + this).idcDataGrid('on', 'rowSelect', function onRowSelect(tr) {
          var thisDoc;
          if (tr) {
            thisDoc = JSON.parse($(tr).attr('data-doc-source'));
            ds.settings.rowFilterField = ds.settings.filterField[idx];
            ds.settings.rowFilterValue = indiciaFns.getValueForField(thisDoc, ds.settings.filterSourceField[idx]);
            ds.populate();
          }
        });
      });

    }
    // If limited to a map's bounds, redraw when the map is zoomed or panned.
    if (ds.settings.filterBoundsUsingMap) {
      $('#' + ds.settings.filterBoundsUsingMap).idcLeafletMap('on', 'moveend', function onMoveEnd() {
        ds.populate();
      });
    }
  };

  /**
   * Track the last request so we avoid duplicate requests.
   */
  IdcEsDataSource.prototype.lastRequestStr = '';

  /**
   * If any source's outputs are on a hidden tab, the population may be delayed.
   */
  IdcEsDataSource.prototype.hiddenTabDelayedSources = [];

  /**
   * Hides spinners for all outputs associated with this source.
   *
   * @param IdcEsDataSource source
   *   Source object to hide spinners for.
   */
  IdcEsDataSource.prototype.hideAllSpinners = function hideAllSpinners(source) {
    $.each(indiciaData.outputPluginClasses, function eachPluginClass(i, pluginClass) {
      $.each(source.outputs[pluginClass], function eachOutput() {
        $(this).find('.loading-spinner').hide();
      });
    });
  };

  IdcEsDataSource.prototype.doPopulation = function doPopulation(force) {
    var source = this;
    var request = indiciaFns.getFormQueryData(source);
    var url;
    // Pagination support for composite aggregations.
    if (source.settings.after_key) {
      indiciaFns.findValue(request, 'composite').after = source.settings.after_key;
    }
    // Don't repopulate if exactly the same request as already loaded.
    if (request && (JSON.stringify(request) !== this.lastRequestStr || force)) {
      this.lastRequestStr = JSON.stringify(request);
      url = indiciaData.esProxyAjaxUrl + '/searchbyparams/' + (indiciaData.nid || '0');
      // Pass through additional parameters to the request.
      if (source.settings.filterPath) {
        // Filter path allows limiting of content in the response.
        url += url.indexOf('?') === false ? '?' : '&';
        url += 'filter_path=' + source.settings.filterPath;
      }
      $.ajax({
        url: url,
        type: 'post',
        data: request,
        success: function success(response) {
          if (response.error || (response.code && response.code !== 200)) {
            source.hideAllSpinners(source);
            alert('Elasticsearch query failed');
          } else {
            // Build any configured output tables.
            source.buildTableXY(response);
            $.each(indiciaData.outputPluginClasses, function eachPluginClass(i, pluginClass) {
              $.each(source.outputs[pluginClass], function eachOutput() {
                $(this)[pluginClass]('populate', source.settings, response, request);
              });
            });
            source.hideAllSpinners(source);
          }
        },
        error: function error() {
          source.hideAllSpinners(source);
          alert('Elasticsearch query failed');
        },
        dataType: 'json'
      });
    } else {
      source.hideAllSpinners(source);
    }
  }

  /**
   * Request a datasource to repopulate from current parameters.
   */
  IdcEsDataSource.prototype.populate = function datasourcePopulate(force) {
    var source = this;
    var needsPopulation = false;

    // Check we have an output other than the download plugin, which only
    // outputs when you click Download.
    $.each(indiciaData.outputPluginClasses, function eachPluginClass(i, pluginClass) {
      $.each(source.outputs[pluginClass], function eachOutput() {
        var output = this;
        var populateThis = $(output)[pluginClass]('getNeedsPopulation', source);
        if ($(output).parents('.ui-tabs-panel:hidden').length > 0) {
          // Don't bother if on a hidden tab.
          populateThis = false;
          $.each($(output).parents('.ui-tabs-panel:hidden'), function eachHiddenTab() {
            var tab = this;
            var tabSelectFn = function eachTabSet() {
              if ($(tab).filter(':visible').length > 0) {
                $(output).find('.loading-spinner').show();
                source.doPopulation(force);
                indiciaFns.unbindTabsActivate($(tab).closest('.ui-tabs'), tabSelectFn);
              }
            };
            indiciaFns.bindTabsActivate($(tab).closest('.ui-tabs'), tabSelectFn);
          });
        }
        needsPopulation = needsPopulation || populateThis;
        if (populateThis) {
          $(output).find('.loading-spinner').show();
        }
      });
    });
    if (needsPopulation) {
      source.doPopulation(force);
    }
  };

  /**
   * IdcEsDataSource function to tablify 2 tier aggregation responses.
   *
   * Use this method if there is an outer aggregation which corresponds to the
   * table columns (X) and an inner aggregation which corresponds to the table
   * rows (Y).
   *
   * @param object response
   *   Response from an ES aggregation search request.
   */
  IdcEsDataSource.prototype.buildTableXY = function buildTableXY(response) {
    var source = this;
    if (source.settings.buildTableXY) {
      $.each(source.settings.buildTableXY, function eachTable(name, aggs) {
        var data = {};
        var colsTemplate = {
          key: ''
        };
        // Collect the list of columns
        $.each(response.aggregations[aggs[0]].buckets, function eachOuterBucket() {
          colsTemplate[this.key] = 0;
        });
        // Now for each column, collect the rows.
        $.each(response.aggregations[aggs[0]].buckets, function eachOuterBucket() {
          var thisCol = this.key;
          var aggsPath = aggs[1].split(',');
          var obj = this;
          // Drill down the required level of nesting.
          $.each(aggsPath, function eachPathLevel() {
            obj = obj[this];
          });
          $.each(obj.buckets, function eachInnerBucket() {
            if (typeof data[this.key] === 'undefined') {
              data[this.key] = $.extend({}, colsTemplate);
              data[this.key].key = this.key;
            }
            data[this.key][thisCol] = this.doc_count;
          });
        });
        // Attach the data table to the response.
        response[name] = data;
      });
    }
  };
}());
