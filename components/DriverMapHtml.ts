// Self-contained MapLibre GL JS HTML page rendered inside a react-native-webview.
// Communicates with the React Native side via window.postMessage / ReactNativeWebView.postMessage.

import {
  bicycleDataUri,
  motorbikeDataUri,
  economyDataUri,
  closed_truckDataUri,
  open_truckDataUri,
  refrigerated_truckDataUri,
  xxlDataUri,
} from './vehicleIconsBase64';

// Vehicle type -> image source. The WebView loads inline HTML and cannot resolve
// bundled asset paths, so the icons are inlined as base64 data URIs. This
// guarantees the icon always loads regardless of network state.
const VEHICLE_IMAGE_MAP: Record<string, string> = {
  bicycle: bicycleDataUri,
  motorbike: motorbikeDataUri,
  economy: economyDataUri,
  car: economyDataUri,
  truck: closed_truckDataUri,
  closed_truck: closed_truckDataUri,
  open_truck: open_truckDataUri,
  refrigerated_truck: refrigerated_truckDataUri,
  bus: xxlDataUri,
  xxl: xxlDataUri,
};

export function getMapHtml(initialLat: number, initialLng: number): string {
  const vehicleMapJson = JSON.stringify(VEHICLE_IMAGE_MAP);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
  <script src="https://unpkg.com/@mapbox/polyline@1.1.1/src/polyline.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #map { position: absolute; top: 0; bottom: 0; left: 0; right: 0; }

    /* Vehicle marker */
    .vehicle-marker { width: 44px; height: 44px; }
    .vehicle-marker img { width: 44px; height: 44px; object-fit: contain; transition: transform 0.2s ease; }

    /* Map markers */
    .map-marker { display: flex; align-items: center; justify-content: center; }
    .marker-pickup {
      width: 22px; height: 22px; border-radius: 50%;
      background: #5B2EFF; border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .marker-store {
      width: 22px; height: 22px; border-radius: 50%;
      background: #F59E0B; border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .marker-dropoff {
      width: 26px; height: 26px;
      background: #5B2EFF; border: 3px solid #fff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .marker-stop {
      width: 24px; height: 24px; border-radius: 50%;
      background: #5B2EFF; border: 3px solid #fff;
      color: #fff; font-size: 12px; font-weight: 700;
      font-family: -apple-system, system-ui, sans-serif;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }

    /* Arrival card (pill + pointer) */
    .arrival-card-wrapper {
      width: fit-content;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    .arrival-card-pill {
      background: #5B2EFF;
      color: #fff;
      font-family: -apple-system, system-ui, sans-serif;
      font-size: 14px;
      font-weight: 700;
      padding: 8px 14px;
      border-radius: 9999px;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .arrival-card-pointer {
      width: 0; height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 7px solid #5B2EFF;
      margin-top: -1px;
    }

    @keyframes bounceIn {
      0% { transform: scale(0) translateY(-20px); opacity: 0; }
      60% { transform: scale(1.2) translateY(0); opacity: 1; }
      100% { transform: scale(1) translateY(0); opacity: 1; }
    }
    .bounce-in { animation: bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
    /* dropoff is rotated, animate without overriding the rotation transform */
    @keyframes bounceInDrop {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    .marker-dropoff.bounce-in { animation: bounceInDrop 0.5s ease; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var VEHICLE_IMAGE_MAP = ${vehicleMapJson};
    var DEFAULT_VEHICLE = VEHICLE_IMAGE_MAP['economy'];

    var map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }]
      },
      center: [${initialLng}, ${initialLat}],
      zoom: 14,
      attributionControl: false
    });

    // ---- State ----
    var vehicleMarker = null;
    var vehicleEl = null;
    var vehicleImg = null;
    var vehicleAnimFrame = null;
    var currentCoords = [];   // [[lng, lat], ...] current decoded polyline
    var markersMap = {};      // id -> maplibregl.Marker
    var arrivalCardMarker = null; // arrival "Arrive by ..." pill marker

    function postToRN(obj) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    }

    // ---- Vehicle marker (create + smooth animate) ----
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function updateVehicle(lat, lng, heading, vehicleType) {
      var imgUrl = (vehicleType && VEHICLE_IMAGE_MAP[vehicleType]) ? VEHICLE_IMAGE_MAP[vehicleType] : DEFAULT_VEHICLE;

      if (!vehicleMarker) {
        vehicleEl = document.createElement('div');
        vehicleEl.className = 'vehicle-marker';
        vehicleImg = document.createElement('img');
        vehicleImg.src = imgUrl;
        // Rotate the icon to face the direction of travel. Icons are authored
        // pointing north-up, so heading (degrees clockwise from north) maps
        // directly to a CSS rotation. The .vehicle-marker img transition rule
        // animates this smoothly.
        vehicleImg.style.transform = 'rotate(' + (heading || 0) + 'deg)';
        vehicleEl.appendChild(vehicleImg);
        vehicleMarker = new maplibregl.Marker({ element: vehicleEl })
          .setLngLat([lng, lat])
          .addTo(map);
        return;
      }

      // keep image in sync if vehicle type changed
      if (vehicleImg && vehicleImg.src !== imgUrl) {
        vehicleImg.src = imgUrl;
      }

      // Apply rotation on every update so the vehicle keeps facing its heading.
      if (vehicleImg) {
        vehicleImg.style.transform = 'rotate(' + (heading || 0) + 'deg)';
      }

      var start = vehicleMarker.getLngLat();
      var startLng = start.lng;
      var startLat = start.lat;
      var endLng = lng;
      var endLat = lat;
      var duration = 1000;
      var startTime = null;

      if (vehicleAnimFrame) cancelAnimationFrame(vehicleAnimFrame);

      function step(ts) {
        if (startTime === null) startTime = ts;
        var elapsed = ts - startTime;
        var t = Math.min(elapsed / duration, 1);
        var e = easeOutCubic(t);
        var curLng = startLng + (endLng - startLng) * e;
        var curLat = startLat + (endLat - startLat) * e;
        vehicleMarker.setLngLat([curLng, curLat]);
        if (t < 1) {
          vehicleAnimFrame = requestAnimationFrame(step);
        }
      }
      vehicleAnimFrame = requestAnimationFrame(step);
    }

    // ---- Polyline ----
    function drawPolyline(encoded, color) {
      var decoded = polyline.decode(encoded); // [[lat, lng], ...]
      currentCoords = decoded.map(function (p) { return [p[1], p[0]]; }); // -> [lng, lat]

      if (map.getLayer('route-layer')) map.removeLayer('route-layer');
      if (map.getSource('route-source')) map.removeSource('route-source');

      map.addSource('route-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: currentCoords }
        }
      });
      map.addLayer({
        id: 'route-layer',
        type: 'line',
        source: 'route-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color || '#5B2EFF', 'line-width': 5 }
      });
    }

    function trimPolyline(driverLat, driverLng) {
      if (!currentCoords || currentCoords.length === 0) return;
      var closestIdx = 0;
      var closestDist = Infinity;
      for (var i = 0; i < currentCoords.length; i++) {
        var dLng = currentCoords[i][0] - driverLng;
        var dLat = currentCoords[i][1] - driverLat;
        var dist = dLng * dLng + dLat * dLat;
        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
      }
      currentCoords = currentCoords.slice(closestIdx);
      var src = map.getSource('route-source');
      if (src) {
        src.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: currentCoords }
        });
      }

      // Report how far the driver is from the route so RN can detect deviation.
      // closestDist is a squared lat/lng delta; convert to approximate metres.
      var approxMetres = Math.sqrt(closestDist) * 111000;
      postToRN({ type: 'CLOSEST_DIST', distMetres: approxMetres, closestIdx: closestIdx });
    }

    function clearPolyline() {
      if (map.getLayer('route-layer')) map.removeLayer('route-layer');
      if (map.getSource('route-source')) map.removeSource('route-source');
      currentCoords = [];
    }

    // ---- Markers ----
    function clearMarkers() {
      Object.keys(markersMap).forEach(function (id) {
        markersMap[id].remove();
      });
      markersMap = {};
    }

    function setMarkers(markers) {
      clearMarkers();
      if (!markers) return;
      markers.forEach(function (m) {
        var el = document.createElement('div');
        el.className = 'map-marker';
        var inner = document.createElement('div');
        if (m.type === 'pickup') {
          inner.className = 'marker-pickup bounce-in';
        } else if (m.type === 'store') {
          inner.className = 'marker-store bounce-in';
        } else if (m.type === 'dropoff') {
          inner.className = 'marker-dropoff bounce-in';
        } else if (m.type === 'stop') {
          inner.className = 'marker-stop bounce-in';
          var num = (m.id || '').toString().replace('stop-', '');
          inner.textContent = num || '';
        } else {
          inner.className = 'marker-pickup bounce-in';
        }
        el.appendChild(inner);
        var marker = new maplibregl.Marker({ element: el })
          .setLngLat([m.lng, m.lat])
          .addTo(map);
        markersMap[m.id] = marker;
      });
    }

    // ---- Arrival card ----
    function setArrivalCard(arrivalTime, lat, lng) {
      // Remove existing card first
      if (arrivalCardMarker) {
        arrivalCardMarker.remove();
        arrivalCardMarker = null;
      }
      if (!arrivalTime || typeof lat !== 'number' || typeof lng !== 'number') return;

      var wrapper = document.createElement('div');
      wrapper.className = 'arrival-card-wrapper';
      var pill = document.createElement('div');
      pill.className = 'arrival-card-pill';
      pill.textContent = 'Arrive by ' + arrivalTime;
      var pointer = document.createElement('div');
      pointer.className = 'arrival-card-pointer';
      wrapper.appendChild(pill);
      wrapper.appendChild(pointer);

      arrivalCardMarker = new maplibregl.Marker({ element: wrapper, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
    }

    // ---- Camera ----
    function fitBounds(coords) {
      if (!coords || coords.length === 0) return;
      var bounds = new maplibregl.LngLatBounds();
      coords.forEach(function (c) { bounds.extend(c); });
      map.fitBounds(bounds, {
        padding: { top: 100, bottom: 320, left: 60, right: 60 },
        maxZoom: 15
      });
    }

    function centerOn(lat, lng, zoom) {
      map.flyTo({ center: [lng, lat], zoom: zoom || 15 });
    }

    // ---- Message bridge ----
    function handleMessage(raw) {
      var msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'UPDATE_VEHICLE':
          updateVehicle(msg.lat, msg.lng, msg.heading || 0, msg.vehicleType);
          break;
        case 'DRAW_POLYLINE':
          drawPolyline(msg.encodedPolyline, msg.color);
          break;
        case 'TRIM_POLYLINE':
          trimPolyline(msg.driverLat, msg.driverLng);
          break;
        case 'CLEAR_POLYLINE':
          clearPolyline();
          break;
        case 'SET_MARKERS':
          setMarkers(msg.markers);
          break;
        case 'CLEAR_MARKERS':
          clearMarkers();
          break;
        case 'SET_ARRIVAL_CARD':
          setArrivalCard(msg.arrivalTime, msg.lat, msg.lng);
          break;
        case 'FOLLOW_VEHICLE':
          // easeTo (not flyTo) keeps frequent small incremental camera moves
          // smooth and arc-free as we track the driver.
          map.easeTo({ center: [msg.lng, msg.lat], zoom: 17, duration: 800 });
          break;
        case 'FIT_BOUNDS':
          fitBounds(msg.coords);
          break;
        case 'CENTER':
          centerOn(msg.lat, msg.lng, msg.zoom);
          break;
      }
    }

    // React Native WebView (Android/iOS) delivers via document/window 'message'
    window.addEventListener('message', function (e) { handleMessage(e.data); });
    document.addEventListener('message', function (e) { handleMessage(e.data); });

    map.on('load', function () {
      postToRN({ type: 'MAP_READY' });
    });
  </script>
</body>
</html>`;
}
