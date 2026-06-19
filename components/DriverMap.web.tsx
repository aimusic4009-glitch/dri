import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import polyline from '@mapbox/polyline';

// Bundled vehicle icons (Metro/web resolve these imports to asset URLs)
import bicycleIcon from '../assets/images/bicycle.png';
import motorbikeIcon from '../assets/images/motorbike.png';
import economyIcon from '../assets/images/economy.png';
import closedTruckIcon from '../assets/images/closed_truck.png';
import openTruckIcon from '../assets/images/open_truck.png';
import refrigeratedTruckIcon from '../assets/images/refrigerated_truck.png';
import xxlIcon from '../assets/images/xxl.png';

// Johannesburg default center
const DEFAULT_LAT = -26.2041;
const DEFAULT_LNG = 28.0473;

// On web, an imported image may be a string URL or a module object with `.uri`/`.default`.
function resolveAsset(asset: any): string {
  if (typeof asset === 'string') return asset;
  if (asset && typeof asset === 'object') return asset.uri || asset.default || '';
  return '';
}

// Vehicle type -> bundled image source (same set used by the native HTML bridge)
const VEHICLE_IMAGE_MAP: Record<string, string> = {
  bicycle: resolveAsset(bicycleIcon),
  motorbike: resolveAsset(motorbikeIcon),
  economy: resolveAsset(economyIcon),
  car: resolveAsset(economyIcon),
  truck: resolveAsset(closedTruckIcon),
  closed_truck: resolveAsset(closedTruckIcon),
  open_truck: resolveAsset(openTruckIcon),
  refrigerated_truck: resolveAsset(refrigeratedTruckIcon),
  bus: resolveAsset(xxlIcon),
  xxl: resolveAsset(xxlIcon),
};
const DEFAULT_VEHICLE = VEHICLE_IMAGE_MAP['economy'];

export interface MapMarker {
  id: string;
  type: string; // pickup | dropoff | stop | store
  lat: number;
  lng: number;
}

