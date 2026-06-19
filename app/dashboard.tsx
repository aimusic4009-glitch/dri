import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  Animated,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { database, auth, firestore } from '@/config/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, update, onValue, off, remove, set } from 'firebase/database';
import { Home, Mail, Clock, Settings } from 'lucide-react-native';

// Helper functions to handle location across platforms
const getLocation = async () => {
  if (Platform.OS !== 'web') {
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const location = await Location.getCurrentPositionAsync({});
      return location.coords;
    }
    console.log('[v0] getLocation: foreground location permission not granted, status =', status);
    return null;
  } else {
    return new Promise<{ latitude: number; longitude: number; heading?: number } | null>((resolve) => {
      if (!navigator.geolocation) {
        console.log('[v0] getLocation: navigator.geolocation is unavailable');
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, heading: pos.coords.heading || 0 }),
        (error) => {
          console.log('[v0] getLocation: getCurrentPosition failed:', error.message);
          resolve(null);
        }
      );
    });
  }
};

const watchLocation = async (callback: (coords: { latitude: number; longitude: number; heading: number; speed: number }) => void) => {
  if (Platform.OS !== 'web') {
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[v0] Location permission denied');
      return null;
    }

    return await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 3000, // Update every 3 seconds
        distanceInterval: 15, // Or every 15 meters
      },
      (loc) => {
        callback({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          heading: loc.coords.heading || 0,
          speed: loc.coords.speed || 0,
        });
      }
    );
  } else {
    if (!navigator.geolocation) return null;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => callback({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        heading: pos.coords.heading || 0,
        speed: pos.coords.speed || 0,
      }),
      (error) => {
        console.log('[v0] Location error:', error.message);
      },
      { enableHighAccuracy: true }
    );
    return { remove: () => navigator.geolocation.clearWatch(watchId) };
  }
};
import ChatPanel from '@/components/ChatPanel';
import ToastNotification from '@/components/ToastNotification';
import DriverMap from '@/components/DriverMap';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { createGeoFireObject } from '@/utils/geofire';
import { getUnreadCount, listenForClientMessages, autoDeleteReadMessages, watchRideStatusForCleanup } from '@/utils/chat';

const { width, height } = Dimensions.get('window');

