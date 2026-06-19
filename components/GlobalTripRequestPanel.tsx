import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { User, MapPin, Navigation, Hash, Phone, Package, Car, Truck, CheckCircle } from 'lucide-react-native';
import { ref, onValue, off } from 'firebase/database';
import { database, auth } from '@/config/firebase';

const { width, height } = Dimensions.get('window');

// Panel positions - TOP ANCHORED (Uber/Bolt style)
const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 50 : 30;
const PANEL_HEIGHT = 420;
const HANDLE_HEIGHT = 30;
// Expanded: panel fully visible from top
const PANEL_EXPANDED_Y = 0;
// Minimized: only handle bar and small portion visible
const PANEL_MINIMIZED_Y = -(PANEL_HEIGHT - HANDLE_HEIGHT - STATUS_BAR_HEIGHT);

// RTDB Trip Request structure
interface TripRequest {
  orderId: string;
  workflowType: 'direct_trip' | 'store_delivery';
  requestType: string;
  status: string;
  createdAt: number;
  expiresAt: number;
  data: {
    pickupAddress: string;
    destinationAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropLat: number;
    dropLng: number;
    stops?: Array<{ address: string; lat: number; lng: number }>;
    total: number;
    fee: number;
    currency?: string;
    userName: string;
    userPhone: string;
    serviceType?: string;
    dispatchService?: string;
  };
}

// Backend API base URL - REAL BACKEND, NOT LOCAL
const API_BASE = 'https://aletwend-render-backend.onrender.com';

const FARE_PANEL_HEIGHT = 360;

// Snapshot of the fields needed to render the fare summary after completion.
interface FareData {
  total?: number;
  fee?: number;
  currency?: string;
  userName?: string;
}

