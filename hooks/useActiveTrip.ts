import { useState, useEffect } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { database } from '@/config/firebase';

export interface MarkerDef {
  id: string;
  type: 'pickup' | 'dropoff' | 'stop' | 'store';
  lat: number;
  lng: number;
}

export type WorkflowType = 'direct_trip' | 'store_delivery';

interface UseActiveTripResult {
  activeTrip: any | null;
  tripStatus: string | null;
  workflowType: WorkflowType | null;
  polylineToPickup: string | null;
  polylineToDestination: string | null;
  markers: MarkerDef[];
  showPolyline: boolean;
  activePolyline: string | null;
  etaMinutes: number | null;
  arrivalTime: string | null; // formatted clock time, e.g. "2:45 PM"
}

// Read a coordinate that may be stored in several shapes:
// order.pickupLocation.latitude/longitude OR order.pickupLat/pickupLng
function readCoord(
  order: any,
  objKey: string,
  latKey: string,
  lngKey: string
): { lat: number; lng: number } | null {
  if (!order) return null;

  const obj = order[objKey];
  if (obj && typeof obj.latitude === 'number') {
    return { lat: obj.latitude, lng: obj.longitude };
  }
  if (obj && typeof obj.lat === 'number') {
    return { lat: obj.lat, lng: obj.lng };
  }
  // Tolerate numeric strings: the backend may write top-level coords as strings.
  const lat = Number(order[latKey]);
  const lng = Number(order[lngKey]);
  if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
    return { lat, lng };
  }
  return null;
}

function buildStopMarkers(order: any): MarkerDef[] {
  const stops = Array.isArray(order?.stops) ? order.stops : [];
  const markers: MarkerDef[] = [];
  stops.forEach((stop: any, index: number) => {
    let lat: number | null = null;
    let lng: number | null = null;
    if (stop?.location && typeof stop.location.latitude === 'number') {
      lat = stop.location.latitude;
      lng = stop.location.longitude;
    } else if (typeof stop?.latitude === 'number') {
      lat = stop.latitude;
      lng = stop.longitude;
    } else if (typeof stop?.lat === 'number') {
      lat = stop.lat;
      lng = stop.lng;
    }
    if (lat != null && lng != null) {
      markers.push({ id: `stop-${index + 1}`, type: 'stop', lat, lng });
    }
  });
  return markers;
}

export function useActiveTrip(driverId: string | null): UseActiveTripResult {
  const [activeTrip, setActiveTrip] = useState<any | null>(null);

  useEffect(() => {
    if (!driverId) {
      setActiveTrip(null);
      return;
    }

    // Same path pattern used in dashboard.tsx and IncomingRidesContext.tsx:
    // RTDB driver_trip_requests/{driverId} keyed by request id
    const tripRequestsRef = ref(database, `driver_trip_requests/${driverId}`);

    const listener = onValue(
      tripRequestsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (!data) {
          setActiveTrip(null);
          return;
        }
        // Pick the first active (non-terminal) request
        const terminal = ['completed', 'cancelled', 'rejected', 'expired'];
        const requests = Object.values(data) as any[];
        const activeRequest = requests.find((r) => !terminal.includes(r?.status)) || null;
        setActiveTrip(activeRequest);
      },
      (error) => {
        console.log('[v0] useActiveTrip listener error:', error.message);
        setActiveTrip(null);
      }
    );

    return () => off(tripRequestsRef, 'value', listener);
  }, [driverId]);

  const tripStatus: string | null = activeTrip?.status ?? null;
  const workflowType: WorkflowType | null =
    activeTrip?.workflowType ?? activeTrip?.requestType ?? null;
  const polylineToPickup: string | null = activeTrip?.driverToPickupEncodedPolyline ?? null;
  const polylineToDestination: string | null = activeTrip?.encodedPolyline ?? null;

  // Compute markers and active polyline based on status + workflow
  let markers: MarkerDef[] = [];
  let activePolyline: string | null = null;

  if (activeTrip && tripStatus && workflowType) {
    const pickup = readCoord(activeTrip, 'pickupLocation', 'pickupLat', 'pickupLng');
    const dropoff = readCoord(activeTrip, 'destinationLocation', 'dropLat', 'dropLng');
    const store = readCoord(activeTrip, 'storeLocation', 'storeLat', 'storeLng') || pickup;
    const stopMarkers = buildStopMarkers(activeTrip);
    console.log('[useActiveTrip] status:', tripStatus, '| pickup:', pickup, '| stopMarkers:', stopMarkers.length, '| stops raw:', activeTrip?.stops);

    if (workflowType === 'direct_trip') {
      switch (tripStatus) {
        case 'accepted':
          activePolyline = polylineToPickup;
          if (pickup) markers = [{ id: 'pickup', type: 'pickup', lat: pickup.lat, lng: pickup.lng }];
          break;
        case 'arrived':
          activePolyline = null;
          markers = [];
          break;
        case 'started':
          activePolyline = polylineToDestination;
          markers = [
            ...(dropoff ? [{ id: 'dropoff', type: 'dropoff' as const, lat: dropoff.lat, lng: dropoff.lng }] : []),
            ...stopMarkers,
          ];
          break;
        case 'completed':
        default:
          activePolyline = null;
          markers = [];
          break;
      }
    } else if (workflowType === 'store_delivery') {
      switch (tripStatus) {
        case 'accepted':
          activePolyline = polylineToPickup;
          if (store) markers = [{ id: 'store', type: 'store', lat: store.lat, lng: store.lng }];
          break;
        case 'at_store':
          activePolyline = null;
          markers = [];
          break;
        case 'picked_up':
          activePolyline = polylineToDestination;
          markers = [
            ...(dropoff ? [{ id: 'dropoff', type: 'dropoff' as const, lat: dropoff.lat, lng: dropoff.lng }] : []),
            ...stopMarkers,
          ];
          break;
        case 'delivered':
        case 'completed':
        default:
          activePolyline = null;
          markers = [];
          break;
      }
    }
  }

  const showPolyline = activePolyline != null;

  // ---- ETA + arrival time ----
  // Same status/workflow switch as above:
  //   accepted (driver -> pickup/store) => driverToPickupEtaMinutes
  //   started / picked_up (pickup -> destination) => tripEtaMinutes
  //   all other statuses (arrived, at_store, delivered, completed, none) => null
  let etaMinutes: number | null = null;
  if (activeTrip && tripStatus && workflowType) {
    if (workflowType === 'direct_trip') {
      if (tripStatus === 'accepted') {
        etaMinutes = activeTrip?.driverToPickupEtaMinutes ?? null;
      } else if (tripStatus === 'started') {
        etaMinutes = activeTrip?.tripEtaMinutes ?? null;
      }
    } else if (workflowType === 'store_delivery') {
      if (tripStatus === 'accepted') {
        etaMinutes = activeTrip?.driverToPickupEtaMinutes ?? null;
      } else if (tripStatus === 'picked_up') {
        etaMinutes = activeTrip?.tripEtaMinutes ?? null;
      }
    }
  }

  // Recompute fresh each render — never cache a stale timestamp.
  const arrivalTime =
    etaMinutes !== null
      ? new Date(Date.now() + etaMinutes * 60000).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  return {
    activeTrip,
    tripStatus,
    workflowType,
    polylineToPickup,
    polylineToDestination,
    markers,
    showPolyline,
    activePolyline,
    etaMinutes,
    arrivalTime,
  };
}
