/**
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
* Output plugin for verification buttons.
*/
(function idcVerificationButtons() {
  'use strict';
  var $ = jQuery;

  /**
   * Declare default settings.
   */
  var defaults = {
  };

  /**
   * Registered callbacks for events.
   */
  var callbacks = {
  };

  var dataGrid;

  var saveVerifyComment = function saveVerifyComment(occurrenceIds, status, comment) {
    var commentToSave;
    var allTableMode = $(dataGrid).find('.multi-mode-table.active').length > 0;
    var data = {
      website_id: indiciaData.website_id,
      user_id: indiciaData.user_id
    };
    var doc = {
      identification: {}
    };
    var indiciaPostUrl;
    var requests = 0;
    // Since this might be slow.
    $('body').append('<div class="loading-spinner"><div>Loading...</div></div>');
    if (status.status) {
      commentToSave = comment.trim() === ''
        ? indiciaData.statusMsgs[status.status]
        : comment.trim();
      $.extend(data, {
        'occurrence:record_decision_source': 'H',
        'occurrence:record_status': status.status[0],
        'occurrence_comment:comment': commentToSave
      });
      if (allTableMode) {
        indiciaPostUrl = indiciaData.esProxyAjaxUrl + '/updateall/' + indiciaData.nid;
        // Loop sources, only 1 will apply.
        $.each($(dataGrid)[0].settings.source, function eachSource(sourceId) {
          $.extend(data, {
            'occurrence:idsFromElasticFilter': indiciaFns.getFormQueryData(indiciaData.esSourceObjects[sourceId])
          });
          return false;
        });
      } else {
        indiciaPostUrl = indiciaData.ajaxFormPostSingleVerify;
        $.extend(data, {
          'occurrence:ids': occurrenceIds.join(',')
        });
      }
      doc.identification.verification_status = status.status[0];
      if (status.status.length > 1) {
        data['occurrence:record_substatus'] = status.status[1];
        doc.identification.verification_substatus = status.status[1];
      }
      // Post update to Indicia.
      requests++;
      $.post(
        indiciaPostUrl,
        data,
        function success(response) {
          if (allTableMode) {
            $('body > .loading-spinner').remove();
            alert(response.updated + ' record(s) updated.');
            // Wait a moment before refresh as Elastic updates not quite immediate.
            setTimeout(function doPopulate() {
              indiciaFns.populateDataSources();
            }, 500);
          } else if (response !== 'OK') {
            alert('Indicia records update failed');
          }
        }
      ).always(function cleanup() {
        requests--;
        if (requests <= 0) {
          $('body > .loading-spinner').remove();
        }
      });
      // In all table mode, everything handled by the ES proxy so nothing else to do.
      if (allTableMode) {
        return;
      }
    } else if (status.query) {
      // No bulk API for query updates at the moment, so process one at a time.
      indiciaPostUrl = indiciaData.ajaxFormPostComment;
      doc.identification.query = status.query;
      commentToSave = comment.trim() === ''
        ? 'This record has been queried.'
        : comment.trim();
      $.each(occurrenceIds, function eachOccurrence() {
        $.extend(data, {
          'occurrence_comment:query': 't',
          'occurrence_comment:occurrence_id': this,
          'occurrence_comment:comment': commentToSave
        });
        // Post update to Indicia.
        $.post(
          indiciaPostUrl,
          data
        ).always(function cleanup() {
          requests--;
          if (requests <= 0) {
            $('body > .loading-spinner').remove();
          }
        });
      });
    }

    // Now post update to Elasticsearch.
    data = {
      ids: occurrenceIds,
      doc: doc
    };
    $.ajax({
      url: indiciaData.esProxyAjaxUrl + '/updateids/' + indiciaData.nid,
      type: 'post',
      data: data,
      success: function success(response) {
        if (typeof response.error !== 'undefined' || (response.code && response.code !== 200)) {
          alert('Elasticsearch update failed');
        } else {
          if (response.updated !== occurrenceIds.length) {
            alert('An error occurred whilst updating the reporting index. It may not reflect your changes ' +
              'temporarily but will be updated automatically later.');
          } else {
            $('body > .loading-spinner').remove();
            if (occurrenceIds.length > 1) {
              alert(response.updated + ' record(s) updated.');
              // Wait a moment before refresh as Elastic updates not quite immediate.
              setTimeout(function doPopulate() {
                indiciaFns.populateDataSources();
              }, 500);
            }
          }
          if (occurrenceIds.length === 1) {
            $(dataGrid).idcDataGrid('hideRowAndMoveNext');
          }
          $(dataGrid).find('.multiselect-all').prop('checked', false);
        }
      },
      error: function error(jqXHR, textStatus, errorThrown) {
        alert('Elasticsearch update failed');
      },
      dataType: 'json'
    }).always(function cleanup() {
      requests--;
      if (requests <= 0) {
        $('body > .loading-spinner').remove();
      }
    });
  };

  var commentPopup = function commentPopup(status) {
    var doc;
    var fs;
    var heading;
    var statusData = [];
    var overallStatus = status.status ? status.status : status.query;
    var ids = [];
    var todoCount;
    var selectedTrs;
    if ($(dataGrid).find('.multi-mode-table.active').length > 0) {
      todoCount = $(dataGrid)[0].settings.totalRowCount;
    } else {
      selectedTrs = $(dataGrid).hasClass('multiselect-mode')
        ? $(dataGrid).find('.multiselect:checked').closest('tr')
        : $(dataGrid).find('tr.selected');
      if (selectedTrs.length === 0) {
        alert('There are no selected records. Either select some rows using the checkboxes in the leftmost column or set the "Apply decision to" mode to "all".');
        return;
      }
      $.each(selectedTrs, function eachRow() {
        doc = JSON.parse($(this).attr('data-doc-source'));
        ids.push(parseInt(doc.id, 10));
      });
      todoCount = ids.length;
    }
    if (status.status) {
      statusData.push('data-status="' + status.status + '"');
    }
    if (status.query) {
      statusData.push('data-query="' + status.query + '"');
    }
    fs = $('<fieldset class="comment-popup" data-ids="' + JSON.stringify(ids) + '" ' + statusData.join('') + '>');
    if (todoCount > 1) {
      heading = status.status
        ? 'Set status to ' + indiciaData.statusMsgs[overallStatus] + ' for ' + todoCount + ' records'
        : 'Query ' + todoCount + ' records';
      $('<div class="alert alert-info">You are updating multiple records!</alert>').appendTo(fs);
    } else {
      heading = status.status
        ? 'Set status to ' + indiciaData.statusMsgs[overallStatus]
        : 'Query this record';
    }
    $('<legend><span class="' + indiciaData.statusClasses[overallStatus] + ' fa-2x"></span>' + heading + '</legend>')
      .appendTo(fs);
    $('<label for="comment-textarea">Add the following comment:</label>').appendTo(fs);
    $('<textarea id="comment-textarea">').appendTo(fs);
    $('<button class="btn btn-primary">Save</button>').appendTo(fs);
    $.fancybox(fs);
  };

  /**
   * Declare public methods.
   */
  var methods = {
    /**
     * Initialise the idcVerificationButtons plugin.
     *
     * @param array options
     */
    init: function init(options) {
      var el = this;

      el.settings = $.extend({}, defaults);
      // Apply settings passed in the HTML data-* attribute.
      if (typeof $(el).attr('data-idc-config') !== 'undefined') {
        $.extend(el.settings, JSON.parse($(el).attr('data-idc-config')));
      }
      // Apply settings passed to the constructor.
      if (typeof options !== 'undefined') {
        $.extend(el.settings, options);
      }
      // Validate settings.
      if (typeof el.settings.showSelectedRow === 'undefined') {
        indiciaFns.controlFail(el, 'Missing showSelectedRow config for table.');
      }
      dataGrid = $('#' + el.settings.showSelectedRow);
      $(dataGrid).idcDataGrid('on', 'rowSelect', function rowSelect(tr) {
        var sep;
        var doc;
        var key;
        var keyParts;
        $('.external-record-link').remove();
        if (tr) {
          // Update the view and edit button hrefs. This allows the user to
          // right click and open in a new tab, rather than have an active
          // button.
          doc = JSON.parse($(tr).attr('data-doc-source'));
          $('.idc-verification-buttons').show();
          sep = el.settings.viewPath.indexOf('?') === -1 ? '?' : '&';
          $(el).find('.view').attr('href', el.settings.viewPath + sep + 'occurrence_id=' + doc.id);
          $(el).find('.edit').attr('href', el.settings.editPath + sep + 'occurrence_id=' + doc.id);
          // Deprecated doc field mappings had occurrence_external_key instead
          // of occurrence.source_system_key. This line can be removed if the
          // index has been rebuilt.
          if (doc.occurrence.source_system_key || doc.occurrence_external_key) {
            key = doc.occurrence.source_system_key ? doc.occurrence.source_system_key : doc.occurrence_external_key;
            if (key.match(/^iNat:/)) {
              keyParts = key.split(':');
              $(el).find('.view').after('<a href="https://www.inaturalist.org/observations/' + keyParts[1] + '" ' +
                'target="_blank" title="View source record on iNaturalist" class="external-record-link">' +
                '<span class="fas fa-file-invoice"></span>iNaturalist</a>');
            }
          }
        } else {
          $('.idc-verification-buttons').hide();
        }
      });
      $(dataGrid).idcDataGrid('on', 'populate', function rowSelect() {
        $('.idc-verification-buttons').hide();
      });
      $(el).find('button.verify').click(function buttonClick(e) {
        var status = $(e.currentTarget).attr('data-status');
        commentPopup({ status: status });
      });
      $(el).find('button.query').click(function buttonClick(e) {
        var query = $(e.currentTarget).attr('data-query');
        commentPopup({ query: query });
      });
      indiciaFns.on('click', '.comment-popup button', {}, function onClickSave(e) {
        var popup = $(e.currentTarget).closest('.comment-popup');
        var ids = JSON.parse($(popup).attr('data-ids'));
        var statusData = {};
        if ($(popup).attr('data-status')) {
          statusData.status = $(popup).attr('data-status');
        }
        if ($(popup).attr('data-query')) {
          statusData.query = $(popup).attr('data-query');
        }
        saveVerifyComment(ids, statusData, $(popup).find('textarea').val());
        $.fancybox.close();
      });
      $(el).find('.l1').hide();
      $(el).find('.toggle').click(function toggleClick(e) {
        var div = $(e.currentTarget).closest('.idc-verification-buttons-row');
        if ($(e.currentTarget).hasClass('fa-toggle-on')) {
          $(e.currentTarget).removeClass('fa-toggle-on');
          $(e.currentTarget).addClass('fa-toggle-off');
          div.find('.l2').hide();
          div.find('.l1').show();
        } else {
          $(e.currentTarget).removeClass('fa-toggle-off');
          $(e.currentTarget).addClass('fa-toggle-on');
          div.find('.l1').hide();
          div.find('.l2').show();
        }
      });
      // Toggle the apply to selected|table mode buttons.
      $(el).find('.apply-to button').click(function modeClick(e) {
        var div = $(e.currentTarget).closest('.idc-verification-buttons-row');
        div.find('.apply-to button').not(e.currentTarget).removeClass('active');
        $(e.currentTarget).addClass('active');
      });
    },

    on: function on(event, handler) {
      if (typeof callbacks[event] === 'undefined') {
        indiciaFns.controlFail(this, 'Invalid event handler requested for ' + event);
      }
      callbacks[event].push(handler);
    },

    /**
     * No need to re-populate if source updates.
     */
    getNeedsPopulation: function getNeedsPopulation() {
      return false;
    }
  };

    /**
   * Extend jQuery to declare idcVerificationButtons plugin.
   */
  $.fn.idcVerificationButtons = function buildVerificationButtons(methodOrOptions) {
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
      $.error('Method ' + methodOrOptions + ' does not exist on jQuery.idcVerificationButtons');
      return true;
    });
    // If the method has no explicit response, return this to allow chaining.
    return typeof result === 'undefined' ? this : result;
  };
}());
