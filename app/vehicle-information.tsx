import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Modal,
  FlatList,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, X, Check, ChevronLeft, Search } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import colorsData from '../assets/colors.json';
import { auth, firestore } from '@/config/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { useRegistration } from '@/context/RegistrationContext';
import { uploadImageToCloudinary } from '@/utils/cloudinary';

type ImageType = 'vehiclePicture' | 'vehicleLicense' | 'vehicleRegistration';
type ViewMode = 'main' | 'instruction' | 'camera' | 'preview';

// Vehicle data from Firestore vehicles_master collection
interface VehicleMasterDoc {
  id: string;
  brand: string;
  model: string;
  vehicleCategory: 'car' | 'minibus' | 'motorbike' | 'truck';
}

type BrandItem = {
  id: string;
  name: string;
  models: string[];
  vehicleCategory: string;
};

interface VehicleData {
  brand: string;
  model: string;
  color: string;
  productionYear: string;
  numberPlate: string;
  classification: string;
  vehiclePicture: string;
  vehicleLicense: string;
  vehicleRegistration: string;
  services?: string[];
  cargoType?: string; // Single select: 'open' or 'enclosed'
  refrigerationType?: string; // Only for enclosed: 'refrigerated' or 'non_refrigerated'
  tonnage?: string;
}

