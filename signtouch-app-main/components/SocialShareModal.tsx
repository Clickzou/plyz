import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Alert } from 'react-native';
import { X, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useLanguage } from '@/contexts/LanguageContext';

interface SocialShareModalProps {
  visible: boolean;
  onClose: () => void;
  imageUri: string;
}

export default function SocialShareModal({ visible, onClose, imageUri }: SocialShareModalProps) {
  const { t } = useLanguage();

  const handleShare = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
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
        alert(t('socialShareError'));
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

            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <View style={styles.shareIconContainer}>
                <Share2 size={28} color="#ffffff" strokeWidth={2} />
              </View>
              <Text style={styles.shareButtonText}>{t('share')}</Text>
            </TouchableOpacity>
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
  shareButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 40,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  shareIconContainer: {
    marginRight: 12,
  },
  shareButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
});
