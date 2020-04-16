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
    var done;
    if (el.settings.aggregation === 'composite') {
      // Can't get progress, but show something happening.
      $(el).find('.progress-text').text(response.done + ' items');
    } else {
      // ES V7 seems to overshoot, reporting whole rather than partial last page size.
      done = Math.min(response.done, response.total);
      $(el).find('.progress-text').text(done + ' of ' + response.total);
      animateTo(el, done / response.total);
    }
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
    // Note, columnsTemplate can be blank.
    if (typeof el.settings.columnsTemplate !== 'undefined') {
      data.columnsTemplate = el.settings.columnsTemplate;
    }
    if (el.settings.addColumns) {
      data.addColumns = el.settings.addColumns;
    }
    if (el.settings.removeColumns) {
      data.removeColumns = el.settings.removeColumns;
    }
    return data;
  }

  /**
   * Recurse until all the pages of a chunked download are received.
   *
   * @param obj lastResponse
   *   Response body from the ES proxy containing progress data.
   */
  function doPages(el, lastResponse) {
    var date;
    var hours;
    var minutes;
    var data = {};
    var description = '';
    var sep = indiciaData.esProxyAjaxUrl.match(/\?/) ? '&' : '?';
    var query = sep + 'state=nextPage&uniq_id=' + lastResponse.uniq_id;
    if (lastResponse.scroll_id) {
      // Scrolls remember the search query so only need the scroll ID.
      query += '&scroll_id=' + lastResponse.scroll_id;
    } else if (el.settings.aggregation && el.settings.aggregation === 'composite') {
      // Paging composite aggregations requires the full search query.
      data = indiciaFns.getFormQueryData(indiciaData.esSourceObjects[el.settings.sourceId]);
      // Inform the warehouse as composite paging behaviour different. The
      // uniq_id allows the warehouse to relocate the last request's after_key.
      query += '&aggregation_type=composite';
    }
    if (lastResponse.state === 'nextPage') {
      $.extend(data, getColumnSettings(el));
      // Post to the ES proxy. Pass scroll_id (docs) or after_key (composite aggregations)
      // parameter to request the next chunk of the dataset.
      $.ajax({
        url: indiciaData.esProxyAjaxUrl + '/download/' + indiciaData.nid + query,
        type: 'POST',
        dataType: 'json',
        data: data,
        success: function success(response) {
          updateProgress(el, response);
          doPages(el, response);
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
        (el.settings.aggregation && el.settings.aggregation === 'composite' ? ' items. ' : ' occurrences. ');

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
      var data;
      var source = indiciaData.esSourceObjects[el.settings.sourceId];
      var sep = indiciaData.esProxyAjaxUrl.match(/\?/) ? '&' : '?';
      var query = sep + 'state=initial';
      $(el).find('.progress-circle-container').removeClass('download-done');
      $(el).find('.progress-circle-container').show();
      done = false;
      $(el).find('.circle').attr('style', 'stroke-dashoffset: 503px');
      $(el).find('.progress-text').text('Loading...');
      data = indiciaFns.getFormQueryData(source);
      if (el.settings.aggregation && el.settings.aggregation === 'composite') {
        query += '&aggregation_type=composite';
      }
      $.extend(data, getColumnSettings(el));
      // Post to the ES proxy.
      $.ajax({
        url: indiciaData.esProxyAjaxUrl + '/download/' + indiciaData.nid + query,
        type: 'POST',
        dataType: 'json',
        data: data,
        success: function success(response) {
          if (typeof response.code !== 'undefined' && response.code === 401) {
            alert('Elasticsearch alias configuration user or secret incorrect in the form configuration.');
            $('.progress-circle-container').hide();
          } else {
            updateProgress(el, response);
            doPages(el, response);
          }
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
      // Only allow a single source for download, so simplify the sources.
      $.each(el.settings.source, function eachSource(sourceId) {
        el.settings.sourceId = sourceId;
        return false;
      });
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
