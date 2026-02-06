import { Alert, Platform } from 'react-native';

export const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
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
    const destructiveBtn = buttons.find(b => b.style === 'destructive');
    const cancelBtn = buttons.find(b => b.style === 'cancel');
    if (destructiveBtn && cancelBtn) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && destructiveBtn.onPress) {
        destructiveBtn.onPress();
      }
    } else {
      window.alert(`${title}\n\n${message}`);
    }
  } else {
    Alert.alert(title, message, buttons as any);
  }
};
