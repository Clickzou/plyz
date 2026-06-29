import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Alert, Linking } from 'react-native';
import { X, Share2, Download } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { showAlert, showConfirm } from '@/utils/alertHelper';

interface SocialShareModalProps {
  visible: boolean;
  onClose: () => void;
  imageUri: string;
  onSave?: () => Promise<void>;
  // Masque le bouton "Enregistrer" (ex: dans l'editeur ou la validation suffit deja a sauvegarder)
  showSave?: boolean;
}

export default function SocialShareModal({ visible, onClose, imageUri, onSave, showSave = true }: SocialShareModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  // Le partage/sauvegarde natif n'accepte que des fichiers locaux (file://).
  // Les photos du cloud sont des URLs https -> on les telecharge d'abord en local.
  const ensureLocalUri = async (uri: string): Promise<string> => {
    if (!uri || !/^https?:\/\//i.test(uri)) return uri;
    const localUri = FileSystem.documentDirectory + `plyz-share-${Date.now()}.png`;
    const res = await FileSystem.downloadAsync(uri, localUri);
    return res.uri;
  };

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
          const localUri = await ensureLocalUri(imageUri);
          await Sharing.shareAsync(localUri, {
            mimeType: 'image/png',
            dialogTitle: t('shareYourCreation'),
          });
          onClose();
        } else {
          showAlert(t('error'), t('socialShareError'));
        }
      } else {
        const link = document.createElement('a');
        link.href = imageUri;
        link.download = `plyz-${Date.now()}.png`;
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
        showAlert(t('error'), t('socialShareError'));
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
          const localUri = await ensureLocalUri(imageUri);
          await MediaLibrary.saveToLibraryAsync(localUri);
          showAlert(t('downloaded'), t('imageSavedToGallery'));
        } else {
          showConfirm(
            t('permissionRequired'),
            t('galleryPermissionMessage'),
            [
              { text: t('cancel') || 'Annuler', style: 'cancel' },
              { text: t('openSettings') || 'Ouvrir les réglages', onPress: () => Linking.openSettings() },
            ]
          );
        }
      } else {
        const link = document.createElement('a');
        link.href = imageUri;
        link.download = `plyz-${Date.now()}.png`;
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

          <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
            <Text style={styles.description}>{t('socialShareDescription')}</Text>

            <View style={styles.buttonsRow}>
              {showSave && (
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                  activeOpacity={0.8}
                >
                  <Download size={24} color="#ffffff" strokeWidth={2} />
                  <Text style={styles.buttonText}>{t('save')}</Text>
                </TouchableOpacity>
              )}

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
