  import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import RegistrationFooter from '@/components/RegistrationFooter';
import RegistrationHeader from '@/components/RegistrationHeader';
import { Picker } from '@react-native-picker/picker';
import { useRegistration } from '@/context/RegistrationContext';
import { auth, firestore } from '@/config/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import {
  validateEmail,
  isAtLeast18YearsOld,
  passwordsMatch,
  isValidPassword,
} from '@/utils/validation';
import { createFirebaseUser } from '@/utils/firebase';
import { uploadImageToCloudinary } from '@/utils/cloudinary';

export default function PersonalInfoPage() {
  const {
    registrationData,
    updateRegistrationData,
    updateProfile,
    currentStep,
    setCurrentStep,
    totalSteps,
  } = useRegistration();
  const [firstName, setFirstName] = useState(
    registrationData.profile.firstName || ''
  );
  const [lastName, setLastName] = useState(
    registrationData.profile.lastName || ''
  );
  const [dob, setDob] = useState(registrationData.profile.dob || '');
  const [email, setEmail] = useState(registrationData.email || '');
  const [password, setPassword] = useState(registrationData.password || '');
  const [confirmPassword, setConfirmPassword] = useState(
    registrationData.confirmPassword || ''
  );
  const [photo, setPhoto] = useState<string | null>(
    registrationData.profile.profilePicture || null
  );
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    dob: '',
  });

  useEffect(() => {
    if (registrationData.profile.profilePicture) {
      setPhoto(registrationData.profile.profilePicture);
    }
  }, [registrationData.profile.profilePicture]);

  const isValidDate = (dateStr: string): boolean => {
    if (!dateStr || dateStr.length !== 10) return false;

    const parts = dateStr.split('.');
    if (parts.length !== 3) return false;

    const [day, month, year] = parts.map(Number);

    if (!day || !month || !year) return false;
    if (day < 1 || day > 31) return false;
    if (month < 1 || month > 12) return false;

    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    const age = today.getFullYear() - year;

    if (
      birthDate.getDate() !== day ||
      birthDate.getMonth() !== month - 1 ||
      birthDate.getFullYear() !== year
    ) {
      return false;
    }

    if (age < 18) return false;
    if (age === 18) {
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0) return false;
      if (monthDiff === 0 && today.getDate() < birthDate.getDate())
        return false;
    }

    return true;
  };

  const handleDobChange = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '');

    if (cleaned.length >= 2) {
      cleaned = cleaned.slice(0, 2) + '.' + cleaned.slice(2);
    }
    if (cleaned.length >= 5) {
      cleaned = cleaned.slice(0, 5) + '.' + cleaned.slice(5);
    }
    if (cleaned.length > 10) {
      cleaned = cleaned.slice(0, 10);
    }

    setDob(cleaned);
    if (cleaned.length === 10 && !isValidDate(cleaned)) {
      setErrors((prev) => ({ ...prev, dob: 'You must be 18+ years old' }));
    } else {
      setErrors((prev) => ({ ...prev, dob: '' }));
    }
  };

  const isFormValid = (): boolean => {
    return (
      photo !== null &&
      firstName.trim() !== '' &&
      lastName.trim() !== '' &&
      isValidDate(dob) &&
      validateEmail(email) &&
      isValidPassword(password) &&
      passwordsMatch(password, confirmPassword)
    );
  };

  const handleNext = async () => {
    if (!photo) {
      Alert.alert('Profile Picture Required', 'Please take a profile picture to continue.');
      return;
    }

    if (!isValidDate(dob)) {
      Alert.alert(
        'Invalid Date of Birth',
        'Please enter a valid date in DD.MM.YYYY format. You must be 18 years or older.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!validateEmail(email)) {
      setErrors((prev) => ({
        ...prev,
        email: 'Please enter a valid email address',
      }));
      return;
    }

    if (!isValidPassword(password)) {
      setErrors((prev) => ({
        ...prev,
        password: 'Password must be at least 6 characters',
      }));
      return;
    }

    if (!passwordsMatch(password, confirmPassword)) {
      setErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      return;
    }

    if (!isFormValid()) {
      Alert.alert('Incomplete Form', 'Please fill in all fields correctly.', [
        { text: 'OK' },
      ]);
      return;
    }

    setLoading(true);

    try {
      let uid = registrationData.uid;

      if (!uid) {
        uid = await createFirebaseUser(email, password);
        updateRegistrationData({ uid, email, password, confirmPassword });
      }

      // Upload profile picture to Cloudinary
      let profilePictureUrl = '';
      if (photo) {
        try {
          const response = await fetch(photo);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result as string;
              resolve(base64data.split(',')[1]);
            };
            reader.readAsDataURL(blob);
          });
          profilePictureUrl = await uploadImageToCloudinary(base64, 'driver_images');
        } catch (uploadError) {
          console.error('Error uploading profile picture:', uploadError);
        }
      }

      updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dob: dob,
        profilePicture: profilePictureUrl,
      });

      // Check if driver document already exists to prevent duplicates
      const driverRef = doc(firestore, 'drivers', uid);
      const driverDoc = await getDoc(driverRef);

      if (!driverDoc.exists()) {
        // Create new driver document in Firestore with correct structure
        await setDoc(driverRef, {
          uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          email: email.trim(),
          phone: '',
          place: '',
          role: 'driver',
          verificationStatus: 'pending',
          registrationCompleted: false,
          rating: 0,
          reviewCount: 0,
          profile: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            dob: dob,
            profilePicture: profilePictureUrl,
          },
          documents: {
            idFront: '',
            idBack: '',
            idNumber: '',
            licenseImage: '',
            licenseExpiry: '',
            licenseNumber: '',
            selfieWithLicense: '',
          },
          vehicle: {
            brand: '',
            model: '',
            color: '',
            plateNumber: '',
            productionYear: '',
            type: '',
            vehicleCategory: '',
            carImage: '',
            registrationCertificate: '',
            vehicleLicense: '',
          },
          registrationStep: 1,
        });
      } else {
        // Update existing document
        await setDoc(driverRef, {
          updatedAt: serverTimestamp(),
          email: email.trim(),
          profile: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            dob: dob,
            profilePicture: profilePictureUrl,
          },
          registrationStep: 1,
        }, { merge: true });
      }

      setCurrentStep(2);
      router.push('/step2');
    } catch (error: any) {
      console.error('Error creating user:', error);
      Alert.alert(
        'Registration Error',
        error.message || 'Failed to create account'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <RegistrationHeader title="Sign Up" showHelp={true} />

      <View style={styles.titleContainer}>
        <Text style={styles.title}>Personal information</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >

        <TouchableOpacity
          style={styles.photoContainer}
          onPress={() => router.push('/personal-picture')}
        >
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photoImage} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.plusIcon}>+</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.photoLabel}>Personal picture</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>First name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder=""
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Surname</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder=""
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Date of birth</Text>
          <TextInput
            style={[styles.input, errors.dob && styles.inputError]}
            value={dob}
            onChangeText={handleDobChange}
            placeholder="DD.MM.YYYY"
            placeholderTextColor="#666"
            keyboardType="numeric"
            maxLength={10}
          />
          {errors.dob ? <Text style={styles.errorText}>{errors.dob}</Text> : null}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              updateRegistrationData({ email: text });
              setErrors((prev) => ({ ...prev, email: '' }));
            }}
            placeholder="Enter your email"
            placeholderTextColor="#666"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {errors.email ? (
            <Text style={styles.errorText}>{errors.email}</Text>
          ) : null}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={[styles.input, errors.password && styles.inputError]}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              updateRegistrationData({ password: text });
              setErrors((prev) => ({ ...prev, password: '' }));
            }}
            placeholder="Enter your password"
            placeholderTextColor="#666"
            secureTextEntry
          />
          {errors.password ? (
            <Text style={styles.errorText}>{errors.password}</Text>
          ) : null}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Confirm Password</Text>
          <TextInput
            style={[styles.input, errors.confirmPassword && styles.inputError]}
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              updateRegistrationData({ confirmPassword: text });
              if (password && text !== password) {
                setErrors((prev) => ({
                  ...prev,
                  confirmPassword: 'Passwords do not match',
                }));
              } else {
                setErrors((prev) => ({ ...prev, confirmPassword: '' }));
              }
            }}
            placeholder="Confirm your password"
            placeholderTextColor="#666"
            secureTextEntry
          />
          {errors.confirmPassword ? (
            <Text style={styles.errorText}>{errors.confirmPassword}</Text>
          ) : null}
        </View>
      </ScrollView>

      <RegistrationFooter
        currentStep={1}
        totalSteps={totalSteps}
        onNext={handleNext}
        canGoNext={isFormValid()}
        showBack={true}
        loading={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  titleContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 0,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 0,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  photoContainer: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 20,
    backgroundColor: '#3a3a3a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoImage: {
    width: 120,
    height: 120,
    borderRadius: 20,
  },
  plusIcon: {
    fontSize: 48,
    color: '#fff',
    fontWeight: '300',
  },
  photoLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  inputError: {
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: 4,
  },
  pickerContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    overflow: 'hidden',
  },
  picker: {
    color: '#fff',
    backgroundColor: '#2a2a2a',
  },
});
