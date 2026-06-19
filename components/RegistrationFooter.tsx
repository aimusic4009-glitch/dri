 import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { router } from 'expo-router';

interface RegistrationFooterProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  canGoNext: boolean;
  showBack?: boolean;
  loading?: boolean;
  nextButtonText?: string;
}

export default function RegistrationFooter({
  currentStep,
  totalSteps,
  onNext,
  canGoNext,
  showBack = true,
  loading = false,
  nextButtonText = 'Next',
}: RegistrationFooterProps) {
  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <View style={styles.footer}>
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>{currentStep} of {totalSteps}</Text>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${progressPercentage}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        {showBack ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backButtonPlaceholder} />
        )}

        <TouchableOpacity
          style={[
            styles.nextButton,
            (!canGoNext || loading) && styles.nextButtonDisabled,
          ]}
          onPress={onNext}
          disabled={!canGoNext || loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.nextButtonText}>{nextButtonText}</Text>
              <ChevronRight color="#000" size={24} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  backButtonPlaceholder: {
    width: 80,
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
    paddingVertical: 16,
    paddingHorizontal: 24,
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
