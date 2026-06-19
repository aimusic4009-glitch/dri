 import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, firestore } from '@/config/firebase';
import { RegistrationData } from '@/context/RegistrationContext';

export async function createFirebaseUser(email: string, password: string): Promise<string> {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  return userCredential.user.uid;
}

export async function createDriverDocument(
  uid: string,
  email: string
): Promise<void> {
  try {
    const driverRef = doc(firestore, 'drivers', uid);
    await setDoc(driverRef, {
      uid,
      email,
      createdAt: serverTimestamp(),
      verificationStatus: 'draft',
      registrationCompleted: false,
      registrationStep: 1,
    });
  } catch (error) {
    console.error('Error creating driver document:', error);
    throw error;
  }
}

export async function updateDriverData(
  uid: string,
  data: Partial<RegistrationData>,
  step: number
): Promise<void> {
  try {
    const driverRef = doc(firestore, 'drivers', uid);

    const updateData: any = {
      registrationStep: step,
      updatedAt: serverTimestamp(),
    };

    if (data.phone) {
      updateData.phone = data.phone;
    }

    if (data.profile) {
      // Use dot notation for nested updates to avoid overwriting
      if (data.profile.firstName) updateData['profile.firstName'] = data.profile.firstName;
      if (data.profile.lastName) updateData['profile.lastName'] = data.profile.lastName;
      if (data.profile.dob) updateData['profile.dob'] = data.profile.dob;
      if (data.profile.profilePicture) updateData['profile.profilePicture'] = data.profile.profilePicture;
    }

    if (data.license) {
      // Update documents section for license info
      if (data.license.number) updateData['documents.licenseNumber'] = data.license.number;
      if (data.license.expiry) updateData['documents.licenseExpiry'] = data.license.expiry;
      if (data.license.licenseImage) updateData['documents.licenseImage'] = data.license.licenseImage;
      if (data.license.selfieWithLicense) updateData['documents.selfieWithLicense'] = data.license.selfieWithLicense;
    }

    if (data.idCard) {
      // Update documents section for ID info
      if (data.idCard.idNumber) updateData['documents.idNumber'] = data.idCard.idNumber;
      if (data.idCard.idImage) updateData['documents.idFront'] = data.idCard.idImage;
    }

    if (data.vehicleCategory) {
      updateData['vehicle.vehicleCategory'] = data.vehicleCategory;
    }

    if (data.vehicle) {
      if (data.vehicle.type) updateData['vehicle.type'] = data.vehicle.type;
      if (data.vehicle.brand) updateData['vehicle.brand'] = data.vehicle.brand;
      if (data.vehicle.model) updateData['vehicle.model'] = data.vehicle.model;
      if (data.vehicle.productionYear) updateData['vehicle.productionYear'] = data.vehicle.productionYear;
      if (data.vehicle.color) updateData['vehicle.color'] = data.vehicle.color;
      if (data.vehicle.plateNumber) updateData['vehicle.plateNumber'] = data.vehicle.plateNumber;
      if (data.vehicle.registrationCertificate) updateData['vehicle.registrationCertificate'] = data.vehicle.registrationCertificate;
      if (data.vehicle.carImage) updateData['vehicle.carImage'] = data.vehicle.carImage;
      if (data.vehicle.vehicleLicense) updateData['vehicle.vehicleLicense'] = data.vehicle.vehicleLicense;
    }

    if (data.operation) {
      if (data.operation.place) updateData.place = data.operation.place;
    }

    if (data.role) {
      updateData.role = data.role;
    }

    await updateDoc(driverRef, updateData);
  } catch (error) {
    console.error('Error updating driver data:', error);
    throw error;
  }
}

export async function completeDriverRegistration(uid: string): Promise<void> {
  try {
    const driverRef = doc(firestore, 'drivers', uid);
    await updateDoc(driverRef, {
      verificationStatus: 'pending',
      registrationCompleted: true,
      registrationStep: 7,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error completing driver registration:', error);
    throw error;
  }
}
