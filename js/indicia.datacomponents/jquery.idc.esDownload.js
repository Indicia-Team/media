/**
 * @file
 * A plugin for managing downloads from Elasticsearch.
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

 /**
 * Output plugin for data downloads.
 */
(function esDownloadPlugin() {
  'use strict';
  var $ = jQuery;

  /**
   * Place to store public methods.
   */
  var methods;

  /**
   * Flag to track when file generation completed.
   */
  var done;

  /**
   * Declare default settings.
   */
  var defaults = {
  };

  /**
   * Save rebuilding request data for each page
   */
  var currentRequestData;

  /**
   * Total rows to download. In some settings we only get this on first page.
   */
  var rowsToDownload;

  /**
   * Wind the progress spinner forward to a certain percentage.
   *
   * @param element el
   *   The plugin instance's element.
   * @param int progress
   *   Progress percentage.
   */
  function animateTo(el, progress) {
    var target = done ? 1006 : 503 + (progress * 503);
    // Stop previous animations if we are making better progress through the
    // download than 1 chunk per 0.5s. This allows the spinner to speed up.
    $(el).find('.circle').stop(true);
    $(el).find('.circle').animate({
      'stroke-dasharray': target
    }, {
      duration: 500
    });
  }

  /**
   * Updates the progress text and spinner after receiving a response.
   *
   * @param element el
   *   The plugin instance's element.
   * @param obj response
   *   Response body from the ES proxy containing progress data.
   */
  function updateProgress(el, response) {
    var rowsDone = response.done;
    if (response.total) {
      rowsToDownload = response.total;
    }
    // ES V7 seems to overshoot, reporting whole rather than partial last page size.
    rowsDone = Math.min(rowsDone, rowsToDownload);
    $(el).find('.progress-text').text(rowsDone + ' of ' + rowsToDownload);
    animateTo(el, rowsDone / rowsToDownload);
  }

  /**
   * Retreive an object containing just settings relating to columns.
   *
   * @param element el
   *   The plugin instance's element which holds the settings.
   *
   * @return obj
   *   Object containing settings relating to columns to include.
   */
  function getColumnSettings(el) {
    var data = {};
    var agg;
    var sourceSettings = el.settings.sourceObject.settings;
    // Note, columnsTemplate can be blank.
    if (typeof el.settings.columnsTemplate !== 'undefined') {
      data.columnsTemplate = el.settings.columnsTemplate;
    } else if (el.settings.sourceObject.settings.mode.match(/Aggregation$/)) {
      data.columnsTemplate = '';
    }
    if (el.settings.addColumns && el.settings.addColumns.length !== 0) {
      data.addColumns = el.settings.addColumns;
    } else if (el.settings.sourceObject.settings.mode.match(/Aggregation$/) && data.columnsTemplate === '') {
      // Find the first aggregation defined for this source.
      agg = sourceSettings.aggregation[Object.keys(sourceSettings.aggregation)[0]];
      data.addColumns = [];
      $.each(sourceSettings.fields, function eachField() {
        data.addColumns.push({
          field: 'key.' + this.asCompositeKeyName(),
          caption: this.asReadableKeyName(),
        });
      });
      // The agg should also contain aggregation for calculated columns.
      $.each(agg.aggs, function eachAgg(key) {
        data.addColumns.push({
          field: key,
          caption: key.asReadableKeyName()
        });
      });


      // Ensure dates are formatted correctly.

    }
    if (el.settings.removeColumns) {
      data.removeColumns = el.settings.removeColumns;
    }
    return data;
  }

  function initSource(el) {
    var settings = el.settings;
    var gridSettings;
    var sourceSettings;
    if (settings.linkToDataGrid) {
      if ($('#' + settings.linkToDataGrid).length !== 1) {
        indiciaFns.controlFail(el, 'Failed to find dataGrid ' + settings.linkToDataGrid + ' linked to download');
      }
      // Refresh the columns according to those currently in the dataGrid.
      gridSettings = $('#' + settings.linkToDataGrid)[0].settings;
      settings.source = gridSettings.source;
      sourceSettings = indiciaData.esSourceObjects[Object.keys(settings.source)[0]].settings;
      settings.columnsTemplate = '';
      settings.addColumns = [];
      $.each(gridSettings.columns, function eachCol() {
        var field;
        if (sourceSettings.mode.match(/Aggregation$/) && $.inArray(this.field, sourceSettings.fields) > -1) {
          field = 'key.' + this.field.asCompositeKeyName();
        } else {
          field = this.field;
        }
        settings.addColumns.push({
          caption: gridSettings.availableColumnInfo[this.field].caption,
          field: field
        });
      });
    }
    // Only allow a single source for download, so simplify the sources.
    settings.sourceObject = indiciaData.esSourceObjects[Object.keys(settings.source)[0]];
  }

  /**
   * Recurse until all the pages of a chunked download are received.
   *
   * @param obj lastResponse
   *   Response body from the ES proxy containing progress data.
   */
  function doPages(el, lastResponse, columnSettings) {
    var date;
    var hours;
    var minutes;
    var description = '';
    var sep = indiciaData.esProxyAjaxUrl.match(/\?/) ? '&' : '?';
    var query = sep + 'state=nextPage&uniq_id=' + lastResponse.uniq_id;
    if (lastResponse.state === 'nextPage') {
      if (lastResponse.scroll_id) {
        // Scrolls remember the search query so only need the scroll ID.
        query += '&scroll_id=' + lastResponse.scroll_id;
        // Scrolling remembers all the settings server-side.
        currentRequestData = {};
      } else if (el.settings.sourceObject.settings.mode.match(/Aggregation$/)) {
        // Inform the warehouse as composite paging behaviour different. The
        // uniq_id allows the warehouse to relocate the last request's after_key.
        query += '&aggregation_type=composite';
        // No need to recount!
        delete currentRequestData.aggs.count;
      }
      // Post to the ES proxy. Pass scroll_id (docs) or after_key (composite aggregations)
      // parameter to request the next chunk of the dataset.
      $.ajax({
        url: indiciaData.esProxyAjaxUrl + '/download/' + indiciaData.nid + query,
        type: 'POST',
        dataType: 'json',
        data: currentRequestData,
        success: function success(response) {
          updateProgress(el, response);
          doPages(el, response, columnSettings);
        },
        error: function error(jqXHR, textStatus, errorThrown) {
          alert('An error occurred with the request to download data.');
          console.log(errorThrown);
        }
      });
    } else {
      // Finished.
      $(el).find('.progress-text').text('Done');
      date = new Date();
      // File available for 45 minutes.
      date.setTime(date.getTime() + (45 * 60 * 1000));
      hours = '0' + date.getHours();
      hours = hours.substr(hours.length - 2);
      minutes = '0' + date.getMinutes();
      minutes = minutes.substr(minutes.length - 2);
      description = 'File containing ' + lastResponse.done +
        (el.settings.sourceObject.settings.mode === 'compositeAggregation' ? ' items. ' : ' occurrences. ');

      $(el).find('.progress-circle-container').addClass('download-done');
      $(el).find('.idc-download-files').append('<div><a href="' + lastResponse.filename + '">' +
        '<span class="fas fa-file-archive fa-2x"></span>' +
        'Download .zip file</a><br/>' + description +
        'Available until ' + hours + ':' + minutes + '.</div>');
      $(el).find('.idc-download-files').fadeIn('med');
    }
  }

  /**
   * Initialise the user interface event handlers.
   */
  function initHandlers(el) {
    /**
     * Download button click handler.
     */
    $(el).find('.do-download').click(function doDownload() {
      var sep = indiciaData.esProxyAjaxUrl.match(/\?/) ? '&' : '?';
      var query = sep + 'state=initial';
      var columnSettings;
      var srcSettings = el.settings.sourceObject.settings;
      initSource(el);
      // Prepare the source aggregations in composite mode if using automatic
      // aggregation as it supports scrolling and is faster.
      el.settings.sourceObject.prepare(srcSettings.mode.match(/Aggregation$/)
        ? 'compositeAggregation' : srcSettings.mode);
      columnSettings = getColumnSettings(el);
      $(el).find('.progress-circle-container').removeClass('download-done');
      $(el).find('.progress-circle-container').show();
      done = false;
      $(el).find('.circle').attr('style', 'stroke-dashoffset: 503px');
      $(el).find('.progress-text').text('Loading...');
      currentRequestData = indiciaFns.getFormQueryData(el.settings.sourceObject);
      if (srcSettings.mode.match(/Aggregation$/)) {
        query += '&aggregation_type=composite';
        // Arbitrary choice of page size.
        currentRequestData.aggs.rows.composite.size = 500;
      }
      $.extend(currentRequestData, columnSettings);
      // Reset.
      rowsToDownload = null;
      // Post to the ES proxy.
      $.ajax({
        url: indiciaData.esProxyAjaxUrl + '/download/' + indiciaData.nid + query,
        type: 'POST',
        dataType: 'json',
        data: currentRequestData,
        success: function success(response) {
          if (typeof response.code !== 'undefined' && response.code === 401) {
            alert('Elasticsearch alias configuration user or secret incorrect in the form configuration.');
            $('.progress-circle-container').hide();
          } else {
            updateProgress(el, response);
            doPages(el, response, columnSettings);
          }
        },
        error: function error(jqXHR, textStatus, errorThrown) {
          alert('An error occurred with the request to download data.');
          console.log(errorThrown);
        }
      });
    });
  }

  /**
   * Declare public methods.
   */
  methods = {

    /**
     * Initialise the idcEsDownload plugin.
     *
     * @param array options
     */
    init: function init(options) {
      var el = this;

      indiciaFns.registerOutputPluginClass('idcEsDownload');
      el.settings = $.extend({}, defaults);
      // Apply settings passed in the HTML data-* attribute.
      if (typeof $(el).attr('data-idc-config') !== 'undefined') {
        $.extend(el.settings, JSON.parse($(el).attr('data-idc-config')));
      }
      // Apply settings passed to the constructor.
      if (typeof options !== 'undefined') {
        $.extend(el.settings, options);
      }
      el.settings.sourceObject = indiciaData.esSourceObjects[Object.keys(el.settings.source)[0]];
      // Don't do any more init at this point, as might be using a not-yet
      // instantiated dataGrid for config.
      initHandlers(el);
    },

    /*
     * The download plugin doesn't do anything until requested.
     */
    populate: function populate() {
      // Nothing to do.
    },

    /**
     * Downloads don't need to refresh until explicitly actioned.
     */
    getNeedsPopulation: function getNeedsPopulation() {
      return false;
    }
  };

  /**
   * Extend jQuery to declare idcEsDownload plugin.
   */
  $.fn.idcEsDownload = function buildEsDownload(methodOrOptions) {
    var passedArgs = arguments;
    var result;
    $.each(this, function callOnEachOutput() {
      if (methods[methodOrOptions]) {
        // Call a declared method.
        result = methods[methodOrOptions].apply(this, Array.prototype.slice.call(passedArgs, 1));
        return true;
      } else if (typeof methodOrOptions === 'object' || !methodOrOptions) {
        // Default to "init".
        return methods.init.apply(this, passedArgs);
      }
      // If we get here, the wrong method was called.
      $.error('Method ' + methodOrOptions + ' does not exist on jQuery.idcEsDownload');
      return true;
    });
    // If the method has no explicit response, return this to allow chaining.
    return typeof result === 'undefined' ? this : result;
  };
}());
