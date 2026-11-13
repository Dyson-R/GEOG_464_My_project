// ---------- TELLING THE READER WHEN SOMETHING DIDN'T LOAD ----------
// Each problem gets a key, so fixing one (e.g. trees load on the next try) doesn't hide another.
// The message shows in the status line and in a box on top of the map.
const problems = {};
let normalStatus = '';   // the latest normal status message ("Zoom in to see…", "120 public trees in view.")

function setProblem(key, text) {
  if (text) { problems[key] = text; } else { delete problems[key]; }
  const messages = Object.keys(problems).map(function (k) { return problems[k]; });

  const mapDiv = document.getElementById('map');
  let box = document.getElementById('map-message');
  if (!messages.length) {
    if (box) { box.remove(); }
    showStatus();   // back to the normal status message
    return;
  }
  if (!box && mapDiv) {
    box = document.createElement('div');
    box.id = 'map-message';
    box.setAttribute('role', 'alert');   // screen readers read it out
    box.style.cssText = 'position:absolute; z-index:1000; top:12px; left:50%; transform:translateX(-50%);' +
      'max-width:80%; padding:10px 14px; background:#ffffff; color:#1b1f2a; border:2px solid #bd0026;' +
      'border-radius:6px; font:14px/1.4 system-ui, sans-serif; box-shadow:0 2px 8px rgba(0,0,0,0.25);';
    if (getComputedStyle(mapDiv).position === 'static') { mapDiv.style.position = 'relative'; }
    mapDiv.appendChild(box);
  }
  if (box) { box.textContent = messages.join(' '); }
  showStatus();
}

// The status line shows any problem first, so moving the map can't hide it; otherwise the normal message.
function showStatus() {
  const messages = Object.keys(problems).map(function (k) { return problems[k]; });
  const status = document.getElementById('status');
  if (status) { status.textContent = messages.length ? messages.join(' ') : normalStatus; }
}


// If the map library itself didn't load, say so in words instead of leaving a blank page.
if (typeof L === 'undefined') {
  setProblem('library', 'The map could not be loaded because the map library (Leaflet) did not download. ' +
    'Check your internet connection and reload the page.');
  throw new Error('Leaflet did not load');
}

// Phones and small screens: a smaller legend and layer switcher, and easier-to-tap trees.
const SMALL_SCREEN = window.matchMedia('(max-width: 700px)').matches;   // narrow screen, like a phone
const TOUCH = window.matchMedia('(pointer: coarse)').matches;           // tapped with a finger, not a mouse

// preferCanvas draws every shape on one canvas instead of one web page element each.
// tolerance makes the tappable area around each shape bigger than the shape itself (in pixels),
// so small tree dots are easy to hit with a finger without drawing them bigger.
const START_CENTER = [45.55, -73.65];   // where the map opens, and where "Reset view" goes back to
const START_ZOOM = 11;
const map = L.map('map', {
  preferCanvas: true,
  renderer: L.canvas({ tolerance: TOUCH ? 12 : 3 })
}).setView(START_CENTER, START_ZOOM);

// "Reset view" button and borough menu, under the zoom buttons.
let boroughMenu = null;   // the drop-down menu, filled with borough names once the boroughs load
const resetControl = L.control({ position: 'topleft' });
resetControl.onAdd = function () {
  const bar = L.DomUtil.create('div', 'leaflet-bar reset-view');
  const button = L.DomUtil.create('button', '', bar);
  button.type = 'button';
  // The ⟲ symbol always shows; the words "Reset view" are hidden on phones to leave room for the menu.
  button.innerHTML = '<span aria-hidden="true">⟲</span><span class="reset-label"> Reset view</span>';
  button.setAttribute('aria-label', 'Reset view');
  button.title = 'Unselect the borough and go back to the whole island';
  button.addEventListener('click', resetView);

  // Drop-down menu: picking a borough does the same as clicking it in the chart.
  boroughMenu = L.DomUtil.create('select', '', bar);
  boroughMenu.setAttribute('aria-label', 'Select a borough');
  boroughMenu.innerHTML = '<option value="" disabled selected>Select a borough</option>';
  boroughMenu.disabled = true;   // until the boroughs have loaded
  boroughMenu.addEventListener('change', function () {
    if (boroughMenu.value) { selectBorough(boroughMenu.value, true); }
  });

  L.DomEvent.disableClickPropagation(bar);    // using the button or menu doesn't also click the map
  L.DomEvent.disableScrollPropagation(bar);
  return bar;
};
resetControl.addTo(map);

