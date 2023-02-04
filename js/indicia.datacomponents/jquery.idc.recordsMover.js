/**
 * @file
 * Plugin for a details pane for verification of records.
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
* Output plugin for the verification record details pane.
*/
(function idcRecordsMover() {
  'use strict';
  var $ = jQuery;

  /**
   * Place to store public methods.
   */
  var methods;

  /**
   * Declare default settings.
   */
  var defaults = {};

  var callbacks = {
    onMove: []
  };

  /* Private methods. */

  /**
   * Returns true if the source filter is limited to the current user's data.
   */
  function checkHasMyRecordsFilter(el, filter) {
    var filterFound = false;
    if (indiciaData.esScope === 'user') {
      return true;
    }
    if (typeof filter.bool_queries !== 'undefined') {
      filter.bool_queries.forEach((qry) => {
        if (qry.bool_clause === 'must' && typeof qry.field !== 'undefined' && qry.field === 'metadata.created_by_id'
            && typeof qry.query_type !== 'undefined' && qry.query_type === 'term'
            && typeof qry.value !== 'undefined' && qry.value == indiciaData.user_id) {
          filterFound = true;
        }
      });
    }
    return filterFound;
  }

  /**
   * Fetches the source from the linked data control.
   *
   * @param DOM el
   *   The recordsMover container element.
   */
  function linkToDataSource(el) {
    let settings = $(el)[0].settings;
    let ctrlSettings;
    if (!settings.sourceObject) {
      if ($('#' + settings.linkToDataControl).length !== 1) {
        indiciaFns.controlFail(el, 'Failed to find data control ' + settings.linkToDataControl + ' linked to recordsMover');
      }
      // Find the source linked to the data control.
      ctrlSettings = $('#' + settings.linkToDataControl)[0].settings;
      settings.source = ctrlSettings.source;
      settings.sourceObject = indiciaData.esSourceObjects[Object.keys(settings.source)[0]];
      if (settings.sourceObject.settings.mode !== 'docs') {
        indiciaFns.controlFail(el, 'The recordsMover control needs to link to a source that lists occurrences rather than aggregated data');
      }
    }
  }

  /**
   * Retrieve a summary of the work to do.
   *
   * @param DOM el
   *   The recordsMover container element.
   */
  function getTodoListInfo(el) {
    const linkToDataControl = $('#' + $(el)[0].settings.linkToDataControl);
    const totalHits = linkToDataControl[0].settings.totalHits;
    var r;
    var selectedItems;
    if (linkToDataControl.hasClass('multiselect-mode')) {
      // Using multi-select checkboxes, so find how many are checked.
      r = {
        total: $(linkToDataControl).find('.multiselect:checked').length,
        totalAsText: $(linkToDataControl).find('.multiselect:checked').length,
        message: indiciaData.lang.recordsMover.recordsMoverDialogMessageSelected,
        ids: []
      };
      selectedItems = $(linkToDataControl).find('.multiselect:checked').closest('tr,.card')
      $.each(selectedItems, function eachRow() {
        const doc = JSON.parse($(this).attr('data-doc-source'));
        r.ids.push(parseInt(doc.id, 10));
      });
    } else {
      // Not using multi-select checkboxes, so return count of all records in filter.
      r = {
        total: totalHits.value,
        totalAsText : (totalHits.relation === 'gte' ? 'at least ' : '') + totalHits.value,
        message: indiciaData.lang.recordsMover.recordsMoverDialogMessageAll
      }
    }
    r.message = r.message.replace('{1}', r.totalAsText);
    return r;
  }

  /**
   * Popup a message if the move cannot proceed.
   */
  function cannotProceedMessage(message) {
    $.fancyDialog({
      title: indiciaData.lang.recordsMover.cannotProceed,
      message: message,
      cancelButton: null
    });
  }

  function logOutput(dlg, info) {
    dlg.find('.post-move-info .output').append('<p>' + info + '</p>');
  }

  function checkResponseCode(dlg, response) {
    if (response.code !== 200) {
      logOutput(dlg, indiciaData.lang.recordsMover.error);
      logOutput(dlg, response.message);
      dlg.find('.close-move').removeAttr('disabled');
      return false;
    }
    return true;
  }


  function performBulkMove(dlg, data, endpoint) {
    dlg.find('.pre-move-info').hide();
    dlg.find('.post-move-info').show();
    logOutput(dlg, indiciaData.lang.recordsMover.preparing);
    // First post doesn't change anything - just checks the data can be moved.
    data.precheck = true;
    $.post(indiciaData.esProxyAjaxUrl + '/' + endpoint + '/' + indiciaData.nid, data, null, 'json')
    .done(function(response) {
      if (!checkResponseCode(dlg, response)) {
        return;
      }
      logOutput(dlg, indiciaData.lang.recordsMover.moving);
      delete data.precheck;
      $.post(indiciaData.esProxyAjaxUrl + '/' + endpoint + '/' + indiciaData.nid, data, null, 'json')
      .done(function(response) {
        // @todo update outputs to remove the moved records.
        // @todo handle scenario where >10000
        // @todo close button
        console.log(response);
        if (!checkResponseCode(dlg, response)) {
          return;
        }
        dlg.find('.close-move').removeAttr('disabled');
        logOutput(dlg, indiciaData.lang.recordsMover.done);
      })
      .fail(function() {
        logOutput(dlg, indiciaData.lang.recordsMover.error);
      });
    })
    .fail(function() {
      logOutput(dlg, indiciaData.lang.recordsMover.error);
    });
  }

  function proceedClickHandler(el) {
    // Either pass through list of IDs or pass through a filter to restrict to.
    const linkToDataControl = $('#' + $(el)[0].settings.linkToDataControl);
    const todoInfo = getTodoListInfo(el);
    const dlg = $('#' + $(el)[0].settings.id + '-dlg');
    let data = {
      datasetMappings: JSON.stringify($(el)[0].settings.datasetMappings),
      website_id: indiciaData.website_id
    };
    if (linkToDataControl.hasClass('multiselect-mode')) {
      data['occurrence:ids'] = todoInfo.ids.join(',');
      performBulkMove(dlg, data, 'bulkmoveids');
    } else {
      const filter = indiciaFns.getFormQueryData($(el)[0].settings.sourceObject, false);
      data['occurrence:idsFromElasticFilter'] = filter;
      performBulkMove(dlg, data, 'bulkmoveall');
    }
  }

  /**
   * Click button displays info message before allowing user to proceed with move.
   */
  function moveRecordsBtnClickHandler(e) {
    const el = $(e.currentTarget).closest('.idc-recordsMover');
    const todoInfo = getTodoListInfo(el);
    const dlg = $('#' + $(el)[0].settings.id + '-dlg');
    linkToDataSource(el);
    const filter = indiciaFns.getFormQueryData($(el)[0].settings.sourceObject, false);
    // Validate that it won't affect other user data if it shouldn't.
    if (el[0].settings.restrictToOwnData && !checkHasMyRecordsFilter(el, filter)) {
      cannotProceedMessage(indiciaData.lang.recordsMover.errorNotFilteredToCurrentUser);
      return;
    }
    // Message if nothing to do.
    if (todoInfo.total === 0) {
      cannotProceedMessage(indiciaData.lang.recordsMover.warningNothingToDo);
      return;
    }
    // Reset the dialog.
    dlg.find('.message').text(todoInfo.message);
    dlg.find('.pre-move-info').show();
    dlg.find('.post-move-info').hide();
    dlg.find('.close-move').attr('disabled', true);
    dlg.find('.post-move-info .output p').remove();
    // Now open it.
    $.fancybox.open(dlg);
  }

  /**
   * Register the various user interface event handlers.
   */
  function initHandlers(el) {
    $(el).find('.move-records-btn').click(moveRecordsBtnClickHandler);

    $(el).find('.proceed-move').click(() => {
      proceedClickHandler(el);
    });

    $(el).find('.close-move-dlg').click(() => {
      $.fancybox.close();
    });
  }

  /**
   * Declare public methods.
   */
  methods = {
    /**
     * Initialise the idcRecordDetailsPane plugin.
     *
     * @param array options
     */
    init: function init(options) {
      var el = this;
      el.settings = $.extend({}, defaults);
      el.callbacks = callbacks;
      // Apply settings passed in the HTML data-* attribute.
      if (typeof $(el).attr('data-idc-config') !== 'undefined') {
        $.extend(el.settings, JSON.parse($(el).attr('data-idc-config')));
      }
      // Apply settings passed to the constructor.
      if (typeof options !== 'undefined') {
        $.extend(el.settings, options);
      }
      initHandlers(el);
    },

    on: function on(event, handler) {
      if (typeof this.callbacks[event] === 'undefined') {
        indiciaFns.controlFail(this, 'Invalid event handler requested for ' + event);
      }
      this.callbacks[event].push(handler);
    },

    /**
     * Never needs population.
     */
    getNeedsPopulation: function getNeedsPopulation() {
      return false;
    }
  };

    /**
   * Extend jQuery to declare idcRecordDetailsPane method.
   */
  $.fn.idcRecordsMover = function buildRecordsMover(methodOrOptions) {
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
      $.error('Method ' + methodOrOptions + ' does not exist on jQuery.idcRecordsMover');
      return true;
    });
    // If the method has no explicit response, return this to allow chaining.
    return typeof result === 'undefined' ? this : result;
  };

}());