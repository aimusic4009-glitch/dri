 import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import RegistrationFooter from '@/components/RegistrationFooter';
import RegistrationHeader from '@/components/RegistrationHeader';
import { useRegistration } from '@/context/RegistrationContext';
import { auth } from '@/config/firebase';
import { updateDriverData } from '@/utils/firebase';

type OptionType = {
  id: number;
  label: string;
  role: string;
  category: 'car' | 'minibus' | 'motorbike' | 'truck';
  icon: string;
  age: string;
  vehicle: string;
  license: string;
  tag: string;
  tagColor: string;
};

const options: OptionType[] = [
  {
    id: 1,
    label: 'Car',
    role: 'Rides',
    category: 'car',
    icon: '🚗',
    age: 'Age: 21+',
    vehicle: 'Vehicle: Car',
    license: 'License: Valid Professional Driving License',
    tag: 'Rides',
    tagColor: '#4169E1',
  },
  {
    id: 2,
    label: 'Bus',
    role: 'Rides',
    category: 'minibus',
    icon: '🚌',
    age: 'Age: 21+',
    vehicle: 'Vehicle: Minibus',
    license: 'License: Valid Professional Driving License',
    tag: 'Rides',
    tagColor: '#4169E1',
  },
  {
    id: 3,
    label: 'Motorbike',
    role: 'Delivery',
    category: 'motorbike',
    icon: '🏍️',
    age: 'Age: 18+',
    vehicle: 'Vehicle: Scooter or motorbike',
    license: 'License: Local/International Driver\'s license',
    tag: 'Delivery',
    tagColor: '#228B22',
  },
  {
    id: 4,
    label: 'Truck',
    role: 'Delivery',
    category: 'truck',
    icon: '🚚',
    age: 'Age: 21+',
    vehicle: 'Vehicle: Small Truck',
    license: 'License: Valid Professional Driving License',
    tag: 'Delivery',
    tagColor: '#228B22',
  },
];

export default function RidesDelivery() {
  const router = useRouter();
  const { registrationData, updateRegistrationData, setCurrentStep, totalSteps } = useRegistration();
  const [selected, setSelected] = useState<number | null>(null);

  const handleNext = async () => {
    if (!selected) return;

    const selectedOption = options.find((o) => o.id === selected);
    if (!selectedOption) return;

    const uid = auth.currentUser?.uid || registrationData.uid;
    if (!uid) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      // Update driver document with role and vehicle category
      await updateDriverData(
        uid,
        {
          role: selectedOption.role as any,
          vehicleCategory: selectedOption.category,
        },
        5
      );

      // Update context
      updateRegistrationData({
        role: selectedOption.role as any,
        vehicleCategory: selectedOption.category,
      });

      setCurrentStep(6);
      router.push('/vehicle-information');
    } catch (error) {
      console.error('Error saving selection:', error);
      Alert.alert('Error', 'Failed to save your selection. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <RegistrationHeader title="Select Option" showHelp={true} />

      <View style={styles.titleContainer}>
        <Text style={styles.title}>Select your driving option</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {options.map((opt) => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.card, selected === opt.id && styles.selectedCard]}
            onPress={() => setSelected(opt.id)}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.tag, { backgroundColor: opt.tagColor }]}>
                <Text style={styles.tagText}>{opt.tag}</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardTitle}>{opt.label}</Text>
                <Text style={styles.cardDetail}>{opt.age}</Text>
                <Text style={styles.cardDetail}>{opt.vehicle}</Text>
                <Text style={styles.cardDetail}>{opt.license}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.icon}>{opt.icon}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <RegistrationFooter
        currentStep={5}
        totalSteps={totalSteps}
        onNext={handleNext}
        canGoNext={selected !== null}
        showBack={true}
      />
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  headerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  helpText: {
    color: '#4a9eff',
    fontSize: 16,
  },
  titleContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#1a1a1a',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#2a2a2a',
  },
  selectedCard: {
    borderColor: '#B19CD9',
    backgroundColor: '#333',
  },
  cardHeader: {
    marginBottom: 12,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  cardDetail: {
    fontSize: 14,
    color: '#999',
    marginBottom: 4,
    lineHeight: 20,
  },
  cardRight: {
    marginLeft: 16,
  },
  icon: {
    fontSize: 48,
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
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
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
    backgroundColor: '#c8ff00',
    borderRadius: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  prevButton: {
    backgroundColor: '#3a3a3a',
    borderRadius: 12,
    padding: 16,
  },
  prevButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#c8ff00',
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
});
