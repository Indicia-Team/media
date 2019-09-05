/**
 * @file
 * A plugin for Leaflet maps.
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

/* eslint no-underscore-dangle: ["error", { "allow": ["_source"] }] */

/**
 * Output plugin for maps.
 */
(function leafletMapPlugin() {
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
    initialBoundsSet: false,
    initialLat: 54.093409,
    initialLng: -2.89479,
    initialZoom: 5,
    baseLayer: 'OpenStreetMap',
    cookies: true
  };

  /**
   * Registered callbacks for different events.
   */
  var callbacks = {
    moveend: []
  };

  /**
   * Variable to hold the marker used to highlight the currently selected row
   * in a linked idcDataGrid.
   */
  var selectedRowMarker = null;

   /**
   * Variable to hold the polygon used to highlight the currently selected
   * location boundary when relevant.
   */
  var selectedFeature = null;

  /**
   * Finds the list of layer IDs that use a given source id for population.
   */
  function getLayerIdsForSource(el, sourceId) {
    var layerIds = [];
    $.each(el.settings.layerConfig, function eachLayer(layerId, cfg) {
      if (cfg.source === sourceId) {
        layerIds.push(layerId);
      }
    });
    return layerIds;
  }

  /**
   * Finds the list of layers that use a given source id for population.
   */
  function getLayersForSource(el, sourceId) {
    var layers = [];
    $.each(el.settings.layerConfig, function eachLayer(layerId, cfg) {
      if (cfg.source === sourceId) {
        layers.push(el.outputLayers[layerId]);
      }
    });
    return layers;
  }

  /**
   * Add a feature to the map (marker, circle etc).
   */
  function addFeature(el, sourceId, location, metric) {
    var layerIds = getLayerIdsForSource(el, sourceId);
    var circle;
    var config;
    $.each(layerIds, function eachLayer() {
      var layerConfig = el.settings.layerConfig[this];
      config = {
        type: typeof layerConfig.type === 'undefined' ? 'marker' : layerConfig.type,
        options: {}
      };

      if (typeof layerConfig.style !== 'undefined') {
        $.extend(config.options, layerConfig.style);
      }
      if (config.type === 'circle' || config.type === 'square') {
        config.options = $.extend({ radius: 'metric', fillOpacity: 0.5 }, config.options);
        indiciaFns.findAndSetValue(config.options, 'size', $(el).idcLeafletMap('getAutoSquareSize'), 'autoGridSquareSize');
        // Apply metric to any options that are supposed to use it.
        $.each(config.options, function eachOption(key, value) {
          if (value === 'metric') {
            if (key === 'fillOpacity') {
              // Set a fill opacity - 20000 is max metric.
              config.options.fillOpacity = metric / 20000;
            } else {
              config.options[key] = metric;
            }
          }
        });
        if (config.options.size) {
          config.options.radius = config.options.size / 2;
          delete config.options.size;
        }
      }
      switch (config.type) {
        // Circle markers on layer.
        case 'circle':
          el.outputLayers[this].addLayer(L.circle(location, config.options));
          break;
        // Leaflet.heat powered heat maps.
        case 'heat':
          el.outputLayers[this].addLatLng([location.lat, location.lon, metric]);
          break;
        case 'square':
          // @todo - properly projected squares. These are just the bounding box of circles.
          // Use a temporary circle to get correct size.
          circle = L.circle(location, config.options).addTo(el.map);
          el.outputLayers[this].addLayer(L.rectangle(circle.getBounds(), config.options));
          circle.removeFrom(el.map);
          break;
        // Default layer type is markers.
        default:
          el.outputLayers[this].addLayer(L.marker(location, config.options));
      }
    });
  }

  /**
   * Thicken the borders of selected features when zoomed out to aid visibility.
   */
  function ensureFeatureClear(el, feature) {
    var weight = Math.min(20, Math.max(1, 20 - (el.map.getZoom())));
    var opacity = Math.min(1, Math.max(0.6, el.map.getZoom() / 18));
    if (typeof feature.setStyle !== 'undefined') {
      feature.setStyle({
        weight: weight,
        opacity: opacity
      });
    }
  }

  /**
   * Adds a Wkt geometry to the map.
   */
  function showFeatureWkt(el, geom, zoom, style) {
    var centre;
    var wkt = new Wkt.Wkt();
    var obj;
    var objStyle = {
      color: '#0000FF',
      opacity: 1.0,
      fillColor: '#0000FF',
      fillOpacity: 0.2
    };
    wkt.read(geom);
    if (style) {
      $.extend(objStyle, style);
    }
    obj = wkt.toObject(objStyle);
    obj.addTo(el.map);
    centre = typeof obj.getCenter === 'undefined' ? obj.getLatLng() : obj.getCenter();
    // Pan and zoom the map. Method differs for points vs polygons.
    if (!zoom) {
      el.map.panTo(centre);
    } else if (wkt.type === 'polygon' || wkt.type === 'multipolygon') {
      el.map.fitBounds(obj.getBounds(), { maxZoom: 11 });
    } else {
      el.map.setView(centre, 11);
    }
    return obj;
  }

  /**
   * Select a grid row pans, optionally zooms and adds a marker.
   */
  function rowSelected(el, tr, zoom) {
    var doc;
    var obj;
    if (selectedRowMarker) {
      selectedRowMarker.removeFrom(el.map);
    }
    selectedRowMarker = null;
    if (tr) {
      doc = JSON.parse($(tr).attr('data-doc-source'));
      if (doc.location) {
        obj = showFeatureWkt(el, doc.location.geom, zoom);
        ensureFeatureClear(el, obj);
        selectedRowMarker = obj;
      }
    }
  }

  /**
   * Allows map settings to be loaded from the browser cookies.
   *
   * Zoom, lat, long and selected base layer can all be remembered in cookies.
   */
  function loadSettingsFromCookies(cookieNames) {
    var val;
    var settings = {};
    if (typeof $.cookie !== 'undefined') {
      $.each(cookieNames, function eachCookie() {
        val = $.cookie(this);
        if (val !== null && val !== 'undefined') {
          settings[this] = val;
        }
      });
    }
    return settings;
  }

  /**
   * Adds features to the map where using a geo_hash aggregation.
   */
  function mapGeoHashAggregation(el, response, sourceSettings) {
    var buckets = indiciaFns.findValue(response.aggregations, 'buckets');
    var maxMetric = 10;
    if (typeof buckets !== 'undefined') {
      $.each(buckets, function eachBucket() {
        var count = indiciaFns.findValue(this, 'count');
        maxMetric = Math.max(Math.sqrt(count), maxMetric);
      });
      $.each(buckets, function eachBucket() {
        var location = indiciaFns.findValue(this, 'location');
        var count = indiciaFns.findValue(this, 'count');
        var metric = Math.round((Math.sqrt(count) / maxMetric) * 20000);
        if (typeof location !== 'undefined') {
          addFeature(el, sourceSettings.id, location, metric);
        }
      });
    }
  }

  /**
   * Adds features to the map where using a grid square aggregation.
   *
   * Grid square aggregations must aggregate on srid then one of the grid
   * square centre field values.
   */
  function mapGridSquareAggregation(el, response, sourceSettings) {
    var buckets = indiciaFns.findValue(response.aggregations, 'buckets');
    var subBuckets;
    var maxMetric = 10;
    if (typeof buckets !== 'undefined') {
      $.each(buckets, function eachBucket() {
        subBuckets = indiciaFns.findValue(this, 'buckets');
        if (typeof subBuckets !== 'undefined') {
          $.each(subBuckets, function eachSubBucket() {
            maxMetric = Math.max(Math.sqrt(this.doc_count), maxMetric);
          });
        }
      });
      $.each(buckets, function eachBucket() {
        subBuckets = indiciaFns.findValue(this, 'buckets');
        if (typeof subBuckets !== 'undefined') {
          $.each(subBuckets, function eachSubBucket() {
            var coords;
            var metric;
            if (this.key && this.key.match(/\-?\d+\.\d+ \d+\.\d+/)) {
              coords = this.key.split(' ');
              metric = Math.round((Math.sqrt(this.doc_count) / maxMetric) * 20000);
              if (typeof location !== 'undefined') {
                addFeature(el, sourceSettings.id, { lat: coords[1], lon: coords[0] }, metric);
              }
            }
          });
        }
      });
    }
  }

  /**
   * If using auto-sized grids, size of the grid recommended for current map zoom.
   *
   * Value in km.
   */
  function autoGridSquareKms(el) {
    var zoom = el.map.getZoom();
    if (zoom > 10) {
      return 1;
    } else if (zoom > 8) {
      return 2;
    }
    return 10;
  }

  /**
   * Returns true if a layer should be enabled when the page loads.
   */
  function layerEnabled(el, id, layerConfig) {
    var layerState;
    if (el.settings.layerState) {
      layerState = JSON.parse(el.settings.layerState);
      if (layerState[id]) {
        return layerState[id].enabled;
      }
    }
    // Revert to default in layer config.
    return typeof layerConfig.enabled === 'undefined' ? true : layerConfig.enabled;
  }

  /**
   * Event handler for layer enabling.
   *
   * * Populates the associated datasource.
   * * Ensures new state reflected in cookie.
   */
  function onAddLayer(el, layer, id) {
    var layerState;
    // Enabling a layer - need to repopulate the source so it gets data.
    if (indiciaData.esSourceObjects[el.settings.layerConfig[id].source]) {
      indiciaData.esSourceObjects[el.settings.layerConfig[id].source].populate();
    }
    if (el.settings.cookies && $.cookie) {
      layerState = $.cookie('layerState');
      if (layerState) {
        layerState = JSON.parse(layerState);
      } else {
        layerState = {};
      }
      layerState[id] = { enabled: true };
      $.cookie('layerState', JSON.stringify(layerState));
    }
  }

  /**
   * Event handler for layer disabling.
   *
   * Ensures new state reflected in cookie.
   */
  function onRemoveLayer(el, id) {
    var layerState;
    if (el.settings.cookies && $.cookie) {
      layerState = $.cookie('layerState');
      if (layerState) {
        layerState = JSON.parse(layerState);
      } else {
        layerState = {};
      }
      layerState[id] = { enabled: false };
      $.cookie('layerState', JSON.stringify(layerState));
    }
  }

  /**
   * Declare public methods.
   */
  methods = {
    /**
     * Initialise the idcLeafletMap plugin.
     *
     * @param array options
     */
    init: function init(options) {
      var el = this;
      var baseMaps;
      var overlays = {};
      var layersControl;
      el.outputLayers = {};

      indiciaFns.registerOutputPluginClass('idcLeafletMap');
      el.settings = $.extend({}, defaults);
      // Apply settings passed in the HTML data-* attribute.
      if (typeof $(el).attr('data-idc-config') !== 'undefined') {
        $.extend(el.settings, JSON.parse($(el).attr('data-idc-config')));
      }
      // Map embeds linked sources in layerConfig. Need to add them to settings
      // in their own right so that maps can be treated same as other data
      // consumers.
      el.settings.source = {};
      $.each(el.settings.layerConfig, function eachLayer() {
        if (this.type !== 'WMS') {
          el.settings.source[this.source] = typeof this.title === 'undefined' ? this.source : this.title;
        }
      })
;      // Apply settings passed to the constructor.
      if (typeof options !== 'undefined') {
        $.extend(el.settings, options);
      }
      // Store initial viewport as configured, before being affected by cookies.
      el.settings.configuredLat = el.settings.initialLat;
      el.settings.configuredLng = el.settings.initialLng;
      el.settings.configuredZoom = el.settings.initialZoom;
      // Apply settings stored in cookies.
      if (el.settings.cookies) {
        $.extend(el.settings, loadSettingsFromCookies([
          'initialLat',
          'initialLng',
          'initialZoom',
          'baseLayer',
          'layerState'
        ]));
      }
      el.map = L.map(el.id).setView([el.settings.initialLat, el.settings.initialLng], el.settings.initialZoom);
      baseMaps = {
        OpenStreetMap: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
        OpenTopoMap: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
          maxZoom: 17,
          attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
            '<a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> ' +
            '(<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA</a>)'
        })
      };
      // Add the active base layer to the map.
      baseMaps[el.settings.baseLayer].addTo(el.map);
      $.each(el.settings.layerConfig, function eachLayer(id, layer) {
        var group;
        var wmsOptions;
        if (layer.type === 'WMS') {
          wmsOptions = {
            layers: layer.layer,
            format: 'image/png',
            transparent: true
          };
          if (typeof layer.wmsOptions !== 'undefined') {
            $.extend(wmsOptions, layer.wmsOptions);
          }
          group = L.tileLayer.wms(layer.sourceUrl, wmsOptions);
        } else {
          if (layer.type && layer.type === 'heat') {
            group = L.heatLayer([], $.extend({ radius: 10 }, layer.style ? layer.style : {}));
          } else {
            group = L.featureGroup();
          }
          group.on('add', function addEvent() {
            onAddLayer(el, this, id);
          });
          group.on('remove', function removeEvent() {
            onRemoveLayer(el, id);
          });
        }
        // Leaflet wants layers keyed by title.
        overlays[typeof layer.title === 'undefined' ? id : layer.title] = group;
        // Plugin wants them keyed by source ID.
        el.outputLayers[id] = group;
        // Add the group to the map
        if (layerEnabled(el, id, this)) {
          group.addTo(el.map);
        }
      });
      layersControl = L.control.layers(baseMaps, overlays);
      layersControl.addTo(el.map);
      el.map.on('zoomend', function zoomEnd() {
        if (selectedRowMarker !== null) {
          ensureFeatureClear(el, selectedRowMarker);
        }
      });
      el.map.on('moveend', function moveEnd() {
        $.each(callbacks.moveend, function eachCallback() {
          this(el);
        });
        if (typeof $.cookie !== 'undefined' && el.settings.cookies) {
          $.cookie('initialLat', el.map.getCenter().lat);
          $.cookie('initialLng', el.map.getCenter().lng);
          $.cookie('initialZoom', el.map.getZoom());
        }
      });
      if (typeof $.cookie !== 'undefined' && el.settings.cookies) {
        el.map.on('baselayerchange', function baselayerchange(layer) {
          $.cookie('baseLayer', layer.name);
        });
      }
    },

    /*
     * Populate the map with Elasticsearch response data.
     *
     * @param obj sourceSettings
     *   Settings for the data source used to generate the response.
     * @param obj response
     *   Elasticsearch response data.
     * @param obj data
     *   Data sent in request.
     */
    populate: function populate(sourceSettings, response) {
      var el = this;
      var layers = getLayersForSource(el, sourceSettings.id);
      var bounds;
      $.each(layers, function eachLayer() {
        if (this.clearLayers) {
          this.clearLayers();
        } else {
          this.setLatLngs([]);
        }
      });

      // Are there document hits to map?
      $.each(response.hits.hits, function eachHit() {
        var latlon = this._source.location.point.split(',');
        addFeature(el, sourceSettings.id, latlon, this._source.location.coordinate_uncertainty_in_meters);
      });
      // Are there aggregations to map?
      if (typeof response.aggregations !== 'undefined') {
        if (sourceSettings.aggregationMapMode === 'geoHash') {
          mapGeoHashAggregation(el, response, sourceSettings);
        } else if (sourceSettings.aggregationMapMode === 'gridSquare') {
          mapGridSquareAggregation(el, response, sourceSettings);
        }
      }
      if (sourceSettings.initialMapBounds && !el.settings.initialBoundsSet && layers.length > 0 && layers[0].getBounds) {
        bounds = layers[0].getBounds();
        if (bounds.isValid()) {
          el.map.fitBounds(layers[0].getBounds());
          el.settings.initialBoundsSet = true;
        }
      }
    },

    /**
     * Binds to dataGrid callbacks.
     *
     * Binds to event handlers for row click (to select feature) and row double
     * click (to also zoom in).
     */
    bindGrids: function bindGrids() {
      var el = this;
      var settings = $(el)[0].settings;
      if (typeof settings.showSelectedRow !== 'undefined') {
        if ($('#' + settings.showSelectedRow).length === 0) {
          indiciaFns.controlFail(el, 'Invalid grid ID in @showSelectedRow parameter');
        }
        $('#' + settings.showSelectedRow).idcDataGrid('on', 'rowSelect', function onRowSelect(tr) {
          rowSelected(el, tr, false);
        });
        $('#' + settings.showSelectedRow).idcDataGrid('on', 'rowDblClick', function onRowDblClick(tr) {
          rowSelected(el, tr, true);
        });
      }
    },

    /**
     * Clears the selected feature boundary (e.g. a selected location).
     */
    clearFeature: function clearFeature() {
      if (selectedFeature) {
        selectedFeature.removeFrom(this.map);
        selectedFeature = null;
      }
    },

    /**
     * Shows a selected feature boundary (e.g. a selected location).
     * */
    showFeature: function showFeature(geom, zoom) {
      if (selectedFeature) {
        selectedFeature.removeFrom(this.map);
        selectedFeature = null;
      }
      selectedFeature = showFeatureWkt(this, geom, zoom, {
        color: '#3333DD',
        fillColor: '#4444CC',
        fillOpacity: 0.05
      });
    },

    /**
     * Reset to the initial viewport (pan/zoom).
     */
    resetViewport: function resetViewport() {
      this.map.setView([this.settings.configuredLat, this.settings.configuredLng], this.settings.configuredZoom);
    },

    /**
     * Hook up event handlers.
     */
    on: function on(event, handler) {
      if (typeof callbacks[event] === 'undefined') {
        indiciaFns.controlFail(this, 'Invalid event handler requested for ' + event);
      }
      callbacks[event].push(handler);
    },

    /**
     * If using auto-sized grids, size of the grid recommended for current map zoom.
     *
     * Value in m.
     */
    getAutoSquareSize: function getAutoSquareSize() {
      var kms = autoGridSquareKms(this);
      return kms * 1000;
    },

    /**
     * If using auto-sized grids, name of the field holding the grid coordinates appropriate to current map zoom.
     *
     * Value in km.
     */
    getAutoSquareField: function getAutoSquareField() {
      var kms = autoGridSquareKms(this);
      return 'location.grid_square.' + kms + 'km.centre';
    },

    /**
     * Maps repopulate from a source only if layer enabled.
     */
    getNeedsPopulation: function getNeedsPopulation(source) {
      var needsPopulation = false;
      var el = this;
      $.each(getLayersForSource(el, source.settings.id), function eachLayer() {
        needsPopulation = el.map.hasLayer(this);
        // can abort loop once we have a hit.
        return !needsPopulation;
      });
      return needsPopulation;
      // @todo Disable layer if source linked to grid and no row selected.
    }
  };

  /**
   * Extend jQuery to declare leafletMap method.
   */
  $.fn.idcLeafletMap = function buildLeafletMap(methodOrOptions) {
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
      $.error('Method ' + methodOrOptions + ' does not exist on jQuery.idcLeafletMap');
      return true;
    });
    // If the method has no explicit response, return this to allow chaining.
    return typeof result === 'undefined' ? this : result;
  };
}());
