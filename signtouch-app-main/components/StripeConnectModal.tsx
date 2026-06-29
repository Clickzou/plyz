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
import { X, Shield, CreditCard, Clock, CheckCircle, ExternalLink, ArrowRight, Home, Mail, RefreshCw } from 'lucide-react-native';
import { useTranslation } from '@/contexts/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStripeAccountId, saveStripeAccountId } from '@/utils/userProfile';
import { authedFetch } from '@/utils/authedFetch';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface StripeConnectModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected: (accountId: string) => void;
  celebrityName?: string;
  celebrityId?: string;
  userId?: string;
  // Écran de l'app vers lequel revenir après l'onboarding Stripe
  // (ex: 'create-event' ou 'create-live-session'). Transmis au serveur
  // pour construire le lien profond de retour.
  returnPath?: string;
  // Langue de l'utilisateur (ex: 'fr', 'en') pour traduire la page de
  // confirmation servie par le serveur après l'onboarding.
  lang?: string;
}

export default function StripeConnectModal({
  visible,
  onClose,
  onConnected,
  celebrityName,
  celebrityId,
  userId,
  returnPath,
  lang,
}: StripeConnectModalProps) {
  const { t } = useTranslation();
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [step, setStep] = React.useState<'main' | 'onboarding' | 'checking' | 'noAccount' | 'pendingVerification'>('main');
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showAdminInput, setShowAdminInput] = React.useState(false);
  const [adminAccountIdInput, setAdminAccountIdInput] = React.useState('');
  const [adminInputError, setAdminInputError] = React.useState(false);
  const [isVerified, setIsVerified] = React.useState(false);
  const [, setIsPolling] = React.useState(false);
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  };

  React.useEffect(() => {
    if (visible) {
      setError(null);
      setShowAdminInput(false);
      setAdminAccountIdInput('');
      setAdminInputError(false);
      setIsVerified(false);
      checkExistingAccount();
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [visible]);

  const checkExistingAccount = async () => {
    try {
      const savedAccountId = userId
        ? await getStripeAccountId(userId)
        : await AsyncStorage.getItem('stripe_connect_account_id');
      if (savedAccountId) {
        setStep('checking');
        setAccountId(savedAccountId);
        const response = await authedFetch(
          `${STRIPE_SERVER_URL}/api/connect-account-status?account_id=${savedAccountId}`
        );
        const data = await response.json();
        if (data.onboarding_complete) {
          setIsVerified(true);
          setStep('onboarding');
          if (userId) {
            await saveStripeAccountId(userId, savedAccountId);
          } else {
            await AsyncStorage.setItem('stripe_connect_account_id', savedAccountId);
          }
          setTimeout(() => {
            onConnected(savedAccountId);
          }, 2500);
          return;
        } else {
          setStep('onboarding');
          return;
        }
      }
      setAccountId(null);
      setStep('main');
    } catch {
      setAccountId(null);
      setStep('main');
    }
  };

  const openUrl = (url: string) => {
    if (url.startsWith('https://connect.stripe.com/')) {
      console.log('[StripeConnect] URL validée : connect.stripe.com ✅', url);
    } else {
      console.warn('[StripeConnect] ⚠️ URL inattendue (pas connect.stripe.com) :', url);
    }

    console.log('[StripeConnect] Opening URL in browser...', url);

    if (Platform.OS === 'web') {
      const w = window.open(url, '_blank');
      if (!w) {
        console.warn('[StripeConnect] window.open blocked by popup blocker, trying location.href');
        window.location.href = url;
      }
    } else {
      Linking.openURL(url);
    }
  };

  const handleCreateNewAccount = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(`${STRIPE_SERVER_URL}/api/stripe/express/create-and-onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          celebrityName: celebrityName || '',
          celebrityId: celebrityId || '',
          returnPath: returnPath || '',
          lang: lang || '',
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur lors de la création du compte');

      console.log('[StripeConnect] Nouveau compte Express créé:', data.account_id);
      console.log('[StripeConnect] URL onboarding:', data.url);

      if (userId) {
        await saveStripeAccountId(userId, data.account_id);
      } else {
        await AsyncStorage.setItem('stripe_connect_account_id', data.account_id);
      }
      setAccountId(data.account_id);

      openUrl(data.url);
      setStep('onboarding');
    } catch (err: any) {
      console.error('[StripeConnect] Erreur création compte:', err);
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleExistingAccount = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const savedAccountId = userId
        ? await getStripeAccountId(userId)
        : await AsyncStorage.getItem('stripe_connect_account_id');

      if (!savedAccountId) {
        setStep('noAccount');
        setIsConnecting(false);
        return;
      }

      const response = await authedFetch(
        `${STRIPE_SERVER_URL}/api/stripe/express/account-link?account_id=${savedAccountId}`
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur lors de la génération du lien');

      console.log('[StripeConnect] Lien onboarding pour compte existant:', savedAccountId);
      console.log('[StripeConnect] URL onboarding:', data.url);

      setAccountId(savedAccountId);
      openUrl(data.url);
      setStep('onboarding');
    } catch (err: any) {
      console.error('[StripeConnect] Erreur compte existant:', err);
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAdminConnect = async () => {
    const trimmed = adminAccountIdInput.trim();
    if (!trimmed.startsWith('acct_')) {
      setAdminInputError(true);
      return;
    }
    setAdminInputError(false);
    setIsConnecting(true);
    setError(null);

    try {
      const response = await authedFetch(
        `${STRIPE_SERVER_URL}/api/stripe/express/account-link?account_id=${trimmed}`
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur lors de la génération du lien');

      console.log('[StripeConnect] Admin: lien onboarding pour:', trimmed);
      console.log('[StripeConnect] URL onboarding:', data.url);

      if (userId) {
        await saveStripeAccountId(userId, trimmed);
      } else {
        await AsyncStorage.setItem('stripe_connect_account_id', trimmed);
      }
      setAccountId(trimmed);
      openUrl(data.url);
      setStep('onboarding');
    } catch (err: any) {
      console.error('[StripeConnect] Erreur admin connect:', err);
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!accountId) return;
    setIsConnecting(true);
    setError(null);

    try {
      const response = await authedFetch(
        `${STRIPE_SERVER_URL}/api/connect-account-status?account_id=${accountId}`
      );
      const data = await response.json();

      if (data.onboarding_complete) {
        stopPolling();
        setIsVerified(true);
        setError(null);
        if (userId) {
          await saveStripeAccountId(userId, accountId);
        } else {
          await AsyncStorage.setItem('stripe_connect_account_id', accountId);
        }
        setTimeout(() => {
          onConnected(accountId);
        }, 2000);
      } else if (data.details_submitted) {
        setStep('pendingVerification');
        setError(null);
      } else {
        setError(t('stripeConnectIncomplete') || 'Veuillez d\'abord compléter toutes les étapes sur Stripe, puis revenez ici.');
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleReopenOnboarding = async () => {
    if (!accountId) return;
    setIsConnecting(true);
    setError(null);

    try {
      const response = await authedFetch(
        `${STRIPE_SERVER_URL}/api/stripe/express/account-link?account_id=${accountId}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur');

      console.log('[StripeConnect] Réouverture onboarding pour:', accountId);
      console.log('[StripeConnect] URL onboarding:', data.url);

      openUrl(data.url);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setIsConnecting(false);
    }
  };

  const features = [
    {
      icon: <Shield size={22} color="#10B981" />,
      titleKey: 'stripeConnectFeature1Title',
      fallbackTitle: 'Paiements sécurisés',
    },
    {
      icon: <Clock size={22} color="#10B981" />,
      titleKey: 'stripeConnectFeature2Title',
      fallbackTitle: 'Versements automatiques',
    },
    {
      icon: <CreditCard size={22} color="#10B981" />,
      titleKey: 'stripeConnectFeature3Title',
      fallbackTitle: 'Transparent et simple',
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
                  {t('stripeModalSubtitle') || 'Pour recevoir l\'argent de vos sessions live, créez ou connectez votre compte Stripe Connect.'}
                  {'\n'}
                  <Text style={styles.subtitleBold}>{t('stripeModalSubtitleBold') || 'C\'est rapide, gratuit et 100% sécurisé.'}</Text>
                </Text>
              </View>

              {step === 'checking' ? (
                <View style={styles.centeredContent}>
                  <ActivityIndicator size="large" color="#10B981" />
                  <Text style={styles.checkingText}>
                    {t('checkingStripeStatus') || 'Vérification de votre compte...'}
                  </Text>
                </View>
              ) : step === 'main' ? (
                <>
                  <View style={styles.featuresRow}>
                    {features.map((feature, index) => (
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

                  {error && (
                    <Text style={styles.errorBanner}>{error}</Text>
                  )}

                  <TouchableOpacity
                    style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
                    onPress={handleCreateNewAccount}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Text style={styles.connectButtonText}>
                          {t('stripeModalCreateAccount') || 'Créer mon compte Stripe Connect'}
                        </Text>
                        <ArrowRight size={20} color="#ffffff" />
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.existingAccountButton, isConnecting && styles.connectButtonDisabled]}
                    onPress={handleExistingAccount}
                    disabled={isConnecting}
                  >
                    <ExternalLink size={16} color="#635BFF" />
                    <Text style={styles.existingAccountText}>
                      {t('stripeModalHaveAccount') || 'J\'ai déjà un compte Stripe Connect'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.infoBox}>
                    <Shield size={14} color="#10B981" />
                    <Text style={styles.infoText}>
                      {t('stripeConnectInfoBox') || 'Plyz ne stocke jamais vos données bancaires. Tout est géré par Stripe, certifié PCI DSS niveau 1.'}
                    </Text>
                  </View>
                </>
              ) : step === 'noAccount' ? (
                <>
                  <View style={styles.onboardingInfo}>
                    <CreditCard size={32} color="#fbbf24" />
                    <Text style={styles.onboardingTitle}>
                      {t('stripeModalNoAccountTitle') || 'Aucun compte trouvé'}
                    </Text>
                    <Text style={styles.onboardingDesc}>
                      {t('stripeModalNoAccountDesc') || 'Aucun compte Stripe Connect n\'est associé à ce profil. Cliquez sur « Créer mon compte Stripe Connect » pour commencer.'}
                    </Text>
                  </View>

                  {error && (
                    <Text style={styles.errorBanner}>{error}</Text>
                  )}

                  <TouchableOpacity
                    style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
                    onPress={() => {
                      setStep('main');
                      setError(null);
                    }}
                    disabled={isConnecting}
                  >
                    <Text style={styles.connectButtonText}>
                      {t('stripeModalCreateAccount') || 'Créer mon compte Stripe Connect'}
                    </Text>
                    <ArrowRight size={20} color="#ffffff" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.adminToggle}
                    onPress={() => setShowAdminInput(!showAdminInput)}
                  >
                    <Text style={styles.adminToggleText}>
                      {(showAdminInput ? '▼ ' : '▶ ') + (t('stripeModalAdminToggle') || 'Mode admin')}
                    </Text>
                  </TouchableOpacity>

                  {showAdminInput && (
                    <View style={styles.adminSection}>
                      <Text style={styles.adminLabel}>
                        {t('stripeModalAdminLabel') || 'Identifiant Stripe Connect (acct_...)'}
                      </Text>
                      <View style={[styles.adminInputContainer, adminInputError && styles.adminInputError]}>
                        <CreditCard size={18} color="rgba(255,255,255,0.4)" />
                        <TextInput
                          style={styles.adminInput}
                          placeholder="acct_xxxxxxxxxxxxxx"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          value={adminAccountIdInput}
                          onChangeText={(text) => {
                            setAdminAccountIdInput(text);
                            setAdminInputError(false);
                            setError(null);
                          }}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                      {adminInputError && (
                        <Text style={styles.errorText}>
                          {t('stripeModalAdminError') || 'L\'identifiant doit commencer par « acct_ »'}
                        </Text>
                      )}
                      <TouchableOpacity
                        style={[styles.adminConnectButton, isConnecting && styles.connectButtonDisabled]}
                        onPress={handleAdminConnect}
                        disabled={isConnecting}
                      >
                        {isConnecting ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <Text style={styles.adminConnectButtonText}>
                            {t('stripeModalAdminConnect') || 'Connecter ce compte'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : step === 'pendingVerification' ? (
                <>
                  <View style={styles.pendingContainer}>
                    <View style={styles.pendingIconWrapper}>
                      <Clock size={48} color="#fbbf24" />
                    </View>
                    <Text style={styles.pendingTitle}>
                      {t('stripeConnectPendingTitle') || 'Inscription envoyée !'}
                    </Text>
                    <Text style={styles.pendingDesc}>
                      {t('stripeConnectPendingDesc') || 'Votre inscription Stripe a bien été soumise. Stripe doit maintenant vérifier vos informations. Ce processus peut prendre de quelques minutes à 24-48 heures.'}
                    </Text>
                  </View>

                  <View style={styles.pendingInfoBox}>
                    <Mail size={18} color="#635BFF" />
                    <Text style={styles.pendingInfoText}>
                      {t('stripeConnectPendingEmail') || 'Vous recevrez un e-mail de Stripe dès que votre compte sera vérifié et activé.'}
                    </Text>
                  </View>

                  <View style={styles.pendingStepsBox}>
                    <Text style={styles.pendingStepsTitle}>
                      {t('stripeConnectPendingNextSteps') || 'Que faire maintenant ?'}
                    </Text>
                    <View style={styles.pendingStep}>
                      <Text style={styles.pendingStepNumber}>1</Text>
                      <Text style={styles.pendingStepText}>
                        {t('stripeConnectPendingStep1') || 'Attendez l\'e-mail de confirmation de Stripe'}
                      </Text>
                    </View>
                    <View style={styles.pendingStep}>
                      <Text style={styles.pendingStepNumber}>2</Text>
                      <Text style={styles.pendingStepText}>
                        {t('stripeConnectPendingStep2') || 'Revenez ici et cliquez sur « Vérifier mon compte » pour confirmer l\'activation'}
                      </Text>
                    </View>
                    <View style={styles.pendingStep}>
                      <Text style={styles.pendingStepNumber}>3</Text>
                      <Text style={styles.pendingStepText}>
                        {t('stripeConnectPendingStep3') || 'Créez votre première session live et commencez à recevoir des paiements !'}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.recheckButton, isConnecting && styles.connectButtonDisabled]}
                    onPress={handleCheckStatus}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <ActivityIndicator color="#635BFF" size="small" />
                    ) : (
                      <>
                        <RefreshCw size={18} color="#635BFF" />
                        <Text style={styles.recheckButtonText}>
                          {t('stripeConnectRecheck') || 'Vérifier mon compte'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.goHomeButton}
                    onPress={onClose}
                  >
                    <Home size={18} color="#ffffff" />
                    <Text style={styles.goHomeButtonText}>
                      {t('stripeConnectGoHome') || 'Retour à l\'accueil'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : isVerified ? (
                <View style={styles.successContainer}>
                  <View style={styles.successIconWrapper}>
                    <CheckCircle size={48} color="#10B981" />
                  </View>
                  <Text style={styles.successTitle}>
                    {t('stripeConnectVerifiedTitle') || 'Compte Stripe activé !'}
                  </Text>
                  <Text style={styles.successDesc}>
                    {t('stripeConnectVerifiedDesc') || 'Votre compte est vérifié et opérationnel. Vous pouvez maintenant recevoir des paiements.'}
                  </Text>
                  <View style={styles.successBadge}>
                    <CheckCircle size={16} color="#10B981" />
                    <Text style={styles.successBadgeText}>
                      {t('stripeConnectActive') || 'Compte actif'}
                    </Text>
                  </View>
                </View>
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
                    onPress={handleReopenOnboarding}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <ActivityIndicator color="#635BFF" size="small" />
                    ) : (
                      <>
                        <ExternalLink size={18} color="#635BFF" />
                        <Text style={styles.reopenButtonText}>
                          {t('stripeConnectReopen') || 'Rouvrir le formulaire Stripe'}
                        </Text>
                      </>
                    )}
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
  subtitleBold: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '700',
    marginTop: 4,
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
    justifyContent: 'space-between',
    backgroundColor: '#635BFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
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
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
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
  adminToggle: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 4,
  },
  adminToggleText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  adminSection: {
    marginTop: 8,
    marginBottom: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  adminLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  adminInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  adminInputError: {
    borderColor: '#ef4444',
  },
  adminInput: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 6,
  },
  adminConnectButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#635BFF',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 10,
  },
  adminConnectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  pendingContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  pendingIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pendingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fbbf24',
    textAlign: 'center',
  },
  pendingDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 6,
  },
  pendingInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(99, 91, 255, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.2)',
  },
  pendingInfoText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 19,
  },
  pendingStepsBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  pendingStepsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  pendingStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  pendingStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 91, 255, 0.2)',
    color: '#635BFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
  pendingStepText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 19,
  },
  recheckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 91, 255, 0.1)',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.3)',
  },
  recheckButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#635BFF',
  },
  goHomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#635BFF',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 16,
  },
  goHomeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  successIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#10B981',
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginTop: 4,
  },
  successBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
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
