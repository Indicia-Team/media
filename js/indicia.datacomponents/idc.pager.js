(function enclose() {
  'use strict';
  var $ = jQuery;

  /**
   * Repopulates a control with the next or previous data page.
   *
   * @param DOM el
   *   Control element.
   * @param bool forward
   *   True for next page, false for previous.
   * @param string itemSelector
   *   Selector to find an individual data item element.
   */
  indiciaFns.movePage = function movePage(el, forward, itemSelector) {
    var sourceSettings = el.settings.sourceObject.settings;
    if (el.settings.sourceObject.settings.mode === 'compositeAggregation') {
      el.settings.compositeInfo.page += (forward ? 1 : -1);
      // Composite aggregations use after_key to find next page.
      if (el.settings.compositeInfo.pageAfterKeys[el.settings.compositeInfo.page]) {
        sourceSettings.after_key = el.settings.compositeInfo.pageAfterKeys[el.settings.compositeInfo.page];
      } else {
        delete sourceSettings.after_key;
      }
    } else {
      if (typeof sourceSettings.from === 'undefined') {
        sourceSettings.from = 0;
      }
      if (forward) {
        // Move to next page based on currently visible row count, in case some
        // have been removed.
        sourceSettings.from += $(el).find(itemSelector).length;
      } else {
        sourceSettings.from -= sourceSettings.size;
      }
      sourceSettings.from = Math.max(0, sourceSettings.from);
    }
    el.settings.sourceObject.populate();
  }

  /**
   * Change the number of rows loaded per page in a control's datasource.
   *
   * @param DOM el
   *   Control element.
   */
  indiciaFns.rowsPerPageChange = function rowsPerPageChange(el) {
    var newRowsPerPage = $(el).find('.rows-per-page select option:selected').val();
    if (el.settings.sourceObject.settings.mode.match(/Aggregation$/)) {
      el.settings.sourceObject.settings.aggregationSize = newRowsPerPage;
    } else {
      el.settings.sourceObject.settings.size = newRowsPerPage;
    }
    el.settings.sourceObject.populate();
  }

  /**
   * A select box for changing the rows per grid page.
   *
   * @param DOM el
   *   Control element.
   */
  function getRowsPerPageControl(el) {
    var opts = [];
    var sourceSize = el.settings.sourceObject.settings.aggregationSize || el.settings.sourceObject.settings.size;
    var buildPageSizeOptionsFrom = sourceSize || 30;
    // Set default rowsPerPageOptions unless explicitly empty.
    if (!el.settings.rowsPerPageOptions) {
      el.settings.rowsPerPageOptions = [];
      if (buildPageSizeOptionsFrom >= 40) {
        el.settings.rowsPerPageOptions.push(Math.round(buildPageSizeOptionsFrom / 2));
      }
      el.settings.rowsPerPageOptions.push(buildPageSizeOptionsFrom);
      el.settings.rowsPerPageOptions.push(buildPageSizeOptionsFrom * 2);
      if (buildPageSizeOptionsFrom < 40) {
        el.settings.rowsPerPageOptions.push(buildPageSizeOptionsFrom * 4);
      }
    }
    // If no size specified, we are showing some arbitrary ES limit on row count.
    if ($.inArray(sourceSize, el.settings.rowsPerPageOptions) === -1) {
      // Add a non-visible default option to represent initial state.
      opts.push('<option selected disabled hidden style="display: none"></option>');
    }
    if (el.settings.rowsPerPageOptions.length > 0) {
      $.each(el.settings.rowsPerPageOptions, function eachOpt() {
        var selected = this === sourceSize ? ' selected="selected"' : '';
        opts.push('<option value="' + this + '"' + selected + '>' + this + '</option>');
      });
      return '<span class="rows-per-page">Rows per page: <select>' + opts.join('') + '</select>';
    }
    return '';
  }

  /**
   * HTML for footer controls such as pager and rows per page.
   *
   * @param DOM el
   *   Control element.
   */
  indiciaFns.getFooterControls = function getFooterControls(el) {
    return '<span class="showing"></span> ' +
      '<span class="buttons"><button class="prev">Previous</button><button class="next">Next</button></span> ' +
      getRowsPerPageControl(el);
  }

   /**
   * Outputs the HTML for the paging footer.
   *
   * @param DOM el
   *   Control element.
   * @param obj response
   *   Elasticsearch response data.
   * @param obj data
   *   Data sent in request.
   * @param string itemSelector
   *   CSS selector for each item in the output.
   */
  indiciaFns.drawPagingFooter = function drawPagingFooter(el, response, data, itemSelector, afterKey) {
    var fromRowIndex;
    var ofLabel = '';
    var toLabel;
    var pageSize = $(el).find(itemSelector).length;
    var footer = $(el).find('.footer');
    var sourceSettings = el.settings.sourceObject.settings;
    var total;
    if (sourceSettings.mode === 'docs') {
      total = response.hits.total.value;
      if (response.hits.total.relation && response.hits.total.relation === 'gte') {
        ofLabel = 'at least ';
      }
    } else if (response.aggregations._count) {
      // Aggregation modes use a separate agg to count only when the filter changes.
      total = response.aggregations._count.value;
      // Safety check in case count's cardinal field makes less unique rows
      // than the selection in a composite aggregation. Ideally, the count
      // should work across all fields but that may affect performance.
      if (response.aggregations._rows) {
        total = Math.max(total, response.aggregations._rows.buckets.length);
      }
      el.settings.lastCount = total;
    } else if (el.settings.lastCount) {
      total = el.settings.lastCount;
    }
    // Set up the count info in the footer.
    if (sourceSettings.mode === 'compositeAggregation') {
      // Composite aggs use after_key for simple paging.
      if (afterKey) {
        el.settings.compositeInfo.pageAfterKeys[el.settings.compositeInfo.page + 1] = afterKey;
      }
      $(footer).find('.next').prop('disabled', !afterKey);
      $(footer).find('.prev').prop('disabled', el.settings.compositeInfo.page === 0);
      fromRowIndex = (el.settings.compositeInfo.page * sourceSettings.aggregationSize) + 1;
    } else if (sourceSettings.mode === 'termAggregation') {
      // Can't page through a standard terms aggregation.
      $(footer).find('.buttons').hide();
      fromRowIndex = 1;
    } else {
      fromRowIndex = typeof data.from === 'undefined' ? 1 : (data.from + 1);
      // Enable or disable the paging buttons.
      $(footer).find('.prev').prop('disabled', fromRowIndex <= 1);
      $(footer).find('.next').prop('disabled', fromRowIndex + response.hits.hits.length >= response.hits.total.value);
    }
    // Output text describing loaded hits.
    if (pageSize > 0) {
      if (fromRowIndex === 1 && pageSize === total) {
        $(footer).find('.showing').html('Showing all ' + total + ' hits');
      } else {
        toLabel = fromRowIndex === 1 ? 'first ' : fromRowIndex + ' to ';
        $(footer).find('.showing').html('Showing ' + toLabel + (fromRowIndex + (pageSize - 1)) + ' of ' + ofLabel + total);
      }
    } else {
      $(footer).find('.showing').html('No hits');
    }
  }

}());