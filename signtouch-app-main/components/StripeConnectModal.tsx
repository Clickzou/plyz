import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Shield, CreditCard, Clock, CheckCircle, ExternalLink, ArrowRight } from 'lucide-react-native';
import { useTranslation } from '@/contexts/LanguageContext';

interface StripeConnectModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export default function StripeConnectModal({
  visible,
  onClose,
  onConnected,
}: StripeConnectModalProps) {
  const { t } = useTranslation();
  const [isConnecting, setIsConnecting] = React.useState(false);

  const [stripeOpened, setStripeOpened] = React.useState(false);

  const handleOpenStripe = async () => {
    setIsConnecting(true);
    try {
      const onboardingUrl = 'https://connect.stripe.com/setup';
      if (Platform.OS === 'web') {
        window.open(onboardingUrl, '_blank');
      } else {
        await Linking.openURL(onboardingUrl);
      }
      setStripeOpened(true);
    } catch (error) {
      console.error('[StripeConnect] Error opening Stripe:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConfirmConnected = () => {
    onConnected();
  };

  const features = [
    {
      icon: <Shield size={22} color="#10B981" />,
      titleKey: 'stripeConnectFeature1Title',
      descKey: 'stripeConnectFeature1Desc',
      fallbackTitle: 'Paiements sécurisés',
      fallbackDesc: 'Stripe est le leader mondial du paiement en ligne, utilisé par des millions d\'entreprises.',
    },
    {
      icon: <Clock size={22} color="#10B981" />,
      titleKey: 'stripeConnectFeature2Title',
      descKey: 'stripeConnectFeature2Desc',
      fallbackTitle: 'Versements automatiques',
      fallbackDesc: 'Recevez vos revenus directement sur votre compte bancaire sous 7 à 14 jours.',
    },
    {
      icon: <CreditCard size={22} color="#10B981" />,
      titleKey: 'stripeConnectFeature3Title',
      descKey: 'stripeConnectFeature3Desc',
      fallbackTitle: 'Transparent et simple',
      fallbackDesc: 'Suivez vos revenus en temps réel. Aucun frais caché, seulement 2.9% + 0.30€ par transaction.',
    },
    {
      icon: <CheckCircle size={22} color="#10B981" />,
      titleKey: 'stripeConnectFeature4Title',
      descKey: 'stripeConnectFeature4Desc',
      fallbackTitle: 'Inscription en 5 minutes',
      fallbackDesc: 'Il vous suffit d\'une pièce d\'identité et de vos coordonnées bancaires pour commencer.',
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <LinearGradient
            colors={['#0a1628', '#0f2030', '#0a1628']}
            style={styles.gradient}
          >
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={styles.header}>
                <View style={styles.stripeLogoContainer}>
                  <Text style={styles.stripeLogo}>stripe</Text>
                  <Text style={styles.connectBadge}>Connect</Text>
                </View>

                <Text style={styles.title}>
                  {t('stripeConnectTitle') || 'Recevez vos paiements'}
                </Text>
                <Text style={styles.subtitle}>
                  {t('stripeConnectSubtitle') || 'Pour recevoir l\'argent de vos sessions live, connectez votre compte Stripe. C\'est rapide, gratuit et 100% sécurisé.'}
                </Text>
              </View>

              <View style={styles.featuresContainer}>
                {features.map((feature, index) => (
                  <View key={index} style={styles.featureCard}>
                    <View style={styles.featureIconContainer}>
                      {feature.icon}
                    </View>
                    <View style={styles.featureTextContainer}>
                      <Text style={styles.featureTitle}>
                        {t(feature.titleKey as any) || feature.fallbackTitle}
                      </Text>
                      <Text style={styles.featureDesc}>
                        {t(feature.descKey as any) || feature.fallbackDesc}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.infoBox}>
                <Shield size={16} color="#10B981" />
                <Text style={styles.infoText}>
                  {t('stripeConnectInfoBox') || 'SignTouch ne stocke jamais vos données bancaires. Tout est géré par Stripe, certifié PCI DSS niveau 1.'}
                </Text>
              </View>

              {!stripeOpened ? (
                <TouchableOpacity
                  style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
                  onPress={handleOpenStripe}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Text style={styles.connectButtonText}>
                        {t('stripeConnectButton') || 'Connecter mon compte Stripe'}
                      </Text>
                      <ArrowRight size={20} color="#ffffff" />
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handleConfirmConnected}
                >
                  <CheckCircle size={20} color="#ffffff" />
                  <Text style={styles.connectButtonText}>
                    {t('stripeConnectConfirm') || 'J\'ai connecté mon compte'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.learnMoreButton} onPress={() => {
                const url = 'https://stripe.com/connect';
                if (Platform.OS === 'web') {
                  window.open(url, '_blank');
                } else {
                  Linking.openURL(url);
                }
              }}>
                <ExternalLink size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.learnMoreText}>
                  {t('stripeConnectLearnMore') || 'En savoir plus sur Stripe Connect'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '92%',
    maxWidth: 440,
    maxHeight: '90%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  gradient: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 28,
    paddingTop: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  stripeLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  stripeLogo: {
    fontSize: 32,
    fontWeight: '700',
    color: '#635BFF',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  connectBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: 'rgba(99, 91, 255, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 22,
  },
  featuresContainer: {
    marginBottom: 20,
    gap: 16,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  featureIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 19,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#635BFF',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 16,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 16,
  },
  connectButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  learnMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 8,
  },
  learnMoreText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
});
