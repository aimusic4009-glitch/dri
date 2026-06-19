import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { auth, firestore } from '@/config/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useRegistration } from '@/context/RegistrationContext';
import RegistrationHeader from '@/components/RegistrationHeader';

const locations = [
  { city: 'Lusaka', region: 'Lusaka Province, Zambia' },
  { city: 'Kitwe', region: 'Copperbelt Province, Zambia' },
  { city: 'Ndola', region: 'Copperbelt Province, Zambia' },
  { city: 'Kabwe', region: 'Central Province, Zambia' },
  { city: 'Chingola', region: 'Copperbelt Province, Zambia' },
  { city: 'Mufulira', region: 'Copperbelt Province, Zambia' },
  { city: 'Livingstone', region: 'Southern Province, Zambia' },
  { city: 'Luanshya', region: 'Copperbelt Province, Zambia' },
  { city: 'Kasama', region: 'Northern Province, Zambia' },
  { city: 'Chipata', region: 'Eastern Province, Zambia' },
  { city: 'Solwezi', region: 'North-Western Province, Zambia' },
  { city: 'Mongu', region: 'Western Province, Zambia' },
  { city: 'Choma', region: 'Southern Province, Zambia' },
  { city: 'Mazabuka', region: 'Southern Province, Zambia' },
  { city: 'Monze', region: 'Southern Province, Zambia' },
  { city: 'Kapiri Mposhi', region: 'Central Province, Zambia' },
  { city: 'Mansa', region: 'Luapula Province, Zambia' },
];

export default function ChooseLocation() {
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState(locations);
  const router = useRouter();
  const { updateOperation, totalSteps } = useRegistration();

  const handleSearch = (text: string) => {
    setSearch(text);
    const results = locations.filter((item) =>
      item.city.toLowerCase().startsWith(text.toLowerCase()) ||
      item.region.toLowerCase().includes(text.toLowerCase())
    );
    setFiltered(results);
  };

  const handleSelect = async (item: typeof locations[0]) => {
    const place = `${item.city}, ${item.region}`;
    const uid = auth.currentUser?.uid;

    if (!uid) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      // Update Firestore driver document with location and finalize registration
      const driverRef = doc(firestore, 'drivers', uid);
      await updateDoc(driverRef, {
        place,
        verificationStatus: 'pending',
        registrationCompleted: true,
        registrationStep: 7,
        updatedAt: serverTimestamp(),
      });

      updateOperation({ place, available: false });

      router.push('/application-submitted');
    } catch (error) {
      console.error('Error saving location:', error);
      Alert.alert('Error', 'Failed to save location. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <RegistrationHeader title="Choose Location" showHelp={false} />

      <View style={styles.content}>
        <Text style={styles.title}>Choose your location</Text>

        <View style={styles.searchContainer}>
          <Search color="#999" size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder="Search"
            placeholderTextColor="#999"
            value={search}
            onChangeText={handleSearch}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.city}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => handleSelect(item)} style={styles.item}>
              <Text style={styles.city}>{item.city}</Text>
              <Text style={styles.region}>{item.region}</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContainer}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>7 of {totalSteps}</Text>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: '100%' },
              ]}
            />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Back</Text>
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    marginBottom: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  search: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  listContainer: {
    paddingBottom: 20,
  },
  item: {
    paddingVertical: 16,
    borderBottomColor: '#333',
    borderBottomWidth: 1,
  },
  city: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 4,
  },
  region: {
    color: '#999',
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    paddingTop: 8,
    backgroundColor: '#1a1a1a',
  },
  progressContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  progressBarBackground: {
    width: '100%',
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
    justifyContent: 'flex-start',
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
});
