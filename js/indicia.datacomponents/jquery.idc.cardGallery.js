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

 /* eslint no-underscore-dangle: ["error", { "allow": ["_id", "_source", "_count"] }] */
 /* eslint no-param-reassign: ["error", { "props": false }]*/

/**
 * Output plugin for card galleries.
 */
(function idcCardGalleryPlugin() {
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
    includeFieldCaptions: false,
    includeFullScreenTool: true,
    includePager: true,
    keyboardNavigation: false,
    /**
     * Registered callbacks for different events.
     */
    callbacks: {
      itemSelect: [],
      itemDblClick: [],
      populate: []
    }
  };

  /**
   * Register the various user interface event handlers.
   */
  function initHandlers(el) {

    /**
     * Track loaded card ID to avoid duplicate effort.
     */
    var lastLoadedCardId = null;

    /**
     * SetTimeout handle so the row load timeout can be cleared when navigating quickly.
     */
    var loadRowTimeout;

    /**
     * Fire callbacks when a card has been selected
     **/
    function loadSelectedCard() {
      var card = $(el).find('.card.selected');
      if (card.length && card.data('row-id') !== lastLoadedCardId) {
        lastLoadedCardId = card.data('row-id');
        $.each(el.settings.callbacks.itemSelect, function eachCallback() {
          this(card);
        });
      }
    }

    /**
     * Card click handler.
     *
     * Adds selected class and fires callbacks.
     */
    indiciaFns.on('click', '#' + el.id + ' .es-card-gallery .card', {}, function onCardGalleryCardClick() {
      var card = this;
      $(card).closest('.es-card-gallery').find('.card.selected').removeClass('selected');
      $(card).addClass('selected');
      loadSelectedCard();
    });

    /**
     * Double click grid row handler.
     *
     * Adds selected class and fires callbacks.
     */
    indiciaFns.on('dblclick', '#' + el.id + ' .es-card-gallery .card', {}, function onCardGalleryitemDblClick() {
      var card = this;
      if (!$(card).hasClass('selected')) {
        $(card).closest('.es-card-gallery').find('.card.selected').removeClass('selected');
        $(card).addClass('selected');
      }
      $.each(el.settings.callbacks.itemDblClick, function eachCallback() {
        this(card);
      });
    });

    /**
     * Implement arrow key and other navigation tools.
     */
    if (el.settings.keyboardNavigation) {
      indiciaFns.on('keydown', '#' + el.id + ' .es-card-gallery .card', {}, function onDataGridKeydown(e) {
        var card = this;
        var oldSelected;
        var newSelected;
        var oldCardBounds;
        var nextRowTop;
        var nextRowContents = [];
        var navFn;
        var closestVerticalDistance = null;
        // Was the key an arrow key?
        if (e.which >= 37 && e.which <= 40) {
          oldSelected = $(card).closest('.es-card-gallery').find('.card.selected');
          if (e.which === 37) {
            newSelected = $(oldSelected).prev('.card');
          } else if (e.which === 39) {
            newSelected = $(oldSelected).next('.card');
          } else {
            navFn = e.which === 38 ? 'prev' : 'next';
            oldCardBounds = oldSelected[0].getBoundingClientRect();
            newSelected = $(oldSelected)[navFn]('.card');
            // Since we are going up or down, find the whole contents of the
            // row we are moving into by inspecting the y position.
            while (newSelected.length !== 0) {
              if (newSelected[0].getBoundingClientRect().y !== oldCardBounds.y) {
                if (!nextRowTop) {
                  nextRowTop = newSelected[0].getBoundingClientRect().y;
                } else if (nextRowTop !== newSelected[0].getBoundingClientRect().y) {
                  break;
                }
                nextRowContents.push(newSelected);
              }
              newSelected = $(newSelected)[navFn]('.card');
            }
            // Now find the item in that row with the closest vertical centre
            // to the card we are leaving.
            $.each(nextRowContents, function() {
              var thisCardBounds = this[0].getBoundingClientRect();
              var thisVerticalDistance = Math.abs((oldCardBounds.left + oldCardBounds.right) / 2 - (thisCardBounds.left + thisCardBounds.right) / 2);
              if (closestVerticalDistance === null || thisVerticalDistance < closestVerticalDistance) {
                newSelected = this;
                closestVerticalDistance = thisVerticalDistance;
              }
            });
          }
          if (newSelected.length) {
            $(newSelected).addClass('selected');
            $(newSelected).focus();
            $(oldSelected).removeClass('selected');
          }
          // Load row on timeout to avoid rapidly hitting services if repeat-hitting key.
          if (loadRowTimeout) {
            clearTimeout(loadRowTimeout);
          }
          loadRowTimeout = setTimeout(function() {
            loadSelectedCard();
          }, 500);
          e.preventDefault();
          return false;
        } else if (e.which === 73) {
          // i key for image popup.
          var fbLink = $(card).closest('.es-card-gallery').find('.card.selected [data-fancybox]');
          if (fbLink.length) {
            $(fbLink).click();
          }
        }
      });
    }

    /**
     * Next page click.
     */
    $(el).find('.pager .next').click(function clickNext() {
      indiciaFns.movePage(el, true, '.card');
    });

    /**
     * Previous page click.
     */
    $(el).find('.pager .prev').click(function clickPrev() {
      indiciaFns.movePage(el, false, '.card');
    });

    /**
     * Rows per page change.
     */
    $(el).find('.rows-per-page select').change(function changeRowsPerPage() {
      indiciaFns.rowsPerPageChange(el);
    });

    $(el).find('.fullscreen-tool').click(function settingsIconClick() {
      indiciaFns.goFullscreen(el);
    });
  }

  /**
   * After population of the gallery, fire callbacks.
   *
   * Callbacks may be linked to the populate event or the itemSelect event if
   * the selected card changes.
   */
  function fireAfterPopulationCallbacks(el) {
    // Fire any population callbacks.
    $.each(el.settings.callbacks.populate, function eachCallback() {
      this(el);
    });
    // Fire callbacks for selected card if any.
    $.each(el.settings.callbacks.itemSelect, function eachCallback() {
      this($(el).find('.card.selected').length === 0 ? null : $(el).find('.card.selected')[0]);
    });
  }

  /**
   * Declare public methods.
   */
  methods = {
    /**
     * Initialise the idcCardGallery plugin.
     *
     * @param array options
     */
    init: function init(options) {
      var el = this;
      var tools = [];

      indiciaFns.registerOutputPluginClass('idcCardGallery');
      el.settings = $.extend(true, {}, defaults);
      // Apply settings passed in the HTML data-* attribute.
      if (typeof $(el).attr('data-idc-config') !== 'undefined') {
        $.extend(el.settings, JSON.parse($(el).attr('data-idc-config')));
      }
      // Apply settings passed to the constructor.
      if (typeof options !== 'undefined') {
        $.extend(el.settings, options);
      }
      // dataGrid does not make use of multiple sources.
      el.settings.sourceObject = indiciaData.esSourceObjects[Object.keys(el.settings.source)[0]];

      if (!el.settings.columns) {
        el.settings.columns = [
          {
            field: '#taxon_label#',
            caption: indiciaData.gridMappingFields['taxon.accepted_name'].caption
          }, {
            field: '#event_date#',
            caption: 'Date'
          }, {
            field: 'event.recorded_by',
            caption: indiciaData.gridMappingFields['event.recorded_by'].caption
          }, {
            field: 'location.output_sref',
            caption: indiciaData.gridMappingFields['location.output_sref'].caption
          }, {
            field: '#status_icons#',
            caption: 'Status',
          }
        ];
      }

      $('<div class="es-card-gallery">').appendTo(el);
      if (el.settings.includePager) {
        $('<div class="pager">' + indiciaFns.getPagerControls(el) + '</div>').appendTo(el);
      }

      if (el.settings.includeFullScreenTool &&
        (document.fullscreenEnabled || document.mozFullScreenEnabled || document.webkitFullscreenEnabled)) {
        tools.push('<span class="far fa-window-maximize fullscreen-tool" title="Click to view grid in full screen mode"></span>');
      }
      $('<div class="idc-output-tools">' + tools.join('<br/>') + '</div>').appendTo(el);
      // Add overlay for loading.
      $('<div class="loading-spinner" style="display: none"><div>Loading...</div></div>').appendTo(el);
      initHandlers(el);
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
      var dataList = response.hits.hits;

      // Cleanup before repopulating.
      $(el).find('.card').remove();

      $.each(dataList, function eachHit(i) {
        var hit = this;
        var doc = hit._source ? hit._source : hit;
        var card = $('<div>')
          .attr('data-row-id', hit._id)
          .attr('data-doc-source', JSON.stringify(doc))
          .appendTo($(el).find('.es-card-gallery'));
        // @todo class warning for rejected.
        var classes = ['card', 'panel', 'panel-info'];
        var imageContainer;
        var dataContainer;
        var value;
        // For keyboard navigation, need to enable row focus.
        if (el.settings.keyboardNavigation) {
          $(card).attr('tabindex', i);
        }
        if (doc.occurrence.media) {
          imageContainer = $('<div>').addClass('image-container').appendTo(card);
          if (doc.occurrence.media.length > 1) {
            // More than one photo needs a bigger card.
            classes.push('big');
          }
          $.each(doc.occurrence.media, function() {
            var thumb = indiciaFns.drawMediaFile(doc.id, this, 'med');
            var thumbwrap = $('<div>').append(thumb);
            $(thumbwrap).appendTo(imageContainer);
          });
        }
        $(card).addClass(classes.join(' '));
        if (el.settings.includeFieldCaptions) {
          dataContainer = $('<dl>').addClass('dl-horizontal');
        } else {
          dataContainer = $('<ul>');
        }
        dataContainer.addClass('data-container panel-body').appendTo(card);
        $.each(el.settings.columns, function() {
          value = indiciaFns.getValueForField(doc, this.field);
          var valueClass = 'field-' + this.field.replace(/\./g, '--').replace(/_/g, '-');
          if (value !== '') {
            if (el.settings.includeFieldCaptions) {
              $('<dt>' + this.caption + '</dt>').appendTo(dataContainer);
              $('<dd >' + value + '</dd>').addClass(valueClass).appendTo(dataContainer);
            } else {
              $('<li>' + value + '</li>').addClass(valueClass).appendTo(dataContainer);
            }
          }
        });
        if (el.settings.actions.length) {
          value = indiciaFns.getActions(el, el.settings.actions, doc);
          if (el.settings.includeFieldCaptions) {
            $('<dt>Actions</dt>').appendTo(dataContainer);
            $('<dd>' + value + '</dd>').appendTo(dataContainer);
          } else {
            $('<li>' + value + '</li>').appendTo(dataContainer);
          }
        }
      });
      indiciaFns.drawPagingFooter(el, response, data, '.card');
      fireAfterPopulationCallbacks(el);
    },

    /**
     * Register an event handler.
     *
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
     * Card galleries always populate when their source updates.
     */
    getNeedsPopulation: function getNeedsPopulation() {
      return true;
    },
  };

  /**
   * Extend jQuery to declare idcCardGallery plugin.
   */
  $.fn.idcCardGallery = function buildCardGallery(methodOrOptions) {
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
      $.error('Method ' + methodOrOptions + ' does not exist on jQuery.idcCardGallery');
      return true;
    });
    // If the method has no explicit response, return this to allow chaining.
    return typeof result === 'undefined' ? this : result;
  };
}());