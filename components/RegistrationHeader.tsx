 import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';

interface RegistrationHeaderProps {
  title?: string;
  showHelp?: boolean;
  onClose?: () => void;
}

export default function RegistrationHeader({
  title = 'Sign Up',
  showHelp = true,
  onClose,
}: RegistrationHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.placeholder} />
      <Text style={styles.headerText}>{title}</Text>
      {showHelp ? (
        <TouchableOpacity>
          <Text style={styles.helpText}>Help</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.helpPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#1a1a1a',
  },
  placeholder: {
    width: 40,
  },
  headerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  helpText: {
    color: '#4a9eff',
    fontSize: 16,
    fontWeight: '500',
  },
  helpPlaceholder: {
    width: 40,
  },
});