// Put the borough names in the menu, in alphabetical order (French accents sorted correctly).
function fillBoroughMenu(features) {
  if (!boroughMenu) { return; }
  features
    .map(function (f) { return f.properties.NOM; })
    .sort(function (a, b) { return a.localeCompare(b, 'fr'); })
    .forEach(function (name) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      boroughMenu.appendChild(option);
    });
  boroughMenu.disabled = false;
}

function resetView() {
  selectedName = null;
  if (heatLayer) { heatLayer.setStyle(boroughStyle); }   // remove the dark outline
  document.querySelectorAll('.chart-row.selected').forEach(function (row) {
    row.classList.remove('selected');                     // remove the chart highlight
  });
  if (boroughMenu) { boroughMenu.value = ''; }            // menu back to "Select a borough"
  map.closePopup();
  map.setView(START_CENTER, START_ZOOM);
}
 
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
  normalStatus = text;
  showStatus();
}

// Download a JSON file. If it fails (missing, blocked, or no connection), the error names the file.
function getJSON(url) {
  const file = url.split('/').pop();
  return fetch(url)
    .then(function (response) {
      if (!response.ok) { throw new Error('HTTP ' + response.status); }
      return response.json();
    })
    .catch(function (err) {
      const problem = new Error(file + ' did not load (' + err.message + ')');
      problem.file = file;
      throw problem;
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

// Borough chart and selection
const TREE_DATA_MIN = 50;            // under 50 trees per km² means the borough isn't in the tree inventory
let selectedName = null;             // the borough picked last, on the map or in the chart
const boroughLayers = {};            // borough name -> its shape on the map
let boroughStyle = null;             // the style function, filled in once the boroughs load

function hasTreeData(p) {
  return Number(p.trees_per_km2) >= TREE_DATA_MIN;
}
 
 
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
 
    // Each borough's look: its heat colour, a dark thick outline if selected,
    // and a fill that fades as you zoom in (see boroughFill below).
    boroughStyle = function (feature) {
      const selected = feature.properties.NOM === selectedName;
      return {
        color: selected ? '#1b1f2a' : '#ffffff',
        weight: selected ? 3 : 1.5,
        fillOpacity: boroughFill(),
        fillColor: heatColour(feature.properties.temp_mean)
      };
    };
 
    heatLayer = L.geoJSON(data, {
      style: boroughStyle,
      onEachFeature: function (feature, layer) {
        const p = feature.properties;
        layer.bindPopup('<strong>' + p.NOM + '</strong><br>' +
          'Avg. surface temperature: ' + Number(p.temp_mean).toFixed(1) + ' °C<br>' +
          'Area classed as heat island: ' + p.pct_heat_island + ' %<br>' +
          'Public trees: ' + (hasTreeData(p)
            ? p.tree_count + ' (' + p.trees_per_km2 + ' per km²)'
            : 'No data (not in the City’s tree inventory)'));

        boroughLayers[p.NOM] = layer;
        // Clicking a borough on the map highlights it here and in the chart (the popup opens on its own).
        layer.on('click', function () { selectBorough(p.NOM, false); });
      }
    });
    heatLayer.addTo(map);

    // The heat zones: one picture, placed on the map by its corners. Shown only when zoomed in.
    zoneImage = L.imageOverlay('../data/heat_island/heat_zones.png', zoneInfo.bounds, {
      pane: 'zonesPane',
      opacity: 0.75
    });
    zoneImage.on('error', function () {
      setProblem('zones', 'The heat zones image (heat_zones.png) did not load, so the detailed heat zones ' +
        'cannot be shown. The borough colours are still correct. Reload the page to try again.');
    });
    zoneImage.on('load', function () { setProblem('zones', null); });
 
    // Legend: borough colours, zone colours (same colours, their own ranges), and trees.
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'legend');
      L.DomEvent.disableClickPropagation(div);    // tapping the legend doesn't click the map under it
      L.DomEvent.disableScrollPropagation(div);   // scrolling inside it doesn't zoom the map

      // A button to show or hide the legend. Hidden at first on small screens, shown on large ones.
      const toggle = L.DomUtil.create('button', 'legend-toggle', div);
      toggle.type = 'button';
      const body = L.DomUtil.create('div', 'legend-body', div);
      function setOpen(open) {
        body.hidden = !open;
        toggle.textContent = open ? 'Legend ▾' : 'Legend ▸';
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      toggle.addEventListener('click', function () { setOpen(body.hidden); });

      const boroughRows = heatColours.map(function (colour, i) {
        const from = breaks[i].toFixed(1);
        const to = i < breaks.length - 1 ? breaks[i + 1].toFixed(1) : temps[temps.length - 1].toFixed(1);
        return '<span style="background:' + colour + '"></span>' + from + ' to ' + to + ' °C';
      });
      const zoneRows = heatColours.map(function (colour, i) {
        return '<span style="background:' + colour + '"></span>' +
          zoneInfo.lows[i].toFixed(1) + ' to ' + zoneInfo.highs[i].toFixed(1) + ' °C';
      });
      body.innerHTML = '<strong>Avg. surface temperature</strong><br>' + boroughRows.join('<br>') +
        '<br><strong>Heat zones (zoom in)</strong><br>' + zoneRows.join('<br>') +
        '<br><span style="background:' + treeColour + '"></span>Public tree (zoom in further)';
      setOpen(!SMALL_SCREEN);
      return div;
    };
    legend.addTo(map);

    // Layer switcher: the basemap on top, then checkboxes to turn each layer on and off.
    L.control.layers(
      { 'Streets': streets },
      {
        'Avg. surface temperature': heatLayer,
        'Heat zones (zoom in to see)': zonesLayer,
        'Public trees (zoom in further)': treesLayer
      },
      { collapsed: SMALL_SCREEN }   // on phones, a small icon you tap to open
    ).addTo(map);
 
    buildChart(data.features, heatColour);
    fillBoroughMenu(data.features);
    updateMap();   // in case the map starts zoomed in
  })
  .catch(function (err) {
    setProblem('startup', 'The map data did not load (' + (err.file || 'a data file') + '), so the boroughs, ' +
      'heat zones and trees cannot be shown. Check your internet connection and reload the page.');
    const chart = document.getElementById('chart');
    if (chart) { chart.textContent = 'The chart is not available because the borough data did not load.'; }
    console.error(err);
  });
 
 