interface DriverMapProps {
  polyline?: string;
  trimmedPolyline?: string;
  vehiclePosition?: { lat: number; lng: number; heading: number };
  vehicleType?: string;
  markers?: MapMarker[];
  arrivalTime?: string | null;
  arrivalPosition?: { lat: number; lng: number } | null;
  followVehicle?: boolean;
  // onDeviationCheck is accepted for prop parity with the native map. The web
  // map trims the route inline (see vehicle effect) and does not post distances
  // back, so deviation-based rerouting is native-only by design.
  onDeviationCheck?: (distMetres: number) => void;
  onMapReady?: () => void;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export default function DriverMap({
  polyline: encodedPolyline,
  vehiclePosition,
  vehicleType,
  markers,
  arrivalTime,
  arrivalPosition,
  followVehicle,
  onMapReady,
}: DriverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isReadyRef = useRef(false);

  // Decoded route coordinates [lng, lat][] (mutated as the route is trimmed)
  const currentCoordsRef = useRef<[number, number][]>([]);

  // Vehicle marker state
  const vehicleMarkerRef = useRef<maplibregl.Marker | null>(null);
  const vehicleImgRef = useRef<HTMLImageElement | null>(null);
  const vehicleAnimRef = useRef<number | null>(null);

  // Map of active markers keyed by id
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});

  // Arrival "Arrive by ..." card marker
  const arrivalCardRef = useRef<maplibregl.Marker | null>(null);

  // Create / update / remove the arrival card pill marker
  const createArrivalCard = (time: string) => {
    const wrapper = document.createElement('div');
    wrapper.style.width = 'fit-content';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.pointerEvents = 'none';

    const pill = document.createElement('div');
    pill.style.background = '#5B2EFF';
    pill.style.color = '#fff';
    pill.style.fontFamily = '-apple-system, system-ui, sans-serif';
    pill.style.fontSize = '14px';
    pill.style.fontWeight = '700';
    pill.style.padding = '8px 14px';
    pill.style.borderRadius = '9999px';
    pill.style.whiteSpace = 'nowrap';
    pill.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
    pill.textContent = `Arrive by ${time}`;

    const pointer = document.createElement('div');
    pointer.style.width = '0';
    pointer.style.height = '0';
    pointer.style.borderLeft = '6px solid transparent';
    pointer.style.borderRight = '6px solid transparent';
    pointer.style.borderTop = '7px solid #5B2EFF';
    pointer.style.marginTop = '-1px';

    wrapper.appendChild(pill);
    wrapper.appendChild(pointer);
    return wrapper;
  };

  // ---- Init map once ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }],
      },
      center: [DEFAULT_LNG, DEFAULT_LAT],
      zoom: 14,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      isReadyRef.current = true;
      onMapReady?.();
    });

    return () => {
      if (vehicleAnimRef.current) cancelAnimationFrame(vehicleAnimRef.current);
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};
      map.remove();
      mapRef.current = null;
      isReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Draw / clear polyline + fit bounds ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (encodedPolyline) {
        const decoded = polyline.decode(encodedPolyline); // [[lat, lng], ...]
        const coords = decoded.map((p) => [p[1], p[0]]) as [number, number][];
        currentCoordsRef.current = coords;

        const data: GeoJSON.Feature = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        };

        const src = map.getSource('route-source') as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(data);
        } else {
          map.addSource('route-source', { type: 'geojson', data });
          map.addLayer({
            id: 'route-layer',
            type: 'line',
            source: 'route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#5B2EFF', 'line-width': 5 },
          });
        }

        const bounds = new maplibregl.LngLatBounds();
        coords.forEach((c) => bounds.extend(c as [number, number]));
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, {
            padding: { top: 100, bottom: 320, left: 60, right: 60 },
            maxZoom: 15,
          });
        }
      } else {
        if (map.getLayer('route-layer')) map.removeLayer('route-layer');
        if (map.getSource('route-source')) map.removeSource('route-source');
        currentCoordsRef.current = [];
      }
    };

    if (isReadyRef.current) {
      apply();
    } else {
      map.once('load', apply);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encodedPolyline]);

  // ---- Update vehicle position (animated) + trim route ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !vehiclePosition) return;

    const run = () => {
      const { lat, lng } = vehiclePosition;
      const imgUrl =
        (vehicleType && VEHICLE_IMAGE_MAP[vehicleType]) || DEFAULT_VEHICLE;

      // Create marker on first update
      if (!vehicleMarkerRef.current) {
        const el = document.createElement('div');
        el.style.width = '44px';
        el.style.height = '44px';
        const img = document.createElement('img');
        img.src = imgUrl;
        img.style.width = '44px';
        img.style.height = '44px';
        img.style.objectFit = 'contain';
        el.appendChild(img);
        vehicleImgRef.current = img;
        vehicleMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
      } else {
        // keep image in sync if vehicle type changed
        if (vehicleImgRef.current && vehicleImgRef.current.src !== imgUrl) {
          vehicleImgRef.current.src = imgUrl;
        }

        // Animate from current to new position over 1000ms ease-out-cubic
        const start = vehicleMarkerRef.current.getLngLat();
        const startLng = start.lng;
        const startLat = start.lat;
        const duration = 1000;
        let startTime: number | null = null;

        if (vehicleAnimRef.current) cancelAnimationFrame(vehicleAnimRef.current);

        const step = (ts: number) => {
          if (startTime === null) startTime = ts;
          const elapsed = ts - startTime;
          const t = Math.min(elapsed / duration, 1);
          const e = easeOutCubic(t);
          const curLng = startLng + (lng - startLng) * e;
          const curLat = startLat + (lat - startLat) * e;
          vehicleMarkerRef.current?.setLngLat([curLng, curLat]);
          if (t < 1) {
            vehicleAnimRef.current = requestAnimationFrame(step);
          }
        };
        vehicleAnimRef.current = requestAnimationFrame(step);
      }

      // Trim the route: slice from the closest coordinate to the vehicle
      const coords = currentCoordsRef.current;
      if (coords.length > 0) {
        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < coords.length; i++) {
          const dLng = coords[i][0] - lng;
          const dLat = coords[i][1] - lat;
          const dist = dLng * dLng + dLat * dLat;
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        }
        const trimmed = coords.slice(closestIdx);
        currentCoordsRef.current = trimmed;
        const src = map.getSource('route-source') as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: trimmed },
          });
        }
      }

      // Keep the camera locked on the driver (Bolt/Uber-style) when requested.
      // easeTo (not flyTo) keeps frequent small incremental moves smooth.
      if (followVehicle) {
        map.easeTo({ center: [lng, lat], zoom: 17, duration: 800 });
      }
    };

    if (isReadyRef.current) {
      run();
    } else {
      map.once('load', run);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiclePosition, vehicleType, followVehicle]);

  // ---- Diff + render markers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const next = markers || [];
      const nextIds = new Set(next.map((m) => m.id));

      // Remove stale markers
      Object.keys(markersRef.current).forEach((id) => {
        if (!nextIds.has(id)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      });

      // Add new markers
      next.forEach((m) => {
        if (markersRef.current[m.id]) return; // already present

        const el = document.createElement('div');
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';

        const inner = document.createElement('div');
        inner.style.border = '3px solid #fff';
        inner.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';

        if (m.type === 'dropoff') {
          inner.style.width = '26px';
          inner.style.height = '26px';
          inner.style.background = '#5B2EFF';
          inner.style.borderRadius = '50% 50% 50% 0';
          inner.style.transform = 'rotate(-45deg)';
        } else if (m.type === 'store') {
          inner.style.width = '22px';
          inner.style.height = '22px';
          inner.style.background = '#F59E0B';
          inner.style.borderRadius = '50%';
        } else if (m.type === 'stop') {
          inner.style.width = '24px';
          inner.style.height = '24px';
          inner.style.background = '#5B2EFF';
          inner.style.borderRadius = '50%';
          inner.style.color = '#fff';
          inner.style.fontSize = '12px';
          inner.style.fontWeight = '700';
          inner.style.fontFamily = '-apple-system, system-ui, sans-serif';
          inner.style.display = 'flex';
          inner.style.alignItems = 'center';
          inner.style.justifyContent = 'center';
          inner.textContent = (m.id || '').toString().replace('stop-', '') || '';
        } else {
          // pickup (default)
          inner.style.width = '22px';
          inner.style.height = '22px';
          inner.style.background = '#5B2EFF';
          inner.style.borderRadius = '50%';
        }

        el.appendChild(inner);
        markersRef.current[m.id] = new maplibregl.Marker({ element: el })
          .setLngLat([m.lng, m.lat])
          .addTo(map);
      });
    };

    if (isReadyRef.current) {
      apply();
    } else {
      map.once('load', apply);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers]);

  // ---- Arrival card: create / update / remove ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // Remove existing card first
      if (arrivalCardRef.current) {
        arrivalCardRef.current.remove();
        arrivalCardRef.current = null;
      }
      if (!arrivalTime || !arrivalPosition) return;

      const el = createArrivalCard(arrivalTime);
      arrivalCardRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([arrivalPosition.lng, arrivalPosition.lat])
        .addTo(map);
    };

    if (isReadyRef.current) {
      apply();
    } else {
      map.once('load', apply);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalTime, arrivalPosition?.lat, arrivalPosition?.lng]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
