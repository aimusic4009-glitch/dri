 import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function RegistrationTermsPage() {
  const [agreed, setAgreed] = useState(false);

  const handleNext = () => {
    if (agreed) {
      router.push('/personal-info');
    }
  };

  return (
    <LinearGradient
      colors={['#0a0e1a', '#1a2332', '#0a0e1a']}
      style={styles.background}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentContainer}>
          <Text style={styles.title}>
            Accept Aletwende Driver's Terms & Review Privacy Notice
          </Text>

          <Text style={styles.description}>
            By selecting "I Agree" below, I have reviewed and agree to the{' '}
            <Text style={styles.link}>Terms of Use</Text> and acknowledge the{' '}
            <Text style={styles.link}>Privacy Notice</Text>. I am at least 18 years of
            age.
          </Text>

          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAgreed(!agreed)}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>I have read and agree</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.nextButton, !agreed && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={!agreed}
          >
            <Text
              style={[styles.nextButtonText, !agreed && styles.nextButtonTextDisabled]}
            >
              Next
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  contentContainer: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 38,
    paddingHorizontal: 8,
  },
  description: {
    fontSize: 16,
    color: '#e0e0e0',
    lineHeight: 26,
    marginBottom: 48,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  link: {
    color: '#00d9ff',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
    gap: 12,
    paddingHorizontal: 16,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#B19CD9',
    borderColor: '#B19CD9',
  },
  checkmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#fff',
    flex: 1,
    fontWeight: '500',
  },
  nextButton: {
    backgroundColor: '#B19CD9',
    borderRadius: 50,
    paddingVertical: 18,
    paddingHorizontal: 60,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#B19CD9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  nextButtonDisabled: {
    backgroundColor: 'rgba(100, 100, 100, 0.5)',
    shadowOpacity: 0,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  nextButtonTextDisabled: {
    color: '#999',
  },
  backLink: {
    color: '#00d9ff',
    fontSize: 16,
    textAlign: 'center',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});

