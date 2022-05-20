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

  if (indiciaData.importerDropArea) {
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

  function transferDataToTempTable(fileName) {
    urlSep = indiciaData.loadChunkToTempTableUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.loadChunkToTempTableUrl + urlSep + 'data-file=' + fileName,
      dataType: 'json',
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce},
      success: function(transferResult) {
        var msg = indiciaData.lang.import_helper_2[transferResult.msgKey];
        if (transferResult.progress) {
          $('#file-progress').val(transferResult.progress);
          msg += ' (' + Math.round(transferResult.progress) + '%)';
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
      }
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
                  transferDataToTempTable(extractResult.dataFile);
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
            });
          }
          else {
            logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.preparingToLoadRecords);
            $('#data-file').val(sendFileResult.uploadedFile);
            transferDataToTempTable(sendFileResult.uploadedFile);
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
    });
  }

  function addTermlistMatchingTableToForm(result) {
    if (result.unmatchedInfo.values.length === 0) {
      // Nothing to match.
      return;
    }
    var matchingPanelBody = $('<div class="panel-body">')
      .appendTo($('<div class="panel panel-default"><div class="panel-heading">' +
        indiciaData.lang.import_helper_2.matchingPanelFor.replace('{1}', result.columnTitle) + '</div></div>')
        .appendTo($('#matching-area')));
    var matchingTable = $('<table class="table" id="matches-' + result.unmatchedInfo.attrType + '-' + result.unmatchedInfo.attrId + '"><thead><tr>' +
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
      $('<tr><th scope="row">' + this + '</th>' +
        '<td><select class="form-control" required data-value="' + this.replace('"', '&quot;') + '" name="' + controlName + '">' + options + '</select></td></tr>')
        .appendTo(tbody);
    });
    $('<button type="button" class="btn btn-primary save-matches" ' +
      'data-attr="' + result.unmatchedInfo.attrType + '-' + result.unmatchedInfo.attrId + '" ' +
      'data-source-field="' + result.sourceField + '"' +
      '>Save matches for ' + result.columnTitle + ' <i class="far fa-check"></i></button>')
      .appendTo($('<div class="panel-body">').appendTo(matchingPanelBody));
  }

  /**
   * Autocomplete handler to format the taxon list in the drop-down.
   */
  function formatTaxonName(item) {
    var r;
    var synText;
    var nameTest;

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

  /**
   * Where there are species names that need matching, adds a matching table.
   */
  function addTaxonMatchingTableToForm(result) {
    var matchingPanelBody = $('<div class="panel-body">')
      .appendTo($('<div class="panel panel-default"><div class="panel-heading">' +
        indiciaData.lang.import_helper_2.matchingPanelFor.replace('{1}', result.columnTitle) + '</div></div>')
        .appendTo($('#matching-area')));
    var matchingTable = $('<table class="table" id="matches-taxon"><thead><tr>' +
      '<th>' + indiciaData.lang.import_helper_2.dataValue + '</th>' +
      '<th>' + indiciaData.lang.import_helper_2.matchesToTaxon + '</th></tr></table>')
      .appendTo(matchingPanelBody);
    var tbody = $('<tbody />')
      .appendTo(matchingTable);
    var idx = 0;
    $.each(result.unmatchedInfo.values, function(taxon, options) {
      var controlName = 'match-taxon-' + idx;
      var searchControl = '<input type="text" class="taxon-search form-control" data-index="' + idx + '" placeholder="' + indiciaData.lang.import_helper_2.typeSpeciesNameToSearch + '" />';
      // Hidden input for the ID.
      searchControl += '<input type="hidden" name="' + controlName + '" class="taxon-id" data-value="' + taxon.replace('"', '&quot;') + '"/>';
      $('<tr><th scope="row">' + taxon + '</th>' +
        '<td>' + searchControl + '</td></tr>')
        .appendTo(tbody);
      idx++;
    });
    // Save button
    $('<button type="button" class="btn btn-primary save-matches" ' +
      'data-attr="' + result.unmatchedInfo.type + '" ' +
      'data-source-field="' + result.sourceField + '"' +
      '>Save matches for ' + result.columnTitle + ' <i class="far fa-check"></i></button>')
      .appendTo($('<div class="panel-body">').appendTo(matchingPanelBody));
    // Enable species search autocomplete for the matching inputs.
    $('.taxon-search').autocomplete(indiciaData.warehouseUrl+'index.php/services/data/taxa_search', getTaxonAutocompleteSettings(result.unmatchedInfo.taxonFilters));
    $('.taxon-search').change(function() {
      $('[name="match-taxon-' + $(this).data('index') + '"]').val('');
    });
    $('.taxon-search').result(function(e, data) {
      $('input[name="match-taxon-' + $(e.currentTarget).data('index') + '"]').attr('value', data.taxa_taxon_list_id);
    });
  }

  /**
   * Requests scanning through the import cols to find the next that needs matching.
   */
  function nextLookupProcessingStep() {
    urlSep = indiciaData.processLookupMatchingUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.processLookupMatchingUrl + urlSep + 'data-file=' + indiciaData.processLookupMatchingForFile + '&index=' + indiciaData.processLookupIndex,
      dataType: 'json',
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce},
      success: function(result) {
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
          logBackgroundProcessingInfo(indiciaData.lang.import_helper_2[result.msgKey].replace('{1}', result.columnTitle));
          if (result.unmatchedInfo) {
            // Prevent next step till matching done.
            $('#next-step').attr('disabled', true);
            if (result.unmatchedInfo.type === 'customAttribute') {
              addTermlistMatchingTableToForm(result);
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
    });
  }

  function getProposedMatchesToSave(attr, sourceField) {
    var matches = {
      attr: attr,
      'source-field': sourceField,
      values: {}
    };
    var anythingToSave = false;
    $.each($('#matches-' + attr + ' select, #matches-' + attr + ' .taxon-id'), function() {
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
    matches = getProposedMatchesToSave($(button).data('attr'), $(button).data('source-field'));
    if (!matches) {
      return;
    }
    logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.savingMatchesFor.replace('{1}', $(button).data('source-field')));
    urlSep = indiciaData.saveLookupMatchesGroupUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.saveLookupMatchesGroupUrl + urlSep + 'data-file=' + indiciaData.processLookupMatchingForFile,
      dataType: 'json',
      method: 'POST',
      data: matches,
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce},
      success: function(result) {
        logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.savedMatches);
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
        }
        else if (result.status === 'incomplete') {
          $.fancyDialog({
            title:'Matching',
            message: indiciaData.lang.import_helper_2.pleaseMatchAllValues.replace('{1}', $(button).data('source-field')),
            cancelButton: null
          });
        }
      }
    });
  });

  function importNextChunk() {
    var postDescription = {};
    // Post the description of the import to save on the first chunk only.
    if (!indiciaData.importDescriptionDone) {
      postDescription.description = indiciaData.importDescription;
      indiciaData.importDescriptionDone = true;
    }
    urlSep = indiciaData.importChunkUrl.indexOf('?') === -1 ? '?' : '&';
    $.ajax({
      url: indiciaData.importChunkUrl + urlSep + 'data-file=' + indiciaData.dataFile,
      dataType: 'json',
      method: 'POST',
      data: postDescription,
      headers: {'Authorization': 'IndiciaTokens ' + indiciaData.write.auth_token + '|' + indiciaData.write.nonce},
      success: function(result) {
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
        } else {
          if (result.progress) {
            $('.progress').val(result.progress);
          }
          if (result.errorsCount) {
            $('#error-info').find('.error-count').html(result.errorsCount);
            $('#error-info').fadeIn();
          }
          if (result.status === 'importing') {
            importNextChunk();
          }
        }
      }
    });
  }

  if (indiciaData.processLookupMatchingForFile) {
    // If on the lookup matching page, then trigger the process.
    logBackgroundProcessingInfo(indiciaData.lang.import_helper_2.findingLookupFieldsThatNeedMatching);
    // Requesting one lookup column at a time, so track which we are asking for.
    indiciaData.processLookupIndex = 0;
    nextLookupProcessingStep();
  } else if (indiciaData.readyToImport) {
    importNextChunk();
  }

  // If on the mappings page, auto-match any obvious column/field matches.
  $.each($('#mappings-table tbody tr'), function() {
    var row = this;
    var label = $(row).find('td:first-child').text().toLowerCase().replace(/[^a-z0-9]/g, '');
    var qualifiedMatches = [];
    var unqualifiedMatches = [];
    // First scan for matches qualified with entity name.
    $.each($(row).find('option'), function() {
      var option = this;
      var qualified = $(option).val().toLowerCase().replace(/[^a-z0-9]/g, '');
      var unqualified = $(option).text().toLowerCase().replace(/[^a-z0-9]/g, '');
      var altTerms;
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
    }
  });

});