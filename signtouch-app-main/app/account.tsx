import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { router } from 'expo-router';
import { Crown, Info, Heart, Share2, Globe, Check, FileText, LogOut, Gift, X, Mail, User, Shield, ArrowRight, CreditCard, HelpCircle, Camera } from 'lucide-react-native';
import { SUBSCRIPTION_ENABLED } from '@/contexts/SubscriptionContext';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import BottomNav from '@/components/BottomNav';
import { useTranslation } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Language } from '@/locales';
import { showAccountModal } from '@/utils/postPurchaseAccount';
import { validatePromoCode, getPromoPremiumStatus } from '@/utils/promoCodeStorage';
import { clearTrialData } from '@/utils/trialStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getStripeAccountId, saveStripeAccountId } from '@/utils/userProfile';
import StripeConnectModal from '@/components/StripeConnectModal';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { Star } from 'lucide-react-native';
import { FanBadgeCard } from '@/components/FanBadge';

const LANGUAGES: { code: Language; name: string; flag: string }[] = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'bn', name: 'বাংলা', flag: '🇧🇩' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'ur', name: 'اردو', flag: '🇵🇰' },
  { code: 'ms', name: 'Bahasa Melayu', flag: '🇲🇾' },
];

export default function AccountScreen() {
  const { t, language, setLanguage, isRTL } = useTranslation();
  const { user, signOut, sendOtpCode, verifyOtpCode } = useAuth();
  const { status } = useSubscription();
  const { isCelebrity, toggleCelebrityMode, profilePhoto, setProfilePhoto } = useCelebrityMode();
  const { startOnboarding } = useOnboarding();
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [promoPremiumExpires, setPromoPremiumExpires] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loginStep, setLoginStep] = useState<'idle' | 'email' | 'otp' | 'sending' | 'verifying'>('idle');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [stripeLinked, setStripeLinked] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

  useEffect(() => {
    checkPromoPremium();
  }, []);

  useEffect(() => {
    checkLocalStripeConnect();
    if (user?.id) {
      syncStripeOnLogin();
    }
  }, [user?.id]);

  const checkLocalStripeConnect = async () => {
    setStripeLoading(true);
    try {
      const localStripeId = await AsyncStorage.getItem('stripe_connect_account_id');
      setStripeLinked(!!localStripeId);
      setStripeAccountId(localStripeId);
    } catch (error) {
      console.error('[Account] Error checking local Stripe:', error);
      setStripeLinked(false);
      setStripeAccountId(null);
    } finally {
      setStripeLoading(false);
    }
  };

  const syncStripeOnLogin = async () => {
    if (!user?.id) return;
    setStripeLoading(true);
    try {
      const localStripeId = await AsyncStorage.getItem('stripe_connect_account_id');
      if (localStripeId) {
        await saveStripeAccountId(user.id, localStripeId);
        setStripeLinked(true);
        setStripeAccountId(localStripeId);
      } else {
        const dbStripeId = await getStripeAccountId(user.id);
        setStripeLinked(!!dbStripeId);
        setStripeAccountId(dbStripeId);
      }
    } catch (error) {
      console.error('[Account] Error syncing Stripe:', error);
    } finally {
      setStripeLoading(false);
    }
  };

  const maskedStripeId = stripeAccountId
    ? stripeAccountId.slice(0, 5) + '••••' + stripeAccountId.slice(-4)
    : '';

  const handleSendOtp = async () => {
    if (!loginEmail.trim()) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(loginEmail.trim())) {
      setLoginError(t('invalidEmail') || 'Adresse email invalide');
      return;
    }
    setLoginStep('sending');
    setLoginError(null);
    const { error } = await sendOtpCode(loginEmail.trim());
    if (error) {
      setLoginError(error.message);
      setLoginStep('email');
    } else {
      setLoginStep('otp');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) return;
    setLoginStep('verifying');
    setLoginError(null);
    const { error } = await verifyOtpCode(loginEmail.trim(), otpCode.trim());
    if (error) {
      setLoginError(error.message);
      setLoginStep('otp');
    } else {
      setLoginStep('idle');
      setLoginEmail('');
      setOtpCode('');
    }
  };

  const checkPromoPremium = async () => {
    const promoStatus = await getPromoPremiumStatus();
    if (promoStatus.isActive && promoStatus.expiresAt) {
      setPromoPremiumExpires(promoStatus.expiresAt);
    }
  };

  const handlePromoSubmit = async () => {
    if (!promoCode.trim()) return;
    
    setPromoLoading(true);
    setPromoMessage(null);
    
    const result = await validatePromoCode(promoCode);
    
    setPromoMessage({ text: result.message, success: result.success });
    setPromoLoading(false);
    
    if (result.success && result.expiresAt) {
      setPromoPremiumExpires(result.expiresAt);
      setTimeout(() => {
        setShowPromoModal(false);
        setPromoCode('');
        setPromoMessage(null);
      }, 2000);
    }
  };

  const handlePress = (action: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (action === 'about') {
      router.push('/about');
    } else if (action === 'subscription') {
      if (user) {
        router.push('/paywall?fromAccount=true');
      } else {
        showAccountModal();
      }
    } else if (action === 'share') {
      router.push('/share');
    } else if (action === 'language') {
      setShowLanguageModal(true);
    } else if (action === 'legal') {
      router.push('/legal');
    } else if (action === 'replayTutorial') {
      AsyncStorage.removeItem('@signtouch_onboarding_done').then(() => {
        startOnboarding();
      });
    } else {
      console.log('Action:', action);
    }
  };

  const handleLanguageSelect = async (newLanguage: Language) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await setLanguage(newLanguage);
    setShowLanguageModal(false);
  };

  const getCurrentLanguageName = () => {
    return LANGUAGES.find(lang => lang.code === language)?.name || 'English';
  };

  const handleSignOut = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleTestDeepLink = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const url = Linking.createURL('auth-callback');
    console.log('URL de redirection:', url);
    await Clipboard.setStringAsync(url);
    showAlert(
      'URL copiée!',
      `Cette URL a été copiée dans le presse-papiers:\n\n${url}\n\nAjoute-la dans Supabase Dashboard:\nAuthentication → URL Configuration → Redirect URLs`
    );
  };

  const pickProfilePhoto = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('permissionRequired' as any) || 'Permission required', t('galleryPermission' as any) || 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await setProfilePhoto(result.assets[0].uri);
    }
  };

  const removeProfilePhoto = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await setProfilePhoto(null);
  };

  const handleResetTrial = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    await signOut();
    
    await clearTrialData();
    await AsyncStorage.removeItem('@signtouch_device_id');
    await AsyncStorage.removeItem('@create_event_form_data');
    await AsyncStorage.removeItem('@create_event_pending');
    await AsyncStorage.removeItem('@post_auth_redirect');
    await AsyncStorage.removeItem('@signtouch_promo_premium');
    await AsyncStorage.removeItem('stripe_connect_account_id');
    
    setPromoPremiumExpires(null);
    
    if (Platform.OS === 'web') {
      localStorage.removeItem('subscription_status');
      alert('Compte déconnecté et données réinitialisées! Rafraîchissez la page pour tester comme nouvel utilisateur.');
    } else {
      await AsyncStorage.removeItem('subscription_status');
      showAlert(
        'Réinitialisation complète',
        'Compte déconnecté et données effacées. Redémarrez l\'app pour tester le flux nouvel utilisateur.'
      );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('account')}</Text>
          <Text style={styles.subtitle}>SignTouch</Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>
            {t('myAccount') || 'MON COMPTE'}
          </Text>

          {user ? (
            <View style={styles.accountCard}>
              <View style={styles.accountCardHeader}>
                <View style={styles.accountAvatar}>
                  <User size={28} color="#10b981" />
                </View>
                <View style={styles.accountCardInfo}>
                  <Text style={styles.accountCardName}>
                    {user.email}
                  </Text>
                  <View style={styles.accountBadge}>
                    <Shield size={12} color="#10b981" />
                    <Text style={styles.accountBadgeText}>
                      {t('accountActive') || 'Compte actif'}
                    </Text>
                  </View>
                </View>
              </View>

              {stripeLinked && (
                <View style={styles.stripeLinkedBadge}>
                  <CreditCard size={14} color="#635BFF" />
                  <Text style={styles.stripeLinkedText}>
                    Stripe Connect
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.signOutButton}
                onPress={handleSignOut}
                activeOpacity={0.7}
              >
                <LogOut size={16} color="#ef4444" />
                <Text style={styles.signOutButtonText}>{t('signOut')}</Text>
              </TouchableOpacity>
            </View>
          ) : loginStep === 'idle' ? (
            <View style={styles.accountCard}>
              {stripeLinked ? (
                <>
                  <View style={styles.accountCardHeader}>
                    <View style={styles.accountAvatar}>
                      <CreditCard size={28} color="#635BFF" />
                    </View>
                    <View style={styles.accountCardInfo}>
                      <Text style={styles.accountCardName}>
                        Stripe Connect
                      </Text>
                      <View style={styles.accountBadge}>
                        <Shield size={12} color="#10b981" />
                        <Text style={styles.accountBadgeText}>
                          {t('stripeConnected') || 'Connecté'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {stripeAccountId && (
                    <View style={styles.stripeAccountIdBox}>
                      <Text style={styles.stripeAccountIdLabel}>ID</Text>
                      <Text style={styles.stripeAccountIdValue} numberOfLines={1}>
                        {maskedStripeId}
                      </Text>
                    </View>
                  )}

                  <Text style={[styles.stripeDesc, { marginTop: 12 }]}>
                    {t('stripeConnectedDesc') || 'Votre compte Stripe Connect est actif. Vous pouvez recevoir des paiements pour vos sessions live.'}
                  </Text>

                  <TouchableOpacity
                    style={[styles.stripeActionButton, styles.stripeActionButtonConnected]}
                    onPress={() => setShowStripeModal(true)}
                    activeOpacity={0.7}
                  >
                    <CreditCard size={18} color="#635BFF" />
                    <Text style={[styles.stripeActionButtonText, styles.stripeActionButtonTextConnected]}>
                      {t('stripeManage') || 'Gérer mon compte Stripe'}
                    </Text>
                    <ArrowRight size={16} color="#635BFF" />
                  </TouchableOpacity>

                  <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                    <Text style={[styles.accountCardSubtitle, { marginBottom: 12 }]}>
                      {t('linkEmailToStripe') || 'Associez un email pour sécuriser votre compte et retrouver vos données.'}
                    </Text>
                    <TouchableOpacity
                      style={styles.createAccountButton}
                      onPress={() => setLoginStep('email')}
                      activeOpacity={0.7}
                    >
                      <Mail size={18} color="#ffffff" />
                      <Text style={styles.createAccountButtonText}>
                        {t('receiveEmail') || 'Recevoir un mail'}
                      </Text>
                      <ArrowRight size={18} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.accountCardHeader}>
                    <View style={[styles.accountAvatar, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                      <User size={28} color="#888" />
                    </View>
                    <View style={styles.accountCardInfo}>
                      <Text style={styles.accountCardTitle}>
                        {t('createAccountToSave') || 'Creez un compte gratuitement'}
                      </Text>
                      <Text style={styles.accountCardSubtitle}>
                        {t('createAccountSubtitle') || 'Sauvegardez vos photos et accedez-y depuis n\'importe quel appareil'}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.createAccountButton}
                    onPress={() => setLoginStep('email')}
                    activeOpacity={0.7}
                  >
                    <Mail size={18} color="#ffffff" />
                    <Text style={styles.createAccountButtonText}>
                      {t('continueWithEmail') || 'Continuer avec mon email'}
                    </Text>
                    <ArrowRight size={18} color="#ffffff" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : loginStep === 'email' || loginStep === 'sending' ? (
            <View style={styles.accountCard}>
              <Text style={styles.loginTitle}>
                {t('enterYourEmail') || 'Entrez votre email'}
              </Text>
              <Text style={styles.loginSubtitle}>
                {t('secureCodeExplanation') || 'Vous recevrez un code a 8 chiffres par email.'}
              </Text>

              <TextInput
                style={styles.loginInput}
                placeholder={t('emailPlaceholder') || 'votre@email.com'}
                placeholderTextColor="#666"
                value={loginEmail}
                onChangeText={(text) => { setLoginEmail(text); setLoginError(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={loginStep !== 'sending'}
              />

              {loginError && (
                <Text style={styles.loginError}>{loginError}</Text>
              )}

              <TouchableOpacity
                style={[styles.createAccountButton, loginStep === 'sending' && { opacity: 0.6 }]}
                onPress={handleSendOtp}
                disabled={loginStep === 'sending'}
                activeOpacity={0.7}
              >
                {loginStep === 'sending' ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.createAccountButtonText}>
                    {t('sendEmailLink') || 'Envoyer le code'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => { setLoginStep('idle'); setLoginError(null); setLoginEmail(''); }}
              >
                <Text style={styles.cancelButtonText}>
                  {t('cancel') || 'Annuler'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.accountCard}>
              <Text style={styles.loginTitle}>
                {t('checkYourEmail') || 'Verifiez votre email'}
              </Text>
              <Text style={styles.loginSubtitle}>
                {t('codeSentToEmail') || 'Nous avons envoye un code a 8 chiffres a votre email.'}
              </Text>
              <Text style={styles.loginEmailDisplay}>{loginEmail}</Text>

              <TextInput
                style={[styles.loginInput, { textAlign: 'center', letterSpacing: 4, fontSize: 22 }]}
                placeholder="12345678"
                placeholderTextColor="#666"
                value={otpCode}
                onChangeText={(text) => { setOtpCode(text); setLoginError(null); }}
                keyboardType="number-pad"
                maxLength={8}
                editable={loginStep !== 'verifying'}
              />

              {loginError && (
                <Text style={styles.loginError}>{loginError}</Text>
              )}

              <TouchableOpacity
                style={[styles.createAccountButton, loginStep === 'verifying' && { opacity: 0.6 }]}
                onPress={handleVerifyOtp}
                disabled={loginStep === 'verifying'}
                activeOpacity={0.7}
              >
                {loginStep === 'verifying' ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.createAccountButtonText}>
                    {t('validate') || 'Valider'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => { setLoginStep('email'); setOtpCode(''); setLoginError(null); }}
              >
                <Text style={styles.cancelButtonText}>
                  {t('changeEmail') || "Changer d'adresse email"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>
            FAN STATUS
          </Text>
          <FanBadgeCard />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>
            {t('celebrityModeSection')}
          </Text>

          <View style={styles.accountCard}>
            <View style={styles.accountCardHeader}>
              <TouchableOpacity
                style={[styles.accountAvatar, { backgroundColor: isCelebrity ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.08)' }]}
                onPress={pickProfilePhoto}
                activeOpacity={0.7}
              >
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.profilePhotoImage} />
                ) : (
                  <Star size={28} color={isCelebrity ? '#f59e0b' : '#888'} fill={isCelebrity ? '#f59e0b' : 'transparent'} />
                )}
                <View style={styles.profilePhotoBadge}>
                  <Camera size={10} color="#fff" />
                </View>
              </TouchableOpacity>
              <View style={styles.accountCardInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.accountCardName}>
                    {isCelebrity ? (t('celebrityModeActive')) : (t('celebrityModeInactive'))}
                  </Text>
                  {isCelebrity && stripeLinked && (
                    <View style={styles.verifiedBadgeSmall}>
                      <Check size={10} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={styles.accountCardSubtitle}>
                  {isCelebrity ? (t('celebrityModeActiveDesc')) : (t('celebrityModeInactiveDesc'))}
                </Text>
                {isCelebrity && stripeLinked && (
                  <Text style={styles.verifiedText}>
                    {t('celVerifiedStripe' as any) || 'Stripe Connect vérifié'}
                  </Text>
                )}
              </View>
            </View>

            {isCelebrity && (
              <TouchableOpacity
                style={[styles.activateButton, stripeLinked && styles.activateButtonDone]}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  router.push('/celebrity-onboarding' as any);
                }}
                activeOpacity={0.8}
              >
                {stripeLinked ? (
                  <Check size={18} color="#fff" />
                ) : (
                  <Star size={18} color="#000" fill="#000" />
                )}
                <Text style={[styles.activateButtonText, stripeLinked && { color: '#fff' }]}>
                  {stripeLinked
                    ? (t('celOnboardActivated' as any) || 'Activé')
                    : (t('celOnboardActivate' as any) || 'Activer')
                  }
                </Text>
                <ArrowRight size={18} color={stripeLinked ? '#fff' : '#000'} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.createAccountButton,
                !isCelebrity && { backgroundColor: '#f59e0b' },
                isCelebrity && { backgroundColor: '#374151' },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                toggleCelebrityMode();
              }}
              activeOpacity={0.7}
            >
              <Star size={18} color={isCelebrity ? '#ffffff' : '#000000'} fill={isCelebrity ? 'transparent' : '#000000'} />
              <Text style={[styles.createAccountButtonText, !isCelebrity && { color: '#000000' }]}>
                {isCelebrity ? (t('disableCelebrityMode')) : (t('enableCelebrityMode'))}
              </Text>
              <ArrowRight size={18} color={isCelebrity ? '#ffffff' : '#000000'} />
            </TouchableOpacity>
          </View>
        </View>

        {__DEV__ && (
          <View style={styles.debugSection}>
            <Text style={styles.debugTitle}>Mode Debug</Text>
            {Platform.OS !== 'web' && (
              <>
                <TouchableOpacity
                  style={styles.debugButton}
                  onPress={handleTestDeepLink}
                  activeOpacity={0.7}
                >
                  <Text style={styles.debugButtonText}>
                    Obtenir l'URL de redirection Supabase
                  </Text>
                </TouchableOpacity>
                <Text style={styles.debugHint}>
                  Si le lien de confirmation d'email ne fonctionne pas, clique ici pour obtenir l'URL à ajouter dans Supabase Dashboard
                </Text>
              </>
            )}
            <TouchableOpacity
              style={[styles.debugButton, { backgroundColor: '#ef4444', marginTop: 12 }]}
              onPress={handleResetTrial}
              activeOpacity={0.7}
            >
              <Text style={styles.debugButtonText}>
                Réinitialiser le trial (test nouvel utilisateur)
              </Text>
            </TouchableOpacity>
            <Text style={styles.debugHint}>
              Efface les données de trial pour tester le flux d'un nouvel utilisateur
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>{t('preferences')}</Text>

          <TouchableOpacity
            style={[styles.menuItem, isRTL && styles.menuItemRTL]}
            onPress={() => handlePress('language')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
              <Globe size={24} color="#10b981" strokeWidth={2} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('language')}</Text>
              <Text style={[styles.menuSubtext, isRTL && styles.menuSubtextRTL]}>{getCurrentLanguageName()}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>{t('application')}</Text>

          {SUBSCRIPTION_ENABLED && (
            <TouchableOpacity
              style={[styles.menuItem, isRTL && styles.menuItemRTL]}
              onPress={() => handlePress('subscription')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
                <Crown size={24} color="#10b981" strokeWidth={2} />
              </View>
              <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('mySubscription')}</Text>
            </TouchableOpacity>
          )}

          {SUBSCRIPTION_ENABLED && (
            <TouchableOpacity
              style={[styles.menuItem, isRTL && styles.menuItemRTL]}
              onPress={() => setShowPromoModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
                <Gift size={24} color="#f59e0b" strokeWidth={2} />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('promoCode') || 'Code promo'}</Text>
                {promoPremiumExpires && (
                  <Text style={[styles.menuSubtextGreen, isRTL && styles.menuSubtextRTL]}>
                    Premium jusqu'au {new Date(promoPremiumExpires).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.menuItem, isRTL && styles.menuItemRTL]}
            onPress={() => handlePress('about')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
              <Info size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('about')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, isRTL && styles.menuItemRTL]}
            onPress={() => handlePress('replayTutorial')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
              <HelpCircle size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('replayTutorial') || 'Replay Tutorial'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>{t('community')}</Text>

          <TouchableOpacity
            style={[styles.menuItem, isRTL && styles.menuItemRTL]}
            onPress={() => handlePress('rate')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
              <Heart size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('rateApp')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, isRTL && styles.menuItemRTL]}
            onPress={() => handlePress('share')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
              <Share2 size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('shareApp')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>{t('legal') || 'Légal'}</Text>

          <TouchableOpacity
            style={[styles.menuItem, isRTL && styles.menuItemRTL]}
            onPress={() => handlePress('legal')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
              <FileText size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>Documents Légaux</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>SignTouch v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            {t('offlineApp')}
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showPromoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPromoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowPromoModal(false)}
          />
          <View style={styles.promoModalContent}>
            <TouchableOpacity
              style={styles.promoCloseBtn}
              onPress={() => setShowPromoModal(false)}
            >
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
            
            <Gift size={48} color="#f59e0b" style={{ marginBottom: 16 }} />
            <Text style={styles.promoTitle}>{t('promoCode') || 'Code promo'}</Text>
            <Text style={styles.promoSubtitle}>
              {t('enterPromoCode') || 'Entrez votre code promotionnel'}
            </Text>
            
            <TextInput
              style={styles.promoInput}
              placeholder="XXXXXX"
              placeholderTextColor="#9ca3af"
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              maxLength={20}
            />
            
            {promoMessage && (
              <Text style={[
                styles.promoMessage,
                promoMessage.success ? styles.promoMessageSuccess : styles.promoMessageError
              ]}>
                {promoMessage.text}
              </Text>
            )}
            
            <TouchableOpacity
              style={[styles.promoButton, promoLoading && styles.promoButtonDisabled]}
              onPress={handlePromoSubmit}
              disabled={promoLoading}
            >
              {promoLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.promoButtonText}>{t('validate') || 'Valider'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showLanguageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowLanguageModal(false)}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('selectLanguage')}</Text>
            <ScrollView
              style={styles.languageScrollView}
              showsVerticalScrollIndicator={true}
            >
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.languageOption,
                    language === lang.code && styles.languageOptionSelected,
                  ]}
                  onPress={() => handleLanguageSelect(lang.code)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <Text style={styles.languageName}>{lang.name}</Text>
                  {language === lang.code && (
                    <Check size={24} color="#10b981" strokeWidth={2} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <StripeConnectModal
        visible={showStripeModal}
        onClose={() => setShowStripeModal(false)}
        onConnected={(accountId) => {
          setStripeLinked(true);
          setStripeAccountId(accountId);
          setShowStripeModal(false);
        }}
        userId={user?.id}
      />

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 15,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 16,
    paddingHorizontal: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  menuItemRTL: {
    flexDirection: 'row-reverse',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  menuIconRTL: {
    marginRight: 0,
    marginLeft: 15,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  menuTextRTL: {
    textAlign: 'right',
  },
  menuSubtext: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  menuSubtextRTL: {
    textAlign: 'right',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#444',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  languageScrollView: {
    maxHeight: 400,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
    textAlign: 'center',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 10,
  },
  languageOptionSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  languageFlag: {
    fontSize: 28,
    marginRight: 15,
  },
  languageName: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
    flex: 1,
  },
  debugSection: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 15,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 10,
  },
  debugButton: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 10,
  },
  debugButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  debugHint: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.8,
    lineHeight: 16,
  },
  menuSubtextGreen: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 2,
  },
  promoModalContent: {
    width: '85%',
    maxWidth: 360,
    backgroundColor: '#1f2937',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    position: 'relative' as const,
  },
  promoCloseBtn: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    padding: 4,
  },
  promoTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  promoSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center' as const,
    marginBottom: 20,
  },
  promoInput: {
    width: '100%',
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center' as const,
    letterSpacing: 2,
    marginBottom: 16,
  },
  promoMessage: {
    fontSize: 14,
    textAlign: 'center' as const,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  promoMessageSuccess: {
    color: '#10b981',
  },
  promoMessageError: {
    color: '#ef4444',
  },
  promoButton: {
    width: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  promoButtonDisabled: {
    opacity: 0.6,
  },
  promoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  accountCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  accountCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  accountAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  profilePhotoImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  profilePhotoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1e293b',
  },
  profilePhotoSection: {
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    marginTop: 4,
  },
  profilePhotoPickerLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(245,158,11,0.4)',
    borderStyle: 'dashed',
  },
  profilePhotoLarge: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  profilePhotoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  profilePhotoPlaceholderText: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 4,
  },
  profilePhotoEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1e293b',
  },
  profilePhotoHint: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  removePhotoBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
  },
  accountCardInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  verifiedBadgeSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  verifiedText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accountBadgeText: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '500',
  },
  accountCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  accountCardSubtitle: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  stripeLinkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(99, 91, 255, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  stripeLinkedText: {
    fontSize: 13,
    color: '#635BFF',
    fontWeight: '500',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  signOutButtonText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '500',
  },
  activateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#f59e0b',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  activateButtonDone: {
    backgroundColor: '#10b981',
  },
  activateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  createAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 12,
  },
  createAccountButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  loginTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 6,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
    lineHeight: 20,
  },
  loginInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  loginError: {
    fontSize: 13,
    color: '#ef4444',
    marginBottom: 10,
  },
  loginEmailDisplay: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '500',
    marginBottom: 14,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#888',
  },
  stripeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.15)',
  },
  stripeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  stripeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(99, 91, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  stripeCardInfo: {
    flex: 1,
  },
  stripeCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  stripeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stripeStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  stripeStatusText: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '500',
  },
  stripeNotConnectedText: {
    fontSize: 13,
    color: '#888',
  },
  stripeAccountIdBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 91, 255, 0.08)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
    gap: 8,
    alignSelf: 'flex-start',
  },
  stripeAccountIdLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#635BFF',
    letterSpacing: 1,
  },
  stripeAccountIdValue: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  stripeDesc: {
    fontSize: 13,
    color: '#888',
    lineHeight: 19,
    marginBottom: 16,
  },
  stripeActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#635BFF',
    paddingVertical: 14,
    borderRadius: 12,
  },
  stripeActionButtonConnected: {
    backgroundColor: 'rgba(99, 91, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.3)',
  },
  stripeActionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  stripeActionButtonTextConnected: {
    color: '#635BFF',
  },
});
