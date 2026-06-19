import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRegistration } from '@/context/RegistrationContext';
import { auth, firestore } from '@/config/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { uploadImageToCloudinary } from '@/utils/cloudinary';

export default function DriverLicensePage() {
  const { registrationData, updateLicense, setCurrentStep, totalSteps } = useRegistration();

  const [licenseImage, setLicenseImage] = useState<string | null>(
    registrationData.license.licenseImage || null
  );
  const [selfieImage, setSelfieImage] = useState<string | null>(
    registrationData.license.selfieWithLicense || null
  );
  const [licenseNumber, setLicenseNumber] = useState(
    registrationData.license.number || ''
  );
  const [expiry, setExpiry] = useState(registrationData.license.expiry || '');
  const [licenseError, setLicenseError] = useState('');
  const [expiryError, setExpiryError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // ✅ Keep local state in sync with global state
  useEffect(() => {
    setLicenseImage(registrationData.license.licenseImage || null);
    setSelfieImage(registrationData.license.selfieWithLicense || null);
    setLicenseNumber(registrationData.license.number || '');
    setExpiry(registrationData.license.expiry || '');
  }, [registrationData]);

  const formatLicenseNumber = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);

    if (digits.length <= 6) {
      return digits;
    }
    if (digits.length === 7) {
      return `${digits.slice(0, 6)}/${digits.slice(6, 7)}`;
    }
    return `${digits.slice(0, 6)}/${digits.slice(6, 7)}/${digits.slice(7, 8)}`;
  };

  const isLicenseNumberValid = (value: string) => /^\d{6}\/\d{1}\/\d{1}$/.test(value);

  const formatExpiryInput = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 2) {
      out = digits.slice(0, 2) + '.' + digits.slice(2);
    }
    if (digits.length > 4) {
      out = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
    }
    return out;
  };

  const validateExpiryDate = (value: string) => {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
      setExpiryError('Invalid format — use DD.MM.YYYY');
      return false;
    }

    const [dStr, mStr, yStr] = value.split('.');
    const day = parseInt(dStr, 10);
    const month = parseInt(mStr, 10);
    const year = parseInt(yStr, 10);
    const date = new Date(year, month - 1, day);

    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      setExpiryError('Invalid date');
      return false;
    }

    const today = new Date();
    const min = new Date();
    min.setMonth(min.getMonth() + 3);

    const max = new Date();
    max.setFullYear(max.getFullYear() + 10);

    if (date < min) {
      setExpiryError('Expiry must be at least 3 months from today');
      return false;
    }
    if (date > max) {
      setExpiryError('Expiry cannot be more than 10 years from today');
      return false;
    }

    setExpiryError('');
    return true;
  };

  const isFormValid = licenseImage && selfieImage && isLicenseNumberValid(licenseNumber) && /^\d{2}\.\d{2}\.\d{4}$/.test(expiry) && !expiryError && !isUploading;

  const handleNext = async () => {
    if (!isFormValid || isUploading) return;

    const uid = auth.currentUser?.uid || registrationData.uid;
    if (!uid) return;

    try {
      setIsUploading(true);

      // Upload license images to Cloudinary
      let licenseImageUrl = '';
      let selfieImageUrl = '';

      if (licenseImage) {
        const response = await fetch(licenseImage);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
        licenseImageUrl = await uploadImageToCloudinary(base64, 'driver_images');
      }

      if (selfieImage) {
        const response = await fetch(selfieImage);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
        selfieImageUrl = await uploadImageToCloudinary(base64, 'driver_images');
      }

      // Update Firestore with license data
      const driverRef = doc(firestore, 'drivers', uid);
      await updateDoc(driverRef, {
        'documents.licenseImage': licenseImageUrl,
        'documents.selfieWithLicense': selfieImageUrl,
        'documents.licenseNumber': licenseNumber.trim(),
        'documents.licenseExpiry': expiry.trim(),
        registrationStep: 4,
        updatedAt: serverTimestamp(),
      });

      updateLicense({
        ...registrationData.license,
        number: licenseNumber.trim(),
        expiry: expiry.trim(),
        licenseImage: licenseImageUrl,
        selfieWithLicense: selfieImageUrl,
      });

      setCurrentStep(5);
      router.push('/ridesDelivery');
    } catch (error) {
      console.error('Error saving license data:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <Text style={styles.headerTitleLarge}>Driver License</Text>
        <TouchableOpacity>
          <Text style={styles.helpText}>Help</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>

        <View style={styles.imagesContainer}>
          {/* License Image */}
          <TouchableOpacity
            style={styles.imageBox}
            onPress={() =>
              router.push({
                pathname: '/driver-license-instructions',
                params: { returnTo: 'license-step' },
              })
            }
          >
            {licenseImage ? (
              <Image source={{ uri: licenseImage }} style={styles.capturedImage} />
            ) : (
              <View style={styles.placeholderBox}>
                <Text style={styles.plusIcon}>+</Text>
              </View>
            )}
            <Text style={styles.imageLabel}>Driver license</Text>
          </TouchableOpacity>

          {/* Selfie Image */}
          <TouchableOpacity
            style={styles.imageBox}
            onPress={() =>
              router.push({
                pathname: '/selfie-with-license-instructions',
                params: { returnTo: 'license-step' },
              })
            }
          >
            {selfieImage ? (
              <Image source={{ uri: selfieImage }} style={styles.capturedImage} />
            ) : (
              <View style={styles.placeholderBox}>
                <Text style={styles.plusIcon}>+</Text>
              </View>
            )}
            <Text style={styles.imageLabel}>Selfie with driver license</Text>
          </TouchableOpacity>
        </View>

        {/* License number input */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>License number</Text>
          <TextInput
            style={styles.input}
            value={licenseNumber}
            onChangeText={(val) => {
              const formatted = formatLicenseNumber(val);
              setLicenseNumber(formatted);
              updateLicense({ ...registrationData.license, number: formatted });
              if (isLicenseNumberValid(formatted)) {
                setLicenseError('');
              } else if (formatted.length === 10) {
                setLicenseError('Invalid format. Use: 123456/1/1');
              }
            }}
            placeholder="123456/1/1"
            placeholderTextColor="#666"
            keyboardType="numeric"
            maxLength={10}
          />
          {licenseError ? <Text style={styles.errorText}>{licenseError}</Text> : null}
        </View>

        {/* Expiration date input */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Expiration date</Text>
          <TextInput
            style={styles.input}
            value={expiry}
            onChangeText={(val) => {
              const formatted = formatExpiryInput(val);
              setExpiry(formatted);
              updateLicense({ ...registrationData.license, expiry: formatted });
              if (formatted.length === 10) {
                validateExpiryDate(formatted);
              } else {
                setExpiryError('');
              }
            }}
            onBlur={() => {
              if (expiry.length === 10) {
                validateExpiryDate(expiry);
              }
            }}
            placeholder="DD.MM.YYYY"
            placeholderTextColor="#666"
            keyboardType="numeric"
            maxLength={10}
          />
          {expiryError ? <Text style={styles.errorText}>{expiryError}</Text> : null}
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>4 of {totalSteps}</Text>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(4 / totalSteps) * 100}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.nextButton,
              !isFormValid && styles.nextButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={!isFormValid}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <ChevronRight color="#000" size={24} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 16
  },
  headerText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headerTitleLarge: { color: '#fff', fontSize: 24, fontWeight: '700' },
  helpText: { color: '#4a9eff', fontSize: 16 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  imagesContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32, gap: 16 },
  imageBox: { flex: 1, alignItems: 'center' },
  placeholderBox: {
    width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#3a3a3a',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8
  },
  capturedImage: { width: '100%', aspectRatio: 1, borderRadius: 16, marginBottom: 8 },
  plusIcon: { fontSize: 48, color: '#fff', fontWeight: '300' },
  imageLabel: { fontSize: 14, color: '#fff', textAlign: 'center', lineHeight: 18, paddingHorizontal: 4 },
  inputContainer: { marginBottom: 20 },
  inputLabel: { fontSize: 14, color: '#999', marginBottom: 8 },
  input: {
    backgroundColor: '#3a3a3a', borderRadius: 12, padding: 16, fontSize: 16, color: '#fff',
    borderWidth: 1, borderColor: '#4a4a4a'
  },
  footer: { paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 30 : 20, paddingTop: 8 },
  progressContainer: { marginBottom: 16 },
  progressText: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12, textAlign: 'center' },
  progressBarBackground: { height: 6, backgroundColor: '#3a3a3a', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#B19CD9', borderRadius: 4 },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  backButton: { backgroundColor: '#3a3a3a', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 24 },
  backButtonText: { fontSize: 18, fontWeight: '600', color: '#fff' },
  nextButton: {
    flex: 1, backgroundColor: '#B19CD9', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8
  },
  nextButtonDisabled: { backgroundColor: '#3a3a3a', opacity: 0.5 },
  nextButtonText: { fontSize: 18, fontWeight: '600', color: '#000' },
  errorText: { color: '#ff4444', fontSize: 12, marginTop: 4 },
});