// Slides down from the top (mirrors the incoming-request panel's spring) to show
// the trip total + breakdown once a trip is completed. Workflow-agnostic.
function FareSummaryPanel({
  visible,
  data,
  onDone,
}: {
  visible: boolean;
  data: FareData | null;
  onDone: () => void;
}) {
  const slideY = useRef(new Animated.Value(-FARE_PANEL_HEIGHT)).current;

  useEffect(() => {
    // Same easing/duration profile as the incoming-request panel for consistency.
    Animated.spring(slideY, {
      toValue: visible ? 0 : -FARE_PANEL_HEIGHT,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [visible, slideY]);

  if (!visible || !data) return null;

  const currency = data.currency || 'R';
  const total = typeof data.total === 'number' ? data.total : 0;
  const fee = typeof data.fee === 'number' ? data.fee : null;
  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;

  return (
    <Animated.View style={[styles.farePanel, { transform: [{ translateY: slideY }] }]}>
      <ScrollView
        contentContainerStyle={styles.fareContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.fareIconCircle}>
          <CheckCircle color="#00C853" size={40} />
        </View>
        <Text style={styles.fareTitle}>Trip Completed</Text>
        {data.userName ? (
          <Text style={styles.fareCustomer}>{data.userName}</Text>
        ) : null}

        <View style={styles.fareTotalBox}>
          <Text style={styles.fareTotalLabel}>Total earned</Text>
          <Text style={styles.fareTotalValue}>{fmt(total)}</Text>
        </View>

        {fee !== null && (
          <View style={styles.fareBreakdownRow}>
            <Text style={styles.fareBreakdownLabel}>Service fee</Text>
            <Text style={styles.fareBreakdownValue}>{fmt(fee)}</Text>
          </View>
        )}
      </ScrollView>

      {/* Done button OUTSIDE the scroll, pinned at bottom */}
      <TouchableOpacity style={styles.fareDoneButton} onPress={onDone}>
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function GlobalTripRequestPanel() {
  // CRITICAL: Get driver UID immediately - if no UID, don't render anything
  const driverUid = auth.currentUser?.uid;
  
  const [currentRequest, setCurrentRequest] = useState<TripRequest | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  // Independent loading states for each button - DO NOT share loading state
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  // Fare summary shown after a completion (snapshot captured before RTDB clears).
  const [showFarePanel, setShowFarePanel] = useState(false);
  const [farePanelData, setFarePanelData] = useState<FareData | null>(null);

  // Animation value for panel position
  const panelY = useRef(new Animated.Value(PANEL_MINIMIZED_Y)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  // Live tracking of panelY's current value (avoids stale-closure base position)
  const panelYValue = useRef<number>(PANEL_MINIMIZED_Y);
  // The panelY value captured at the moment a drag begins
  const dragStartY = useRef<number>(PANEL_MINIMIZED_Y);

  useEffect(() => {
    const id = panelY.addListener(({ value }) => {
      panelYValue.current = value;
    });
    return () => panelY.removeListener(id);
  }, [panelY]);

  // Animate panel to position
  const animateToPosition = useCallback((toValue: number, showOverlay: boolean) => {
    Animated.parallel([
      Animated.spring(panelY, {
        toValue,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
      Animated.timing(overlayOpacity, {
        toValue: showOverlay ? 0.5 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [panelY, overlayOpacity]);

  // Pan responder for drag gestures.
  // Created once but reads live position from refs so it never uses a stale base.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        // Stop any running animation and capture the ACTUAL current position
        panelY.stopAnimation((value) => {
          dragStartY.current = value;
          panelYValue.current = value;
        });
        // Fallback in case the callback hasn't fired yet
        dragStartY.current = panelYValue.current;
      },
      onPanResponderMove: (_, gestureState) => {
        // Track the finger 1:1 from where the drag started
        const newY = dragStartY.current + gestureState.dy;
        const clampedY = Math.max(
          PANEL_MINIMIZED_Y,
          Math.min(PANEL_EXPANDED_Y, newY)
        );
        panelY.setValue(clampedY);
      },
      onPanResponderRelease: (_, gestureState) => {
        const velocity = gestureState.vy;
        const currentY = Math.max(
          PANEL_MINIMIZED_Y,
          Math.min(PANEL_EXPANDED_Y, dragStartY.current + gestureState.dy)
        );
        const midPoint = (PANEL_MINIMIZED_Y + PANEL_EXPANDED_Y) / 2;

        // Velocity-aware snap: fast swipe wins, otherwise nearest position
        if (velocity < -0.5 || (velocity <= 0.5 && currentY < midPoint)) {
          // Minimize - swipe up
          animateToPosition(PANEL_MINIMIZED_Y, false);
          setIsMinimized(true);
        } else {
          // Expand - swipe down
          animateToPosition(PANEL_EXPANDED_Y, true);
          setIsMinimized(false);
        }
      },
    })
  ).current;

  // Countdown timer for incoming requests
  useEffect(() => {
    if (!currentRequest || currentRequest.status !== 'incoming_request') {
      setCountdown(null);
      return;
    }

    const expiresAt = currentRequest.expiresAt;
    if (!expiresAt) return;

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [currentRequest?.orderId, currentRequest?.status, currentRequest?.expiresAt]);

  // Listen to driver_trip_requests/{driverUid} - PERMANENT GLOBAL LISTENER
  // CRITICAL: Only start listener if driverUid exists
  useEffect(() => {
    if (!driverUid) {
      // No authenticated driver - clear all state and don't start listener
      setCurrentRequest(null);
      setIsVisible(false);
      return;
    }

    const tripRequestsRef = ref(database, `driver_trip_requests/${driverUid}`);
    
    const listener = onValue(tripRequestsRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        // No requests
        if (!currentRequest || ['completed', 'rejected', 'expired', 'cancelled'].includes(currentRequest.status)) {
          setCurrentRequest(null);
          setIsVisible(false);
          animateToPosition(PANEL_MINIMIZED_Y, false);
        }
        return;
      }

      // Get all requests
      const requests = Object.entries(data).map(([orderId, requestData]: [string, any]) => ({
        orderId,
        ...requestData,
      })) as TripRequest[];

      if (requests.length === 0) {
        if (!currentRequest || ['completed', 'rejected', 'expired', 'cancelled'].includes(currentRequest.status)) {
          setCurrentRequest(null);
          setIsVisible(false);
          animateToPosition(PANEL_MINIMIZED_Y, false);
        }
        return;
      }

      // Get the active request (not in terminal state)
      const activeRequest = requests.find(r => 
        !['completed', 'rejected', 'expired', 'cancelled'].includes(r.status)
      );

      if (activeRequest) {
        const prevStatus = currentRequest?.status;
        setCurrentRequest(activeRequest);

        // Show panel on new incoming request
        if (activeRequest.status === 'incoming_request' && (!isVisible || prevStatus !== 'incoming_request')) {
          setIsVisible(true);
          setIsMinimized(false);
          animateToPosition(PANEL_EXPANDED_Y, true);
        }

        // Status changes that should hide panel
        if (['completed', 'rejected', 'expired', 'cancelled'].includes(activeRequest.status)) {
          setTimeout(() => {
            setIsVisible(false);
            setCurrentRequest(null);
            animateToPosition(PANEL_MINIMIZED_Y, false);
          }, 1500);
        }
      } else {
        // No active request
        setCurrentRequest(null);
        setIsVisible(false);
        animateToPosition(PANEL_MINIMIZED_Y, false);
      }
    });

    return () => off(tripRequestsRef, 'value', listener);
  }, [driverUid, currentRequest?.status, isVisible, animateToPosition]);

  // CENTRALIZED status update handler - ALL buttons use this same pattern
  // Matches the ACCEPT button behavior which is already working correctly
  const updateTripStatus = async (status: string): Promise<boolean> => {
    const uid = auth.currentUser?.uid;
    if (!uid || !currentRequest) return false;

    // Set appropriate loading state based on status
    if (status === 'accepted') {
      setIsAccepting(true);
    } else if (status === 'declined') {
      setIsRejecting(true);
    } else {
      setIsActionLoading(true);
    }

    try {
      const response = await fetch(`${API_BASE}/updateTripStatus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentRequest.orderId,
          driverId: uid,
          status: status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to update status to ${status}`);
      }
      // DO NOT manually update state - WAIT for RTDB status update
      return true;
    } catch (error) {
      console.error(`[v0] Error updating trip status to ${status}:`, error);
      return false;
    } finally {
      if (status === 'accepted') {
        setIsAccepting(false);
      } else if (status === 'declined') {
        setIsRejecting(false);
      } else {
        setIsActionLoading(false);
      }
    }
  };

  // All button handlers use the centralized updateTripStatus
  const handleAccept = () => updateTripStatus('accepted');
  const handleReject = () => updateTripStatus('declined');
  const handleArrived = () => updateTripStatus('arrived');
  const handleStartTrip = () => updateTripStatus('started');
  const handleAtStore = () => updateTripStatus('at_store');
  const handlePickedUp = () => updateTripStatus('picked_up');
  const handleDelivered = () => updateTripStatus('delivered');

  // Completion handler for BOTH workflows (direct_trip started -> completed and
  // store_delivery delivered -> completed). On success, capture the fare snapshot
  // and show the summary instead of letting the panel clear immediately.
  const handleComplete = async () => {
    const d = currentRequest?.data;
    const ok = await updateTripStatus('completed');
    if (ok) {
      setFarePanelData({
        total: d?.total,
        fee: d?.fee,
        currency: d?.currency,
        userName: d?.userName,
      });
      setShowFarePanel(true);
    }
  };

  // "Done" on the fare summary: hide it and run the same active-trip cleanup that
  // otherwise happens immediately on completion.
  const handleFareDone = () => {
    setShowFarePanel(false);
    setFarePanelData(null);
    setIsVisible(false);
    setCurrentRequest(null);
    animateToPosition(PANEL_MINIMIZED_Y, false);
  };

  // Render buttons based on workflowType and RTDB status
  const renderButtons = () => {
    if (!currentRequest) return null;

    const { workflowType, status } = currentRequest;

    // DIRECT TRIP flow: incoming_request -> accepted -> arrived -> started -> completed
    if (workflowType === 'direct_trip') {
      switch (status) {
        case 'incoming_request':
          return (
            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={[styles.rejectButton, isRejecting && styles.buttonDisabled]} 
                onPress={handleReject}
                disabled={isRejecting || isAccepting}
              >
                {isRejecting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Reject</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.acceptButton, isAccepting && styles.buttonDisabled]} 
                onPress={handleAccept}
                disabled={isAccepting || isRejecting}
              >
                {isAccepting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Accept</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        case 'accepted':
          return (
            <TouchableOpacity 
              style={[styles.actionButton, styles.arrivedButton, isActionLoading && styles.buttonDisabled]} 
              onPress={handleArrived}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Arrived</Text>
              )}
            </TouchableOpacity>
          );
        case 'arrived':
          return (
            <TouchableOpacity 
              style={[styles.actionButton, styles.startButton, isActionLoading && styles.buttonDisabled]} 
              onPress={handleStartTrip}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Start Trip</Text>
              )}
            </TouchableOpacity>
          );
        case 'started':
          return (
            <TouchableOpacity 
              style={[styles.actionButton, styles.completeButton, isActionLoading && styles.buttonDisabled]} 
              onPress={handleComplete}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Complete</Text>
              )}
            </TouchableOpacity>
          );
        case 'completed':
        case 'rejected':
        case 'expired':
        case 'cancelled':
          return null;
        default:
          return null;
      }
    }

    // DELIVERY flow: incoming_request -> accepted -> at_store -> picked_up -> delivered -> completed
    if (workflowType === 'store_delivery') {
      switch (status) {
        case 'incoming_request':
          return (
            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={[styles.rejectButton, isRejecting && styles.buttonDisabled]} 
                onPress={handleReject}
                disabled={isRejecting || isAccepting}
              >
                {isRejecting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Reject</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.acceptButton, isAccepting && styles.buttonDisabled]} 
                onPress={handleAccept}
                disabled={isAccepting || isRejecting}
              >
                {isAccepting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Accept</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        case 'accepted':
          return (
            <TouchableOpacity 
              style={[styles.actionButton, styles.atStoreButton, isActionLoading && styles.buttonDisabled]} 
              onPress={handleAtStore}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>At Store</Text>
              )}
            </TouchableOpacity>
          );
        case 'at_store':
          return (
            <TouchableOpacity 
              style={[styles.actionButton, styles.pickedUpButton, isActionLoading && styles.buttonDisabled]} 
              onPress={handlePickedUp}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Picked Up</Text>
              )}
            </TouchableOpacity>
          );
        case 'picked_up':
          return (
            <TouchableOpacity 
              style={[styles.actionButton, styles.deliveredButton, isActionLoading && styles.buttonDisabled]} 
              onPress={handleDelivered}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Delivered</Text>
              )}
            </TouchableOpacity>
          );
        case 'delivered':
          return (
            <TouchableOpacity 
              style={[styles.actionButton, styles.completeButton, isActionLoading && styles.buttonDisabled]} 
              onPress={handleComplete}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Complete Delivery</Text>
              )}
            </TouchableOpacity>
          );
        case 'completed':
        case 'rejected':
        case 'expired':
        case 'cancelled':
          return null;
        default:
          return null;
      }
    }

    return null;
  };

  // Get status display text and color
  const getStatusDisplay = () => {
    if (!currentRequest) return { text: '', color: '#666', bgColor: '#E8E8E8' };
    
    const statusMap: Record<string, { text: string; color: string; bgColor: string }> = {
      incoming_request: { text: 'New Request', color: '#FF6B00', bgColor: '#FFF3E0' },
      accepted: { text: 'En Route to Pickup', color: '#2196F3', bgColor: '#E3F2FD' },
      arrived: { text: 'At Pickup Location', color: '#4CAF50', bgColor: '#E8F5E9' },
      started: { text: 'Trip in Progress', color: '#9C27B0', bgColor: '#F3E5F5' },
      at_store: { text: 'At Store', color: '#FF9800', bgColor: '#FFF3E0' },
      picked_up: { text: 'Package Picked Up', color: '#00BCD4', bgColor: '#E0F7FA' },
      delivered: { text: 'Delivered', color: '#8BC34A', bgColor: '#F1F8E9' },
      completed: { text: 'Completed', color: '#4CAF50', bgColor: '#E8F5E9' },
      rejected: { text: 'Rejected', color: '#F44336', bgColor: '#FFEBEE' },
      expired: { text: 'Expired', color: '#9E9E9E', bgColor: '#F5F5F5' },
      cancelled: { text: 'Cancelled', color: '#F44336', bgColor: '#FFEBEE' },
    };
    
    return statusMap[currentRequest.status] || { text: currentRequest.status, color: '#666', bgColor: '#E8E8E8' };
  };

  // Get workflow icon
  const getWorkflowIcon = () => {
    if (!currentRequest) return <Car color="#333" size={20} />;
    
    if (currentRequest.workflowType === 'store_delivery') {
      return <Package color="#FF6B00" size={20} />;
    }
    
    const serviceType = currentRequest.data?.serviceType;
    if (serviceType === 'truck' || serviceType === 'delivery_truck') {
      return <Truck color="#333" size={20} />;
    }
    
    return <Car color="#333" size={20} />;
  };

  // CRITICAL: Do NOT render if driver is not authenticated
  if (!driverUid) {
    return null;
  }

  // Compute request-panel locals defensively. The fare summary renders
  // independently and persists after the live request clears on completion, so
  // we gate the REQUEST panel — not the whole component.
  const requestData = (currentRequest?.data || {}) as Partial<TripRequest['data']>;
  const pickupAddress = requestData.pickupAddress || 'Unknown location';
  const destinationAddress = requestData.destinationAddress || 'Unknown destination';
  const userName = requestData.userName || 'Customer';
  const userPhone = requestData.userPhone;
  const stops = Array.isArray(requestData.stops) ? requestData.stops : [];
  const statusDisplay = getStatusDisplay();

  return (
    <>
      {/* FARE SUMMARY - slides from top after completion, outlives the request */}
      <FareSummaryPanel visible={showFarePanel} data={farePanelData} onDone={handleFareDone} />

      {isVisible && currentRequest && (
        <>
      {/* OVERLAY - only visible when panel is expanded */}
      <Animated.View 
        style={[
          styles.overlay,
          { opacity: overlayOpacity }
        ]}
        pointerEvents={isMinimized ? 'none' : 'auto'}
      />

      {/* TOP-ANCHORED DRAGGABLE PANEL */}
      <Animated.View
        style={[
          styles.panel,
          {
            transform: [{ translateY: panelY }],
          },
        ]}
      >
        {/* Panel content */}
        <View style={styles.content}>
          {/* Status badge with countdown */}
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusDisplay.bgColor }]}>
              <Text style={[styles.statusText, { color: statusDisplay.color }]}>
                {statusDisplay.text}
              </Text>
            </View>
            {countdown !== null && currentRequest.status === 'incoming_request' && (
              <View style={styles.countdownBadge}>
                <Text style={styles.countdownText}>{countdown}s</Text>
              </View>
            )}
          </View>

          {/* Order ID and workflow type */}
          <View style={styles.orderInfoRow}>
            {getWorkflowIcon()}
            <View style={styles.orderIdContainer}>
              <Hash color="#999" size={12} />
              <Text style={styles.orderIdText}>
                {currentRequest.orderId.length > 16 
                  ? `${currentRequest.orderId.slice(0, 16)}...` 
                  : currentRequest.orderId}
              </Text>
            </View>
          </View>

          {/* Scrollable trip info: customer/pickup/stops/destination scroll
              underneath the fixed order ID and action buttons, so a request with
              many stops never pushes the buttons out of the panel. */}
          <ScrollView
            style={styles.infoScroll}
            contentContainerStyle={styles.infoScrollContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled
          >
            {/* Customer info */}
            <View style={styles.infoRow}>
              <View style={styles.iconCircle}>
                <User color="#333" size={18} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.label}>Customer</Text>
                <Text style={styles.value}>{userName}</Text>
              </View>
              {userPhone && (
                <TouchableOpacity style={styles.phoneButton}>
                  <Phone color="#4CAF50" size={18} />
                </TouchableOpacity>
              )}
            </View>

            {/* Pickup */}
            <View style={styles.infoRow}>
              <View style={[styles.iconCircle, styles.pickupIcon]}>
                <MapPin color="#fff" size={16} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.label}>Pickup</Text>
                <Text style={styles.value} numberOfLines={2}>{pickupAddress}</Text>
              </View>
            </View>

            {/* Stops (between pickup and destination) */}
            {stops.map((stop, index) => (
              <View style={styles.infoRow} key={`stop-${index}`}>
                <View style={[styles.iconCircle, styles.stopIcon]}>
                  <Text style={styles.stopNumber}>{index + 1}</Text>
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.label}>{`Stop ${index + 1}`}</Text>
                  <Text style={styles.value} numberOfLines={2}>{stop.address}</Text>
                </View>
              </View>
            ))}

            {/* Destination */}
            <View style={styles.infoRow}>
              <View style={[styles.iconCircle, styles.destinationIcon]}>
                <Navigation color="#fff" size={16} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.label}>Destination</Text>
                <Text style={styles.value} numberOfLines={2}>{destinationAddress}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Action buttons - fixed at bottom of content */}
          <View style={styles.buttonContainer}>
            {renderButtons()}
          </View>
        </View>

        {/* Handle bar at BOTTOM - draggable area */}
        <View {...panResponder.panHandlers} style={styles.handleContainer}>
          <View style={styles.handleBar} />
          <Text style={styles.handleHint}>
            {isMinimized ? 'Pull down to expand' : 'Swipe up to minimize'}
          </Text>
        </View>
      </Animated.View>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 9998,
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: PANEL_HEIGHT,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 25,
    zIndex: 9999,
  },
  content: {
    flex: 1,
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  handleBar: {
    width: 48,
    height: 5,
    backgroundColor: '#DDD',
    borderRadius: 3,
  },
  handleHint: {
    marginTop: 4,
    fontSize: 11,
    color: '#999',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
  },
  countdownBadge: {
    backgroundColor: '#FF6B00',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countdownText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  orderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  orderIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderIdText: {
    fontSize: 12,
    color: '#999',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickupIcon: {
    backgroundColor: '#4CAF50',
  },
  destinationIcon: {
    backgroundColor: '#2196F3',
  },
  stopIcon: {
    backgroundColor: '#5B2EFF',
  },
  stopNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: '#888',
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  phoneButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContainer: {
    marginTop: 'auto',
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#00C853',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#00C853',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#F44336',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#F44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  arrivedButton: {
    backgroundColor: '#2196F3',
    shadowColor: '#2196F3',
  },
  startButton: {
    backgroundColor: '#9C27B0',
    shadowColor: '#9C27B0',
  },
  completeButton: {
    backgroundColor: '#00C853',
    shadowColor: '#00C853',
  },
  atStoreButton: {
    backgroundColor: '#FF9800',
    shadowColor: '#FF9800',
  },
  pickedUpButton: {
    backgroundColor: '#00BCD4',
    shadowColor: '#00BCD4',
  },
  deliveredButton: {
    backgroundColor: '#8BC34A',
    shadowColor: '#8BC34A',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Scrollable trip-info region (between fixed order ID and fixed buttons)
  infoScroll: {
    flex: 1,
  },
  infoScrollContent: {
    paddingBottom: 8,
  },

  // ---- Fare summary panel ----
  farePanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: FARE_PANEL_HEIGHT,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 30,
    zIndex: 10000,
  },
  fareContent: {
  paddingTop: STATUS_BAR_HEIGHT + 12,
  paddingHorizontal: 24,
  paddingBottom: 12,
  alignItems: 'center',
  },
  fareIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  fareTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  fareCustomer: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
    marginBottom: 16,
  },
  fareTotalBox: {
    width: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  fareTotalLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  fareTotalValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#00C853',
  },
  fareBreakdownRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  fareBreakdownLabel: {
    fontSize: 14,
    color: '#666',
  },
  fareBreakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  fareDoneButton: {
  marginHorizontal: 24,
  marginBottom: 24,
  backgroundColor: '#00C853',
  paddingVertical: 16,
  borderRadius: 14,
  alignItems: 'center',
  shadowColor: '#00C853',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 6,
  },
});
