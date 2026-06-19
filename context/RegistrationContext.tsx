 import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface RegistrationData {
  email: string;
  password: string;
  confirmPassword: string;
  uid: string;
  role: 'driver' | 'motorcycle' | 'cyclist' | 'trucker' | 'other' | '';

  profile: {
    firstName: string;
    lastName: string;
    dob: string;
    profilePicture: string;
  };

  phone: string;

  license: {
    number: string;
    expiry: string;
    licenseImage: string;
    selfieWithLicense: string;
  };

  idCard: {
    idNumber: string;
    idImage: string;
  };

  vehicle: {
    type: string;
    brand: string;
    model: string;
    productionYear: string;
    color: string;
    plateNumber: string;
    registrationCertificate: string;
    carImage: string;
    category?: string;
  };

  vehicleCategory?: string;

  operation: {
    place: string;
    available: boolean;
  };
}

interface RegistrationContextType {
  registrationData: RegistrationData;
  updateRegistrationData: (data: Partial<RegistrationData>) => void;
  updateProfile: (data: Partial<RegistrationData['profile']>) => void;
  updateLicense: (data: Partial<RegistrationData['license']>) => void;
  updateIdCard: (data: Partial<RegistrationData['idCard']>) => void;
  updateVehicle: (data: Partial<RegistrationData['vehicle']>) => void;
  updateOperation: (data: Partial<RegistrationData['operation']>) => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  totalSteps: number;
}

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

export function RegistrationProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 7;

  const [registrationData, setRegistrationData] = useState<RegistrationData>({
    email: '',
    password: '',
    confirmPassword: '',
    uid: '',
    role: '',

    profile: {
      firstName: '',
      lastName: '',
      dob: '',
      profilePicture: '',
    },

    phone: '',

    license: {
      number: '',
      expiry: '',
      licenseImage: '',
      selfieWithLicense: '',
    },

    idCard: {
      idNumber: '',
      idImage: '',
    },

    vehicle: {
      type: '',
      brand: '',
      model: '',
      productionYear: '',
      color: '',
      plateNumber: '',
      registrationCertificate: '',
      carImage: '',
    },

    operation: {
      place: '',
      available: false,
    },
  });

  const updateRegistrationData = (data: Partial<RegistrationData>) => {
    setRegistrationData(prev => ({ ...prev, ...data }));
  };

  const updateProfile = (data: Partial<RegistrationData['profile']>) => {
    setRegistrationData(prev => ({
      ...prev,
      profile: { ...prev.profile, ...data },
    }));
  };

  const updateLicense = (data: Partial<RegistrationData['license']>) => {
    setRegistrationData(prev => ({
      ...prev,
      license: { ...prev.license, ...data },
    }));
  };

  const updateIdCard = (data: Partial<RegistrationData['idCard']>) => {
    setRegistrationData(prev => ({
      ...prev,
      idCard: { ...prev.idCard, ...data },
    }));
  };

  const updateVehicle = (data: Partial<RegistrationData['vehicle']>) => {
    setRegistrationData(prev => ({
      ...prev,
      vehicle: { ...prev.vehicle, ...data },
    }));
  };

  const updateOperation = (data: Partial<RegistrationData['operation']>) => {
    setRegistrationData(prev => ({
      ...prev,
      operation: { ...prev.operation, ...data },
    }));
  };

  return (
    <RegistrationContext.Provider
      value={{
        registrationData,
        updateRegistrationData,
        updateProfile,
        updateLicense,
        updateIdCard,
        updateVehicle,
        updateOperation,
        currentStep,
        setCurrentStep,
        totalSteps,
      }}
    >
      {children}
    </RegistrationContext.Provider>
  );
}

export function useRegistration() {
  const context = useContext(RegistrationContext);
  if (!context) {
    throw new Error('useRegistration must be used within RegistrationProvider');
  }
  return context;
}
