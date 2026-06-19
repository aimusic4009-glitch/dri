  import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { X, ChevronDown } from 'lucide-react-native';
import RegistrationFooter from '@/components/RegistrationFooter';
import RegistrationHeader from '@/components/RegistrationHeader';
import { Picker } from '@react-native-picker/picker';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { useRegistration } from '@/context/RegistrationContext';

const COUNTRIES = [
  { code: 'ZM', name: 'Zambia', callingCode: '+260', flag: '🇿🇲' },
  { code: 'US', name: 'United States', callingCode: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', callingCode: '+44', flag: '🇬🇧' },
  { code: 'ZA', name: 'South Africa', callingCode: '+27', flag: '🇿🇦' },
  { code: 'KE', name: 'Kenya', callingCode: '+254', flag: '🇰🇪' },
  { code: 'NG', name: 'Nigeria', callingCode: '+234', flag: '🇳🇬' },
  { code: 'GH', name: 'Ghana', callingCode: '+233', flag: '🇬🇭' },
];

export default function PhoneVerificationPage() {
  const { registrationData, totalSteps } = useRegistration();
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const fullNumber = selectedCountry.callingCode + phone;
  const isPhoneValid = phone.length > 0 && isValidPhoneNumber(fullNumber);
  const canVerify = isPhoneValid && agreedToTerms;

  const handleCountrySelect = (countryCode: string) => {
    const country = COUNTRIES.find((c) => c.code === countryCode);
    if (country) {
      setSelectedCountry(country);
    }
    setShowCountryPicker(false);
  };

  const handleVerify = () => {
    if (canVerify) {
      router.push({
        pathname: '/step3',
        params: { phone: fullNumber },
      });
    }
  };

  return (
    <View style={styles.container}>
      <RegistrationHeader title="Sign Up" showHelp={false} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Become a driver</Text>

        <View style={styles.phoneSection}>
          <Text style={styles.phoneLabel}>Phone number</Text>

          <View style={styles.phoneInputContainer}>
            <TouchableOpacity
              style={styles.countryButton}
              onPress={() => setShowCountryPicker(true)}
            >
              <Text style={styles.flag}>{selectedCountry.flag}</Text>
              <Text style={styles.callingCode}>{selectedCountry.callingCode}</Text>
              <ChevronDown color="#fff" size={20} />
            </TouchableOpacity>

            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={(text) => setPhone(text.slice(0, 9))}
              placeholder="Mobile number"
              placeholderTextColor="#666"
              keyboardType="phone-pad"
              maxLength={9}
            />
          </View>
        </View>

        <View style={styles.termsSection}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
          >
            <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
              {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              By signing up, you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>, comply with transport
              rules under the <Text style={styles.termsLink}>European Union</Text> and{' '}
              <Text style={styles.termsLink}>local legislation</Text> and provide only
              legal services and content on the Bolt Platform.
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.infoText}>
          Once you've become a driver, we will occasionally send you offers and
          promotions for our services. You can unsubscribe by changing your communication
          preferences.
        </Text>
      </ScrollView>

      <RegistrationFooter
        currentStep={2}
        totalSteps={totalSteps}
        onNext={handleVerify}
        canGoNext={canVerify}
        showBack={true}
        nextButtonText="Verify"
      />

      <Modal
        visible={showCountryPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <X color="#fff" size={24} />
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={selectedCountry.code}
              onValueChange={handleCountrySelect}
              style={styles.picker}
            >
              {COUNTRIES.map((country) => (
                <Picker.Item
                  key={country.code}
                  label={`${country.flag} ${country.name} (${country.callingCode})`}
                  value={country.code}
                />
              ))}
            </Picker>
          </View>
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
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 40,
  },
  phoneSection: {
    marginBottom: 32,
  },
  phoneLabel: {
    fontSize: 16,
    color: '#999',
    marginBottom: 12,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#3a3a3a',
    gap: 4,
    width: '30%',
  },
  flag: {
    fontSize: 24,
  },
  callingCode: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 2,
    borderColor: '#B19CD9',
    width: '68%',
  },
  termsSection: {
    marginBottom: 24,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#666',
    backgroundColor: 'transparent',
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#B19CD9',
    borderColor: '#B19CD9',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
    textAlign: 'left',
    paddingHorizontal: 0,
    flexWrap: 'wrap',
  },
  termsLink: {
    color: '#4a9eff',
    textDecorationLine: 'underline',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'left',
    paddingHorizontal: 0,
    flexWrap: 'wrap',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 20,
  },
  verifyButton: {
    backgroundColor: '#4a5cff',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  verifyButtonDisabled: {
    backgroundColor: '#3a3a3a',
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  verifyButtonTextDisabled: {
    color: '#666',
  },
  loginText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginBottom: 16,
    paddingHorizontal: 16,
    lineHeight: 20,
    flexWrap: 'wrap',
  },
  loginLink: {
    color: '#4a9eff',
  },
  fleetText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    flexWrap: 'wrap',
  },
  fleetLink: {
    color: '#4a9eff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  picker: {
    color: '#fff',
    backgroundColor: '#1a1a1a',
  },
});
