// preferCanvas draws every shape on one canvas instead of one web page element each.
const map = L.map('map', { preferCanvas: true }).setView([45.55, -73.65], 11);
 
// The OpenStreetMap basemap, slightly faded so the heat colours stand out on top of it.
// (opacity: 1 is full strength; lower numbers fade it more.)
const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  opacity: 0.6,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
streets.addTo(map);
 
// Heat colours: from coolest (yellow) to hottest (dark red). The notebook uses the same list for the zones image.
const heatColours = ['#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];
const treeColour = '#1a9641';

// What appears at which zoom. (11 = whole island, 13 = a few neighbourhoods, 15 = a few streets, 19 = closest)
const ZONE_ZOOM = 13;   // heat zones from here
const TREE_ZOOM = 15;   // trees from here

// The heat zones image goes in its own pane UNDER the boroughs and trees (350 is below Leaflet's 400),
// so the borough outlines and tree dots stay on top and stay clickable.
map.createPane('zonesPane').style.zIndex = 350;
 
function setStatus(text) {
  document.getElementById('status').textContent = text;
}

// Download a JSON file, with a clear error if it's missing.
function getJSON(url) {
  return fetch(url).then(function (response) {
    if (!response.ok) { throw new Error('HTTP ' + response.status + ' loading ' + url); }
    return response.json();
  });
}
 
const zonesLayer = L.layerGroup();   // holds the zones image while zoomed in
zonesLayer.addTo(map);
const treesLayer = L.layerGroup();   // holds the trees on screen
treesLayer.addTo(map);
const treeCache = {};                // tree squares already downloaded
let heatLayer = null;                // filled in once the files below have loaded
let zoneImage = null;
let treeGrid = null;                 // square size and the list of squares that have trees
let requestNumber = 0;               // used to ignore downloads that finish after you've already moved on
 
 
// ---------- START-UP: three small files, loaded together ----------
Promise.all([
  getJSON('../data/heat_island/heat_by_borough.geojson'),
  getJSON('../data/heat_island/heat_zones.json'),
  getJSON('../data/tree_tiles/index.json')
])
  .then(function (results) {
    const data = results[0];       // the 19 boroughs
    const zoneInfo = results[1];   // where the zones image goes, and its temperature classes
    treeGrid = results[2];
    treeGrid.available = new Set(treeGrid.tiles);

    // Colour breaks by rank: the coolest fifth of boroughs gets colour 1, the hottest fifth colour 5.
    // With only 19 boroughs, this shows the differences much better than equal steps.
    const temps = data.features
      .map(function (f) { return Number(f.properties.temp_mean); })
      .filter(function (v) { return !isNaN(v); })
      .sort(function (a, b) { return a - b; });
    const breaks = heatColours.map(function (c, i) {
      return temps[Math.floor(temps.length * i / heatColours.length)];
    });   // the lowest temperature in each colour group
 
    function heatColour(value) {
      if (value == null || isNaN(Number(value))) { return '#999999'; }
      let i = 0;
      while (i < breaks.length - 1 && Number(value) >= breaks[i + 1]) { i++; }
      return heatColours[i];
    }
 
    function boroughStyle(feature) {
      return {
        color: '#ffffff',
        weight: 1.5,
        fillOpacity: 0.8,
        fillColor: heatColour(feature.properties.temp_mean)
      };
    }
 
    heatLayer = L.geoJSON(data, {
      style: boroughStyle,
      onEachFeature: function (feature, layer) {
        const p = feature.properties;
        layer.bindPopup('<strong>' + p.NOM + '</strong><br>' +
          'Average surface temperature: ' + p.temp_mean + ' °C<br>' +
          'Area classed as heat island: ' + p.pct_heat_island + ' %<br>' +
          'Public trees: ' + p.tree_count + ' (' + p.trees_per_km2 + ' per km²)');
      }
    });
    heatLayer.addTo(map);

    // The heat zones: one picture, placed on the map by its corners. Shown only when zoomed in.
    zoneImage = L.imageOverlay('../data/heat_island/heat_zones.png', zoneInfo.bounds, {
      pane: 'zonesPane',
      opacity: 0.75
    });
 
    // Legend: borough colours, zone colours (same colours, their own ranges), and trees.
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'legend');
      const boroughRows = heatColours.map(function (colour, i) {
        const from = breaks[i].toFixed(1);
        const to = i < breaks.length - 1 ? breaks[i + 1].toFixed(1) : temps[temps.length - 1].toFixed(1);
        return '<span style="background:' + colour + '"></span>' + from + ' to ' + to + ' °C';
      });
      const zoneRows = heatColours.map(function (colour, i) {
        return '<span style="background:' + colour + '"></span>' +
          zoneInfo.lows[i].toFixed(1) + ' to ' + zoneInfo.highs[i].toFixed(1) + ' °C';
      });
      div.innerHTML = '<strong>Borough average temperature</strong><br>' + boroughRows.join('<br>') +
        '<br><strong>Heat zones (zoom in)</strong><br>' + zoneRows.join('<br>') +
        '<br><span style="background:' + treeColour + '"></span>Public tree (zoom in further)';
      return div;
    };
    legend.addTo(map);

    // Layer switcher: the basemap on top, then checkboxes to turn each layer on and off.
    L.control.layers(
      { 'Streets': streets },
      {
        'Average temperature by borough': heatLayer,
        'Heat zones (zoom in to see)': zonesLayer,
        'Public trees (zoom in further)': treesLayer
      },
      { collapsed: false }
    ).addTo(map);
 
    updateMap();   // in case the map starts zoomed in
  })
  .catch(function (err) {
    setStatus('Could not load the map data. Open the console (F12) for details.');
    console.error(err);
  });
 
 
