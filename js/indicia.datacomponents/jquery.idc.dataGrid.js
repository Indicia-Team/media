/**
 * @file
 * A data grid plugin.
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

 /* eslint no-underscore-dangle: ["error", { "allow": ["_id", "_source"] }] */
 /* eslint no-param-reassign: ["error", { "props": false }]*/

/**
 * Output plugin for data grids.
 */
(function idcDataGridPlugin() {
  'use strict';
  var $ = jQuery;

  /**
   * Place to store public methods.
   */
  var methods;

  /**
   * Declare default settings.
   */
  var defaults = {
    actions: [],
    aggregation: null,
    cookies: true,
    includeColumnHeadings: true,
    includeFilterRow: true,
    includePager: true,
    sortable: true,
    responsive: true,
    responsiveOptions: {
      breakpoints: {
        xs: 480,
        sm: 768,
        md: 992,
        lg: 1200
      }
    },
    autoResponsiveCols: false,
    /**
     * Registered callbacks for different events.
     */
    callbacks: {
      rowSelect: [],
      rowDblClick: [],
      populate: []
    },
    // Page tracking for composite aggregations
    compositeInfo: {
      page: 0,
      pageAfterKeys: {}
    },
    totalRowCount: null
  };

  /**
   * Removes the configuration overlay pane.
   */
  function removeConfigPane(el) {
    var panel = $(el).find('.data-grid-settings');
    $(panel).fadeOut('fast');
    // Undo forced minimum height on the container.
    $(el).css('min-height', '');
  }

  function appendColumnsToConfigList(el, columns) {
    var done = [];
    var ol = $(el).find('.data-grid-settings ol');
    $.each(columns, function eachColumn() {
      var colInfo = el.settings.availableColumnInfo[this];
      var caption = colInfo.caption ? colInfo.caption : '<em>no heading</em>';
      var description = colInfo.description ? colInfo.description : '';
      done.push(this);
      $('<li>' +
        '<div class="checkbox">' +
        '<label><input type="checkbox" checked="checked" value="' + this + '">' + caption + '</label>' +
        '</div>' + description +
        '</li>').appendTo(ol);
    });
    $.each(el.settings.availableColumnInfo, function eachField(key, info) {
      if ($.inArray(key, done) === -1) {
        $('<li>' +
          '<div class="checkbox"><label><input type="checkbox" value="' + key + '">' + info.caption + '</label></div>' +
          (info.description ? info.description : '') +
          '</li>').appendTo(ol);
      }
    });
  }

  /**
   * Adds the header cells to the table header.
   */
  function addColumnHeadings(el, header) {
    var headerRow = $('<tr/>').appendTo(header);
    var breakpointsByIdx = [];
    if (el.settings.autoResponsiveCols) {
      // Build list of breakpoints to use by column position.
      $.each(el.settings.responsiveOptions.breakpoints, function eachPoint(name, point) {
        var i;
        for (i = Math.round(point / 100); i < el.settings.columns.length; i++) {
          while (breakpointsByIdx.length < i + 1) {
            breakpointsByIdx.push([]);
          }
          breakpointsByIdx[i].push(name);
        }
      });
    }
    if (el.settings.responsive) {
      $('<th class="footable-toggle-col" data-sort-ignore="true"></th>').appendTo(headerRow);
    }
    $.each(el.settings.columns, function eachColumn(idx) {
      var colDef = el.settings.availableColumnInfo[this];
      var heading = colDef.caption;
      var footableExtras = '';
      var sortableField = typeof indiciaData.esMappings[this] !== 'undefined'
        && indiciaData.esMappings[this].sort_field;
      // Tolerate hyphen or camelCase.
      var hideBreakpoints = colDef.hideBreakpoints || colDef['hide-breakpoints'];
      var dataType = colDef.dataType || colDef['data-type'];
      sortableField = sortableField
        || indiciaData.fieldConvertorSortFields[this.simpleFieldName()]
        || (el.settings.aggregation && el.settings.aggregation === 'composite')
        || (el.settings.aggregation && el.settings.aggregation === 'autoAggregationTable');
      if (el.settings.sortable !== false && sortableField) {
        heading += '<span class="sort fas fa-sort"></span>';
      }
      // Extra data attrs to support footable.
      if (el.settings.autoResponsiveCols) {
        footableExtras = ' data-hide="' + breakpointsByIdx[idx].join(',') + '"';
      } else if (hideBreakpoints) {
        footableExtras = ' data-hide="' + hideBreakpoints + '"';
      }
      if (dataType) {
        footableExtras += ' data-type="' + dataType + '"';
      }
      $('<th class="col-' + idx + '" data-field="' + this + '"' + footableExtras + '>' + heading + '</th>')
        .appendTo(headerRow);
    });
    if (el.settings.actions.length) {
      $('<th class="col-actions"></th>').appendTo(headerRow);
    }
    if (el.settings.scrollY) {
      // Spacer in header to allow for scrollbar in body.
      $('<th class="scroll-spacer"></th>').appendTo(headerRow);
    }
  }

  /**
   * Adds the filter row cells and inputs to the table header.
   */
  function addFilterRow(el, header) {
    var filterRow = $('<tr class="es-filter-row" />').appendTo(header);
    if (el.settings.responsive) {
      $('<td class="footable-toggle-col"></td>').appendTo(filterRow);
    }
    $.each(el.settings.columns, function eachColumn(idx) {
      var td = $('<td class="col-' + idx + '" data-field="' + this + '"></td>').appendTo(filterRow);
      var title;
      var caption = el.settings.availableColumnInfo[this].caption;
      // No filter input if this column has no mapping unless there is a
      // special field function that can work out the query.
      if (typeof indiciaData.esMappings[this] !== 'undefined'
          || typeof indiciaFns.fieldConvertorQueryBuilders[this.simpleFieldName()] !== 'undefined') {
        if (indiciaFns.fieldConvertorQueryBuilders[this.simpleFieldName()]) {
          if (indiciaFns.fieldConvertorQueryDescriptions[this.simpleFieldName()]) {
            title = indiciaFns.fieldConvertorQueryDescriptions[this.simpleFieldName()];
          } else {
            title = 'Enter a value to find matches in the ' + caption + ' column.';
          }
        } else if (indiciaData.esMappings[this].type === 'text' || indiciaData.esMappings[this].type === 'keyword') {
          title = 'Search for words in the ' + caption + ' column. Prefix with ! to exclude rows which contain words ' +
            'beginning with the text you enter. Use * at the end of words to find words starting with. Use ' +
            '&quot;&quot; to group words into phrases and | between words to request either/or searches. Use - ' +
            'before a word to exclude that word from the search results.';
        } else if (indiciaData.esMappings[this].type === 'date') {
          title = 'Search for dates in the ' + caption + ' column. Searches can be in the format yyyy, yyyy-yyyy, ' +
            'dd/mm/yyyy or dd/mm/yyyy hh:mm.';
        } else {
          title = 'Search for a number in the ' + caption + ' column. Prefix with ! to exclude rows which match the ' +
            'number you enter or separate a range with a hyphen (e.g. 123-456).';
        }
        $('<input type="text" title="' + title + '">').appendTo(td);
      }
    });
  }

  function applyColumnsList(el, colsList) {
    el.settings.columns = [];
    $.each(colsList, function eachCol() {
      if (el.settings.availableColumnInfo[this]) {
        el.settings.columns.push(this);
      }
    });
  }

  function movePage(el, forward) {
    if (el.settings.aggregation === 'composite') {
      el.settings.compositeInfo.page += (forward ? 1 : -1);
    }
    $.each(el.settings.source, function eachSource(sourceId) {
      var source = indiciaData.esSourceObjects[sourceId];
      if (el.settings.aggregation === 'composite') {
        // Composite aggregations use after_key to find next page.
        if (el.settings.compositeInfo.pageAfterKeys[el.settings.compositeInfo.page]) {
          source.settings.after_key = el.settings.compositeInfo.pageAfterKeys[el.settings.compositeInfo.page];
        } else {
          delete source.settings.after_key;
        }
      } else {
        if (typeof source.settings.from === 'undefined') {
          source.settings.from = 0;
        }
        if (forward) {
          // Move to next page based on currently visible row count, in case some
          // have been removed.
          source.settings.from += $(el).find('tbody tr.data-row').length;
        } else {
          source.settings.from -= source.settings.size;
        }
        source.settings.from = Math.max(0, source.settings.from);
      }
      source.populate();
    });
  }

  /**
   * Calculate the correct tbody height on resize, if a fixed or anchored height.
   */
  function setTableHeight(el) {
    var tbody = $(el).find('tbody');
    if (el.settings.scrollY) {
      if (el.settings.scrollY.match(/^-/)) {
        tbody.css('max-height', (($(window).height() + parseInt(el.settings.scrollY.replace('px', ''), 10))
          - ($(el).find('tbody').offset().top + $(el).find('tfoot').height())));
      } else {
        tbody.css('max-height', el.settings.scrollY);
      }
    }
  }

  /**
   * Assigns the classes required to show sort info icons in the header row.
   */
  function showHeaderSortInfo(sortButton, sortDesc) {
    var headingRow = $(sortButton).closest('tr');
    $(headingRow).find('.sort.fas').removeClass('fa-sort-down');
    $(headingRow).find('.sort.fas').removeClass('fa-sort-up');
    $(headingRow).find('.sort.fas').addClass('fa-sort');
    $(sortButton).removeClass('fa-sort');
    $(sortButton).addClass('fa-sort-' + (sortDesc ? 'down' : 'up'));
  }

  /**
   * Apply changes to a source when sorting for a composite aggregation.
   */
  function handleSortForCompositeAgg(source, fieldName, sortDesc) {
    var aggSources;
    var newAggSources = [];
    var sortFields;
    if (source.settings.originalCompositeSources) {
      aggSources = $.extend({}, source.settings.originalCompositeSources);
    } else {
      aggSources = $.extend({}, indiciaFns.findValue(source.settings.aggregation, 'composite').sources);
      source.settings.originalCompositeSources = $.extend({}, aggSources);
    }
    if (indiciaData.fieldConvertorSortFields[fieldName] && $.isArray(indiciaData.fieldConvertorSortFields[fieldName])) {
      sortFields = indiciaData.fieldConvertorSortFields[fieldName];
      $.each(aggSources, function eachAggSource() {
        var pos = $.inArray(indiciaFns.findValue(this, 'field'), sortFields);
        if (pos === -1) {
          newAggSources.push(this);
        } else {
          indiciaFns.findValue(this, 'terms').order = sortDesc ? 'desc' : 'asc';
          newAggSources.splice(pos, 0, this);
        }
      });
    } else {
      $.each(aggSources, function eachAggSource() {
        if ($(this).prop(fieldName.replace(/^key\./, ''))) {
          indiciaFns.findValue(this, 'terms').order = sortDesc ? 'desc' : 'asc';
          newAggSources.splice(0, 0, this);
        } else {
          newAggSources.push(this);
        }
      });
    }
    indiciaFns.findValue(source.settings.aggregation, 'composite').sources = newAggSources;
  }

  /**
   * Apply changes to a source when sorting for an auto aggregation table.
   */
  function handleSortForAutoAggregationTable(source, fieldName, sortDesc) {
    var sortFields;
    if (indiciaData.fieldConvertorSortFields[fieldName] && $.isArray(indiciaData.fieldConvertorSortFields[fieldName])) {
      sortFields = indiciaData.fieldConvertorSortFields[fieldName];
    } else {
      sortFields = [fieldName];
    }
    source.settings.sort[sortFields[0]] = sortDesc ? 'desc' : 'asc';
  }

  /**
   * Apply changes to a source when sorting on a special field column.
   */
  function handleSortForSpecialField(source, fieldName, sortDesc) {
    var sortFields = indiciaData.fieldConvertorSortFields[fieldName];
    if ($.isArray(sortFields)) {
      $.each(sortFields, function eachField() {
        source.settings.sort[this] = {
          order: sortDesc ? 'desc' : 'asc'
        };
      });
    } else if (typeof sortFields === 'object') {
      source.settings.sort = sortFields;
      indiciaFns.findAndSetValue(source.settings.sort, 'order', sortDesc ? 'desc' : 'asc');
    }
  }

   /**
   * Register the various user interface event handlers.
   */
  function initHandlers(el) {
    indiciaFns.on('click', '#' + el.id + ' .es-data-grid tbody tr', {}, function onDataGridRowClick() {
      var tr = this;
      $(tr).closest('tbody').find('tr.selected').removeClass('selected');
      $(tr).addClass('selected');
      $.each(el.settings.callbacks.rowSelect, function eachCallback() {
        this(tr);
      });
    });

    /**
     * Double click grid row handler.
     *
     * Adds selected class and fires callbacks.
     */
    indiciaFns.on('dblclick', '#' + el.id + ' .es-data-grid tbody tr', {}, function onDataGridRowDblClick() {
      var tr = this;
      if (!$(tr).hasClass('selected')) {
        $(tr).closest('tbody').find('tr.selected').removeClass('selected');
        $(tr).addClass('selected');
      }
      $.each(el.settings.callbacks.rowDblClick, function eachCallback() {
        this(tr);
      });
    });

    /**
     * Next page click.
     */
    $(el).find('.pager-row .next').click(function clickNext() {
      movePage(el, true);
    });

    /**
     * Previous page click.
     */
    $(el).find('.pager-row .prev').click(function clickPrev() {
      movePage(el, false);
    });

    /**
     * Sort column headers click handler.
     */
    indiciaFns.on('click', '#' + el.id + ' .sort', {}, function clickSort() {
      var fieldName = $(this).closest('th').attr('data-field').simpleFieldName();
      var sortDesc = $(this).hasClass('fa-sort-up');
      showHeaderSortInfo(this, sortDesc);
      $.each(el.settings.source, function eachSource(sourceId) {
        var source = indiciaData.esSourceObjects[sourceId];
        source.settings.sort = {};
        if (el.settings.aggregation && el.settings.aggregation === 'composite') {
          handleSortForCompositeAgg(source, fieldName, sortDesc);
        } else if (el.settings.aggregation && el.settings.aggregation === 'autoAggregationTable') {
          handleSortForAutoAggregationTable(source, fieldName, sortDesc);
        } else if (indiciaData.esMappings[fieldName]) {
          source.settings.sort[indiciaData.esMappings[fieldName].sort_field] = {
            order: sortDesc ? 'desc' : 'asc'
          };
        } else if (indiciaData.fieldConvertorSortFields[fieldName]) {
          handleSortForSpecialField(source, fieldName, sortDesc);
        }
        source.populate();
      });
    });

    indiciaFns.on('change', '#' + el.id + ' .es-filter-row input', {}, function changeFilterInput() {
      var sources = Object.keys(el.settings.source);
      if (el.settings.applyFilterRowToSources) {
        sources = sources.concat(el.settings.applyFilterRowToSources);
      }
      $.each(sources, function eachSource() {
        var source = indiciaData.esSourceObjects[this];
        // Reset to first page.
        source.settings.from = 0;
        source.populate();
      });
    });

    $(el).find('.multiselect-switch').click(function clickMultiselectSwitch() {
      var table = $(el).find('table');
      if ($(el).hasClass('multiselect-mode')) {
        $(el).removeClass('multiselect-mode');
        $(table).find('.multiselect-cell').remove();
        $('.selection-buttons-placeholder').append($('.all-selected-buttons'));
      } else {
        $(el).addClass('multiselect-mode');
        $(table).find('thead tr').prepend(
          '<th class="multiselect-cell" />'
        );
        $(table).find('thead tr:first-child th:first-child').append(
          '<input type="checkbox" class="multiselect-all" />'
        );
        $(table).find('tbody tr').prepend(
          '<td class="multiselect-cell"><input type="checkbox" class="multiselect" /></td>'
        );
        $(table).closest('div').prepend(
          $('.all-selected-buttons')
        );
      }
      setTableHeight(el);
    });

    /**
     * Select all checkboxes event handler.
     */
    indiciaFns.on('click', '#' + el.id + ' .multiselect-all', {}, function onClick(e) {
      $(e.currentTarget).closest('table')
        .find('.multiselect')
        .prop('checked', $(e.currentTarget).is(':checked'));
    });

    /**
     * Click handler for the settings icon. Displays the config overlay pane.
     */
    $(el).find('.data-grid-show-settings').click(function settingsIconClick() {
      var $panel = $(el).find('.data-grid-settings').html('');
      var ol;
      var maxHeight;
      // Ensure height available enough for columns config.
      $(el).css('min-height', '250px');
      $('<h3>Column configuration</h3>').appendTo($panel);
      $('<p>The following columns are available for this table. Tick the ones you want to include. Drag and drop the ' +
        'columns into your preferred order.</p>').appendTo($panel);
      $('<div><button class="btn btn-default toggle">Tick/untick all</button>' +
        '<button class="btn btn-default restore">Restore defaults</button> ' +
        '<button class="btn btn-default cancel">Cancel</button>' +
        '<button class="btn btn-primary save">Save</button></div>').appendTo($panel);
      ol = $('<ol/>').appendTo($panel);
      $panel.fadeIn('fast');
      maxHeight = $(el).find('table.es-data-grid').height() - ($(ol).offset().top - $panel.offset().top);
      $(ol).css('max-height', Math.max(400, maxHeight) + 'px');
      appendColumnsToConfigList(el, el.settings.columns);
      $panel.find('ol').sortable();
    });

    $(el).find('.data-grid-fullscreen').click(function settingsIconClick() {
      if (document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      } else if (el.requestFullscreen) {
        el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      }
    });

    /**
     * Config save button handler.
     */
    indiciaFns.on('click', '#' + el.id + ' .data-grid-settings .save', {}, function onClick() {
      var header = $(el).find('thead');
      var showingAggregation = el.settings.aggregation || el.settings.sourceTable;
      var colsList = [];
      $.each($(el).find('.data-grid-settings ol :checkbox:checked'), function eachCheckedCol() {
        colsList.push($(this).val());
      });
      applyColumnsList(el, colsList);
      // Save columns in a cookie.
      if (el.settings.cookies) {
        $.cookie('cols-' + el.id, JSON.stringify(colsList), { expires: 3650 });
      }
      $(header).find('*').remove();
      // Output header row for column titles.
      if (el.settings.includeColumnHeadings !== false) {
        addColumnHeadings(el, header);
      }
      // Disable filter row for aggregations.
      el.settings.includeFilterRow = el.settings.includeFilterRow && !showingAggregation;
      // Output header row for filtering.
      if (el.settings.includeFilterRow !== false) {
        addFilterRow(el, header);
      }
      $.each(el.settings.source, function eachSource(sourceId) {
        var source = indiciaData.esSourceObjects[sourceId];
        source.populate(true);
      });
      removeConfigPane(el);
    });

    /**
     * Config cancel button handler.
     */
    indiciaFns.on('click', '.data-grid-settings .cancel', {}, function onClick() {
      removeConfigPane(el);
    });

    /**
     * Config restore button handler.
     */
    indiciaFns.on('click', '.data-grid-settings .restore', {}, function onClick() {
      // Discard current columns and replace with defaults.
      $(el).find('.data-grid-settings ol li').remove();
      appendColumnsToConfigList(el, el.settings.defaultColumns);
    });

    /**
     * Config toggle button handler.
     */
    indiciaFns.on('click', '.data-grid-settings .toggle', {}, function onClick() {
      var anyUnchecked = $(el).find('.data-grid-settings ol li :checkbox:not(:checked)').length > 0;
      $(el).find('.data-grid-settings ol li :checkbox').prop('checked', anyUnchecked);
    });
  }

  /**
   * Takes a string and applies token replacement for field values.
   *
   * @param object doc
   *   The ES document for the row.
   * @param string text
   *   Text to perform replacements on.
   *
   * @return string
   *   Updated text.
   */
  function applyFieldReplacements(doc, text) {
    // Find any field name replacements.
    var fieldMatches = text.match(/\[(.*?)\]/g);
    var updatedText = text;
    $.each(fieldMatches, function eachMatch(i, fieldToken) {
      var dataVal;
      // Cleanup the square brackets which are not part of the field name.
      var field = fieldToken.replace(/\[/, '').replace(/\]/, '');
      // Field names can be separated by OR if we want to pick the first.
      var fieldOrList = field.split(' OR ');
      $.each(fieldOrList, function eachFieldName() {
        dataVal = indiciaFns.getValueForField(doc, this);
        // Drop out when we find a value.
        return dataVal === '';
      });
      updatedText = updatedText.replace(fieldToken, dataVal);
    });
    return updatedText;
  }

  /**
   * Retrieve any action links to attach to an idcDataGrid row.
   *
   * @param array actions
   *   List of actions from configuration.
   * @param object doc
   *   The ES document for the row.
   *
   * @return string
   *   Action link HTML.
   */
  function getActionsForRow(actions, doc) {
    var html = '';
    $.each(actions, function eachActions() {
      var item;
      var link;
      var params = [];
      if (typeof this.title === 'undefined') {
        html += '<span class="fas fa-times-circle error" title="Invalid action definition - missing title"></span>';
      } else {
        if (this.iconClass) {
          item = '<span class="' + this.iconClass + '" title="' + this.title + '"></span>';
        } else {
          item = this.title;
        }
        if (this.path) {
          link = this.path
            .replace(/{rootFolder}/g, indiciaData.rootFolder)
            .replace(/\{language\}/g, indiciaData.currentLanguage);
          if (this.urlParams) {
            link += link.indexOf('?') === -1 ? '?' : '&';
            $.each(this.urlParams, function eachParam(name, value) {
              params.push(name + '=' + value);
            });
            link += params.join('&');
          }
          item = applyFieldReplacements(doc, '<a href="' + link + '" title="' + this.title + '">' + item + '</a>');
        }
        html += item;
      }
    });
    return html;
  }

  /**
   * Find the data used to populate the table in the response.
   *
   * Data can be found in the response hits (i.e. standard occurrence
   * documents), the buckets of an aggregation, or a custom built source table.
   */
  function getSourceDataList(el, response) {
    if (el.settings.sourceTable) {
      // A custom table built from an aggregation by the source.
      return response[$(el)[0].settings.sourceTable];
    } else if (el.settings.aggregation && typeof response.aggregations !== 'undefined') {
      // A standard aggregation.
      return indiciaFns.findValue(response.aggregations, 'buckets');
    }
    // A standard list of records.
    return response.hits.hits;
  }

  function drawMediaFile(i, doc, file, sizeClass) {
    // Check if an extenral URL.
    var match = file.path.match(/^http(s)?:\/\/(www\.)?([a-z(\.kr)]+)/);
    var captionItems = [];
    var captionAttr;
    var html = '';
    if (file.caption) {
      captionItems.push(file.caption);
    }
    if (file.licence) {
      captionItems.push('Licence is ' + file.licence);
    }
    captionAttr = captionItems.length ? ' title="' + captionItems.join(' | ').replace('"', '&quot;') + '"' : '';
    if (match !== null) {
      // If so, is it iNat? We can work out the image file names if so.
      if (file.path.match(/^https:\/\/static\.inaturalist\.org/)) {
        html += '<a ' + captionAttr +
          'href="' + file.path.replace('/square.', '/large.') + '" ' +
          'class="inaturalist fancybox" rel="group-' + doc.id + '">' +
          '<img class="' + sizeClass + '" src="' + file.path + '" /></a>';
      } else {
        html += '<a ' +
          'href="' + file.path + '" class="social-icon ' + match[3].replace('.', '') + '"></a>';
        if (captionItems.length) {
          html += '<p>' + captionItems.join(' | ').replace('"', '&quot;') + '</p>';
        }
      }
    } else if ($.inArray(file.path.split('.').pop(), ['mp3', 'wav']) > -1) {
      // Audio files can have a player control.
      html += '<audio controls ' +
        'src="' + indiciaData.warehouseUrl + 'upload/' + file.path + '" type="audio/mpeg"/>';
    } else {
      // Standard link to Indicia image.
      html += '<a ' + captionAttr +
        'href="' + indiciaData.warehouseUrl + 'upload/' + file.path + '" ' +
        'class="fancybox" rel="group-' + doc.id + '">' +
        '<img class="' + sizeClass + '" src="' + indiciaData.warehouseUrl + 'upload/thumb-' + file.path + '" />' +
        '</a>';
    }
    return html;
  }

  function addHeader(el, table) {
    var header;
    // If we need any sort of header, add <thead>.
    if (el.settings.includeColumnHeadings !== false || el.settings.includeFilterRow !== false) {
      header = $('<thead/>').appendTo(table);
      // Output header row for column titles.
      if (el.settings.includeColumnHeadings !== false) {
        addColumnHeadings(el, header);
      }
      // Output header row for filtering.
      if (el.settings.includeFilterRow !== false) {
        addFilterRow(el, header);
      }
    }
  }
  /**
   * Outputs the HTML for the table footer.
   *
   * @param obj response
   *   Elasticsearch response data.
   * @param obj data
   *   Data sent in request.
   */
  function drawTableFooter(el, response, data, afterKey) {
    var fromRowIndex = typeof data.from === 'undefined' ? 1 : (data.from + 1);
    var ofLabel = '';
    var toLabel;
    var total;
    var pageSize = $(el).find('tbody tr').length;
    // Set up the count info in the footer.
    if (el.settings.aggregation && el.settings.aggregation === 'composite') {
      // Composite aggs use after_key for simple paging.
      if (afterKey) {
        el.settings.compositeInfo.pageAfterKeys[el.settings.compositeInfo.page + 1] = afterKey;
      }
      $(el).find('.pager-row .next').prop('disabled', !afterKey);
      $(el).find('.pager-row .prev').prop('disabled', el.settings.compositeInfo.page === 0);
    } else {
      if (el.settings.aggregation && el.settings.aggregation === 'autoAggregationTable') {
        // The count agg is always added in this mode.
        total = response.aggregations.count.value;
        // Can't page through a standard aggregation.
        $(el).find('.pager-row .buttons').hide();
      } else {
        total = response.hits.total.value;
        // Enable or disable the paging buttons.
        $(el).find('.pager-row .prev').prop('disabled', fromRowIndex <= 1);
        $(el).find('.pager-row .next').prop('disabled', fromRowIndex + response.hits.hits.length >= response.hits.total.value);
      }
      // Output text describing loaded hits.
      if (pageSize > 0) {
        if (fromRowIndex === 1 && pageSize === total) {
          $(el).find('tfoot .showing').html('Showing all ' + total + ' hits');
        } else {
          toLabel = fromRowIndex === 1 ? 'first ' : fromRowIndex + ' to ';
          $(el).find('tfoot .showing').html('Showing ' + toLabel + (fromRowIndex + (pageSize - 1)) + ' of ' + ofLabel + total);
        }
      } else {
        $(el).find('tfoot .showing').html('No hits');
      }
    }
  }

  /**
   * Return the <td> elements for special behaviours in a row.
   *
   * Includes row selection and responsive table toggle cells.
   */
  function getRowBehaviourCells(el) {
    var cells = [];
    if ($(el).hasClass('multiselect-mode')) {
      cells.push('<td class="multiselect-cell"><input type="checkbox" class="multiselect" /></td>');
    }
    if (el.settings.responsive) {
      cells.push('<td class="footable-toggle-col"></td>');
    }
    return cells;
  }

  /**
   * Return the <td> elements for data in a row.
   */
  function getDataCells(el, doc, maxCharsPerCol) {
    var cells = [];
    $.each(el.settings.columns, function eachColumn(idx) {
      var value;
      var rangeValue;
      var sizeClass;
      var classes = ['col-' + idx];
      var style = '';
      var colDef = el.settings.availableColumnInfo[this];
      var media = '';
      var date;
      // Extra space in last col to account for tool icons.
      var extraSpace = idx === el.settings.columns.length - 1 && !el.settings.actions.length ? 2 : 0;
      value = indiciaFns.getValueForField(doc, this, colDef);
      if (colDef.rangeField) {
        rangeValue = indiciaFns.getValueForField(doc, colDef.rangeField);
        if (value !== rangeValue) {
          value = value + ' to ' + rangeValue;
        }
      }
      if (value && colDef.handler && colDef.handler === 'date') {
        date = new Date(value);
        value = date.toLocaleDateString();
      } else if (value && colDef.handler && colDef.handler === 'datetime') {
        date = new Date(value);
        value = date.toLocaleString();
      }
      if (value && colDef.handler && colDef.handler === 'media') {
        // Tweak image sizes if more than 1.
        sizeClass = value.length === 1 ? 'single' : 'multi';
        // Build media HTML.
        $.each(value, function eachFile(i, file) {
          media += drawMediaFile(i, doc, file, sizeClass);
        });
        value = media;
        // Approximate a column size to accomodate the thumbnails.
        maxCharsPerCol['col-' + idx] = Math.max(maxCharsPerCol['col-' + idx], extraSpace + value.length === 1 ? 8 : 14);
      } else {
        maxCharsPerCol['col-' + idx] =
          Math.max(maxCharsPerCol['col-' + idx], $('<p>' + value + '</p>').text().length + extraSpace);
      }
      classes.push('field-' + this.replace(/\./g, '--').replace(/_/g, '-'));
      // Copy across responsive hidden cols.
      if ($(el).find('table th.col-' + idx).css('display') === 'none') {
        style = ' style="display: none"';
      }
      value = value === null ? '' : value;
      if (colDef.ifEmpty && value === '') {
        value = colDef.ifEmpty;
      }
      cells.push('<td class="' + classes.join(' ') + '"' + style + '>' + value + '</td>');
      return true;
    });
    return cells;
  }

  /**
   * After population of the table, fire callbacks.
   *
   * Callbacks may be linked to the populate event or the rowSelect event if
   * the selected row changes.
   */
  function fireAfterPopulationCallbacks(el) {
    // Fire any population callbacks.
    $.each(el.settings.callbacks.populate, function eachCallback() {
      this(el);
    });
    // Fire callbacks for selected row if any.
    $.each(el.settings.callbacks.rowSelect, function eachCallback() {
      this($(el).find('tr.selected').length === 0 ? null : $(el).find('tr.selected')[0]);
    });
  }

  /**
   * Column resizing needs to be done manually when tbody has scroll bar.
   *
   * Tbody can only have scroll bar if not it's normal CSS display setting, so
   * we lose col auto-resizing. This sets col widths according to the max
   * amount of data in each.
   */
  function setColWidths(el, maxCharsPerCol) {
    var maxCharsPerRow = 0;
    var tbody = $(el).find('tbody');
    // Column resizing needs to be done manually when tbody has scroll bar.
    if (el.settings.scrollY) {
      $.each(el.settings.columns, function eachColumn(idx) {
        // Allow extra char per col for padding.
        maxCharsPerCol['col-' + idx] += 1;
        maxCharsPerRow += maxCharsPerCol['col-' + idx];
      });
      if (el.settings.actions.length > 0) {
        // Allow 3 characters per icon. Max 2 wide, rest can flow below.
        maxCharsPerCol['col-actions'] = Math.min(6, el.settings.actions.length * 3);
        maxCharsPerRow += maxCharsPerCol['col-actions'];
      }
      if (el.settings.responsive) {
        maxCharsPerRow += 3;
        $(el).find('.footable-toggle-col').css('width', (100 * (3 / maxCharsPerRow)) + '%');
      }
      $(el).find('.col-actions').css('width', (100 * (maxCharsPerCol['col-actions'] / maxCharsPerRow)) + '%');
      $.each(el.settings.columns, function eachColumn(idx) {
        $(el).find('.col-' + idx).css('width', (100 * (maxCharsPerCol['col-' + idx] / maxCharsPerRow)) + '%');
      });
      // Space header if a scroll bar visible.
      if (tbody.find('tr').length > 0) {
        $(el).find('.scroll-spacer').css('width', (tbody[0].offsetWidth - tbody[0].clientWidth) + 'px');
      }
    }
  }

  /**
   * Finds the longest word in a string.
   */
  function longestWordLength(str) {
    var strSplit = str.split(' ');
    var longestWord = 0;
    var i;
    for (i = 0; i < strSplit.length; i++) {
      if (strSplit[i].length > longestWord) {
        longestWord = strSplit[i].length;
      }
    }
    return longestWord;
  }

  /**
   * Declare public methods.
   */
  methods = {
    /**
     * Initialise the idcDataGrid plugin.
     *
     * @param array options
     */
    init: function init(options) {
      var el = this;
      var table;
      var totalCols;
      var showingAggregation;
      var footableSort;
      var tableClasses = ['table', 'es-data-grid'];
      var savedCols;
      var tools;
      indiciaFns.registerOutputPluginClass('idcDataGrid');
      el.settings = $.extend(true, {}, defaults);
      // Apply settings passed in the HTML data-* attribute.
      if (typeof $(el).attr('data-idc-config') !== 'undefined') {
        $.extend(el.settings, JSON.parse($(el).attr('data-idc-config')));
      }
      // Apply settings passed to the constructor.
      if (typeof options !== 'undefined') {
        $.extend(el.settings, options);
      }
      // Disable cookies unless id specified.
      if (!el.id || !$.cookie) {
        el.settings.cookies = false;
      }
      // Validate settings.
      if (typeof el.settings.columns === 'undefined') {
        indiciaFns.controlFail(el, 'Missing columns config for table.');
      }
      // Store original column settings.
      el.settings.defaultColumns = el.settings.columns.slice();
      if (el.settings.cookies) {
        savedCols = $.cookie('cols-' + el.id);
        // Don't recall cookie if empty, as this is unlikely to be deliberate.
        if (savedCols && savedCols !== '[]') {
          applyColumnsList(el, JSON.parse(savedCols));
        }
      }
      if (el.settings.columns.length === 0) {
        el.settings.columns = el.settings.defaultColumns.slice();
      }
      showingAggregation = el.settings.aggregation || el.settings.sourceTable;
      footableSort = showingAggregation && el.settings.sortable ? 'true' : 'false';
      if (el.settings.scrollY) {
        tableClasses.push('fixed-header');
      }
      // Disable filter row for aggregations.
      el.settings.includeFilterRow = el.settings.includeFilterRow && !showingAggregation;
      // Build the elements required for the table.
      table = $('<table class="' + tableClasses.join(' ') + '" data-sort="' + footableSort + '" />').appendTo(el);
      addHeader(el, table);
      // We always want a table body for the data.
      $('<tbody />').appendTo(table);
      // Output a footer if we want a pager.
      if (el.settings.includePager && !(el.settings.sourceTable || el.settings.aggregation === 'simple')) {
        totalCols = el.settings.columns.length
          + (el.settings.responsive ? 1 : 0)
          + (el.settings.actions.length > 0 ? 1 : 0);
        $('<tfoot><tr class="pager-row"><td colspan="' + totalCols + '"><span class="showing"></span>' +
          '<span class="buttons"><button class="prev">Previous</button><button class="next">Next</button></span>' +
          '</td></tr></tfoot>').appendTo(table);
      }
      setTableHeight(el);
      // Add icons for table settings.
      tools = '<span class="fas fa-wrench data-grid-show-settings" title="Click to show grid column settings"></span>';
      if (document.fullscreenEnabled || document.mozFullScreenEnabled || document.webkitFullscreenEnabled) {
        tools += '<br/><span class="far fa-window-maximize data-grid-fullscreen" title="Click to view grid in full screen mode"></span>';
      }
      if (el.settings.includeMultiSelectTool) {
        tools = '<span title="Enable multiple selection mode" class="fas fa-list multiselect-switch"></span><br/>' + tools;
      }
      $('<div class="data-grid-tools">' + tools + '</div>').appendTo(el);
      // Add overlay for settings etc.
      $('<div class="data-grid-settings" style="display: none"></div>').appendTo(el);
      $('<div class="loading-spinner" style="display: none"><div>Loading...</div></div>').appendTo(el);
      initHandlers(el);
      if (footableSort === 'true' || el.settings.responsive) {
        // Make grid responsive.
        $(el).indiciaFootableReport(el.settings.responsiveOptions);
      }
      if (el.settings.responsive && el.settings.autoResponsiveExpand) {
        // Auto-expand the extra details row if cols hidden because below a
        // breakpoint.
        $(table).trigger('footable_expand_all');
        $(table).bind('footable_breakpoint', function onBreak() {
          $(table).trigger('footable_expand_all');
        });
      }
      window.addEventListener('resize', function resize() { setTableHeight(el); });
    },

    /**
     * Populate the data grid with Elasticsearch response data.
     *
     * @param obj sourceSettings
     *   Settings for the data source used to generate the response.
     * @param obj response
     *   Elasticsearch response data.
     * @param obj data
     *   Data sent in request.
     */
    populate: function populate(sourceSettings, response, data) {
      var el = this;
      var dataList = getSourceDataList(el, response);
      var maxCharsPerCol = {};
      var afterKey = indiciaFns.findValue(response, 'after_key');
      if (el.settings.aggregation === 'composite' && !afterKey && el.settings.compositeInfo.page > 0) {
        // Moved past last page, so abort.
        $(el).find('.next').prop('disabled', true);
        el.settings.compositeInfo.page--;
        return;
      }
      // Cleanup before repopulating.
      $(el).find('tbody tr').remove();
      $(el).find('.multiselect-all').prop('checked', false);
      // In scrollY mode, we have to calculate the column widths ourselves
      // since putting CSS overflow on tbody requires us to lose table layout.
      // Start by finding the number of characters in header cells. Later we'll
      // increase this if  we find cells in a column that contain more
      // characters.
      $.each(el.settings.columns, function eachColumn(idx) {
        // Only use the longest word in the caption as we'd rather break the
        // heading than the data rows.
        maxCharsPerCol['col-' + idx] = Math.max(longestWordLength(el.settings.availableColumnInfo[this].caption), 3);
        if (typeof indiciaData.esMappings[this] !== 'undefined' && indiciaData.esMappings[this].sort_field) {
          // Add 2 chars to allow for the sort icon.
          maxCharsPerCol['col-' + idx] += 2;
        }
      });
      if (el.settings.actions.length) {
        // Allow 2 chars per action icon.
        maxCharsPerCol['col-actions'] = Math.max(el.settings.actions.length * 2);
      } else if (!el.settings.scrollY) {
        // If no scrollbar or actions column, 2 extra chars for the last
        // heading as it contains tool icons.
        maxCharsPerCol['col-' + (el.settings.columns.length - 1)] += 2;
      }
      $.each(dataList, function eachHit() {
        var hit = this;
        var cells = [];
        var row;
        var classes = ['data-row'];
        var doc = hit._source ? hit._source : hit;
        var dataRowIdAttr;
        cells = getRowBehaviourCells(el);
        cells = cells.concat(getDataCells(el, doc, maxCharsPerCol));
        if (el.settings.actions.length) {
          cells.push('<td class="col-actions">' + getActionsForRow(el.settings.actions, doc) + '</td>');
        }
        if (el.settings.selectIdsOnNextLoad && $.inArray(hit._id, el.settings.selectIdsOnNextLoad) !== -1) {
          classes.push('selected');
        }
        // Automatically add class for zero abundance data so it can be struck
        // through.
        if (doc.occurrence && doc.occurrence.zero_abundance === 'true') {
          classes.push('zero-abundance');
        }
        if (el.settings.rowClasses) {
          $.each(el.settings.rowClasses, function eachClass() {
            classes.push(applyFieldReplacements(doc, this));
          });
        }
        dataRowIdAttr = hit._id ? ' data-row-id="' + hit._id + '"' : '';
        row = $('<tr class="' + classes.join(' ') + '"' + dataRowIdAttr + '>'
           + cells.join('') +
           '</tr>').appendTo($(el).find('tbody'));
        $(row).attr('data-doc-source', JSON.stringify(doc));
        return true;
      });
      if (el.settings.responsive) {
        $(el).find('table').trigger('footable_redraw');
      }
      if (!el.settings.aggregation) {
        el.settings.totalRowCount = response.hits.total.value;
      }
      drawTableFooter(el, response, data, afterKey);
      fireAfterPopulationCallbacks(el);
      setColWidths(el, maxCharsPerCol);
    },

    /**
     * Special handling for pager information when using countAggregation.
     *
     * @param int count
     *   Optional new total row count.
     */
    updatePagerForCountAgg: function updatePagerForCountAgg(pageSize, count) {
      var pageInfo = this.settings.compositeInfo;
      // Optionally update the total count.
      if (count) {
        this.totalRowCount = count;
      }
      $(this).find('tfoot .showing').html('Showing ' + (pageInfo.page * pageSize + 1) +
          ' to ' + Math.min(this.totalRowCount, (pageInfo.page + 1) * pageSize) +
          ' of ' + this.totalRowCount);
    },

    /**
     * Register an event handler.
     * @param string event
     *   Event name.
     * @param function handler
     *   Callback function called on this event.
     */
    on: function on(event, handler) {
      if (typeof this.settings.callbacks[event] === 'undefined') {
        indiciaFns.controlFail(this, 'Invalid event handler requested for ' + event);
      }
      this.settings.callbacks[event].push(handler);
    },

    /**
     * Hides a row and moves to next row.
     *
     * When an action is taken on a row so it is no longer required in the grid
     * this method hides the row and moves to the next row, for example after
     * a verification accept.
     */
    hideRowAndMoveNext: function hideRowAndMoveNext() {
      var el = this;
      var oldSelected = $(el).find('tr.selected');
      var newSelectedId;
      var showingLabel = $(el).find('.showing');
      var selectedIds = [];

      if ($(el).find('table.multiselect-mode').length > 0) {
        $.each($(el).find('input.multiselect:checked'), function eachRow() {
          var tr = $(this).closest('tr');
          selectedIds.push($(tr).attr('data-row-id'));
          tr.remove();
        });
      } else {
        if ($(oldSelected).next('tr').length > 0) {
          newSelectedId = $(oldSelected).next('tr').attr('data-row-id');
        } else if ($(oldSelected).prev('tr').length > 0) {
          newSelectedId = $(oldSelected).prev('tr').attr('data-row-id');
        }
        selectedIds.push($(oldSelected).attr('data-row-id'));
        $(oldSelected).remove();
      }
      $.each(el.settings.source, function eachSource(sourceId) {
        var source = indiciaData.esSourceObjects[sourceId];
        // If the number of rows below 75% of page size, reresh the grid.
        if ($(el).find('table tbody tr.data-row').length < source.settings.size * 0.75) {
          // As ES updates are not instant, we need a temporary must_not match
          // filter to prevent the verified records reappearing.
          if (!source.settings.filterBoolClauses) {
            source.settings.filterBoolClauses = {};
          }
          if (!source.settings.filterBoolClauses.must_not) {
            source.settings.filterBoolClauses.must_not = [];
          }
          source.settings.filterBoolClauses.must_not.push({
            query_type: 'terms',
            field: '_id',
            value: JSON.stringify(selectedIds)
          });
          $(el)[0].settings.selectIdsOnNextLoad = [newSelectedId];
          // Reload the grid page.
          source.populate(true);
          // Clean up the temporary exclusion filter.
          source.settings.filterBoolClauses.must_not.pop();
          if (!source.settings.filterBoolClauses.must_not.length) {
            delete source.settings.filterBoolClauses.must_not;
          }
        } else {
          // Update the paging info if some rows left.
          showingLabel.html(showingLabel.html().replace(/\d+ of /, $(el).find('tbody tr.data-row').length + ' of '));
          // Immediately select the next row.
          if (typeof newSelectedId !== 'undefined') {
            $(el).find('table tbody tr.data-row[data-row-id="' + newSelectedId + '"]').addClass('selected');
          }
          // Fire callbacks for selected row.
          $.each(el.settings.callbacks.rowSelect, function eachCallback() {
            this($(el).find('tr.selected').length === 0 ? null : $(el).find('tr.selected')[0]);
          });
        }
      });
    },

    /**
     * Grids always populate when their source updates.
     */
    getNeedsPopulation: function getNeedsPopulation() {
      return true;
    }
  };

  /**
   * Extend jQuery to declare idcDataGrid plugin.
   */
  $.fn.idcDataGrid = function buildDataGrid(methodOrOptions) {
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
      $.error('Method ' + methodOrOptions + ' does not exist on jQuery.idcDataGrid');
      return true;
    });
    // If the method has no explicit response, return this to allow chaining.
    return typeof result === 'undefined' ? this : result;
  };
}());