export default function VehicleInformation() {
  const router = useRouter();
  const { registrationData } = useRegistration();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [currentImageType, setCurrentImageType] = useState<ImageType | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraRef, setCameraRef] = useState<any>(null);

  const [vehicleData, setVehicleData] = useState<VehicleData>({
    brand: '',
    model: '',
    color: '',
    productionYear: '',
    numberPlate: '',
    classification: '',
    vehiclePicture: '',
    vehicleLicense: '',
    vehicleRegistration: '',
    services: [],
    cargoType: '', // Single select
    refrigerationType: '', // Only for enclosed cargo type
    tonnage: '',
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingBrands, setIsLoadingBrands] = useState(true);

  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showServicesPicker, setShowServicesPicker] = useState(false);
  const [showTonnagePicker, setShowTonnagePicker] = useState(false);
  const [showCargoTypePicker, setShowCargoTypePicker] = useState(false);
  const [showRefrigerationPicker, setShowRefrigerationPicker] = useState(false);

  // All brands loaded from Firestore vehicles_master
  const [allBrands, setAllBrands] = useState<BrandItem[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<BrandItem | null>(null);

  // Service rules loaded from vehicle_service_rules
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [availableCargoTypes, setAvailableCargoTypes] = useState<string[]>([]);
  const [availableTonnageOptions, setAvailableTonnageOptions] = useState<string[]>([]);

  const [brandSearch, setBrandSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [filteredBrands, setFilteredBrands] = useState<BrandItem[]>([]);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);
  const [plateError, setPlateError] = useState('');

  const getInstructionContent = (type: ImageType) => {
    switch (type) {
      case 'vehiclePicture':
        return {
          title: 'Vehicle picture',
          instructions: [
            'Take a picture of your vehicle as shown in the example.',
            'Make sure the registration plate and the body of the vehicle are visible',
          ],
        };
      case 'vehicleLicense':
        return {
          title: 'Motor Vehicle licence',
          instructions: ['Please upload a picture of your Motor Vehicle License'],
        };
      case 'vehicleRegistration':
        return {
          title: 'Certificate of Registration',
          instructions: ['Please upload a picture of the Certificate of Registration'],
        };
    }
  };

  const handleImageTypePress = (type: ImageType) => {
    setCurrentImageType(type);
    setViewMode('instruction');
  };

  const handleTakeNewPicture = async () => {
    if (!cameraPermission) {
      await requestCameraPermission();
      return;
    }

    if (!cameraPermission.granted) {
      Alert.alert('Permission Required', 'Camera permission is required to take photos.');
      await requestCameraPermission();
      return;
    }

    setViewMode('camera');
  };

  const handleChooseFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
      setViewMode('preview');
    }
  };

  const handleCapture = async () => {
    if (cameraRef) {
      const photo = await cameraRef.takePictureAsync();
      setCapturedImage(photo.uri);
      setViewMode('preview');
    }
  };

  const handleUpload = () => {
    if (capturedImage && currentImageType) {
      setVehicleData((prev) => ({
        ...prev,
        [currentImageType]: capturedImage,
      }));
      setCapturedImage(null);
      setCurrentImageType(null);
      setViewMode('main');
    }
  };

  const handleRetry = () => {
    setCapturedImage(null);
    setViewMode('camera');
  };

  // Store raw vehicle documents for looking up doc IDs later
  const [vehicleDocMap, setVehicleDocMap] = useState<Map<string, string>>(new Map());

  // Load brands from Firestore vehicles_master collection based on vehicleCategory
  useEffect(() => {
    const loadBrandsFromFirestore = async () => {
      setIsLoadingBrands(true);

      try {
        const uid = auth.currentUser?.uid || registrationData.uid;

        // Step 1: Get vehicleCategory - first try context, then fetch from Firestore
        let vehicleCategory = registrationData.vehicleCategory;

        if (!vehicleCategory && uid) {
          console.log('[v0] No category in context, fetching from Firestore...');
          const driverRef = doc(firestore, 'drivers', uid);
          const driverSnap = await getDoc(driverRef);

          if (driverSnap.exists()) {
            vehicleCategory = driverSnap.data()?.vehicle?.vehicleCategory;
            console.log('[v0] Loaded vehicleCategory from Firestore:', vehicleCategory);
          }
        }

        if (!vehicleCategory) {
          console.log('[v0] No vehicle category found');
          setIsLoadingBrands(false);
          return;
        }

        console.log('[v0] Loading brands for category:', vehicleCategory);

        // Step 2: Query vehicles_master collection FIRST - filtered by vehicleCategory
        // This is the FIRST query - NOT pricing, NOT services, NOT vehicle_service_rules
        const vehiclesMasterRef = collection(firestore, 'vehicles_master');
        const q = query(vehiclesMasterRef, where('vehicleCategory', '==', vehicleCategory));
        const querySnapshot = await getDocs(q);

        console.log('[v0] vehicles_master query returned', querySnapshot.size, 'documents');

        // Step 3: Group documents by brand and aggregate models
        // Also store the document ID mapping for later service rules lookup
        const brandMap: Map<string, { models: { name: string; docId: string }[]; vehicleCategory: string }> = new Map();
        const docIdMap: Map<string, string> = new Map(); // key: "brand_model", value: docId

        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const brandName = data.brand;
          const model = data.model;
          const docId = docSnap.id; // This is the actual document ID like "toyota_dyna"

          console.log('[v0] Found vehicle:', docId, '- Brand:', brandName, 'Model:', model);

          // Store the document ID mapping (brand_model -> docId)
          if (brandName && model) {
            const key = `${brandName}_${model}`.toLowerCase().replace(/\s+/g, '_');
            docIdMap.set(key, docId);
          }

          if (brandMap.has(brandName)) {
            const existing = brandMap.get(brandName)!;
            if (model && !existing.models.find(m => m.name === model)) {
              existing.models.push({ name: model, docId });
            }
          } else {
            brandMap.set(brandName, {
              models: model ? [{ name: model, docId }] : [],
              vehicleCategory: data.vehicleCategory,
            });
          }
        });

        setVehicleDocMap(docIdMap);

        // Convert map to array of BrandItem
        const brands: BrandItem[] = [];
        brandMap.forEach((value, brandName) => {
          brands.push({
            id: brandName.toLowerCase().replace(/\s+/g, '_'),
            name: brandName,
            models: value.models.map(m => m.name),
            vehicleCategory: value.vehicleCategory,
          });
        });

        // Sort brands alphabetically
        brands.sort((a, b) => a.name.localeCompare(b.name));

        console.log('[v0] Loaded unique brands:', brands.length, brands.map(b => `${b.name} (${b.models.length} models)`));
        setAllBrands(brands);
        setFilteredBrands(brands);
      } catch (error) {
        console.error('[v0] Error loading brands from Firestore:', error);
        Alert.alert('Error', 'Failed to load vehicle brands. Please try again.');
      } finally {
        setIsLoadingBrands(false);
      }
    };

    loadBrandsFromFirestore();
  }, [registrationData.vehicleCategory, registrationData.uid]);

  // Filter brands based on search
  useEffect(() => {
    if (brandSearch.trim() === '') {
      setFilteredBrands(allBrands);
    } else {
      const searchQuery = brandSearch.toLowerCase();
      const startsWith = allBrands.filter((b) => b.name.toLowerCase().startsWith(searchQuery));
      const others = allBrands.filter(
        (b) => !b.name.toLowerCase().startsWith(searchQuery) && b.name.toLowerCase().includes(searchQuery)
      );
      setFilteredBrands([...startsWith, ...others]);
    }
  }, [brandSearch, allBrands]);

  // Filter models based on selected brand and search
  useEffect(() => {
    if (!selectedBrand) {
      setFilteredModels([]);
      return;
    }

    const models = selectedBrand.models || [];

    if (modelSearch.trim() === '') {
      setFilteredModels(models);
    } else {
      const searchQuery = modelSearch.toLowerCase();
      const startsWith = models.filter((m) => m.toLowerCase().startsWith(searchQuery));
      const others = models.filter(
        (m) => !m.toLowerCase().startsWith(searchQuery) && m.toLowerCase().includes(searchQuery)
      );
      setFilteredModels([...startsWith, ...others]);
    }
  }, [selectedBrand, modelSearch]);

  // Load vehicle service rules when model is selected
  useEffect(() => {
    const loadServiceRules = async () => {
      if (!selectedBrand || !vehicleData.model) {
        // Reset service options when no model selected
        setAvailableServices([]);
        setAvailableCargoTypes([]);
        setAvailableTonnageOptions([]);
        return;
      }

      try {
        // Create vehicleId from brand and model (e.g., "toyota_dyna")
        // First try the stored document ID, then fallback to constructed ID
        const constructedKey = `${selectedBrand.name}_${vehicleData.model}`.toLowerCase().replace(/\s+/g, '_');
        const vehicleId = vehicleDocMap.get(constructedKey) || constructedKey;

        console.log('[v0] Looking up service rules in vehicle_service_rules/', vehicleId);

        // NOW query vehicle_service_rules/{vehicleId} for services, cargoTypes, tonnageOptions
        const serviceRulesRef = doc(firestore, 'vehicle_service_rules', vehicleId);
        const serviceRulesSnap = await getDoc(serviceRulesRef);

        if (serviceRulesSnap.exists()) {
          const rules = serviceRulesSnap.data();
          console.log('[v0] Loaded service rules from Firestore:', rules);

          // Extract services array
          const services = rules.services || [];
          setAvailableServices(services);
          console.log('[v0] Available services:', services);

          // FIXED: For trucks, always use 'open' and 'enclosed' for cargo types
          const category = registrationData.vehicleCategory;
          if (category === 'truck') {
            setAvailableCargoTypes(['open', 'enclosed']);
            console.log('[v0] Set cargo types to open/enclosed for truck');
          } else {
            // Extract cargoTypes array for other categories
            const cargoTypes = rules.cargoTypes || [];
            setAvailableCargoTypes(cargoTypes);
            console.log('[v0] Available cargo types:', cargoTypes);
          }

          // Handle tonnageOptions - could be array of strings or numbers
          const tonnage = rules.tonnageOptions || [];
          const tonnageStrings = tonnage.map((t: number | string) =>
            typeof t === 'number' ? `${t} ton${t > 1 ? 's' : ''}` : t
          );
          setAvailableTonnageOptions(tonnageStrings);
          console.log('[v0] Available tonnage options:', tonnageStrings);
        } else {
          // Fallback to default options based on category if no rules found
          console.log('[v0] No service rules found for', vehicleId, 'in vehicle_service_rules, using defaults');
          setDefaultServiceOptions();
        }
      } catch (error) {
        console.error('[v0] Error loading service rules:', error);
        setDefaultServiceOptions();
      }
    };

    loadServiceRules();
  }, [selectedBrand, vehicleData.model, vehicleDocMap]);

  const setDefaultServiceOptions = () => {
    const category = registrationData.vehicleCategory;
    if (category === 'car' || category === 'motorbike') {
      setAvailableServices(['ride', 'delivery', 'courier', 'towing']);
      setAvailableCargoTypes([]);
      setAvailableTonnageOptions([]);
    } else if (category === 'truck') {
      setAvailableServices(['delivery', 'courier', 'moving']);
      // FIXED: Cargo types for trucks must be 'open' or 'enclosed' only
      setAvailableCargoTypes(['open', 'enclosed']);
      setAvailableTonnageOptions(['1 ton', '2 tons', '3 tons', '4 tons', '5 tons', '8 tons', '10 tons']);
    } else if (category === 'minibus') {
      // Bus auto-sets services to 'ride' - no selection needed
      setAvailableServices([]);
      setAvailableCargoTypes([]);
      setAvailableTonnageOptions([]);
    } else {
      setAvailableServices([]);
      setAvailableCargoTypes([]);
      setAvailableTonnageOptions([]);
    }
  };

  const handleBrandSelect = (item: BrandItem) => {
    setVehicleData((prev) => ({ 
      ...prev, 
      brand: item.name, 
      model: '', 
      services: [], 
      cargoType: '', 
      refrigerationType: '',
      tonnage: '' 
    }));
    setSelectedBrand(item);
    setBrandSearch('');
    setShowBrandPicker(false);
    // Immediately populate models from the selected brand
    setFilteredModels(item.models || []);
  };

  const handleModelSelect = (model: string) => {
    setVehicleData((prev) => ({ ...prev, model }));
    setModelSearch('');
    setShowModelPicker(false);
  };

  const handleColorSelect = (color: string) => {
    setVehicleData((prev) => ({ ...prev, color }));
    setShowColorPicker(false);
  };

  const handleYearSelect = (year: string) => {
    setVehicleData((prev) => ({ ...prev, productionYear: year }));
    setShowYearPicker(false);
  };

  const handleServiceSelect = (service: string) => {
    setVehicleData((prev) => {
      const currentServices = prev.services || [];
      if (currentServices.includes(service)) {
        return { ...prev, services: currentServices.filter(s => s !== service) };
      } else {
        return { ...prev, services: [...currentServices, service] };
      }
    });
  };

  const handleTonnageSelect = (tonnage: string) => {
    setVehicleData((prev) => ({ ...prev, tonnage }));
    setShowTonnagePicker(false);
  };

  // Check if services should be shown
  const shouldShowServices = (): boolean => {
    return availableServices.length > 0;
  };

  // Check if cargo types should be shown - only for trucks
  const shouldShowCargoTypes = (): boolean => {
    return registrationData.vehicleCategory === 'truck';
  };

  // Check if tonnage should be shown - only for trucks
  const shouldShowTonnage = (): boolean => {
    return registrationData.vehicleCategory === 'truck';
  };

  // Single select for cargo type - reset refrigerationType when changing
  const handleCargoTypeSelect = (cargoType: string) => {
    setVehicleData((prev) => ({
      ...prev,
      cargoType,
      // Reset refrigerationType when cargo type changes
      refrigerationType: cargoType === 'enclosed' ? prev.refrigerationType : '',
    }));
    setShowCargoTypePicker(false);
  };

  // Handler for refrigeration type (only for enclosed trucks)
  const handleRefrigerationTypeSelect = (refrigerationType: string) => {
    setVehicleData((prev) => ({
      ...prev,
      refrigerationType,
    }));
    setShowRefrigerationPicker(false);
  };

  // Check if refrigeration field should be shown (only when cargoType is 'enclosed')
  const shouldShowRefrigeration = (): boolean => {
    return registrationData.vehicleCategory === 'truck' && vehicleData.cargoType === 'enclosed';
  };

  const validatePlate = (text: string) => {
    let upper = text.toUpperCase();

    // Auto-insert space after 3 letters
    if (upper.length === 3 && !upper.includes(' ')) {
      upper = upper + ' ';
    }

    // Enforce pattern LLL NNNN
    const regex = /^[A-Z]{3}\s\d{0,4}$/;

    if (upper.length <= 3) {
      if (/[^A-Z]/.test(upper)) {
        setPlateError('First 3 characters must be letters');
      } else {
        setPlateError('');
      }
    } else if (upper.length > 4 && !regex.test(upper)) {
      setPlateError('Plate must be 3 letters, space, then 4 digits');
    } else {
      setPlateError('');
    }

    setVehicleData((prev) => ({ ...prev, numberPlate: upper }));
  };

  const classifyVehicle = (category: string | undefined) => {
    if (category === 'motorbike') return 'Motorbike';
    if (category === 'truck') return 'Truck';
    if (category === 'minibus') return 'Minibus';
    if (category === 'car') return 'Car';
    return '';
  };

  const isFormValid = () => {
    const category = registrationData.vehicleCategory;
    
    // Common required fields for ALL categories:
    // - vehicle image, vehicle license, certificate of registration (now required)
    // - brand, model, productionYear, plateNumber, color (now required)
    const basicFieldsValid =
      vehicleData.brand &&
      vehicleData.model &&
      vehicleData.color && // Now required for all
      vehicleData.productionYear &&
      vehicleData.numberPlate &&
      vehicleData.numberPlate.length === 8 &&
      !plateError &&
      vehicleData.vehiclePicture &&
      vehicleData.vehicleLicense &&
      vehicleData.vehicleRegistration; // Now required for all

    // TRUCK validation: services, tonnage, cargoType, refrigerationType (if enclosed)
    if (category === 'truck') {
      const servicesValid = vehicleData.services && vehicleData.services.length > 0;
      const tonnageValid = !!vehicleData.tonnage;
      const cargoTypeValid = !!vehicleData.cargoType;
      // Refrigeration is required ONLY if cargoType is 'enclosed'
      const refrigerationValid = vehicleData.cargoType !== 'enclosed' || !!vehicleData.refrigerationType;
      
      return basicFieldsValid && servicesValid && tonnageValid && cargoTypeValid && refrigerationValid && !isUploading;
    }
    
    // CAR and MOTORBIKE validation: services required
    if (category === 'car' || category === 'motorbike') {
      const servicesValid = vehicleData.services && vehicleData.services.length > 0;
      return basicFieldsValid && servicesValid && !isUploading;
    }
    
    // BUS validation: no services, tonnage, cargoType needed (services auto-set to 'ride')
    if (category === 'minibus') {
      return basicFieldsValid && !isUploading;
    }

    return basicFieldsValid && !isUploading;
  };

  const handleNext = async () => {
    if (!isFormValid()) {
      Alert.alert('Incomplete', 'Please fill all required fields and upload images.');
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    const classification = classifyVehicle(registrationData.vehicleCategory);

    try {
      setIsUploading(true);

      // Upload images to Cloudinary
      let vehiclePictureUrl = '';
      let vehicleLicenseUrl = '';
      let vehicleRegistrationUrl = '';

      if (vehicleData.vehiclePicture) {
        // Convert image URI to base64 for upload
        const response = await fetch(vehicleData.vehiclePicture);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
        vehiclePictureUrl = await uploadImageToCloudinary(base64, 'driver_images');
      }

      if (vehicleData.vehicleLicense) {
        const response = await fetch(vehicleData.vehicleLicense);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
        vehicleLicenseUrl = await uploadImageToCloudinary(base64, 'driver_images');
      }

      if (vehicleData.vehicleRegistration) {
        const response = await fetch(vehicleData.vehicleRegistration);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
        vehicleRegistrationUrl = await uploadImageToCloudinary(base64, 'driver_images');
      }

      // Update Firestore with vehicle data and Cloudinary URLs
      const driverRef = doc(firestore, 'drivers', uid);
      const vehicleUpdateData: any = {
        'vehicle.brand': vehicleData.brand,
        'vehicle.model': vehicleData.model,
        'vehicle.color': vehicleData.color,
        'vehicle.productionYear': vehicleData.productionYear,
        'vehicle.plateNumber': vehicleData.numberPlate.trim(),
        'vehicle.type': classification,
        'vehicle.vehicleCategory': registrationData.vehicleCategory || '',
        'vehicle.carImage': vehiclePictureUrl,
        'vehicle.vehicleLicense': vehicleLicenseUrl,
        'vehicle.registrationCertificate': vehicleRegistrationUrl,
        registrationStep: 6,
        updatedAt: serverTimestamp(),
      };

      // Add services if applicable (stored under vehicle object)
      if (shouldShowServices() && vehicleData.services && vehicleData.services.length > 0) {
        vehicleUpdateData['vehicle.services'] = vehicleData.services;
      }
      
      // For minibus/bus, auto-set services to 'ride'
      if (registrationData.vehicleCategory === 'minibus') {
        vehicleUpdateData['vehicle.services'] = ['ride'];
      }

      // Add cargo type if applicable (single select)
      if (shouldShowCargoTypes() && vehicleData.cargoType) {
        vehicleUpdateData['vehicle.cargoType'] = vehicleData.cargoType;
      }

      // Add refrigeration type if applicable (only for enclosed trucks)
      if (shouldShowRefrigeration() && vehicleData.refrigerationType) {
        vehicleUpdateData['vehicle.refrigerationType'] = vehicleData.refrigerationType;
      }

      // Add tonnage if applicable
      if (shouldShowTonnage() && vehicleData.tonnage) {
        vehicleUpdateData['vehicle.tonnage'] = vehicleData.tonnage;
      }

      await updateDoc(driverRef, vehicleUpdateData);

      console.log('Vehicle data saved to Firestore');

      // Navigate to the location selection page
      router.push('/chooseLocation');
    } catch (error) {
      console.error('Error saving vehicle data:', error);
      Alert.alert('Error', 'Failed to save vehicle information. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2011 }, (_, i) => (currentYear - i).toString());

  if (viewMode === 'instruction' && currentImageType) {
    const content = getInstructionContent(currentImageType);
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setViewMode('main')} style={styles.backButton}>
            <ChevronLeft color="#fff" size={28} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.instructionContent}>
          {content.optional && (
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalText}>Optional document</Text>
            </View>
          )}
          <Text style={styles.instructionTitle}>{content.title}</Text>
          {content.instructions.map((instruction, index) => (
            <View key={index} style={styles.instructionRow}>
              <Check color="#fff" size={20} style={styles.checkIcon} />
              <Text style={styles.instructionText}>{instruction}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleTakeNewPicture}>
            <Text style={styles.primaryButtonText}>Take a new picture</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleChooseFromGallery}>
            <Text style={styles.secondaryButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
          {content.optional && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                setCurrentImageType(null);
                setViewMode('main');
              }}
            >
              <Text style={styles.secondaryButtonText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (viewMode === 'camera') {
    return (
      <View style={styles.container}>
        <CameraView style={styles.camera} ref={(ref) => setCameraRef(ref)}>
          <View style={styles.cameraHeader}>
            <TouchableOpacity onPress={() => setViewMode('instruction')} style={styles.closeButton}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraFooter}>
            <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  if (viewMode === 'preview' && capturedImage) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setViewMode('instruction')} style={styles.backButton}>
            <ChevronLeft color="#fff" size={28} />
          </TouchableOpacity>
        </View>
        <Image source={{ uri: capturedImage }} style={styles.previewImage} />
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleUpload}>
            <Text style={styles.primaryButtonText}>Upload</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleRetry}>
            <Text style={styles.secondaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <Text style={styles.headerTitle}>Vehicle information</Text>
        <TouchableOpacity>
          <Text style={styles.helpText}>Help</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>

        <View style={styles.imageRow}>
          <TouchableOpacity
            style={styles.imageBox}
            onPress={() => handleImageTypePress('vehiclePicture')}
          >
            {vehicleData.vehiclePicture ? (
              <Image source={{ uri: vehicleData.vehiclePicture }} style={styles.uploadedImage} />
            ) : (
              <Text style={styles.plusSign}>+</Text>
            )}
            <Text style={styles.imageLabel}>Vehicle picture</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.imageBox}
            onPress={() => handleImageTypePress('vehicleLicense')}
          >
            {vehicleData.vehicleLicense ? (
              <Image source={{ uri: vehicleData.vehicleLicense }} style={styles.uploadedImage} />
            ) : (
              <Text style={styles.plusSign}>+</Text>
            )}
            <Text style={styles.imageLabel}>Motor Vehicle licence...</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.imageBox}
            onPress={() => handleImageTypePress('vehicleRegistration')}
          >
            {vehicleData.vehicleRegistration ? (
              <Image source={{ uri: vehicleData.vehicleRegistration }} style={styles.uploadedImage} />
            ) : (
              <Text style={styles.plusSign}>+</Text>
            )}
            <Text style={styles.imageLabel}>Certificate of Registration</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.fieldBox, isLoadingBrands && styles.fieldBoxDisabled]}
          onPress={() => !isLoadingBrands && setShowBrandPicker(true)}
          disabled={isLoadingBrands}
        >
          <Text style={styles.fieldLabel}>Vehicle brand</Text>
          {isLoadingBrands ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#B19CD9" />
              <Text style={styles.loadingText}>Loading brands...</Text>
            </View>
          ) : (
            <Text style={vehicleData.brand ? styles.fieldValue : styles.fieldPlaceholder}>
              {vehicleData.brand || 'Select brand'}
            </Text>
          )}
        </TouchableOpacity>

        {/* 2. Model - comes after Brand */}
        <TouchableOpacity
          style={[styles.fieldBox, !vehicleData.brand && styles.fieldBoxDisabled]}
          onPress={() => vehicleData.brand && setShowModelPicker(true)}
          disabled={!vehicleData.brand}
        >
          <Text style={styles.fieldLabel}>Vehicle model</Text>
          <Text style={vehicleData.model ? styles.fieldValue : styles.fieldPlaceholder}>
            {vehicleData.model || (vehicleData.brand ? 'Select model' : '')}
          </Text>
        </TouchableOpacity>

        {/* 3. Services field - shown after model for car, motorbike, truck */}
        {shouldShowServices() && (
          <TouchableOpacity
            style={[styles.fieldBox, !vehicleData.model && styles.fieldBoxDisabled]}
            onPress={() => vehicleData.model && setShowServicesPicker(true)}
            disabled={!vehicleData.model}
          >
            <Text style={styles.fieldLabel}>Service</Text>
            <Text style={vehicleData.services && vehicleData.services.length > 0 ? styles.fieldValue : styles.fieldPlaceholder}>
              {vehicleData.services && vehicleData.services.length > 0
                ? vehicleData.services.join(', ')
                : 'Select services'}
            </Text>
          </TouchableOpacity>
        )}

        {/* 4. Tonnage field - for trucks only (after service) */}
        {shouldShowTonnage() && (
          <TouchableOpacity
            style={[styles.fieldBox, !vehicleData.model && styles.fieldBoxDisabled]}
            onPress={() => vehicleData.model && setShowTonnagePicker(true)}
            disabled={!vehicleData.model}
          >
            <Text style={styles.fieldLabel}>Tonnage</Text>
            <Text style={vehicleData.tonnage ? styles.fieldValue : styles.fieldPlaceholder}>
              {vehicleData.tonnage || 'Select tonnage'}
            </Text>
          </TouchableOpacity>
        )}

        {/* 5. Cargo Type field - SINGLE SELECT for trucks only */}
        {shouldShowCargoTypes() && (
          <TouchableOpacity
            style={[styles.fieldBox, !vehicleData.model && styles.fieldBoxDisabled]}
            onPress={() => vehicleData.model && setShowCargoTypePicker(true)}
            disabled={!vehicleData.model}
          >
            <Text style={styles.fieldLabel}>Cargo Type</Text>
            <Text style={vehicleData.cargoType ? styles.fieldValue : styles.fieldPlaceholder}>
              {vehicleData.cargoType 
                ? vehicleData.cargoType.charAt(0).toUpperCase() + vehicleData.cargoType.slice(1)
                : 'Select cargo type'}
            </Text>
          </TouchableOpacity>
        )}

        {/* 6. Refrigeration Type - ONLY shown when cargoType is 'enclosed' */}
        {shouldShowRefrigeration() && (
          <TouchableOpacity
            style={styles.fieldBox}
            onPress={() => setShowRefrigerationPicker(true)}
          >
            <Text style={styles.fieldLabel}>Refrigeration Type</Text>
            <Text style={vehicleData.refrigerationType ? styles.fieldValue : styles.fieldPlaceholder}>
              {vehicleData.refrigerationType 
                ? (vehicleData.refrigerationType === 'refrigerated' ? 'Refrigerated' : 'Non-Refrigerated')
                : 'Select refrigeration type'}
            </Text>
          </TouchableOpacity>
        )}

        {/* 7. Production year */}
        <TouchableOpacity
          style={[styles.fieldBox, (!vehicleData.brand || !vehicleData.model) && styles.fieldBoxDisabled]}
          onPress={() => vehicleData.brand && vehicleData.model && setShowYearPicker(true)}
          disabled={!vehicleData.brand || !vehicleData.model}
        >
          <Text style={styles.fieldLabel}>Production year</Text>
          <Text style={vehicleData.productionYear ? styles.fieldValue : styles.fieldPlaceholder}>
            {vehicleData.productionYear || ''}
          </Text>
        </TouchableOpacity>

        {/* 7. Plate number */}
        <View style={styles.fieldBox}>
          <Text style={styles.fieldLabel}>Plate number</Text>
          <TextInput
            style={styles.fieldInput}
            value={vehicleData.numberPlate}
            onChangeText={validatePlate}
            placeholder="ABC 1234"
            placeholderTextColor="#666"
            autoCapitalize="characters"
            maxLength={8}
          />
        </View>
        {plateError ? <Text style={styles.errorText}>{plateError}</Text> : null}

        {/* Vehicle color - REQUIRED */}
        <TouchableOpacity style={styles.fieldBox} onPress={() => setShowColorPicker(true)}>
          <Text style={styles.fieldLabel}>Vehicle color</Text>
          <Text style={vehicleData.color ? styles.fieldValue : styles.fieldPlaceholder}>
            {vehicleData.color || 'Select color'}
          </Text>
        </TouchableOpacity>

        {/* Upload status indicator */}
        {isUploading && (
          <View style={styles.uploadingContainer}>
            <Text style={styles.uploadingText}>Uploading images...</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>6 of 7</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '75%' }]} />
          </View>
        </View>
        <View style={styles.footerButtons}>
          <TouchableOpacity style={styles.backFooterButton} onPress={() => router.back()}>
            <Text style={styles.backFooterText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nextButton, !isFormValid() && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={!isFormValid()}
          >
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showBrandPicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Vehicle brand</Text>
            <TouchableOpacity onPress={() => setShowBrandPicker(false)} style={styles.modalClose}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchContainer}>
            <Search color="#999" size={20} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Start typing..."
              placeholderTextColor="#999"
              value={brandSearch}
              onChangeText={setBrandSearch}
            />
          </View>
          <FlatList
            data={filteredBrands}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => handleBrandSelect(item)}>
                <Text style={styles.listItemText}>{item.name}</Text>
                <Text style={styles.modelCount}>{item.models.length} models</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text style={styles.emptyListText}>No brands found for this category</Text>
              </View>
            }
          />
        </View>
      </Modal>

      <Modal visible={showModelPicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Vehicle model</Text>
            <TouchableOpacity onPress={() => setShowModelPicker(false)} style={styles.modalClose}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchContainer}>
            <Search color="#999" size={20} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Start typing..."
              placeholderTextColor="#999"
              value={modelSearch}
              onChangeText={setModelSearch}
            />
          </View>
          <FlatList
            data={filteredModels}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => handleModelSelect(item)}>
                <Text style={styles.listItemText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <Modal visible={showColorPicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Vehicle color</Text>
            <TouchableOpacity onPress={() => setShowColorPicker(false)} style={styles.modalClose}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={colorsData}
            keyExtractor={(item) => item.name}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.colorItem}
                onPress={() => handleColorSelect(item.name)}
              >
                <View style={[styles.colorCircle, { backgroundColor: item.hex }]} />
                <Text style={styles.colorItemText}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <Modal visible={showYearPicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Production year</Text>
            <TouchableOpacity onPress={() => setShowYearPicker(false)} style={styles.modalClose}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={years}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => handleYearSelect(item)}>
                <Text style={styles.listItemText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Services Picker Modal */}
      <Modal visible={showServicesPicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Services</Text>
            <TouchableOpacity onPress={() => setShowServicesPicker(false)} style={styles.modalClose}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          <View style={styles.servicesInfo}>
            <Text style={styles.servicesInfoText}>Select the services you want to offer</Text>
          </View>
          <FlatList
            data={availableServices}
            keyExtractor={(item) => item}
            renderItem={({ item }) => {
              const isSelected = vehicleData.services?.includes(item);
              return (
                <TouchableOpacity
                  style={[styles.listItem, isSelected && styles.listItemSelected]}
                  onPress={() => handleServiceSelect(item)}
                >
                  <Text style={styles.listItemText}>{item.charAt(0).toUpperCase() + item.slice(1)}</Text>
                  {isSelected && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setShowServicesPicker(false)}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Cargo Type Picker Modal - SINGLE SELECT */}
      <Modal visible={showCargoTypePicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Cargo Type</Text>
            <TouchableOpacity onPress={() => setShowCargoTypePicker(false)} style={styles.modalClose}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          <View style={styles.servicesInfo}>
            <Text style={styles.servicesInfoText}>Is your truck enclosed or open trailer?</Text>
          </View>
          <FlatList
            data={availableCargoTypes}
            keyExtractor={(item) => item}
            renderItem={({ item }) => {
              const isSelected = vehicleData.cargoType === item;
              return (
                <TouchableOpacity
                  style={[styles.listItem, isSelected && styles.listItemSelected]}
                  onPress={() => handleCargoTypeSelect(item)}
                >
                  <Text style={styles.listItemText}>{item.charAt(0).toUpperCase() + item.slice(1)}</Text>
                  {isSelected && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* Refrigeration Type Picker Modal - Only for enclosed cargo */}
      <Modal visible={showRefrigerationPicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Refrigeration Type</Text>
            <TouchableOpacity onPress={() => setShowRefrigerationPicker(false)} style={styles.modalClose}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          <View style={styles.servicesInfo}>
            <Text style={styles.servicesInfoText}>Is your truck refrigerated?</Text>
          </View>
          <FlatList
            data={['refrigerated', 'non_refrigerated']}
            keyExtractor={(item) => item}
            renderItem={({ item }) => {
              const isSelected = vehicleData.refrigerationType === item;
              const displayText = item === 'refrigerated' ? 'Refrigerated' : 'Non-Refrigerated';
              return (
                <TouchableOpacity
                  style={[styles.listItem, isSelected && styles.listItemSelected]}
                  onPress={() => handleRefrigerationTypeSelect(item)}
                >
                  <Text style={styles.listItemText}>{displayText}</Text>
                  {isSelected && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* Tonnage Picker Modal */}
      <Modal visible={showTonnagePicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Tonnage</Text>
            <TouchableOpacity onPress={() => setShowTonnagePicker(false)} style={styles.modalClose}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={availableTonnageOptions}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.listItem, vehicleData.tonnage === item && styles.listItemSelected]}
                onPress={() => handleTonnageSelect(item)}
              >
                <Text style={styles.listItemText}>{item}</Text>
                {vehicleData.tonnage === item && <Text style={styles.checkMark}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  closeText: {
    color: '#fff',
    fontSize: 16,
    position: 'absolute',
    right: 16,
    top: 58,
  },
  helpText: {
    color: '#00BFFF',
    fontSize: 16,
  },
  backButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  imageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  imageBox: {
    width: '31%',
    aspectRatio: 0.75,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  optionalBadgeSmall: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#4169E1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 1,
  },
  optionalTextSmall: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '500',
  },
  plusSign: {
    color: '#666',
    fontSize: 48,
    fontWeight: '300',
  },
  uploadedImage: {
    width: '100%',
    height: '70%',
    borderRadius: 8,
    marginBottom: 8,
  },
  imageLabel: {
    color: '#fff',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 2,
    lineHeight: 14,
  },
  fieldBox: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  fieldLabel: {
    color: '#999',
    fontSize: 13,
    marginBottom: 8,
  },
  fieldValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  fieldPlaceholder: {
    color: '#666',
    fontSize: 18,
  },
  fieldInput: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    padding: 0,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: -12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#B19CD9',
  },
  footerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backFooterButton: {
    flex: 1,
    backgroundColor: '#333',
    padding: 16,
    borderRadius: 12,
    marginRight: 8,
  },
  backFooterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  nextButton: {
    flex: 2,
    backgroundColor: '#B19CD9',
    padding: 16,
    borderRadius: 12,
    marginLeft: 8,
  },
  nextButtonDisabled: {
    backgroundColor: '#4a4a4a',
  },
  nextButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  instructionContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  optionalBadge: {
    backgroundColor: '#4169E1',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 16,
  },
  optionalText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  instructionTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 24,
  },
  instructionRow: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingRight: 16,
  },
  checkIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
    flex: 1,
    flexWrap: 'wrap',
  },
  buttonContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#B19CD9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: '#333',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  camera: {
    flex: 1,
  },
  cameraHeader: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  cameraFooter: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  modalClose: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  listItemText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  categoryBadge: {
    color: '#B19CD9',
    fontSize: 12,
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  modelCount: {
    color: '#999',
    fontSize: 12,
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#999',
    fontSize: 16,
  },
  emptyList: {
    padding: 32,
    alignItems: 'center',
  },
  emptyListText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
  listItemDisabled: {
    opacity: 0.4,
  },
  listItemTextDisabled: {
    color: '#666',
  },
  colorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#666',
  },
  colorItemText: {
    color: '#fff',
    fontSize: 16,
  },
  fieldBoxDisabled: {
    opacity: 0.5,
  },
  servicesInfo: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
  },
  servicesInfoText: {
    color: '#999',
    fontSize: 14,
  },
  listItemSelected: {
    backgroundColor: '#3a3a3a',
    borderLeftWidth: 3,
    borderLeftColor: '#B19CD9',
  },
  checkMark: {
    color: '#B19CD9',
    fontSize: 18,
    fontWeight: '600',
  },
  modalFooter: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  doneButton: {
    backgroundColor: '#B19CD9',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
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
