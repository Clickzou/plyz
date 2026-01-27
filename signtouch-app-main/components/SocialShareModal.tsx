import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Alert } from 'react-native';
import { X, Share2, Download } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useLanguage } from '@/contexts/LanguageContext';

interface SocialShareModalProps {
  visible: boolean;
  onClose: () => void;
  imageUri: string;
  onSave?: () => Promise<void>;
}

export default function SocialShareModal({ visible, onClose, imageUri, onSave }: SocialShareModalProps) {
  const { t } = useLanguage();

  const handleShare = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Save to story gallery first
      if (onSave) {
        await onSave();
      }
      
      if (Platform.OS !== 'web') {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(imageUri, {
            mimeType: 'image/png',
            dialogTitle: t('shareYourCreation'),
          });
          onClose();
        } else {
          Alert.alert(t('error'), t('socialShareError'));
        }
      } else {
        const link = document.createElement('a');
        link.href = imageUri;
        link.download = `signtouch-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onClose();
      }
    } catch (error) {
      console.error('Erreur lors du partage:', error);
      if (Platform.OS === 'web') {
        alert(t('socialShareError'));
      } else {
        Alert.alert(t('error'), t('socialShareError'));
      }
    }
  };

  const handleSave = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Save to story gallery first
      if (onSave) {
        await onSave();
      }
      
      // Also save to device
      if (Platform.OS !== 'web') {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(imageUri);
          Alert.alert(t('done'), t('storySaved'));
        }
      } else {
        const link = document.createElement('a');
        link.href = imageUri;
        link.download = `signtouch-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      onClose();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('shareYourCreation')}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
              <X size={24} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.description}>{t('socialShareDescription')}</Text>

            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                activeOpacity={0.8}
              >
                <Download size={24} color="#ffffff" strokeWidth={2} />
                <Text style={styles.buttonText}>{t('save')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.shareButton}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <Share2 size={24} color="#ffffff" strokeWidth={2} />
                <Text style={styles.buttonText}>{t('share')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 32,
    alignItems: 'center',
  },
  description: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#6366f1',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
