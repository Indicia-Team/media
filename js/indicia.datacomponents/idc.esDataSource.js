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
   * Finds the sort field and direction from the source config.
   *
   * For autoAggregationTable mode. Sets default to the unique field if not
   * set.
   */
  function getSortInfo(source) {
    var sortField;
    var sortDir;
    var settings = source.settings;
    // Default source config to sort by the unique field unless otherwise specified.
    if (!settings.sort || settings.sort.length === 0) {
      settings.sort = {};
      settings.sort[settings.autoAggregationTable.unique_field] = {
        order: 'asc'
      };
    }
    // Find the sort field and direction from the source config.
    $.each(settings.sort, function eachSortField(field) {
      sortField = field;
      sortDir = this.order;
      // Only support a single sort field.
      return false;
    });
    return {
      field: sortField,
      dir: sortDir
    };
  }

  /**
   * Auto-build the aggregation if this mode enabled.
   */
  function buildAutoAggregationTable(source) {
    var subAggs;
    var sort;
    var orderBy;
    var settings = source.settings;
    if (settings.autoAggregationTable) {
      settings.size = 0;
      sort = getSortInfo(source);
      // List of sub-aggregations within the outer terms agg for the unique field must
      // always contain a top_hits agg to retrieve field values.
      subAggs = {
        fieldlist: {
          top_hits: {
            size: 1,
            _source: {
              includes: source.settings.autoAggregationTable.fields
            }
          }
        }
      };
      // Add the additional aggs for column data output values.
      $.each(settings.autoAggregationTable.aggs, function eachAgg(name) {
        subAggs[name] = this;
        if (name === sort.field && settings.autoAggregationTable.orderby_aggs &&
            settings.autoAggregationTable.orderby_aggs[sort.field]) {
          // Aggregation has a different aggregation to simplify the sort
          // e.g. where agg is costly.
          sort.field = 'orderby_' + name;
          subAggs[sort.field] = settings.autoAggregationTable.orderby_aggs[name];
        }
      });
      // Include the unique field in the list of fields request even if not specified.
      if ($.inArray(settings.autoAggregationTable.unique_field, settings.autoAggregationTable.fields) === -1) {
        settings.autoAggregationTable.fields.push(settings.autoAggregationTable.unique_field);
      }
      if ($.inArray(sort.field, settings.autoAggregationTable.fields) > -1) {
        // Sorting by a standard field.
        if (sort.field === settings.autoAggregationTable.unique_field) {
          // Using the outer agg to sort, so simple use of _key.
          orderBy = '_key';
        } else {
          // Using another field to sort, so add an aggregation to get a single
          // bucket value which we can sort on.
          subAggs.sortfield = {
            max: {
              field: sort.field
            }
          };
          orderBy = 'sortfield';
        }
      } else {
        // Sorting by a named aggregation.
        orderBy = sort.field;
      }
      // Create the final aggregation object for the request.
      settings.aggregation = {
        idfield: {
          terms: {
            size: settings.autoAggregationTable.size,
            field: settings.autoAggregationTable.unique_field,
            order: {
              // Will be filled in.
            }
          },
          aggs: subAggs
        },
        count: {
          cardinality: {
            field: settings.autoAggregationTable.unique_field
          }
        }
      };
      settings.aggregation.idfield.terms.order[orderBy] = sort.dir;
    }
  }

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
   * Track the last count request so we avoid duplicate requests.
   */
  IdcEsDataSource.prototype.lastCountRequestStr = '';

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

  /**
   * Fetch data and populate appropriate output plugins.
   *
   * @param bool force
   *   Set to true to force even if request same as before.
   * @param obj onlyForControl
   *   jQuery plugin to populate into. If not supplied, all plugins linked to
   *   source are populated.
   */
  IdcEsDataSource.prototype.doPopulation = function doPopulation(force, onlyForControl) {
    var source = this;
    var request;
    var url;
    var countRequest;
    buildAutoAggregationTable(source);
    request = indiciaFns.getFormQueryData(source);
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
          var countAggregateControls = [];
          var pageSize;
          if (response.error || (response.code && response.code !== 200)) {
            source.hideAllSpinners(source);
            alert('Elasticsearch query failed');
          } else {
            // Convert hits.total to Elasticsearch 7 style.
            if (response.hits.total && indiciaData.esVersion === 6) {
              response.hits.total = { value: response.hits.total, relation: 'eq' };
            }
            // Build any configured output tables.
            source.buildTableXY(response);
            $.each(indiciaData.outputPluginClasses, function eachPluginClass(i, pluginClass) {
              $.each(source.outputs[pluginClass], function eachOutput() {
                if (!onlyForControl || onlyForControl === this) {
                  $(this)[pluginClass]('populate', source.settings, response, request);
                  if (pluginClass === 'idcDataGrid' && source.settings.countAggregation) {
                    // For composite aggregations we may specify a separate
                    // aggregation to provide the count for grid pager.
                    countAggregateControls.push(this);
                  }
                }
              });
            });
            if (countAggregateControls.length > 0) {
              // Separate aggregation to get total record count, e.g. where
              // composite aggregation doesn't return total hit count.
              countRequest = indiciaFns.getFormQueryData(source, true);
              pageSize = indiciaFns.findValue(source.settings.aggregation, 'composite').size;
              // Only need to count on initial population or when filter changes.
              if (countRequest && (JSON.stringify(countRequest) !== source.lastCountRequestStr || force)) {
                source.lastCountRequestStr = JSON.stringify(countRequest);
                $.ajax({
                  url: url,
                  type: 'post',
                  data: countRequest,
                  success: function success(countResponse) {
                    // Update the grid pager data.
                    $.each(countAggregateControls, function eachGrid() {
                      var grid = this;
                      $.each(countResponse.aggregations, function() {
                        $(grid).idcDataGrid('updatePagerForCountAgg', pageSize, this.value);
                      });
                    });
                  }
                });
              } else {
                $.each(countAggregateControls, function eachGrid() {
                  // Update the grid pager data. Use the old count but new page
                  // location info.
                  $(this).idcDataGrid('updatePagerForCountAgg', pageSize);
                });
              }
            }
            source.hideAllSpinners(source);
          }
        },
        error: function error(jqXHR) {
          source.hideAllSpinners(source);
          if (jqXHR.readyState === 4) {
            // Don't bother if not done - i.e. error because user navigated away.
            alert('Elasticsearch query failed');
          }
        },
        dataType: 'json'
      });
    } else {
      source.hideAllSpinners(source);
    }
  }

  /**
   * Request a datasource to repopulate from current parameters.
   *
   * @param bool force
   *   Set to true to force even if request same as before.
   * @param obj onlyForControl
   *   jQuery plugin to populate into. If not supplied, all plugins linked to
   *   source are populated.
   */
  IdcEsDataSource.prototype.populate = function datasourcePopulate(force, onlyForControl) {
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
                source.doPopulation(force, onlyForControl);
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
      source.doPopulation(force, onlyForControl);
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
