import { triggerAlert } from '@/components/CustomAlert';

export const showAlert = (title: string, message: string) => {
  triggerAlert(title, message);
};

export const showConfirm = (
  title: string,
  message: string,
  buttons: { text: string; style?: string; onPress?: () => void }[]
) => {
  triggerAlert(title, message, buttons as any);
};
