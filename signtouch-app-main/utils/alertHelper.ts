import { Alert, Platform } from 'react-native';
import { triggerAlert } from '@/components/CustomAlert';

export const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    triggerAlert(title, message);
  } else {
    Alert.alert(title, message);
  }
};

export const showConfirm = (
  title: string,
  message: string,
  buttons: { text: string; style?: string; onPress?: () => void }[]
) => {
  if (Platform.OS === 'web') {
    triggerAlert(title, message, buttons as any);
  } else {
    Alert.alert(title, message, buttons as any);
  }
};
