import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { X, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRegistration } from '@/context/RegistrationContext';
import { auth, firestore } from '@/config/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { uploadImageToCloudinary } from '@/utils/cloudinary';

export default function IdStepPage() {
  const { registrationData, updateIdCard, setCurrentStep, totalSteps } = useRegistration();

  const [idFront, setIdFront] = useState<string | null>(null);
  const [idBack, setIdBack] = useState<string | null>(null);
  const [idNumber, setIdNumber] = useState(registrationData.idCard?.idNumber || '');
  const [isUploading, setIsUploading] = useState(false);

  const [showInstructions, setShowInstructions] = useState<'front' | 'back' | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);

  // ---------- MODIFIED: enforce ######/##/# pattern (9 digits total) ----------
  const formatIdNumber = (text: string) => {
    // remove non-digits
    const digits = text.replace(/\D/g, '');
    // limit digits to 9 (6 + 2 + 1)
    const limited = digits.slice(0, 9);

    const part1 = limited.slice(0, 6);            // first 6 digits
    const part2 = limited.slice(6, 8);            // next 2 digits
    const part3 = limited.slice(8, 9);            // final 1 digit

    if (limited.length <= 6) {
      return part1;
    } else if (limited.length <= 8) {
      return `${part1}/${part2}`;
    } else {
      return `${part1}/${part2}/${part3}`;
    }
  };

  // exact regex for ######/##/# (6 digits / 2 digits / 1 digit)
  const idPattern = /^\d{6}\/\d{2}\/\d{1}$/;
  const isFormValid = Boolean(idFront && idBack && idPattern.test(idNumber));
  // -------------------------------------------------------------------------

  const openCamera = async () => {
    if (!cameraPermission) {
      const { status } = await requestCameraPermission();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required.');
        return;
      }
    }

    if (!cameraPermission?.granted) {
      const { status } = await requestCameraPermission();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required.');
        return;
      }
    }
    setShowCamera(true);
  };

  const takePicture = async () => {
    if (cameraRef) {
      try {
        const photo = await cameraRef.takePictureAsync();
        if (photo?.uri) {
          setCapturedImage(photo.uri);
          setShowCamera(false);
        }
      } catch (error) {
        console.error('Error taking picture:', error);
        Alert.alert('Error', 'Failed to take picture. Please try again.');
      }
    }
  };

  const handleUpload = () => {
    if (capturedImage) {
      if (showInstructions === 'front') setIdFront(capturedImage);
      if (showInstructions === 'back') setIdBack(capturedImage);
      setCapturedImage(null);
      setShowInstructions(null);
    }
  };

  const handleRetry = () => {
    setCapturedImage(null);
    setShowCamera(true);
  };

  const handleChooseFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Gallery permission is required to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        if (showInstructions === 'front') setIdFront(result.assets[0].uri);
        if (showInstructions === 'back') setIdBack(result.assets[0].uri);
        setShowInstructions(null);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const handleNext = async () => {
    if (!isFormValid || isUploading) return;

    const uid = auth.currentUser?.uid || registrationData.uid;
    if (!uid) return;

    try {
      setIsUploading(true);

      // Upload ID images to Cloudinary
      let idFrontUrl = '';
      let idBackUrl = '';

      if (idFront) {
        const response = await fetch(idFront);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
        idFrontUrl = await uploadImageToCloudinary(base64, 'driver_images');
      }

      if (idBack) {
        const response = await fetch(idBack);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
        idBackUrl = await uploadImageToCloudinary(base64, 'driver_images');
      }

      // Update Firestore with ID data and Cloudinary URLs using documents structure
      const driverRef = doc(firestore, 'drivers', uid);
      await updateDoc(driverRef, {
        'documents.idFront': idFrontUrl,
        'documents.idBack': idBackUrl,
        'documents.idNumber': idNumber.trim(),
        registrationStep: 3,
        updatedAt: serverTimestamp(),
      });

      updateIdCard({
        idNumber: idNumber.trim(),
        idImage: idFrontUrl,
      });

      setCurrentStep(4);
      router.push('/license-step');
    } catch (error) {
      console.error('Error saving ID data:', error);
      Alert.alert('Error', 'Failed to save ID information. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          ref={(ref) => setCameraRef(ref)}
          facing="back"
        >
          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowCamera(false)}
            >
              <ArrowLeft color="#fff" size={28} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  if (capturedImage) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setCapturedImage(null)}>
            <ArrowLeft color="#fff" size={28} />
          </TouchableOpacity>
          <Text style={styles.headerText}>Preview</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.previewImage} />
        </View>

        <View style={styles.previewActions}>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.uploadButton} onPress={handleUpload}>
            <Text style={styles.uploadButtonText}>Upload</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (showInstructions) {
    return (
      <View style={styles.container}>
        <View style={styles.headerCompact}>
          <TouchableOpacity onPress={() => setShowInstructions(null)}>
            <ArrowLeft color="#fff" size={28} />
          </TouchableOpacity>
          <Text style={styles.headerTitleLarge}>
            {showInstructions === 'front' ? 'ID Front' : 'ID Back'}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.instructionContent}>
          <View style={styles.instructionsContainer}>
            <View style={styles.instructionItem}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.instructionText}>
                Take a picture of your original <Text style={styles.boldText}>ID.</Text>
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.instructionText}>
                Please don&apos;t use screenshots, copies, or printed photos.
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.instructionText}>
                No filters, your face and all the details must be clearly visible
              </Text>
            </View>
          </View>

          <View style={styles.illustrationContainerFixed}>
            <View style={styles.illustrationBoxSmall}>
              <Text style={styles.illustrationTextSmall}>ID</Text>
            </View>
          </View>
        </View>

        <View style={styles.footerFixed}>
          <TouchableOpacity style={styles.primaryButton} onPress={openCamera}>
            <Text style={styles.primaryButtonText}>Take a new picture</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleChooseFromGallery}>
            <Text style={styles.secondaryButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with proper safe area positioning */}
      <View style={styles.headerFixed}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color="#fff" size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitleLarge}>ID Number</Text>
        <TouchableOpacity>
          <Text style={styles.helpText}>Help</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.imagesContainer}>
          <TouchableOpacity
            style={styles.imageBox}
            onPress={() => setShowInstructions('front')}
          >
            {idFront ? (
              <Image source={{ uri: idFront }} style={styles.capturedImage} />
            ) : (
              <View style={styles.placeholderBox}>
                <Text style={styles.plusIcon}>+</Text>
              </View>
            )}
            <Text style={styles.imageLabel}>Id front</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.imageBox}
            onPress={() => setShowInstructions('back')}
          >
            {idBack ? (
              <Image source={{ uri: idBack }} style={styles.capturedImage} />
            ) : (
              <View style={styles.placeholderBox}>
                <Text style={styles.plusIcon}>+</Text>
              </View>
            )}
            <Text style={styles.imageLabel}>Id back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Id number</Text>
          <TextInput
            style={styles.input}
            value={idNumber}
            onChangeText={(text) => setIdNumber(formatIdNumber(text))}
            placeholder="123456/12/1"
            placeholderTextColor="#666"
            keyboardType="numeric"
            maxLength={11}