// ---------- BOROUGH CHART ----------

// How solid the borough colours are: full when zoomed out, clear once the zones show, light under the trees.
function boroughFill() {
  const zoom = map.getZoom();
  if (zoom >= ZONE_ZOOM && map.hasLayer(zonesLayer)) { return 0; }
  return zoom >= TREE_ZOOM ? 0.35 : 0.8;
}

// One bar per borough, hottest at the top, in the same colours as the map.
function buildChart(features, heatColour) {
  const chart = document.getElementById('chart');
  if (!chart) { return; }   // no chart box in index.html

  const rows = features
    .filter(function (f) { return !isNaN(Number(f.properties.temp_mean)); })
    .sort(function (a, b) { return b.properties.temp_mean - a.properties.temp_mean; });

  // Bars start 1 °C below the coolest borough, so the differences are visible.
  const max = rows[0].properties.temp_mean;
  const low = Math.floor(rows[rows.length - 1].properties.temp_mean) - 1;

  chart.innerHTML = '<div class="chart-head"><span>Borough</span><span>Avg. surface temperature</span>' +
    '<span></span><span>Trees / km²</span></div>';

  rows.forEach(function (f) {
    const p = f.properties;
    const width = 100 * (p.temp_mean - low) / (max - low);
    const row = document.createElement('button');   // a button, so it also works with the keyboard
    row.type = 'button';
    row.className = 'chart-row';
    row.dataset.name = p.NOM;
    row.innerHTML =
      '<span class="chart-name" title="' + p.NOM + '">' + p.NOM + '</span>' +
      '<span class="chart-track"><span class="chart-bar" style="width:' + width + '%; background:' +
        heatColour(p.temp_mean) + '"></span></span>' +
      '<span class="chart-temp">' + Number(p.temp_mean).toFixed(1) + ' °C</span>' +
      '<span class="chart-trees">' + (hasTreeData(p)
        ? Number(p.trees_per_km2).toLocaleString('en-CA')
        : '<em>No data</em>') + '</span>';
    row.addEventListener('click', function () { selectBorough(p.NOM, true); });
    chart.appendChild(row);
  });

}