// Straight-line distance in km between two lat/lng points (Haversine).
// Used for a client-side fallback ETA before the backend writes an ETA field.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Dashboard() {
  const [isOnline, setIsOnline] = useState(false);
  const [userStatus, setUserStatus] = useState<'pending' | 'approved' | 'accepted' | 'rejected'>('pending');
  const [registrationCompleted, setRegistrationCompleted] = useState(false);
  const [locationSubscription, setLocationSubscription] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');

  // Active ride state for location updates (trip managed by GlobalTripRequestPanel)
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [activeRideStatus, setActiveRideStatus] = useState<string | null>(null);
  const [driverData, setDriverData] = useState<any>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState<string>('economy');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [vehiclePosition, setVehiclePosition] = useState<{ lat: number; lng: number; heading: number } | null>(null);

  // Active trip from Firestore orders (drives the live map polylines + markers)
  const { activeTrip, tripStatus, workflowType, markers, activePolyline, showPolyline, arrivalTime } =
    useActiveTrip(driverId);

  // Arrival card anchors at the coordinate matching the current trip phase:
  //   direct_trip accepted -> pickup, store_delivery accepted -> store,
  //   started / picked_up -> destination (dropoff), otherwise none.
  // IMPORTANT: this is computed purely from tripStatus + workflowType and is NOT
  // gated behind arrivalTime, so the dot is always hidden and the card always
  // renders while a relevant trip phase is active (even before the backend ETA).
  let arrivalPosition: { lat: number; lng: number } | null = null;
  let arrivalTargetId: string | null = null;
  if (tripStatus && workflowType) {
    if (workflowType === 'direct_trip') {
      if (tripStatus === 'accepted') arrivalTargetId = 'pickup';
      else if (tripStatus === 'started') arrivalTargetId = 'dropoff';
    } else if (workflowType === 'store_delivery') {
      if (tripStatus === 'accepted') arrivalTargetId = 'store';
      else if (tripStatus === 'picked_up') arrivalTargetId = 'dropoff';
    }
    if (arrivalTargetId) {
      const target = markers.find((m) => m.id === arrivalTargetId);
      if (target) arrivalPosition = { lat: target.lat, lng: target.lng };
      else arrivalTargetId = null; // no matching marker, nothing to hide
    }
  }

  // Arrival time string: prefer the backend ETA (via the hook). If it isn't
  // populated yet, fall back to a client-side straight-line estimate at an urban
  // 30 km/h so the card still renders. Once the backend ETA lands, it takes over.
  let displayArrivalTime: string | null = arrivalTime;
  if (!displayArrivalTime && arrivalPosition && vehiclePosition) {
    const distanceKm = haversineKm(
      vehiclePosition.lat,
      vehiclePosition.lng,
      arrivalPosition.lat,
      arrivalPosition.lng
    );
    const fallbackMinutes = Math.max(1, Math.round((distanceKm / 30) * 60));
    displayArrivalTime = new Date(Date.now() + fallbackMinutes * 60000).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  // Hide the plain dot/pin marker that sits directly under the arrival pill so
  // it doesn't read as a spade/shield beneath the "Arrive by ..." card. Other
  // markers along the route still render normally. Ungated so it always applies
  // whenever a relevant phase is active.
  const displayedMarkers =
    arrivalTargetId ? markers.filter((m) => m.id !== arrivalTargetId) : markers;

  const [showChatPanel, setShowChatPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [toastData, setToastData] = useState({ clientName: '', message: '' });
  const [chatRideInfo, setChatRideInfo] = useState<any>(null);

  const sliderX = useRef(new Animated.Value(0)).current;
  // Toggle dimensions - track is full width minus padding, thumb is 48px
  const TRACK_WIDTH = width - 64; // 16px padding on each side + 16px margin
  const THUMB_SIZE = 48;
  const SLIDE_RANGE = TRACK_WIDTH - THUMB_SIZE - 8; // Max translation (account for 4px padding on each side)
  const SLIDE_THRESHOLD = SLIDE_RANGE * 0.5;

  // Panel animation for draggable bottom sheet (panel slides behind nav bar)
  // Collapsed: panel slides down so only scheduled card is visible above nav (85px)
  // Expanded: shows all content including toggle
  const PANEL_TOTAL_HEIGHT = 380; // Total panel height
  const NAV_HEIGHT = 85;
  // When collapsed, panel should hide behind nav, only showing scheduled card (~100px visible)
  const PANEL_COLLAPSED_OFFSET = PANEL_TOTAL_HEIGHT - NAV_HEIGHT - 100; // How much to push down when collapsed
  const PANEL_EXPANDED_OFFSET = 0; // When expanded, no offset
  const panelY = useRef(new Animated.Value(PANEL_COLLAPSED_OFFSET)).current; // Start collapsed
  const savedPanelY = useRef(PANEL_COLLAPSED_OFFSET);
  // JS-side source of truth for the panel's current Y. Kept in sync via a
  // listener below so the drag baseline is always reliable (the private
  // (panelY as any)._value is not dependable with useNativeDriver).
  const panelYRef = useRef(PANEL_COLLAPSED_OFFSET);

  // ---- Follow-vehicle camera control ----
  // Follow the driver (Bolt/Uber-style) while online, EXCEPT for a brief 3s
  // window right after a status change, when the route's FIT_BOUNDS overview
  // should be shown instead. After the window, following resumes.
  const [followEnabled, setFollowEnabled] = useState(true);
  const followTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTripStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (tripStatus !== prevTripStatusRef.current) {
      prevTripStatusRef.current = tripStatus;
      if (tripStatus && ['accepted', 'started', 'picked_up'].includes(tripStatus)) {
        // Pause following so the new route overview is visible, then resume.
        setFollowEnabled(false);
        if (followTimeoutRef.current) clearTimeout(followTimeoutRef.current);
        followTimeoutRef.current = setTimeout(() => setFollowEnabled(true), 3000);
      }
    }
    return () => {
      if (followTimeoutRef.current) clearTimeout(followTimeoutRef.current);
    };
  }, [tripStatus]);

  // ---- Deviation detection / reroute ----
  // The WebView posts the driver's distance-from-route (CLOSEST_DIST). After 3
  // consecutive readings beyond 120m (and at most once per 30s), request a fresh
  // polyline from the backend; the new route flows back via useActiveTrip.
  const deviationCountRef = useRef(0);
  const lastRerouteRef = useRef(0);

  const triggerReroute = async () => {
    if (!vehiclePosition || !activeTrip || !driverId) return;
    lastRerouteRef.current = Date.now();
    deviationCountRef.current = 0;
    const body = {
      driverId,
      orderId: activeTrip.orderId,
      currentLat: vehiclePosition.lat,
      currentLng: vehiclePosition.lng,
      phase: tripStatus, // 'accepted' | 'started' | 'picked_up'
    };
    try {
      await fetch('https://aletwend-render-backend.onrender.com/reroutePolyline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      // Backend writes the new polyline to RTDB; useActiveTrip picks it up and
      // triggers a fresh DRAW_POLYLINE automatically — nothing else to do here.
    } catch (e) {
      console.log('[reroute] request failed:', e);
    }
  };

  const handleDeviationCheck = (distMetres: number) => {
    if (distMetres > 120) {
      deviationCountRef.current += 1;
    } else {
      deviationCountRef.current = 0;
    }
    if (deviationCountRef.current >= 3 && Date.now() - lastRerouteRef.current > 30000) {
      triggerReroute();
    }
  };

  // Dashboard entry animations
  const panelSlideAnim = useRef(new Animated.Value(300)).current; // Panel slides up from bottom
  const cardsFadeAnim = useRef(new Animated.Value(0)).current; // Cards fade in
  const cardsScaleAnim = useRef(new Animated.Value(0.95)).current; // Cards scale up

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setIsLoading(false);
      return;
    }
    setDriverId(uid);
    // LISTEN TO FIRESTORE drivers/{uid} for verification status (NOT Realtime DB users/{uid})
    const driverDocRef = doc(firestore, 'drivers', uid);
    const unsubscribeFirestore = onSnapshot(driverDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Set verification status from Firestore
        const verificationStatus = data.verificationStatus || 'pending';
        const regCompleted = data.registrationCompleted === true;

        setUserStatus(verificationStatus as 'pending' | 'approved' | 'accepted' | 'rejected');
        setRegistrationCompleted(regCompleted);

        // Store driver profile data for ride acceptance - include ALL fields
        setDriverData({
          profile: {
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            profilePicture: data.profilePicture || '',
          },
          vehicle: {
            brand: data.vehicleBrand || '',
            model: data.vehicleModel || '',
            color: data.vehicleColor || '',
            plateNumber: data.plateNumber || '',
            // Truck-specific fields
            tonnage: data.tonnage || '',
            refrigerationType: data.refrigerationType || '',
          },
          rating: data.rating || 5.0,
        });

        // Determine vehicle type for the map vehicle marker
        const resolvedVehicleType =
          data.vehicleType ||
          data.serviceType ||
          data.category ||
          'economy';
        setVehicleType(String(resolvedVehicleType).toLowerCase());
      }
      setIsLoading(false);
    });

    // Listen to drivers_online/{uid} for online status
    const driversOnlineRef = ref(database, `drivers_online/${uid}`);
    const onlineListener = onValue(driversOnlineRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setIsOnline(data.isOnline === true);
        sliderX.setValue(data.isOnline ? SLIDE_RANGE : 0);
        // Track active order for location updates and chat
        if (data.currentOrderId) {
          setActiveRideId(data.currentOrderId);
        } else {
          setActiveRideId(null);
          setActiveRideStatus(null);
        }
      } else {
        setIsOnline(false);
        sliderX.setValue(0);
      }
    });

    // Listen for active trip status changes (for location updates and chat)
    const tripRequestsRef = ref(database, `driver_trip_requests/${uid}`);
    const tripRequestsListener = onValue(tripRequestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const requests = Object.values(data) as any[];
        const activeRequest = requests.find(r => 
          !['completed', 'rejected', 'expired', 'cancelled'].includes(r.status)
        );
        if (activeRequest) {
          setActiveRideId(activeRequest.orderId);
          setActiveRideStatus(activeRequest.status);
          setChatRideInfo({
            id: activeRequest.orderId,
            clientName: activeRequest.data?.userName || 'Client',
            clientId: activeRequest.data?.userId || '',
            pickupAddress: activeRequest.data?.pickupAddress || '',
            destinationAddress: activeRequest.data?.destinationAddress || '',
            status: activeRequest.status,
          });
        }
      }
    });

    return () => {
      unsubscribeFirestore();
      off(driversOnlineRef, 'value', onlineListener);
      off(tripRequestsRef, 'value', tripRequestsListener);
    };
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !activeRideId) {
      setUnreadCount(0);
      return;
    }

    const rideId = activeRideId;
    const clientId = chatRideInfo?.clientId || '';

    const unsubscribeUnread = getUnreadCount(firestore, rideId, uid, (count) => {
      setUnreadCount(count);
    });

    const unsubscribeMessages = listenForClientMessages(
      firestore,
      rideId,
      uid,
      (message, messageId) => {
        if (message.senderId !== uid && !showChatPanel) {
          const clientName = chatRideInfo?.clientName || 'Client';
          setToastData({
            clientName,
            message: message.text,
          });
          setShowToast(true);
        }
      }
    );

    const unsubscribeAutoDelete = autoDeleteReadMessages(firestore, rideId, clientId, uid);
    const unsubscribeCleanup = watchRideStatusForCleanup(firestore, rideId);

    return () => {
      unsubscribeUnread();
      unsubscribeMessages();
      unsubscribeAutoDelete();
      unsubscribeCleanup();
    };
  }, [activeRideId, chatRideInfo, showChatPanel]);

  const handleInboxPress = () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !activeRideId) {
      return;
    }

    // Allow chat during active trip statuses
    const validStatuses = ['accepted', 'arrived', 'started', 'at_store', 'picked_up', 'delivered'];
    if (!activeRideStatus || !validStatuses.includes(activeRideStatus)) {
      return;
    }

    setShowChatPanel(true);
  };

  const startTracking = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    console.log('[v0] Starting location tracking for driver:', uid);

    const subscription = await watchLocation(async (coords) => {
      const { latitude, longitude, heading } = coords;

      setCurrentLocation({ latitude, longitude });
      // Feed the live map vehicle marker
      setVehiclePosition({ lat: latitude, lng: longitude, heading: heading || 0 });

      // CRITICAL: Update driver_locations/{uid} with GeoFire format
      // This is ONLY path client app uses to find nearby drivers
      const geoObject = createGeoFireObject(latitude, longitude);
      await set(ref(database, `driver_locations/${uid}`), {
        l: geoObject.l,
        g: geoObject.g,
      });

      console.log('[v0] Driver location updated to driver_locations:', { lat: latitude, lng: longitude, g: geoObject.g });

      // Update order location in Firestore if driver has an active order
      if (activeRideId && activeRideStatus && ['accepted', 'arrived', 'started', 'at_store', 'picked_up'].includes(activeRideStatus)) {
        try {
          const orderRef = doc(firestore, 'orders', activeRideId);
          await updateDoc(orderRef, {
            driverLocation: {
              latitude,
              longitude,
              updatedAt: Date.now(),
            },
          });
        } catch (error) {
          // Silently fail location updates to avoid spamming console
        }
      }
    });
    setLocationSubscription(subscription);
  };

  const stopTracking = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    console.log('[v0] Stopping location tracking for driver:', uid);

    if (locationSubscription) {
      try {
        await locationSubscription.remove();
      } catch (error) {
        console.log('[v0] Error removing location subscription:', error);
      }
      setLocationSubscription(null);
    }

    // Remove driver_locations/{uid} when driver goes OFFLINE
    await remove(ref(database, `driver_locations/${uid}`));
    console.log('[v0] Driver location removed from driver_locations');
  };

  const goOnline = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !driverData) return;

    const firstName = driverData.profile?.firstName || '';
    const lastName = driverData.profile?.lastName || '';
    const driverName = `${firstName} ${lastName}`.trim();

    const carBrand = driverData.vehicle?.brand || '';
    const carModelName = driverData.vehicle?.model || '';
    const carColor = driverData.vehicle?.color || '';
    const carModel = carColor && carBrand
      ? `${carColor} • ${carBrand} ${carModelName}`.trim()
      : `${carBrand} ${carModelName}`.trim();

    const plateNumber = driverData.vehicle?.plateNumber || '';
    const photo = driverData.profile?.profilePicture || '';
    const rating = driverData.rating || 5.0;

    let coords = await getLocation();

    // Fallback: a fresh GPS fix can be slow or time out. On native, fall back to
    // the last-known position so the vehicle marker appears immediately.
    if (!coords && Platform.OS !== 'web') {
      try {
        const Location = await import('expo-location');
        const lastKnown = await Location.getLastKnownPositionAsync({});
        if (lastKnown) {
          coords = lastKnown.coords;
          console.log('[v0] goOnline: using last-known position as fallback');
        } else {
          console.log('[v0] goOnline: no last-known position available');
        }
      } catch (err) {
        console.log('[v0] goOnline: getLastKnownPositionAsync failed:', err);
      }
    }

    if (coords) {
      const { latitude, longitude } = coords;
      setVehiclePosition({ lat: latitude, lng: longitude, heading: (coords as any).heading || 0 });
      // Update driver_locations/{uid} with GeoFire format
      const geoObject = createGeoFireObject(latitude, longitude);
      await set(ref(database, `driver_locations/${uid}`), {
        l: geoObject.l,
        g: geoObject.g,
      });

      console.log('[v0] Driver went online, location set to driver_locations:', { lat: latitude, lng: longitude, g: geoObject.g });
    }

    // SET drivers_online/{uid} - NEW REALTIME STATE SYSTEM
    await set(ref(database, `drivers_online/${uid}`), {
      isOnline: true,
      isBusy: false,
      lastUpdated: Date.now(),
    });

    setIsOnline(true);
    await startTracking();

    Animated.spring(sliderX, {
      toValue: SLIDE_RANGE,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  };

  const goOffline = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setIsOnline(false);
    await stopTracking();

    // REMOVE drivers_online/{uid} - Driver goes offline
    await remove(ref(database, `drivers_online/${uid}`));

    Animated.spring(sliderX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  };

  // All trip lifecycle handling is now done via GlobalTripRequestPanel
  // which listens to RTDB driver_trip_requests/{uid} and calls backend APIs

  const startX = useRef(0);
  const savedTranslateX = useRef(0);

  const gesture = Gesture.Pan()
    .enabled(userStatus === 'approved' && registrationCompleted)
    .onStart(() => {
      savedTranslateX.current = isOnline ? SLIDE_RANGE : 0;
    })
    .onUpdate((event) => {
      const newValue = Math.max(0, Math.min(savedTranslateX.current + event.translationX, SLIDE_RANGE));
      sliderX.setValue(newValue);
    })
    .onEnd((event) => {
      const finalPosition = savedTranslateX.current + event.translationX;
      if (finalPosition > SLIDE_THRESHOLD) {
        goOnline();
      } else {
        goOffline();
      }
    });

  // Keep panelYRef in sync with the animated value so the drag baseline below
  // is always accurate (works regardless of useNativeDriver).
  useEffect(() => {
    const id = panelY.addListener((state) => {
      panelYRef.current = state.value;
    });
    return () => panelY.removeListener(id);
  }, []);

  // Panel drag gesture for bottom sheet
  const panelGesture = Gesture.Pan()
    .onStart(() => {
      savedPanelY.current = panelYRef.current;
    })
    .onUpdate((event) => {
      // Allow dragging from collapsed (positive offset) to expanded (0)
      const newValue = Math.max(PANEL_EXPANDED_OFFSET, Math.min(PANEL_COLLAPSED_OFFSET, savedPanelY.current + event.translationY));
      panelY.setValue(newValue);
    })
    .onEnd((event) => {
      const snapThreshold = PANEL_COLLAPSED_OFFSET / 2;
      const currentValue = savedPanelY.current + event.translationY;

      if (currentValue < snapThreshold) {
        // Snap to expanded (fully visible)
        Animated.spring(panelY, {
          toValue: PANEL_EXPANDED_OFFSET,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start(() => {
          savedPanelY.current = PANEL_EXPANDED_OFFSET;
        });
      } else {
        // Snap to collapsed (behind nav, only scheduled card visible)
        Animated.spring(panelY, {
          toValue: PANEL_COLLAPSED_OFFSET,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start(() => {
          savedPanelY.current = PANEL_COLLAPSED_OFFSET;
        });
      }
    });

  useEffect(() => {
    return () => {
      if (locationSubscription) {
        (async () => {
          try {
            await locationSubscription.remove();
          } catch (error) {
            console.log('Error removing location subscription on cleanup:', error);
          }
        })();
      }
    };
  }, [locationSubscription]);

  // Dashboard entry animations - panel slides up to reveal toggle
  useEffect(() => {
    if (!isLoading) {
      // Animate panel sliding up from bottom
      Animated.spring(panelSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 10,
      }).start();

      // Animate cards fading in and scaling
      Animated.parallel([
        Animated.timing(cardsFadeAnim, {
          toValue: 1,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
        Animated.spring(cardsScaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }),
      ]).start();

      // After initial animation, smoothly expand panel to show toggle
      setTimeout(() => {
        Animated.spring(panelY, {
          toValue: PANEL_EXPANDED_OFFSET,
          useNativeDriver: true,
          tension: 60,
          friction: 12,
        }).start(() => {
          savedPanelY.current = PANEL_EXPANDED_OFFSET;
        });
      }, 600);
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#006400" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Trip request handling is now done globally via GlobalTripRequestPanel in _layout.tsx */}

      {/* CHAT PANEL */}
      <ChatPanel
        visible={showChatPanel}
        onClose={() => setShowChatPanel(false)}
        rideId={activeRideId}
        clientName={chatRideInfo?.clientName || 'Client'}
        clientId={chatRideInfo?.clientId || ''}
        driverName={driverData ? `${driverData.profile?.firstName || ''} ${driverData.profile?.lastName || ''}`.trim() || 'Driver' : 'Driver'}
        pickupAddress={chatRideInfo?.pickupAddress || 'Pickup'}
        destinationAddress={chatRideInfo?.destinationAddress || 'Destination'}
        rideStatus={activeRideStatus}
      />

      {/* TOAST NOTIFICATION */}
      <ToastNotification
        visible={showToast}
        clientName={toastData.clientName}
        message={toastData.message}
        onHide={() => setShowToast(false)}
      />

      {/* FULL SCREEN MAP BACKGROUND - real interactive map */}
      <View style={styles.mapFullScreen}>
        <DriverMap
          polyline={showPolyline ? activePolyline || undefined : undefined}
          vehiclePosition={vehiclePosition || undefined}
          vehicleType={vehicleType}
          markers={displayedMarkers}
          arrivalTime={displayArrivalTime}
          arrivalPosition={arrivalPosition}
          followVehicle={isOnline && followEnabled}
          onDeviationCheck={handleDeviationCheck}
        />
      </View>

      {/* DRAGGABLE SLIDING PANEL - Contains toggle inside */}
      <Animated.View
        style={[
          styles.slidingPanel,
          {
            transform: [
              { translateY: Animated.add(panelY, panelSlideAnim) },
            ],
          },
        ]}
      >
        {/* Panel Handle - Draggable area */}
        <GestureDetector gesture={panelGesture}>
          <View style={styles.panelHandleArea}>
            <View style={styles.panelHandle} />
          </View>
        </GestureDetector>

        {/* Panel Content */}
        <View style={styles.panelContent}>
          {/* Scheduled Requests Card - Always visible when collapsed */}
          <Animated.View style={[styles.scheduledCard, { opacity: cardsFadeAnim, transform: [{ scale: cardsScaleAnim }] }]}>
            <View style={styles.scheduledIconCircle}>
              <Clock color="#666" size={24} />
            </View>
            <View style={styles.scheduledTextContainer}>
              <Text style={styles.scheduledTitle}>New scheduled requests</Text>
              <Text style={styles.scheduledSubtitle}>Choose a request that suits you</Text>
            </View>
          </Animated.View>

          {/* Stats Row */}
          <Animated.View style={[styles.statsRow, { opacity: cardsFadeAnim, transform: [{ scale: cardsScaleAnim }] }]}>
            <View style={styles.statCard}>
              <View style={styles.statHeader}>
                <Text style={styles.statLabel}>Today&apos;s{'\n'}earnings</Text>
              </View>
              <Text style={styles.statValue}>£0.00</Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statHeader}>
                <Text style={styles.statLabel}>Activity{'\n'}score</Text>
              </View>
              <Text style={styles.statValue}>50%</Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statHeader}>
                <Text style={styles.statLabel}>Current{'\n'}rating</Text>
              </View>
              <Text style={styles.statValue}>{(driverData?.rating || 5.0).toFixed(2)}</Text>
            </View>
          </Animated.View>

          {/* TOGGLE - FULL WIDTH inside panel, below stats */}
          <Animated.View
            style={[
              styles.toggleContainer,
              { opacity: cardsFadeAnim, transform: [{ scale: cardsScaleAnim }] },
              (userStatus !== 'approved' || !registrationCompleted) && styles.disabledSlider,
            ]}
            pointerEvents={(userStatus === 'approved' && registrationCompleted) ? 'auto' : 'none'}
          >
            <View style={[styles.slideTrack, isOnline && styles.slideTrackOnline]}>
              <Text style={[styles.slideInstructionText, isOnline && styles.slideInstructionTextOnline]}>
                {isOnline ? 'Slide to go offline' : 'Slide to go online'}
              </Text>
              <GestureDetector gesture={gesture}>
                <Animated.View
                  style={[
                    styles.slideThumb,
                    {
                      transform: [{ translateX: sliderX }],
                    },
                  ]}
                >
                  <Text style={[styles.chevronText, isOnline && styles.chevronTextOnline]}>{isOnline ? '<<' : '>>'}</Text>
                </Animated.View>
              </GestureDetector>
            </View>
          </Animated.View>
        </View>
      </Animated.View>

      {/* NAV BAR */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('home')}>
          <Home color={activeTab === 'home' ? '#4285F4' : '#999'} size={26} />
          <Text style={[styles.navLabel, activeTab === 'home' && styles.navLabelActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleInboxPress}>
          <View style={styles.iconWrapper}>
            <Mail color={activeTab === 'inbox' ? '#4285F4' : '#999'} size={26} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.navLabel, activeTab === 'inbox' && styles.navLabelActive]}>Inbox</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('trips')}>
          <Clock color={activeTab === 'trips' ? '#4285F4' : '#999'} size={26} />
          <Text style={[styles.navLabel, activeTab === 'trips' && styles.navLabelActive]}>Trips</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('settings')}>
          <Settings color={activeTab === 'settings' ? '#4285F4' : '#999'} size={26} />
          <Text style={[styles.navLabel, activeTab === 'settings' && styles.navLabelActive]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* BLUR OVERLAY - Show when not approved OR registration not completed */}
      {(userStatus !== 'approved' || !registrationCompleted) && (
        <BlurView intensity={90} style={styles.blurOverlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>
              {userStatus === 'rejected'
                ? 'Your application was not approved'
                : userStatus === 'pending'
                  ? 'Your account is under review'
                  : !registrationCompleted
                    ? 'Please complete your registration'
                    : 'Account Status Pending'}
            </Text>
            <Text style={styles.overlayMessage}>
              {userStatus === 'rejected'
                ? 'Please contact support for more information'
                : userStatus === 'pending'
                  ? 'Please wait up to 24 hours'
                  : !registrationCompleted
                    ? 'Complete all required steps to start driving'
                    : 'Please wait while we verify your account'}
            </Text>
          </View>
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8E8E8' },
  loadingContainer: { justifyContent: 'center', alignItems: 'center' },

  // Full screen map background
  mapFullScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#E8E8E8',
  },
  mapBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapGrid: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  mapGridVertical: { flexDirection: 'row' },
  mapLine: { flex: 1, borderWidth: 0.5, borderColor: '#D0D0D0', opacity: 0.3 },
  serviceRadius: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: '#00C853',
    backgroundColor: 'rgba(0, 200, 83, 0.08)',
  },
  // Toggle inside panel - FULL WIDTH
  toggleContainer: {
    marginTop: 16,
  },
  slideTrack: {
    height: 56,
    backgroundColor: '#00C853',
    borderRadius: 30,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  slideTrackOnline: {
    backgroundColor: '#E53935',
  },
  slideInstructionText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  slideInstructionTextOnline: {
    // Text stays centered when online
  },
  slideThumb: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  chevronText: {
    color: '#00C853',
    fontSize: 20,
    fontWeight: '700',
  },
  chevronTextOnline: {
    color: '#E53935',
  },
  disabledSlider: {
    opacity: 0.5,
  },

  // Sliding panel - slides behind nav bar when collapsed
  // When collapsed: only scheduled requests card visible above nav
  // When expanded: shows all content including toggle
  slidingPanel: {
    position: 'absolute',
    bottom: 85, // Position above nav bar
    left: 0,
    right: 0,
    height: 300, // Total height of panel content
    backgroundColor: '#F5F5F5',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  panelHandleArea: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#D0D0D0',
    borderRadius: 2,
  },
  panelContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 100, // Extra space for content behind bottom nav
  },

  // Scheduled requests card
  scheduledCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  scheduledIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  scheduledTextContainer: { flex: 1 },
  scheduledTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginBottom: 2 },
  scheduledSubtitle: { fontSize: 13, color: '#888' },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statLabel: { fontSize: 12, color: '#666', lineHeight: 16 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#000' },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 85,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingTop: 8,
    zIndex: 15, // Always on top - panel slides behind it
    elevation: 25,
  },
  navItem: { alignItems: 'center', justifyContent: 'center' },
  iconWrapper: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  navLabel: { fontSize: 11, color: '#999', marginTop: 6 },
  navLabelActive: { color: '#4285F4', fontWeight: '600' },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  overlayCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    paddingVertical: 36,
    paddingHorizontal: 28,
    borderRadius: 20,
    alignItems: 'center',
  },
  overlayTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  overlayMessage: { fontSize: 15, color: '#666', textAlign: 'center' },
});



