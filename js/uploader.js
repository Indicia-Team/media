jQuery(document).ready(function($) {
  "use strict";

  var urlSep;

  /**
   * Select file page code.
   */

  function clearExistingUploadedFileInfo() {
    $('#uploaded-files').html('');
    $('#uploaded-file').val('');
    $('#file-upload-form input[type="submit"]').attr('disabled', true);
  }

  indiciaFns.on('click', '#uploaded-files .remove-file', {}, function(e) {
    clearExistingUploadedFileInfo();
  });

  function initFileUploadControl() {
    $(indiciaData.importerDropArea).dmUploader({
      url: indiciaData.uploadFileUrl,
      multiple: false,
      extFilter: ['csv','xls','xlsx','zip'],
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce},
      onDragEnter: function() {
        // Happens when dragging something over the DnD area
        this.addClass('active');
      },
      onDragLeave: function() {
        // Happens when dragging something OUT of the DnD area
        this.removeClass('active');
      },
      onInit: function() {
        this.find('input[type="text"]').val('');
      },
      onBeforeUpload: function() {
        clearExistingUploadedFileInfo();
      },
      onUploadProgress: function(id, percent) {
        // Don't show the progress bar if it goes to 100% in 1 chunk.
        if (percent !== 100) {
          // Updating file progress
          $('#file-progress').show();
          $('#file-progress').val(percent);
        }
      },
      onFileExtError() {
        $.fancyDialog({
          title: 'Upload error',
          message: indiciaData.lang.import_helper_2.invalidType,
          cancelButton: null
        });
      },
      onUploadError(id, xhr, status, errorThrown) {
        $.fancyDialog({
          title: 'Upload error',
          message: indiciaData.lang.import_helper_2.uploadFailedWithError.replace('{1}', errorThrown),
          cancelButton: null
        });
      },
      onUploadSuccess: function(id, data) {
        var ext;
        // IForm proxy code doesn't set header correctly.
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
        ext = data.interimFile.split('.').pop().toUpperCase();
        $('#interim-file').val(data.interimFile);
        $('#file-upload-form input[type="submit"]').attr('disabled', false);
        $('#uploaded-files').append($('<i class="far fa-file-alt fa-7x"></i>'));
        $('#uploaded-files').append($('<i class="far fa-trash-alt remove-file" title="' + indiciaData.lang.import_helper_2.removeUploadedFileHint + '"></i>'));
        $('#uploaded-files').append($('<p>' + indiciaData.lang.import_helper_2.selectedFile.replace('{1}', ext) + '</p>'));
      }
    });
  }

  /**
   * Import settings page code.
   */

  /**
   * Adds a background processing progress message to the log output panel.
   *
   * @param string msg
   *   Message to log.
   */
  function logBackgroundProcessingInfo(msg) {
    $('.background-processing .panel-body').append('<p>' + msg + '</p>');
    $('.background-processing .panel-body')[0].scrollTop = $('.background-processing .panel-body')[0].scrollHeight;
  }

  /**
   * Creates the config JSON file on the server, then proceeds with next step.
   *
   * @param string fileName
   *   Import file name.
   */
  function initServerConfig(fileName) {
    var url;
    urlSep = indiciaData.initServerConfigUrl.indexOf('?') === -1 ? '?' : '&';
    url = indiciaData.initServerConfigUrl + urlSep + 'data-file=' + fileName;
    if (indiciaData.import_template_id) {
      url += '&import_template_id=' + indiciaData.import_template_id;
    }
    $.ajax({
      url: url,
      dataType: 'json',
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce}
    }).done(function() {
      transferDataToTempTable(fileName);
    });
  }

  function transferDataToTempTable(fileName) {
    urlSep = indiciaData.loadChunkToTempTableUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.loadChunkToTempTableUrl + urlSep + 'data-file=' + fileName,
      dataType: 'json',
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce}
    }).done(function(transferResult) {
      var msg = indiciaData.lang.import_helper_2[transferResult.msgKey];
      if (transferResult.progress) {
        $('#file-progress').val(transferResult.progress);
        msg += ' (' + Math.round(transferResult.progress) + '%)';
        if (transferResult.progress >= 100) {
          $('#file-progress').hide();
          $('.background-processing .panel-heading span').text(indiciaData.lang.import_helper_2.backgroundProcessingDone);
        }
      }
      if (transferResult.status === 'ok') {
        logBackgroundProcessingInfo(msg);
        if (transferResult.msgKey === 'loadingRecords') {
          transferDataToTempTable(fileName);
        }
        else {
          $('input[type="submit"]').attr('disabled', false);
        }
      } else {
        if (transferResult.msg) {
          $.fancyDialog({
            title: indiciaData.lang.import_helper_2.uploadError,
            message: transferResult.msg,
            cancelButton: null
          });
        }
      }
    }).fail(function(qXHR, textStatus, errorThrown) {
      $.fancyDialog({
        title: indiciaData.lang.import_helper_2.uploadError,
        message: qXHR.responseText,
        cancelButton: null
      });
    });
  }

  if (indiciaData.processUploadedInterimFile) {
    logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.uploadingFile);
    urlSep = indiciaData.sendFileToWarehouseUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.sendFileToWarehouseUrl + urlSep + 'interim-file=' + indiciaData.processUploadedInterimFile,
      dataType: 'json',
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce},
      success: function(sendFileResult) {
        if (sendFileResult.status === 'ok') {
          var isZip = indiciaData.processUploadedInterimFile.split('.').pop().toLowerCase() === 'zip';
          logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.fileUploaded);
          if (isZip) {
            logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.extractingFile);
            $.ajax({
              url: indiciaData.extractFileOnWarehouseUrl + urlSep + 'uploaded-file=' + sendFileResult.uploadedFile,
              dataType: 'json',
              headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce},
              success: function(extractResult) {
                if (extractResult.status === 'ok') {
                  logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.fileExtracted);
                  logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.preparingToLoadRecords);
                  $('#data-file').val(extractResult.dataFile);
                  initServerConfig(extractResult.dataFile);
                }
                else {
                  if (extractResult.msg) {
                    $.fancyDialog({
                      title: indiciaData.lang.import_helper_2.uploadError,
                      message: extractResult.msg,
                      cancelButton: null
                    });
                  }
                }
              }
            })
            .fail(
              function(jqXHR, textStatus, errorThrown) {
                $.fancyDialog({
                  // @todo i18n
                  title: indiciaData.lang.import_helper_2.uploadError,
                  message: indiciaData.lang.import_helper_2.errorExtractingZip + ':<br/>' + errorThrown,
                  cancelButton: null
                });
              }
            );
          }
          else {
            logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.preparingToLoadRecords);
            $('#data-file').val(sendFileResult.uploadedFile);
            initServerConfig(sendFileResult.uploadedFile);
          }
        }
        else {
          if (sendFileResult.msg) {
            $.fancyDialog({
              title: indiciaData.lang.import_helper_2.uploadError,
              message: sendFileResult.msg,
              cancelButton: null
            });
          }
        }
      }
    })
    .fail(
      function(jqXHR, textStatus, errorThrown) {
        $.fancyDialog({
          // @todo i18n
          title: indiciaData.lang.import_helper_2.uploadError,
          message: indiciaData.lang.import_helper_2.errorUploadingFile + ':<br/>' + errorThrown,
          cancelButton: null
        });
      }
    );
  }

  /**
   * Button handler to show the unrestricted version of a global values control.
   *
   * Appears if the settings list several options, plus a special option *
   * which triggers the extra unrestricted control.
   */
  $('.show-unrestricted').click(function() {
    const ctrlWrap = $(this).closest('.ctrl-wrap');
    const input = ctrlWrap.find(':input');
    const controlName = input.attr('name');
    const unrestrictedCtrlWrap = $('#' + $(ctrlWrap).attr('id') + '-unrestricted');
    ctrlWrap.slideUp();
    // Prevent old input from submitting.
    input.attr('disabled', true);
    $(unrestrictedCtrlWrap).closest('.unrestricted-cntr').slideDown();
    $(unrestrictedCtrlWrap).find(':input').attr('name', controlName);
  });

  /**
   * Lookup matching page code.
   */

  /**
   * Adds a table for matching lookup values for a field.
   *
   * Returns a table with a row for each unmatched value, with a control for
   * allowing the user to select what to import.
   *
   * @param object result
   *   Data returned from the warehouse with the unmatched value info.
   */
  function addFkMatchingTableToForm(result) {
    if (result.unmatchedInfo.values.length === 0) {
      // Nothing to match.
      return;
    }
    var matchingPanelBody = $('<div class="panel-body">')
      .appendTo($('<div class="panel panel-default"><div class="panel-heading">' +
        indiciaData.lang.import_helper_2.matchingPanelFor.replace('{1}', result.columnLabel) + '</div></div>')
        .appendTo($('#matching-area')));
    var matchingTable = $('<table class="table" id="matches-' + result.sourceField + '"><thead><tr>' +
      '<th>' + indiciaData.lang.import_helper_2.dataValue + '</th>' +
      '<th>' + indiciaData.lang.import_helper_2.matchesToTerm + '</th></tr></table>')
      .appendTo(matchingPanelBody);
    var tbody = $('<tbody />')
      .appendTo(matchingTable);
    var options = '<option value="">' + indiciaData.lang.import_helper_2.pleaseSelect + '</option>';
    $.each(result.unmatchedInfo.matchOptions, function(id, term) {
      options += '<option value="' + id + '">' + term + '</option>';
    });
    $.each(result.unmatchedInfo.values, function(idx) {
      var controlName;
      controlName = 'match-' + result.unmatchedInfo.attrType + '-' + result.unmatchedInfo.attrId + '-' + idx;
      $('<tr><th scope="row" data-value="' + this + '">' + this + '</th>' +
        '<td><select class="form-control" required data-value="' + this.replace('"', '&quot;') + '" name="' + controlName + '">' + options + '</select></td></tr>')
        .appendTo(tbody);
    });
    $('<button type="button" class="btn btn-primary save-matches" ' +
      'data-source-field="' + result.sourceField + '"' +
      '>Save matches for ' + result.columnLabel + ' <i class="far fa-check"></i></button>')
      .appendTo($('<div class="panel-body">').appendTo(matchingPanelBody));
  }

  /**
   * Autocomplete handler to format the taxon list in the drop-down.
   */
  function formatTaxonName(item) {
    var r;
    var nameTest;
    var synText;

    if (item.language_iso !== null && item.language_iso.toLowerCase() === 'lat') {
      r = '<em class="taxon-name">' + item.taxon + '</em>';
    } else {
      r = '<span class="taxon-name">' + item.taxon + '</span>';
    }
    // This bit optionally adds '- common' or '- latin' depending on what was being searched
    nameTest = item.preferred_taxon !== item.taxon;

    if (item.preferred === 't' && item.default_common_name !== item.taxon && item.default_common_name) {
      r += '<br/>' + item.default_common_name;
    } else if (item.preferred==='f' && nameTest && item.preferred_taxon) {
      synText = item.language_iso==='lat' ? 'syn. of' : '';
      r += '<br/>[';
      if (item.language_iso==='lat') {
        r += 'syn. of ';
      }
      r += '<em>' + item.preferred_taxon+ '</em>';
      r += ']';
    }
    r += '<br/><strong>' + item.taxon_group + '</strong>';
    if (item.taxon_rank) {
      r += ' | <span class="taxon-rank">' + item.taxon_rank + '</span>';
    }
    return r;
  }

  /**
   * Returns autocomplete settings for species searches.
   */
  function getTaxonAutocompleteSettings(filters) {
    return {
      extraParams : $.extend({
        orderby : 'searchterm',
        mode : 'json',
        qfield : 'searchterm',
        auth_token: indiciaData.read.auth_token,
        nonce: indiciaData.read.nonce,
      }, filters),
      simplify: false,
      selectMode: false,
      warnIfNoMatch: true,
      continueOnBlur: true,
      matchContains: false,
      parse: function(data) {
        var results = [];
        var done = [];
        $.each(data, function(i, item) {
          if ($.inArray(item.taxon + '#' + item.taxon_meaning_id, done)===-1) {
            results.push({
              'data' : item,
              'result' : item.searchterm,
              'value' : item.taxa_taxon_list_id
            });
            done.push(item.taxon + '#' + item.taxon_meaning_id);
          }
        });
        return results;
      },
      formatItem: formatTaxonName
    };
  }

  function getTaxonCard(info) {
    var rows = [];
    var prefix = '';
    if (info.taxon_rank_sort_order >= 300 && info.language_iso === 'lat') {
      rows.push('<div class="taxon-name"><em>' + info.taxon + '</em>' + (info.authority ? ' ' + info.authority : '') + '</div>');
    } else {
      rows.push('<div class="taxon-name">' + info.taxon + (info.authority ? ' ' + info.authority : '') + '</div>');
    }
    if (info.taxon !== info.preferred_taxon || info.authority !== info.preferred_authority) {
      if (info.language_iso === 'lat') {
        prefix = indiciaData.lang.import_helper_2.synOf + ' ';
      }
      if (info.taxon_rank_sort_order >= 300 && info.preferred_language_iso === 'lat') {
        rows.push('<div>[' + prefix + '<em>' + info.preferred_taxon + '</em>' + (info.preferred_authority ? ' ' + info.preferred_authority : '') + ']</div>');
      } else {
        rows.push('<div>[' + prefix + info.preferred_taxon + (info.preferred_authority ? ' ' + info.preferred_authority : '') + ']</div>');
      }
    }
    rows.push('<div>' + info.taxon_group + (info.taxon_rank ? ' | ' + info.taxon_rank : '') + '</div>');
    return rows.join('');
  }

  /**
   * Where there are species names that need matching, adds a matching table.
   */
  function addTaxonMatchingTableToForm(result) {
    var matchingPanelBody = $('<div class="panel-body">')
      .appendTo($('<div class="panel panel-default"><div class="panel-heading">' +
        indiciaData.lang.import_helper_2.matchingPanelFor.replace('{1}', result.columnLabel) + '</div></div>')
        .appendTo($('#matching-area')));
    var matchingTable = $('<table class="table" id="matches-' + result.sourceField + '"><thead><tr>' +
      '<th>' + indiciaData.lang.import_helper_2.dataValue + '</th>' +
      '<th>' + indiciaData.lang.import_helper_2.matchesToTaxon + '</th></tr></table>')
      .appendTo(matchingPanelBody);
    var tbody = $('<tbody />')
      .appendTo(matchingTable);
    var idx = 0;
    $.each(result.unmatchedInfo.values, function(taxon, choiceInfo) {
      var controlName = 'match-taxon-' + idx;
      var searchControl = '<input type="text" class="taxon-search form-control" data-index="' + idx + '" placeholder="' + indiciaData.lang.import_helper_2.typeSpeciesNameToSearch + '" />';
      var choiceCards = [];
      var choicesObj = JSON.parse(choiceInfo);
      $.each(choicesObj, function() {
        choiceCards.push('<div class="taxon-card" data-taxon="' + this.taxon + '" data-id="' + this.id + '">' + getTaxonCard(this) + '</div>');
      })
      // Hidden input for the ID.
      searchControl += '<input type="hidden" name="' + controlName + '" class="taxon-id" data-value="' + taxon.replace('"', '&quot;') + '"/>';
      $('<tr><th scope="row" data-value="' + taxon + '">' + taxon + '</th>' +
        '<td>' + searchControl + '</td></tr>')
        .appendTo(tbody);
      if (choiceCards.length > 0) {
        $('<tr class="taxon-suggestions"><td colspan="2"><p>' + indiciaData.lang.import_helper_2.severalMatches.replace('{1}', result.columnLabel) + '</p>' + choiceCards.join('') + '</td></tr>')
        .appendTo(tbody);
      }
      idx++;
    });
    // Save button
    $('<button type="button" class="btn btn-primary save-matches" ' +
      'data-source-field="' + result.sourceField + '"' +
      '>Save matches for ' + result.columnLabel + ' <i class="far fa-check"></i></button>')
      .appendTo($('<div class="panel-body">').appendTo(matchingPanelBody));
    // Enable species search autocomplete for the matching inputs.
    $('.taxon-search').autocomplete(indiciaData.warehouseUrl+'index.php/services/data/taxa_search', getTaxonAutocompleteSettings(result.unmatchedInfo.taxonFilters));
    $('.taxon-search').change(function() {
      // Clear when changed, unless value is correct for the current search string.
      if ($('[name="match-taxon-' + $(this).data('index') + '"]').data('set-for') !== $(this).val()) {
        $('[name="match-taxon-' + $(this).data('index') + '"]').val('');
      }
    });
    $('.taxon-search').result(function(e, data) {
      $('input[name="match-taxon-' + $(e.currentTarget).data('index') + '"]').val(data.taxa_taxon_list_id);
      // Remember the string it was set for to prevent it being cleared.
      $('input[name="match-taxon-' + $(e.currentTarget).data('index')).data('set-for', $(e.currentTarget).val());
    });
    $('.taxon-card').click(function(e) {
      var id = $(e.currentTarget).data('id');
      var taxon = $(e.currentTarget).data('taxon');
      var tr = $(e.currentTarget).closest('tr');
      var trPrev = $(tr).prev();
      $(tr).find('.taxon-card.active').removeClass('active');
      $(e.currentTarget).addClass('active');
      $(trPrev).find('.taxon-id').val(id);
      $(trPrev).find('.taxon-search').val(taxon);
      console.log(id);

    });
  }

  /**
   * Requests scanning through the import cols to find the next that needs matching.
   */
  function nextLookupProcessingStep() {
    urlSep = indiciaData.processLookupMatchingUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.processLookupMatchingUrl + urlSep + 'data-file=' + indiciaData.dataFile + '&index=' + indiciaData.processLookupIndex,
      dataType: 'json',
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce}
    })
    .done(function(result) {
        if (result.status==='error') {
          if (result.msg) {
            $.fancyDialog({
              title:'Matching error',
              message: result.msg,
              cancelButton: null
            });
          }
        }
        else {
          logBackgroundProcessingInfo(indiciaData.lang.import_helper_2[result.msgKey].replace('{1}', result.columnLabel));
          if (result.unmatchedInfo) {
            // Prevent next step till matching done.
            $('#next-step').attr('disabled', true);
            if (result.unmatchedInfo.type === 'customAttribute' || result.unmatchedInfo.type === 'otherFk') {
              addFkMatchingTableToForm(result);
            }
            else if (result.unmatchedInfo.type === 'taxon') {
              addTaxonMatchingTableToForm(result);
            }
          }
          if (result.colTitle) {
            logBackgroundProcessingInfo(result.colTitle);
          }
          if (result.status === 'ok' && result.msgKey !== 'findLookupFieldsDone') {
            // Move to next lookup col
            indiciaData.processLookupIndex++;
            nextLookupProcessingStep();
          }
          else if (result.msgKey === 'findLookupFieldsDone') {
            $('.background-processing .panel-heading span').text(indiciaData.lang.import_helper_2.backgroundProcessingDone);
            if ($('.save-matches:enabled').length === 0) {
              // Nothing to match.
              $('#next-step').attr('disabled', false);
              $('#instructions').text(indiciaData.lang.import_helper_2.lookupMatchingFormNothingToDo);
            } else {
              $('lookup-matching-form').validate();
            }
          }
        }
      }
    )
    .fail(
      function(jqXHR, textStatus, errorThrown) {
        $.fancyDialog({
          // @todo i18n
          title: 'Import error',
          message: 'An error occurred on the server whilst finding fields to metch terms for:<br/>' + errorThrown,
          cancelButton: null
        });
      }
    );
  }

  /**
   * Retrieve data about the proposed term matches for a lookup attribute.
   *
   * Retrieves the user's chosen matches for terms, species or other lookups in
   * the import file that  did not automatically match entries on the warehouse,
   * ready to save.
   *
   * @param string sourceField
   *   The name of the column in the temp DB that contains the terms being matched.
   */
  function getProposedMatchesToSave(sourceField) {
    var matches = {
      'source-field': sourceField,
      values: {}
    };
    var anythingToSave = false;
    $.each($('#matches-' + sourceField).find('select, .taxon-id'), function() {
      var select = this;
      if ($(select).val() !== '') {
        matches.values[$(select).data('value')] = $(select).val();
        anythingToSave = true;
      }
    });
    if (!anythingToSave) {
      $.fancyDialog({
        title:'Matching',
        message: indiciaData.lang.import_helper_2.pleaseMatchValues,
        cancelButton: null
      });
      return null;
    }
    return matches;
  }

  /**
   * Handler for the button click when saving a set of value lookup matches.
   */
  indiciaFns.on('click', '.save-matches', {}, function() {
    var button = this;
    var matches;
    matches = getProposedMatchesToSave($(button).data('source-field'));
    if (!matches) {
      return;
    }
    logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.savingMatchesFor.replace('{1}', $(button).data('source-field')));
    urlSep = indiciaData.saveLookupMatchesGroupUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.saveLookupMatchesGroupUrl + urlSep + 'data-file=' + indiciaData.dataFile,
      dataType: 'json',
      method: 'POST',
      data: matches,
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce},
      success: function(result) {
        logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.savedMatches);
        $('#matching-area tr.unmatched').removeClass('unmatched');
        if (result.status === 'ok') {
          $(button).attr('disabled', true)
            .addClass('btn-success').removeClass('btn-primary')
            .find('i')
              // Tick the box;
              .addClass('fas').removeClass('far');
          if ($('.save-matches:enabled').length === 0) {
            // All done
            $('#next-step').attr('disabled', false);
          }
          // Make it clear these inputs are no longer in action.
          $(button).closest('.panel').find('select,.ac_input').attr('disabled', true);
          // Remove any duplicate taxon name suggestion cards.
          $(button).closest('.panel').find('tr.taxon-suggestions').slideUp();
        }
        else if (result.status === 'incomplete') {
          $.each(result.unmatched, function() {
            var unmatchedTerm = this;
            $('#matching-area').find('th[scope="row"]')
              .filter(function() {
                return $(this).data('value') === unmatchedTerm;
              })
              .closest('tr')
              .addClass('unmatched');
          });

          $.fancyDialog({
            title:'Matching',
            message: indiciaData.lang.import_helper_2.pleaseMatchAllValues.replace('{1}', $(button).data('source-field')),
            cancelButton: null
          });
        }
      }
    });
  });

  /**
   * Tests if a required field key is covered by one of the global values.
   *
   * @param string
   *   Key to check.
   */
  function inGlobalValues(key) {
    // If there are several options of how to search a single lookup then they
    // are identified by a 3rd token, e.g. occurrence:fk_taxa_taxon_list:search_code.
    // These cases fulfil the needs of a required field so we can remove them.
    var fieldTokens = key.split(':');
    var found;
    var parts;
    if (fieldTokens.length > 2) {
      fieldTokens.pop();
      key = fieldTokens.join(':');
    }
    found = typeof indiciaData.globalValues[key] !== 'undefined';
    // Global values also works if not entity specific.
    parts = key.split(':');
    if (parts.length > 1) {
      found = found || typeof indiciaData.globalValues[parts[1]] !== 'undefined';
    }
    return found;
  }

  /**
   * Check that required fields are mapped. Set checkbox ticked state in UI.
   */
  function checkRequiredFields() {
    $.each($('.required-checkbox'), function() {
      var checkbox = $(this);
      var checkboxKeyList = checkbox.data('key');
      var foundInMapping = false;
      // When there is a choice of one of several, keys are separated by '|'.
      var keys = checkboxKeyList.split('|');
      $.each(keys, function() {
        // Field can be populated from global values.
        var foundInGlobalValues = inGlobalValues(this);
        // *_id global values fill in FK fields.
        if (this.match(/\bfk_/)) {
          foundInGlobalValues = foundInGlobalValues || inGlobalValues(this.replace(/\bfk_/, '') + '_id');
        }
        // No need to show required fields that are filled in by global values
        // at this point.
        if (foundInGlobalValues) {
          $(checkbox).closest('li').hide();
        }
        // Or field can be populated by a mapping.
        foundInMapping = foundInMapping || $('.mapped-field option:selected[value="' + this + '"]').length > 0;
      });
      if (foundInMapping) {
        $(checkbox).removeClass('fa-square');
        $(checkbox).addClass('fa-check-square');
      } else {
        $(checkbox).removeClass('fa-check-square');
        $(checkbox).addClass('fa-square');
      }
    });
    $('input[type="submit"]').attr('disabled', $('.required-checkbox.fa-square:visible').length > 0);
  }

  /**
   * Click a link on the suggested column mappings auto-selects the option.
   */
  function applySuggestion(e) {
    $(e.currentTarget).closest('td').find('option[value="' + $(e.currentTarget).data('value') + '"]').prop('selected', true);
    checkRequiredFields();
  }

  /**
   * Preprocessing page code.
   */

  function nextPreprocessingStep() {
    urlSep = indiciaData.preprocessUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.preprocessUrl + urlSep + 'data-file=' + indiciaData.dataFile + '&index=' + indiciaData.preprocessIndex,
      dataType: 'json',
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce}
    })
    .done(function(result) {
      console.log(result);
      if (indiciaData.preprocessIndex === 0 && result.description) {
        logBackgroundProcessingInfo(result.description);
      }
      if (result.message) {
        // @todo All possible messages need to go in i18n.
        logBackgroundProcessingInfo(result.message[0].replace('{1}', result.message[1]).replace('{2}', result.message[2]));
      }
      if (result.error) {
        // Abort process.
        logBackgroundProcessingInfo(result.error);
        $.fancyDialog({
          title: 'Upload error',
          message: indiciaData.lang.import_helper_2.importCannotProceed + '<br/><ul><li>' + result.error + '</li></ul>',
          cancelButton: null
        });
      }
      else if (result.nextStep) {
        logBackgroundProcessingInfo(result.nextDescription);
        indiciaData.preprocessIndex++;
        nextPreprocessingStep();
      }
      else {
        $('#next-step').click();
      }
    })
    .fail(function(jqXHR, textStatus, errorThrown) {
      $.fancyDialog({
        title: indiciaData.lang.import_helper_2.lang.preprocessingError,
        message: indiciaData.lang.import_helper_2.lang.preprocessingErrorInfo + '<br/>' + errorThrown,
        cancelButton: null
      });
    });
  }

  /**
   * Import progress page code.
   */

  /**
   * When an import or precheck has validation errors, warn the user.
   *
   * @param obj result
   *   Result of warehouse service call
   * @param string state
   *   Current state variable, e.g. precheck.
   */
  function showErrorInfo(result, state) {
    var msg = result.errorsCount === 1 ? indiciaData.lang.import_helper_2.errorInImportFile : indiciaData.lang.import_helper_2.errorsInImportFile;
    var urlSep = indiciaData.getErrorFileUrl.indexOf('?') === -1 ? '?' : '&';
    msg = msg.replace('{1}', result.errorsCount);
    if (state === 'precheck') {
      msg += ' ' + indiciaData.lang.import_helper_2.precheckFoundErrors;
    } else {
      msg += ' ' + indiciaData.lang.import_helper_2.importingFoundErrors;
    }
    $('#error-info').append(msg);
    $('#error-info').append('<div><a class="btn btn-info" href="' + indiciaData.getErrorFileUrl + urlSep + 'data-file=' + indiciaData.dataFile + '">' + indiciaData.lang.import_helper_2.downloadErrors + '</a></div>');
    $('#error-info').fadeIn();
  }

  function importNextChunk(state, forceTemplateOverwrite) {
    var postData = {};
    // Post the description and template title of the import to save on the first chunk only.
    if (!indiciaData.importOneOffFieldsToSaveDone) {
      postData.description = indiciaData.importDescription;
      postData.importTemplateTitle = indiciaData.importTemplateTitle;
      // If user has confirmed overwrite OK.
      if (forceTemplateOverwrite) {
        postData.forceTemplateOverwrite = true;
      }
      indiciaData.importOneOffFieldsToSaveDone = true;
    }
    if (state === 'startPrecheck') {
      postData.restart = true;
      state = 'precheck';
    }
    if (state === 'precheck') {
      postData.precheck = true;
    } else if (state === 'restart') {
      postData.restart = true;
      state = 'doimport';
    }
    urlSep = indiciaData.importChunkUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.importChunkUrl + urlSep + 'data-file=' + indiciaData.dataFile,
      dataType: 'json',
      method: 'POST',
      data: postData,
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce}
    }).done(
      function(result) {
        var msg;
        if (result.status === 'error') {
          // @todo standardise this way of doing the message.
          msg = result.msgKey ? indiciaData.lang.import_helper_2[transferResult.msgKey] : result.msg;
          $.fancyDialog({
            // @todo i18n on the titles throughout
            title: 'Import error',
            message: msg,
            cancelButton: null
          });
        } else if (result.status === 'conflict') {
          $.fancyDialog({
            message: indiciaData.lang.import_helper_2.confirmTemplateOverwrite,
            okButton: indiciaData.lang.import_helper_2.overwriteTemplate,
            cancelButton: indiciaData.lang.import_helper_2.cancel,
            callbackOk: function () {
              indiciaData.importOneOffFieldsToSaveDone = false;
              // Re-trigger save with flag set to force overwrite.
              importNextChunk(state, true);
            },
            callbackCancel: function () {
              $('#import-template-title').val(indiciaData.importTemplateTitle);
              $.fancyDialog({
                contentElement: '#template-title-form',
                okButton: indiciaData.lang.import_helper_2.saveTemplate,
                cancelButton: indiciaData.lang.import_helper_2.skipSavingTemplate,
                callbackOk: function () {
                  indiciaData.importTemplateTitle = $('#import-template-title').val();
                  indiciaData.importOneOffFieldsToSaveDone = false;
                  // Re-trigger save with updated title.
                  importNextChunk(state);
                },
                callbackCancel: function () {
                  // Continue without template save.
                  importNextChunk(state);
                }
              });
            }
          });
        } else {
          if (result.progress) {
            $('.progress').val(result.progress);
          }

          if (state === 'precheck') {
            $('#import-details-precheck-title').show();
            $('#import-details-precheck-details')
              .text(indiciaData.lang.import_helper_2.precheckDetails
                .replace('{rowsProcessed}', result.rowsProcessed)
                .replace('{totalRows}', result.totalRows)
                .replace('{errorsCount}', result.errorsCount))
              .show();
            if (result.status !== 'done') {
              importNextChunk(state);
            }
            else {
              // Checks are complete.
              $('#import-details-precheck-done').show();
              if (result.errorsCount) {
                showErrorInfo(result, state);
              }
              else {
                // Update page title to importing.
                $('#current-task').text(indiciaData.lang.import_helper_2.importingData);
                // Start again for real.
                $('.progress').val(0);
                importNextChunk('restart');
              }
            }
          } else {
            $('#import-details-importing-title').show();
            $('#import-details-importing-details')
              .text(indiciaData.lang.import_helper_2.importingDetails
                .replace('{rowsProcessed}', result.rowsProcessed)
                .replace('{totalRows}', result.totalRows)
                .replace('{errorsCount}', result.errorsCount))
              .show();
            if (result.status !== 'done') {
              importNextChunk(state);
            } else {
              // Import is complete.
              $('#import-details-importing-done').show();
              // Update page title to import complete.
              $('#current-task').text(indiciaData.lang.import_helper_2.completeMessage);
              $('#file-progress').slideUp();
              if (result.errorsCount) {
                showErrorInfo(result, state);
              }
            }
          }
        }
      },
    ).fail(
      function(jqXHR, textStatus, errorThrown) {
        $.fancyDialog({
          // @todo i18n
          title: 'Import error',
          message: 'An error occurred on the server whilst importing your data:<br/>' + errorThrown,
          cancelButton: null
        });
      }
    );
  }

  // Trigger the functionality for the appropriate page.
  if (indiciaData.step === 'fileSelectForm') {
    initFileUploadControl();
  }
  else if (indiciaData.step === 'mappingsForm') {
    var urlSep = indiciaData.getRequiredFieldsUrl.indexOf('?') === -1 ? '?' : '&';
    // On the mappings page.
    // Prepare the list of required fields.
    $('#required-fields').show();
    $.each(indiciaData.requiredFields, function(key, caption) {
       $('#required-fields ul').append($('<li><i class="far fa-square required-checkbox" data-key="' + key + '"></i>' + caption + '</li>'));
    });
    // Auto-match any obvious column/field matches.
    $.each($('#mappings-table tbody tr'), function() {
      var row = this;
      var label = $(row).find('td:first-child').text().toLowerCase().replace(/[^a-z0-9]/g, '');
      var qualifiedMatches = [];
      var unqualifiedMatches = [];
      var suggestions = [];
      var allMatches = [];
      if (indiciaData.columns && indiciaData.columns[$(row).find('td:first-child').text()] && indiciaData.columns[$(row).find('td:first-child').text()]['warehouseField']) {
        // Mapping is already in the columns info, e.g. when loaded from a template.
        $(row).find('option[value="' + indiciaData.columns[$(row).find('td:first-child').text()]['warehouseField'] + '"]').attr('selected', true);
      } else if (!indiciaData.import_template_id) {
        // Scan for matches by field name, but only if not using a template.
        $.each($(row).find('option'), function() {
          var option = this;
          var unqualified = $(option).text().toLowerCase().replace(/\(.+\)/, '').replace(/[^a-z0-9]/g, '');
          var optGroupLabel
          var qualified;
          var altTerms;
          if (!$(option).val()) {
            // Skip the not-imported option.
            return true;
          }
          optGroupLabel = $(option).parent().attr('label').toLowerCase().replace(/[^a-z0-9]/g, '');
          qualified = optGroupLabel + unqualified;
          if (label === qualified) {
            qualifiedMatches.push(option);
          }
          if (label === unqualified) {
            unqualifiedMatches.push(option);
          }
          if ($(option).data('alt')) {
            altTerms = $(option).data('alt').split(',');
            $.each(altTerms, function() {
              if (label === this) {
                unqualifiedMatches.push(option);
              }
            });
          }
        });
        if (qualifiedMatches.length === 1) {
          $(qualifiedMatches[0]).attr('selected', true);
        } else if (qualifiedMatches.length === 0 && unqualifiedMatches.length === 1) {
          $(unqualifiedMatches[0]).attr('selected', true);
        } else if (qualifiedMatches.length + unqualifiedMatches.length > 1) {
          $.extend(allMatches, qualifiedMatches, unqualifiedMatches)
          $.each(allMatches, function() {
            var label = $(this).parent().data('short-label') + ' - ' + this.text;
            suggestions.push('<a class="apply-suggestion" data-value="' + this.value + '">' + label + '</a>');
          });
          $(row).find('select.mapped-field').after('<p class="helpText">' +  indiciaData.lang.import_helper_2.suggestions + ': ' + suggestions.join('; ') + '</p>');
        }
      }
    });
    indiciaFns.on('change', '.mapped-field', {}, checkRequiredFields);
    indiciaFns.on('click', '.apply-suggestion', {}, applySuggestion);
    checkRequiredFields();
  } else if (indiciaData.step === 'lookupMatchingForm') {
    // If on the lookup matching page, then trigger the process.
    logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.findingLookupFieldsThatNeedMatching);
    // Requesting one lookup column at a time, so track which we are asking for.
    indiciaData.processLookupIndex = 0;
    nextLookupProcessingStep();
  } else if (indiciaData.step === 'preprocessPage') {
    // If on the lookup matching page, then trigger the process.
    logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.preprocessingImport);
    // Requesting one lookup column at a time, so track which we are asking for.
    indiciaData.preprocessIndex = 0;
    nextPreprocessingStep();
  } else if (indiciaData.step === 'doImportPage') {
    importNextChunk('startPrecheck');
  }


});