 import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRegistration } from '@/context/RegistrationContext';

export default function DriverLicenseInstructionsPage() {
  const { registrationData, updateLicense } = useRegistration();
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);

  const handleTakePicture = async () => {
    if (!cameraPermission?.granted) {
      const { status } = await requestCameraPermission();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to take pictures.');
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
        setCapturedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const handleRetry = () => {
    setCapturedImage(null);
    setShowCamera(true);
  };

  const handleUpload = async () => {
    if (capturedImage) {
      // Only update local registration context - Firestore write happens in license-step.tsx
      updateLicense({
        ...registrationData.license,
        licenseImage: capturedImage,
      });

      router.back();
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
            <Text style={styles.uploadButtonText}>Save</Text>
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
        <Text style={styles.headerTitleLarge}>Driver License</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Content area - instructions and illustration */}
      <View style={styles.contentCompact}>
        <View style={styles.instructionsContainer}>
          <View style={styles.instructionItem}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.instructionText}>
              Take a picture of your original driver license.
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

        {/* Illustration with fixed height to prevent overlap with buttons */}
        <View style={styles.illustrationContainerFixed}>
          <View style={styles.illustrationBoxSmall}>
            <Text style={styles.illustrationTextSmall}>📄</Text>
          </View>
        </View>
      </View>

      {/* Footer buttons - static at bottom */}
      <View style={styles.footerFixed}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleTakePicture}>
          <Text style={styles.primaryButtonText}>Take a new picture</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleChooseFromGallery}>
          <Text style={styles.secondaryButtonText}>Choose from Gallery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  // Fixed header position - proper safe area
  headerFixed: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 12,
  },
  headerTitleLarge: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 16,
  },
  headerText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  // Compact content area
  contentCompact: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 32 },
  instructionsContainer: { marginBottom: 20 },
  instructionItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, paddingHorizontal: 8 },
  checkmark: { fontSize: 20, color: '#B19CD9', marginRight: 12, marginTop: 2 },
  instructionText: { flex: 1, fontSize: 16, color: '#fff', lineHeight: 24, flexWrap: 'wrap' },
  illustrationContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Fixed height illustration container to fit properly above buttons
  illustrationContainerFixed: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  illustrationBox: {
    width: 160,
    height: 160,
    backgroundColor: '#B19CD9',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationBoxSmall: {
    width: 130,
    height: 130,
    backgroundColor: '#B19CD9',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationText: { fontSize: 80 },
  illustrationTextSmall: { fontSize: 50 },
  // Fixed footer at bottom
  footerFixed: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    paddingTop: 16,
  },
  footer: { paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 30 : 20, paddingTop: 8 },
  primaryButton: { backgroundColor: '#B19CD9', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 12 },
  primaryButtonText: { fontSize: 18, fontWeight: '600', color: '#000' },
  secondaryButton: { backgroundColor: '#3a3a3a', borderRadius: 12, padding: 18, alignItems: 'center' },
  secondaryButtonText: { fontSize: 18, fontWeight: '600', color: '#fff' },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraControls: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  closeButton: { alignSelf: 'flex-start' },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  captureButtonInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
  previewContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  previewImage: { width: '100%', height: '70%', borderRadius: 16, resizeMode: 'contain' },
  previewActions: { flexDirection: 'row', paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 30 : 20, gap: 12 },
  retryButton: { flex: 1, backgroundColor: '#3a3a3a', borderRadius: 12, padding: 18, alignItems: 'center' },
  retryButtonText: { fontSize: 18, fontWeight: '600', color: '#fff' },
  uploadButton: { flex: 1, backgroundColor: '#B19CD9', borderRadius: 12, padding: 18, alignItems: 'center' },
  uploadButtonText: { fontSize: 18, fontWeight: '600', color: '#000' },
});
