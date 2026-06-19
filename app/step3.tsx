   import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useRegistration } from '@/context/RegistrationContext';
import { auth, firestore } from '@/config/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function OTPVerificationPage() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { registrationData, updateRegistrationData } = useRegistration();
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCanResend(true);
    }
  }, [timer]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value[value.length - 1];
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((digit) => digit !== '') && newOtp.join('').length === 4) {
      verifyOtp(newOtp.join(''));
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verifyOtp = async (code: string) => {
    const demoOtp = '1234';

    if (code === demoOtp) {
      try {
        const uid = auth.currentUser?.uid || registrationData.uid;
        if (uid) {
          // Update Firestore driver document with phone number
          const driverRef = doc(firestore, 'drivers', uid);
          await updateDoc(driverRef, {
            phone: phone,
            registrationStep: 2,
            updatedAt: serverTimestamp(),
          });

          updateRegistrationData({ phone: phone || '' });

          setTimeout(() => {
            if (registrationData.role === 'cyclist') {
              router.push('/cyclist-step');
            } else {
              router.push('/id-step');
            }
          }, 500);
        }
      } catch (error) {
        console.error('Error updating phone:', error);
        setError('Failed to verify. Please try again.');
      }
    } else {
      setError('Invalid code. Wait or resend.');
    }
  };

  const handleResend = () => {
    if (canResend) {
      setTimer(60);
      setCanResend(false);
      setOtp(['', '', '', '']);
      setError('');
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <X color="#fff" size={28} />
        </TouchableOpacity>
        <Text style={styles.signUpText}>Sign Up</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.brandText}>
          <Text style={styles.brandBold}>Aletwende</Text> Driver
        </Text>

        <Text style={styles.title}>Enter code</Text>
        <Text style={styles.subtitle}>
          A verification code was sent to{'\n'}
          <Text style={styles.phoneNumber}>{phone}</Text>
        </Text>

        <View style={styles.otpContainer}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[styles.otpInput, error && styles.otpInputError]}
              value={digit}
              onChangeText={(value) => handleOtpChange(index, value)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.timerContainer}>
          {canResend ? (
            <TouchableOpacity onPress={handleResend}>
              <Text style={styles.resendText}>Resend code</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.timerText}>Resend code in {timer}</Text>
          )}
        </View>

        <View style={styles.languageContainer}>
          <View style={styles.languageButton}>
            <Text style={styles.globeIcon}>🌐</Text>
            <Text style={styles.languageText}>English</Text>
          </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  signUpText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  brandText: {
    fontSize: 28,
    color: '#fff',
    marginBottom: 60,
    textAlign: 'center',
  },
  brandBold: {
    fontWeight: 'bold',
    color: '#4a5cff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
    paddingHorizontal: 16,
    flexWrap: 'wrap',
  },
  phoneNumber: {
    color: '#fff',
    fontWeight: '600',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  otpInput: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: '#4a5cff',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  otpInputError: {
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
    flexWrap: 'wrap',
  },
  timerContainer: {
    marginBottom: 60,
  },
  timerText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
    flexWrap: 'wrap',
  },
  resendText: {
    fontSize: 14,
    color: '#4a9eff',
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 16,
    lineHeight: 20,
    flexWrap: 'wrap',
  },
  languageContainer: {
    alignItems: 'center',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  globeIcon: {
    fontSize: 18,
  },
  languageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
