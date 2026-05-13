import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { X } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

interface AdModalProps {
  visible: boolean;
  onClose: () => void;
  onAdWatched: () => void;
}

export default function AdModal({ visible, onClose, onAdWatched }: AdModalProps) {
  const [watchingAd, setWatchingAd] = useState(false);
  const { t } = useLanguage();

  const handleWatchAd = async () => {
    setWatchingAd(true);
    setTimeout(() => {
      setWatchingAd(false);
      onClose();
      onAdWatched();
    }, 3000);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
            <X size={24} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>

          {watchingAd ? (
            <View style={styles.adContent}>
              <ActivityIndicator size="large" color="#10b981" />
              <Text style={styles.adText}>{t('loadingAd')}</Text>
              <Text style={styles.adSubtext}>{t('downloadStartsSoon')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>{t('downloadYourMemory')}</Text>
                <Text style={styles.subtitle}>
                  {t('watchAdToDownload')}
                </Text>
              </View>

              <View style={styles.buttonsContainer}>
                <TouchableOpacity
                  style={styles.adButton}
                  onPress={handleWatchAd}
                  activeOpacity={0.8}
                >
                  <Text style={styles.adButtonText}>{t('watchAdButton')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 30,
    width: '100%',
    maxWidth: 400,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  header: {
    marginTop: 20,
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonsContainer: {
    gap: 15,
  },
  adButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  adButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  adContent: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 15,
  },
  adText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
  },
  adSubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});
