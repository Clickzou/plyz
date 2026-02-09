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
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Shield, CreditCard, Clock, CheckCircle, ExternalLink, ArrowRight, Mail } from 'lucide-react-native';
import { useTranslation } from '@/contexts/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface StripeConnectModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected: (accountId: string) => void;
  celebrityName?: string;
  celebrityId?: string;
}

export default function StripeConnectModal({
  visible,
  onClose,
  onConnected,
  celebrityName,
  celebrityId,
}: StripeConnectModalProps) {
  const { t } = useTranslation();
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [emailError, setEmailError] = React.useState(false);
  const [step, setStep] = React.useState<'email' | 'onboarding' | 'checking'>('email');
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      checkExistingAccount();
    }
  }, [visible]);

  const checkExistingAccount = async () => {
    try {
      const savedAccountId = await AsyncStorage.getItem('stripe_connect_account_id');
      if (savedAccountId) {
        setStep('checking');
        const response = await fetch(
          `${STRIPE_SERVER_URL}/api/connect-account-status?account_id=${savedAccountId}`
        );
        const data = await response.json();
        if (data.onboarding_complete) {
          onConnected(savedAccountId);
          return;
        } else if (data.details_submitted) {
          setAccountId(savedAccountId);
          setStep('onboarding');
          return;
        }
      }
      setStep('email');
    } catch {
      setStep('email');
    }
  };

  const validateEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const handleCreateAccount = async () => {
    if (!validateEmail(email)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setError(null);
    setIsConnecting(true);

    try {
      const response = await fetch(`${STRIPE_SERVER_URL}/api/create-connect-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          celebrityEmail: email,
          celebrityName: celebrityName || '',
          celebrityId: celebrityId || '',
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create account');

      const newAccountId = data.accountId;
      setAccountId(newAccountId);
      await AsyncStorage.setItem('stripe_connect_account_id', newAccountId);

      await openOnboardingLink(newAccountId);
    } catch (err: any) {
      console.error('[StripeConnect] Error:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setIsConnecting(false);
    }
  };

  const openOnboardingLink = async (acctId: string) => {
    setIsConnecting(true);
    try {
      const currentOrigin = Platform.OS === 'web'
        ? window.location.origin
        : 'https://signtouch.app';

      const response = await fetch(`${STRIPE_SERVER_URL}/api/create-account-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: acctId,
          returnUrl: `${currentOrigin}/stripe-return`,
          refreshUrl: `${currentOrigin}/stripe-refresh`,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create link');

      if (Platform.OS === 'web') {
        window.open(data.url, '_blank');
      } else {
        await Linking.openURL(data.url);
      }

      setStep('onboarding');
    } catch (err: any) {
      console.error('[StripeConnect] Error opening link:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!accountId) return;
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(
        `${STRIPE_SERVER_URL}/api/connect-account-status?account_id=${accountId}`
      );
      const data = await response.json();

      if (data.onboarding_complete) {
        await AsyncStorage.setItem('stripe_connect_account_id', accountId);
        onConnected(accountId);
      } else if (data.details_submitted) {
        setError(t('stripeConnectPending') || 'Your account is being verified by Stripe. This usually takes a few minutes.');
      } else {
        setError(t('stripeConnectIncomplete') || 'Please complete all the steps on Stripe first, then come back here.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsConnecting(false);
    }
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
      fallbackDesc: 'Recevez vos revenus directement sur votre compte bancaire sous 2 à 7 jours ouvrés.',
    },
    {
      icon: <CreditCard size={22} color="#10B981" />,
      titleKey: 'stripeConnectFeature3Title',
      descKey: 'stripeConnectFeature3Desc',
      fallbackTitle: 'Transparent et simple',
      fallbackDesc: 'Suivez vos revenus en temps réel. Aucun frais caché.',
    },
    {
      icon: <CheckCircle size={22} color="#10B981" />,
      titleKey: 'stripeConnectFeature4Title',
      descKey: 'stripeConnectFeature4Desc',
      fallbackTitle: 'Inscription en 5 minutes',
      fallbackDesc: 'Il vous suffit d\'une pièce d\'identité et de vos coordonnées bancaires.',
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

              {step === 'checking' ? (
                <View style={styles.centeredContent}>
                  <ActivityIndicator size="large" color="#10B981" />
                  <Text style={styles.checkingText}>
                    {t('checkingStripeStatus') || 'Vérification de votre compte...'}
                  </Text>
                </View>
              ) : step === 'email' ? (
                <>
                  <View style={styles.featuresRow}>
                    {features.slice(0, 3).map((feature, index) => (
                      <View key={index} style={styles.featureChip}>
                        <View style={styles.featureChipIcon}>
                          {feature.icon}
                        </View>
                        <Text style={styles.featureChipText} numberOfLines={2}>
                          {t(feature.titleKey as any) || feature.fallbackTitle}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.emailSection}>
                    <Text style={styles.emailLabel}>
                      {t('stripeConnectEmailLabel') || 'Votre adresse email'}
                    </Text>
                    <View style={[styles.emailInputContainer, emailError && styles.emailInputError]}>
                      <Mail size={18} color="rgba(255,255,255,0.4)" />
                      <TextInput
                        style={styles.emailInput}
                        placeholder={t('stripeConnectEmailPlaceholder') || 'votre@email.com'}
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        value={email}
                        onChangeText={(text) => {
                          setEmail(text);
                          setEmailError(false);
                          setError(null);
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                    {emailError && (
                      <Text style={styles.errorText}>
                        {t('invalidEmail') || 'Veuillez entrer une adresse email valide'}
                      </Text>
                    )}
                  </View>

                  {error && (
                    <Text style={styles.errorBanner}>{error}</Text>
                  )}

                  <TouchableOpacity
                    style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
                    onPress={handleCreateAccount}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Text style={styles.connectButtonText}>
                          {t('stripeConnectButton') || 'Créer mon compte Stripe'}
                        </Text>
                        <ArrowRight size={20} color="#ffffff" />
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.existingAccountButton, isConnecting && styles.connectButtonDisabled]}
                    onPress={handleCreateAccount}
                    disabled={isConnecting}
                  >
                    <ExternalLink size={16} color="#635BFF" />
                    <Text style={styles.existingAccountText}>
                      {t('stripeConnectExisting') || 'J\'ai déjà un compte Stripe'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.infoBox}>
                    <Shield size={14} color="#10B981" />
                    <Text style={styles.infoText}>
                      {t('stripeConnectInfoBox') || 'SignTouch ne stocke jamais vos données bancaires. Tout est géré par Stripe, certifié PCI DSS niveau 1.'}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.onboardingInfo}>
                    <CheckCircle size={32} color="#10B981" />
                    <Text style={styles.onboardingTitle}>
                      {t('stripeConnectOnboardingTitle') || 'Complétez votre inscription'}
                    </Text>
                    <Text style={styles.onboardingDesc}>
                      {t('stripeConnectOnboardingDesc') || 'Finalisez votre inscription sur Stripe, puis revenez ici pour confirmer.'}
                    </Text>
                  </View>

                  {error && (
                    <Text style={styles.errorBanner}>{error}</Text>
                  )}

                  <TouchableOpacity
                    style={styles.reopenButton}
                    onPress={() => accountId && openOnboardingLink(accountId)}
                    disabled={isConnecting}
                  >
                    <ExternalLink size={18} color="#635BFF" />
                    <Text style={styles.reopenButtonText}>
                      {t('stripeConnectReopen') || 'Rouvrir le formulaire Stripe'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.confirmButton, isConnecting && styles.connectButtonDisabled]}
                    onPress={handleCheckStatus}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <CheckCircle size={20} color="#ffffff" />
                        <Text style={styles.connectButtonText}>
                          {t('stripeConnectConfirm') || 'J\'ai terminé mon inscription'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
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
    marginBottom: 16,
  },
  stripeLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  featuresRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  featureChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  featureChipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 14,
  },
  emailSection: {
    marginBottom: 16,
  },
  emailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  emailInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emailInputError: {
    borderColor: '#ef4444',
  },
  emailInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 6,
  },
  errorBanner: {
    fontSize: 13,
    color: '#fbbf24',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    textAlign: 'center',
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
  existingAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 91, 255, 0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.25)',
  },
  existingAccountText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#635BFF',
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
  centeredContent: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  checkingText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  onboardingInfo: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
    marginBottom: 20,
  },
  onboardingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  onboardingDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  reopenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 91, 255, 0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.3)',
  },
  reopenButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#635BFF',
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
