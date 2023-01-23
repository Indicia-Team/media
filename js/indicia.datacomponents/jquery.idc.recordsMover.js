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
(function idcRecordDetailsPane() {
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
   * Register the various user interface event handlers.
   */
  function initHandlers(el) {
    $(el).find('.move-records-btn').click(() => {
      $.fancyDialog({
        title: indiciaData.lang.recordsMover.recordsMoverDialogTitle,
        message: indiciaData.lang.recordsMover.recordsMoverDialogMessage,
        okButton: indiciaData.lang.recordsMover.move,
        cancelButton: indiciaData.lang.recordsMover.cancel,
        callbackOk: () => {
          // @todo Check that the source does have a survey ID filter that matches the datasetMappings sources.
          // @todo Call new API on the warehouse
        }
      });
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
      // @todo Validate settings, e.g. source exists.

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