// Pick a borough, from the chart (zoom to it) or from the map (you're already looking at it).
// A new pick always replaces the old one, so the map and the chart point at the same borough.
function selectBorough(name, fromChart) {
  selectedName = name;
  heatLayer.setStyle(boroughStyle);   // move the dark outline

  // Show the same borough in the menu, whichever way it was picked (map, chart or menu).
  if (boroughMenu) { boroughMenu.value = name; }

  // Highlight the borough's row in the chart, without scrolling the page to it.
  document.querySelectorAll('.chart-row').forEach(function (row) {
    row.classList.toggle('selected', row.dataset.name === name);
  });

  if (fromChart) {
    if (!map.hasLayer(heatLayer)) { heatLayer.addTo(map); }   // turn the boroughs back on if they were off
    const layer = boroughLayers[name];
    // Zoom so the whole borough fits, but never past the borough-colour level (zoom 12),
    // so small boroughs don't jump straight to the heat zones.
    const bounds = layer.getBounds();
    const zoom = Math.min(map.getBoundsZoom(bounds), ZONE_ZOOM - 1);

    // Open the popup first: opening it can nudge the map to make room for it.
    // Then centre the map on the borough, so it ends up in the middle of the map.
    layer.openPopup();
    map.setView(bounds.getCenter(), zoom);
  }
}


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
  heatLayer.setStyle(boroughStyle);

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
    if (problems.trees) { setProblem('trees', null); }
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

  let failed = 0;
  Promise.all(missing.map(function (t) {
    return getJSON('../data/tree_tiles/' + t + '.geojson')
      .then(function (data) { treeCache[t] = data; })
      .catch(function (err) {
        failed++;                 // not saved, so the next move tries this square again
        console.warn(err.message);
      });
  })).then(function () {
    if (thisRequest !== requestNumber) { return; }   // the map moved again while downloading
    drawTrees(tiles.filter(function (t) { return treeCache[t]; }), view);
    setProblem('trees', failed
      ? 'Some public trees did not load, so trees may be missing from this view. Move the map or reload the page to try again.'
      : null);
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
        radius: TOUCH ? 4 : 2.5,   // a little bigger on touch screens
        weight: 0,
        fillOpacity: 0.8,
        fillColor: treeColour
      });
    },
    onEachFeature: function (feature, layer) {
      const p = feature.properties;

      // Computers only (phones have no hover): when the mouse is over a tree, make the dot bigger
      // with a dark outline, and show its species with "Click for details", so people know it's clickable.
      if (!TOUCH) {
        const radius = layer.getRadius();
        layer.bindTooltip((p.Essence_ang || 'Unknown species') + '<br><em>Click for details</em>', {
          direction: 'top',
          offset: [0, -6]
        });
        layer.on('mouseover', function () {
          layer.setRadius(radius + 2);
          layer.setStyle({ weight: 2, color: '#1b1f2a' });
        });
        layer.on('mouseout', function () {
          layer.setRadius(radius);
          layer.setStyle({ weight: 0 });
        });
        layer.on('click', function () { layer.closeTooltip(); });   // the popup takes over
      }

      layer.bindPopup('<strong>' + (p.Essence_ang || 'Unknown species') + '</strong><br>' +
        'Trunk diameter (DBH): ' + (p.DHP != null ? p.DHP + ' cm' : 'Not recorded') + '<br>' +
        'Planted: ' + (p.Date_Plantation || 'Not recorded'));   // the notebook already removed the time
    }
  }).addTo(treesLayer);
 
  // The tree count, plus a tip saying the trees can be clicked (or tapped, on phones).
  setStatus(visible.length.toLocaleString('en-CA') + ' public trees in view. ' +
    (TOUCH ? 'Tap' : 'Click') + ' a tree to see its details.');
}