/>
  </View>

  {/* Upload status indicator */}
  {isUploading && (
    <View style={styles.uploadingContainer}>
      <Text style={styles.uploadingText}>Uploading images...</Text>
    </View>
  )}
  </View>
  
  <View style={styles.footer}>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>3 of {totalSteps}</Text>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(3 / totalSteps) * 100}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  // Fixed header with proper safe area
  headerFixed: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 16,
  },
  headerCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 12,
  },
  headerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerTitleLarge: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  helpText: {
    color: '#4a9eff',
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  instructionContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 32,
  },
  imagesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 16,
  },
  imageBox: {
    flex: 1,
    alignItems: 'center',
  },
  placeholderBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#3a3a3a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  capturedImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    marginBottom: 8,
  },
  plusIcon: {
    fontSize: 48,
    color: '#fff',
    fontWeight: '300',
  },
  imageLabel: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 4,
    flexWrap: 'wrap',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#3a3a3a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#4a4a4a',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    paddingTop: 8,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#3a3a3a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#B19CD9',
    borderRadius: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    backgroundColor: '#3a3a3a',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#B19CD9',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextButtonDisabled: {
    backgroundColor: '#3a3a3a',
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  instructionsContainer: {
    marginBottom: 40,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  checkmark: {
    fontSize: 20,
    color: '#B19CD9',
    marginRight: 12,
    marginTop: 2,
  },
  instructionText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
    flexWrap: 'wrap',
    paddingRight: 8,
  },
  boldText: {
    fontWeight: 'bold',
  },
  illustrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationContainerFixed: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  illustrationBox: {
    width: 200,
    height: 200,
    backgroundColor: '#B19CD9',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationBoxSmall: {
    width: 140,
    height: 140,
    backgroundColor: '#B19CD9',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationText: {
    fontSize: 80,
  },
  illustrationTextSmall: {
    fontSize: 50,
  },
  footerFixed: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    paddingTop: 16,
  },
  primaryButton: {
    backgroundColor: '#B19CD9',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  secondaryButton: {
    backgroundColor: '#3a3a3a',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  closeButton: {
    alignSelf: 'flex-start',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  previewImage: {
    width: '100%',
    height: '70%',
    borderRadius: 16,
    resizeMode: 'contain',
  },
  previewActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    gap: 12,
  },
  retryButton: {
    flex: 1,
    backgroundColor: '#3a3a3a',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  uploadButton: {
    flex: 1,
    backgroundColor: '#B19CD9',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
uploadButtonText: {
  fontSize: 18,
  fontWeight: '600',
  color: '#000',
  },
  uploadingContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  uploadingText: {
    color: '#B19CD9',
    fontSize: 14,
  },
});