// ---------- HEAT ZONES AND TREES: shown by zoom ----------

// Every time the map stops moving or zooming, and when a layer is ticked or unticked, refresh.
map.on('moveend', updateMap);
map.on('overlayadd overlayremove', updateMap);

function updateMap() {
  if (!heatLayer) { return; }   // start-up files not loaded yet
  const zoom = map.getZoom();
  const showZones = zoom >= ZONE_ZOOM && map.hasLayer(zonesLayer);
  const showTrees = zoom >= TREE_ZOOM && map.hasLayer(treesLayer);

  // Boroughs: full colour when zoomed out, only their outlines once the zones take over.
  heatLayer.setStyle({ fillOpacity: showZones ? 0 : (zoom >= TREE_ZOOM ? 0.35 : 0.8) });

  // Zones: add the picture once, fade it a little when the trees are on top.
  if (showZones) {
    if (!zonesLayer.hasLayer(zoneImage)) {
      zonesLayer.addLayer(zoneImage);
      zoneImage.getElement().style.imageRendering = 'pixelated';   // sharp squares instead of a blur
    }
    zoneImage.setOpacity(zoom >= TREE_ZOOM ? 0.5 : 0.75);
  } else {
    zonesLayer.clearLayers();
  }

  if (!showTrees) {
    treesLayer.clearLayers();
    setStatus(zoom < ZONE_ZOOM ? 'Zoom in to see the heat zones.' : 'Zoom in further to see the public trees.');
    return;
  }

  // The area on screen, plus a margin of 10% so small pans don't show an empty edge,
  // and the tree squares that touch it.
  const view = map.getBounds().pad(0.1);
  const tiles = tilesFor(view);

  // Download the squares we don't have yet, all at the same time (each one only once).
  const thisRequest = ++requestNumber;
  const missing = tiles.filter(function (t) { return !treeCache[t]; });
  if (missing.length) { setStatus('Loading trees...'); }

  Promise.all(missing.map(function (t) {
    return getJSON('../data/tree_tiles/' + t + '.geojson')
      .catch(function (err) {
        console.warn(err.message);
        return { type: 'FeatureCollection', features: [] };
      })
      .then(function (data) { treeCache[t] = data; });
  })).then(function () {
    if (thisRequest !== requestNumber) { return; }   // the map moved again while downloading
    drawTrees(tiles, view);
  });
}

// The names of the grid squares that touch the view and actually contain trees.
// The names match the notebook: "column_row", where column = floor(longitude / width).
function tilesFor(view) {
  const w = treeGrid.tile_w;
  const h = treeGrid.tile_h;
  const tiles = [];
  for (let col = Math.floor(view.getWest() / w); col <= Math.floor(view.getEast() / w); col++) {
    for (let row = Math.floor(view.getSouth() / h); row <= Math.floor(view.getNorth() / h); row++) {
      const name = col + '_' + row;
      if (treeGrid.available.has(name)) { tiles.push(name); }
    }
  }
  return tiles;
}

function drawTrees(tiles, view) {
  // Keep only the trees inside the area on screen.
  const visible = [];
  tiles.forEach(function (t) {
    treeCache[t].features.forEach(function (f) {
      const c = f.geometry.coordinates;   // GeoJSON order: [longitude, latitude]
      if (view.contains([c[1], c[0]])) { visible.push(f); }
    });
  });

  treesLayer.clearLayers();   // remove the trees from the previous view
  L.geoJSON({ type: 'FeatureCollection', features: visible }, {
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, {
        radius: 2.5,
        weight: 0,
        fillOpacity: 0.8,
        fillColor: treeColour
      });
    },
    onEachFeature: function (feature, layer) {
      const p = feature.properties;
      layer.bindPopup('<strong>' + (p.Essence_ang || 'Unknown species') + '</strong><br>' +
        'Trunk diameter (DHP): ' + (p.DHP != null ? p.DHP + ' cm' : 'Not Recorded') + '<br>' +
        'Planted: ' + (p.Date_Plantation || 'Not Recorded'));   // the notebook already removed the time
    }
  }).addTo(treesLayer);
 
  setStatus(visible.length + ' public trees in view.');
}