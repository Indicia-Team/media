/**
 * @file
 * Code for the controlLayout Elasticsearch control.
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
 * Output plugin for data grids.
 */
jQuery(document).ready(function($) {

  /**
   * Get correct component(s) to set scrollbox on.
   *
   * For anchoring to the bottom of the page using alignBottom.
   *
   * @param string id
   *   ID of the control container.
   */
  function getResizeableScrollComponent(id) {
    let thisCtrl = $('#' + id);
    if (thisCtrl.hasClass('idc-recordDetails')) {
      return thisCtrl.find('.ui-tabs-panel');
    }
    if (thisCtrl.hasClass('idc-dataGrid')) {
      return thisCtrl.find('tbody');
    }
    return thisCtrl;
  }

  /**
   * Find the css style of a margin or padding size, as an integer.
   *
   * @param DOM ctrl
   *   Control to check.
   * @param string measurement
   *   E.g. marginTop or paddingTop.
   *
   * @return float
   *   Size (hopefully in pixels but doesn't check).
   */
  function getCtrlStyledSizing(ctrl, measurement) {
    const size = ctrl[0].style[measurement];
    return size ? parseInt(size.match(/\d+/)[0], 10) : 0;
  }

  if (typeof indiciaData.esControlLayout !== 'undefined') {
    if ($('#' + indiciaData.esControlLayout.setOriginY).length === 0) {
      alert('Invalid [controlLayout] @setOriginY option - must point to the ID of another control.');
      return;
    }
    // If being aligned to the top, we want no initial margin.
    $.each(indiciaData.esControlLayout.alignTop, function() {
      $('#' + this).css('margin-top', 0);
    });

    /**
     * Resize layout management function.
     */
    indiciaFns.updateControlLayout = function updateLayout() {
      const originY = $('#' + indiciaData.esControlLayout.setOriginY)[0].getBoundingClientRect().y;
      const belowBreakpoint = window.matchMedia('(max-width: ' + indiciaData.esControlLayout.breakpoint + 'px)').matches;
      $.each(indiciaData.esControlLayout.alignTop, function() {
        const thisCtrl = $('#' + this);
        if (belowBreakpoint) {
          // Below breakpoint, so don't set margin.
          thisCtrl.css('margin-top', 0);
        } else {
          const thisCtrlTop = thisCtrl[0].getBoundingClientRect().y;
          // Get the previuosly applied margin without 'px';
          const currentMargin = getCtrlStyledSizing(thisCtrl, 'marginTop');
          const newMargin = originY - (thisCtrlTop - currentMargin);
          // If tiny change, probably a rounding issue,
          if (Math.abs(currentMargin - newMargin) > 2) {
            thisCtrl.css('margin-top', newMargin + 'px');
          }
        }
      });
      $.each(indiciaData.esControlLayout.setHeightPercent, function(id, height) {
        if (belowBreakpoint) {
          // Below breakpoint, so revert to unstyled height.
          $('#' + id).css('height', '');
        } else {
          $('#' + id).css('height', (window.innerHeight * height / 100) + 'px');
        }
      });
      $.each(indiciaData.esControlLayout.alignBottom, function() {
        const thisCtrl = $(getResizeableScrollComponent(this));
        // Ensure control ready.
        if (thisCtrl.length > 0) {
          if (belowBreakpoint) {
            // Below breakpoint, so revert to unstyled height.
            thisCtrl.css('max-height', '');
          } else {
            const thisCtrlTop = thisCtrl[0].getBoundingClientRect().y;
            thisCtrl.css('overflow-y', 'auto');
            thisCtrl.css('max-height', ((window.innerHeight + originY) - (thisCtrlTop + getCtrlStyledSizing($('body'), 'paddingTop'))) + 'px');
          }
        }
      });
    }

    window.addEventListener('resize', indiciaFns.updateControlLayout);
    // Also recalc on fullscreen change otherwise layout refreshes too early
    // when closing fullscreen.
    document.addEventListener("fullscreenchange", indiciaFns.updateControlLayout);
    document.addEventListener("webkitfullscreenchange", indiciaFns.updateControlLayout);
  } else {
    // No control layout settings so nothing to do.
    indiciaFns.updateControlLayout = () => {};
  }

});