import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { database, auth } from '@/config/firebase';

// RTDB-based trip request structure
interface TripRequestData {
  pickupAddress: string;
  destinationAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  total: number;
  fee: number;
  userName: string;
  userPhone: string;
  workflowType?: string;
  serviceType?: string;
  dispatchService?: string;
}

interface TripRequest {
  orderId: string;
  workflowType: 'direct_trip' | 'store_delivery';
  requestType: string;
  status: string;
  createdAt: number;
  expiresAt: number;
  data: TripRequestData;
}

interface TripRequestContextType {
  currentRequest: TripRequest | null;
  isVisible: boolean;
  isMinimized: boolean;
  setIsMinimized: (value: boolean) => void;
  isLoading: boolean;
  setIsLoading: (value: boolean) => void;
  clearRequest: () => void;
}

const TripRequestContext = createContext<TripRequestContextType | undefined>(undefined);

export function TripRequestProvider({ children }: { children: ReactNode }) {
  const [currentRequest, setCurrentRequest] = useState<TripRequest | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [driverUid, setDriverUid] = useState<string | null>(null);

  // Listen for auth state changes to get authenticated driver UID
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        setDriverUid(user.uid);
      } else {
        setDriverUid(null);
        // Clear all state when user logs out
        setCurrentRequest(null);
        setIsVisible(false);
        setIsMinimized(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // RTDB listener - ONLY starts when driverUid is available
  useEffect(() => {
    // CRITICAL: Do NOT start listener if no authenticated driver UID
    if (!driverUid) {
      return;
    }

    // Listen ONLY to driver_trip_requests/{driverUid} in RTDB
    const tripRequestsRef = ref(database, `driver_trip_requests/${driverUid}`);
    
    const listener = onValue(tripRequestsRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        // No requests - hide panel only if status was terminal
        if (!currentRequest || 
            currentRequest.status === 'completed' || 
            currentRequest.status === 'rejected' || 
            currentRequest.status === 'expired' ||
            currentRequest.status === 'cancelled') {
          setCurrentRequest(null);
          setIsVisible(false);
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
        }
        return;
      }

      // Get the active request (not in terminal state)
      const activeRequest = requests.find(r => 
        !['completed', 'rejected', 'expired', 'cancelled'].includes(r.status)
      );

      if (activeRequest) {
        setCurrentRequest(activeRequest);

        // Show panel on incoming request
        if (activeRequest.status === 'incoming_request' && !isVisible) {
          setIsVisible(true);
          setIsMinimized(false);
        }

        // Handle terminal statuses - hide after brief delay
        if (['completed', 'rejected', 'expired', 'cancelled'].includes(activeRequest.status)) {
          setTimeout(() => {
            setIsVisible(false);
            setCurrentRequest(null);
          }, 1000);
        }
      } else {
        // No active request found
        setCurrentRequest(null);
        setIsVisible(false);
      }
    });

    return () => off(tripRequestsRef, 'value', listener);
  }, [driverUid, currentRequest?.status, isVisible]);

  const clearRequest = () => {
    setCurrentRequest(null);
    setIsVisible(false);
    setIsMinimized(false);
  };

  return (
    <TripRequestContext.Provider
      value={{
        currentRequest,
        isVisible,
        isMinimized,
        setIsMinimized,
        isLoading,
        setIsLoading,
        clearRequest,
      }}
    >
      {children}
    </TripRequestContext.Provider>
  );
}

export function useTripRequest() {
  const context = useContext(TripRequestContext);
  if (context === undefined) {
    throw new Error('useTripRequest must be used within TripRequestProvider');
  }
  return context;
}

// Keep backward compatibility exports during migration
export const IncomingRidesProvider = TripRequestProvider;
export const useIncomingRides = useTripRequest;
