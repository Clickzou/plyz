import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { X, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';

interface AdModalProps {
  visible: boolean;
  onClose: () => void;
  onAdWatched: () => void;
}

export default function AdModal({ visible, onClose, onAdWatched }: AdModalProps) {
  const [watchingAd, setWatchingAd] = useState(false);
  const router = useRouter();
  const { t } = useLanguage();

  const handleWatchAd = async () => {
    setWatchingAd(true);
    setTimeout(() => {
      setWatchingAd(false);
      onClose();
      onAdWatched();
    }, 3000);
  };

  const handleUpgrade = () => {
    onClose();
    setTimeout(() => {
      router.push('/paywall');
    }, 200);
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

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('or')}</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.premiumButton}
                  onPress={handleUpgrade}
                  activeOpacity={0.8}
                >
                  <Sparkles size={20} color="#ffffff" strokeWidth={2} />
                  <Text style={styles.premiumButtonText}>{t('premiumInfoButton')}</Text>
                </TouchableOpacity>

                <Text style={styles.premiumDescription}>
                  {t('disableAdsAndUnlock')}
                </Text>
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  dividerText: {
    color: '#666',
    fontSize: 14,
    marginHorizontal: 15,
  },
  premiumButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  premiumButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  premiumDescription: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginTop: 5,
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
