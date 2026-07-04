import { useState, useEffect } from 'react';
import { getDateLocale } from '@/utils/dateLocale';
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
import { Info, Heart, Share2, Globe, Check, FileText, LogOut, Mail, User, Shield, ArrowRight, CreditCard, HelpCircle, Camera, Images, ChevronRight , Star, Clock, TrendingUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import BottomNav from '@/components/BottomNav';
import PlyzHeader from '@/components/PlyzHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { Language } from '@/locales';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStripeAccountId, saveStripeAccountId, getUserProfile, upsertUserProfile } from '@/utils/userProfile';
import StripeConnectModal from '@/components/StripeConnectModal';
import { authedFetch } from '@/utils/authedFetch';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import { useOnboarding } from '@/contexts/OnboardingContext';

import { FanBadgeCard } from '@/components/FanBadge';
import { supabase } from '@/utils/supabase';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');
const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// Réponse de GET /api/celebrity-earnings (cf. app/my-earnings.tsx)
interface EarningsSession {
  session_earnings_cents: number;
  created_at: string;
  ended_at: string | null;
}
interface EarningsData {
  total_earnings_cents: number;
  total_fans: number;
  total_sessions: number;
  sessions: EarningsSession[];
  // Champs ajoutés serveur (vidéo + dédicaces). Optionnels : si le serveur
  // n'est pas encore à jour, ils valent undefined -> fallback rétrocompatible.
  video_month_cents?: number;
  dedication_total_cents?: number;
  dedication_month_cents?: number;
  grand_total_cents?: number;
}

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
  const { requireAuth } = useAuthPrompt();
  const { isCelebrity, toggleCelebrityMode, profilePhoto, setProfilePhoto } = useCelebrityMode();
  const { startOnboarding } = useOnboarding();
  const insets = useSafeAreaInsets();
  const trUI = useAutoTranslate([
    'Administration',
    'Mode Célébrité — Validé',
    'En cours de vérification',
    'Tu seras validé sous 5 à 10 min',
    'Tableau de bord admin',
  ]);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loginStep, setLoginStep] = useState<'idle' | 'email' | 'otp' | 'sending' | 'verifying'>('idle');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [stripeLinked, setStripeLinked] = useState(false);
  // Vrai statut Stripe : le compte peut-il RÉELLEMENT encaisser ? (charges_enabled)
  // ≠ « un compte existe » (stripeLinked). Un compte peut exister sans être activé.
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [, setStripeLoading] = useState(false);
  const [celebrityName, setCelebrityName] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user?.id) {
        setIsVerified(false);
        return;
      }
      try {
        const { data } = await supabase.rpc('is_user_verified', { uid: user.id });
        setIsVerified(!!data);
      } catch {
        // Silencieux : ne bloque pas l'écran si la vérif échoue.
      }
    })();
  }, [user?.id, isCelebrity]);

  useEffect(() => {
    (async () => {
      if (user?.id) {
        const profile = await getUserProfile(user.id);
        if (profile?.celebrity_name) setCelebrityName(profile.celebrity_name);
      }
    })();
  }, [user?.id]);

  // Gains célébrité : ne charge que pour les comptes en mode célébrité.
  useEffect(() => {
    (async () => {
      if (!isCelebrity || !user?.id || !STRIPE_SERVER_URL) {
        setEarnings(null);
        return;
      }
      setEarningsLoading(true);
      try {
        const res = await authedFetch(
          `${STRIPE_SERVER_URL}/api/celebrity-earnings?celebrity_id=${user.id}`
        );
        const result = await res.json();
        setEarnings(result);
      } catch (e) {
        // Catch silencieux : on affiche 0 € sans casser l'écran.
        console.warn('[Account] earnings fetch failed', e);
        setEarnings(null);
      } finally {
        setEarningsLoading(false);
      }
    })();
  }, [isCelebrity, user?.id]);

  // Gains vidéo du mois civil en cours (fallback client si serveur pas à jour).
  const videoMonthClientCents = (() => {
    if (!earnings?.sessions) return 0;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return earnings.sessions.reduce((sum, s) => {
      const ref = s.ended_at || s.created_at;
      if (!ref) return sum;
      const d = new Date(ref);
      if (d.getFullYear() === y && d.getMonth() === m) {
        return sum + (s.session_earnings_cents || 0);
      }
      return sum;
    }, 0);
  })();

  // Total des gains (vidéo + dédicaces). FALLBACK : si grand_total_cents absent
  // (ancien serveur), on retombe sur total_earnings_cents (vidéo seule).
  const totalEarningsCents =
    earnings?.grand_total_cents ?? earnings?.total_earnings_cents ?? 0;

  // Gains du mois civil en cours = vidéo du mois + dédicaces du mois.
  // FALLBACK : si les nouveaux champs sont absents, on utilise le calcul vidéo
  // client (comportement historique) pour ne rien casser.
  const monthEarningsCents =
    earnings?.video_month_cents !== undefined ||
    earnings?.dedication_month_cents !== undefined
      ? (earnings?.video_month_cents ?? videoMonthClientCents) +
        (earnings?.dedication_month_cents ?? 0)
      : videoMonthClientCents;

  const formatEuros = (cents: number) =>
    (cents / 100).toLocaleString(getDateLocale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €';

  useEffect(() => {
    checkLocalStripeConnect();
    if (user?.id) {
      syncStripeOnLogin();
    }
  }, [user?.id]);

  // Interroge Stripe (via le serveur) pour savoir si le compte peut vraiment
  // encaisser. Met à jour stripeChargesEnabled. Best-effort (silencieux).
  const refreshStripeCharges = async (acctId: string | null) => {
    if (!acctId || !STRIPE_SERVER_URL) { setStripeChargesEnabled(false); return; }
    try {
      const res = await authedFetch(`${STRIPE_SERVER_URL}/api/connect-account-status?account_id=${encodeURIComponent(acctId)}`);
      if (res.ok) {
        const data = await res.json();
        setStripeChargesEnabled(!!data?.charges_enabled);
      }
    } catch { /* réseau indisponible : on laisse la valeur précédente */ }
  };

  const checkLocalStripeConnect = async () => {
    setStripeLoading(true);
    try {
      const localStripeId = await AsyncStorage.getItem('stripe_connect_account_id');
      setStripeLinked(!!localStripeId);
      setStripeAccountId(localStripeId);
      refreshStripeCharges(localStripeId);
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
        refreshStripeCharges(localStripeId);
      } else {
        const dbStripeId = await getStripeAccountId(user.id);
        setStripeLinked(!!dbStripeId);
        setStripeAccountId(dbStripeId);
        refreshStripeCharges(dbStripeId);
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

  const handlePress = (action: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (action === 'about') {
      router.push('/about');
    } else if (action === 'share') {
      router.push('/share');
    } else if (action === 'language') {
      setShowLanguageModal(true);
    } else if (action === 'legal') {
      router.push('/legal');
    } else if (action === 'faq') {
      router.push('/faq' as any);
    } else if (action === 'documents') {
      router.push('/documents' as any);
    } else if (action === 'report') {
      router.push('/report-problem' as any);
    } else if (action === 'admin') {
      router.push('/admin' as any);
    } else if (action === 'replayTutorial') {
      AsyncStorage.removeItem('@plyz_onboarding_done').then(() => {
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

  const uploadAvatarToServer = async (base64?: string | null, contentType?: string | null) => {
    if (!base64 || !user?.id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/upload-celebrity-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: user.id, image_base64: base64, content_type: contentType || 'image/jpeg' }),
      });
      const data = await res.json();
      if (data?.avatar_url) {
        // Remplace l'URI locale par l'URL publique -> visible sur le profil public.
        await setProfilePhoto(data.avatar_url);
      }
    } catch (e) {
      console.warn('[avatar upload] failed', e);
    }
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
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await setProfilePhoto(asset.uri);
      // Publie la photo sur le profil public (upload + profiles.avatar_url).
      uploadAvatarToServer(asset.base64, asset.mimeType);
    }
  };

  const saveCelebrityName = async () => {
    if (!user?.id) return;
    await upsertUserProfile(user.id, { celebrity_name: celebrityName.trim() });
  };

  return (
    <View style={styles.container}>
      <ScrollView style={[styles.content, { paddingTop: insets.top }]}>
        <PlyzHeader />
        <View style={styles.header}>
          <Text style={styles.title}>{t('account')}</Text>
          <Text style={styles.subtitle}>Plyz</Text>
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

              {isCelebrity && stripeLinked && (
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
              {isCelebrity && stripeLinked ? (
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
                {t('secureCodeExplanation') || 'Vous recevrez un code a 6 chiffres par email.'}
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
                {t('codeSentToEmail') || 'Nous avons envoye un code a 6 chiffres a votre email.'}
              </Text>
              <Text style={styles.loginEmailDisplay}>{loginEmail}</Text>

              <TextInput
                style={[styles.loginInput, { textAlign: 'center', letterSpacing: 4, fontSize: 22 }]}
                placeholder="123456"
                placeholderTextColor="#666"
                value={otpCode}
                onChangeText={(text) => { setOtpCode(text.replace(/[^0-9]/g, '').slice(0, 6)); setLoginError(null); }}
                keyboardType="number-pad"
                maxLength={6}
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
            {t('celebrityModeSection')}
          </Text>

          <View style={styles.accountCard}>
            <View style={styles.accountCardHeader}>
              <TouchableOpacity
                style={[styles.accountAvatar, { backgroundColor: isCelebrity ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)' }]}
                onPress={pickProfilePhoto}
                activeOpacity={0.7}
              >
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.profilePhotoImage} />
                ) : (
                  <Star size={28} color={isCelebrity ? '#10b981' : '#888'} fill={isCelebrity ? '#10b981' : 'transparent'} />
                )}
                <View style={[styles.profilePhotoBadge, isCelebrity && { backgroundColor: '#10b981' }]}>
                  <Camera size={10} color="#fff" />
                </View>
              </TouchableOpacity>
              <View style={styles.accountCardInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.accountCardName}>
                    {isCelebrity ? (t('celebrityModeActive')) : (t('celebrityModeInactive'))}
                  </Text>
                </View>
                <Text style={styles.accountCardSubtitle}>
                  {isCelebrity ? (t('celebrityModeActiveDesc')) : (t('celebrityModeInactiveDesc'))}
                </Text>
                {isCelebrity && stripeChargesEnabled && (
                  <Text style={styles.verifiedText}>
                    {t('celVerifiedStripe' as any) || 'Stripe Connect vérifié'}
                  </Text>
                )}
                {isCelebrity && stripeLinked && !stripeChargesEnabled && (
                  <Text style={[styles.verifiedText, { color: '#f59e0b' }]}>
                    {t('celStripePending' as any) || 'Paiements à activer'}
                  </Text>
                )}
              </View>
            </View>

            {isCelebrity && (
              <View style={{ marginTop: 12, marginBottom: 4 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 6, fontWeight: '600' }}>
                  {t('celebrityPublicName' as any) || 'Nom public'}
                </Text>
                <TextInput
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
                  value={celebrityName}
                  onChangeText={setCelebrityName}
                  onBlur={saveCelebrityName}
                  placeholder={t('celebrityPublicNamePlaceholder' as any) || 'Votre nom de scène (ex : Omar Sy)'}
                  placeholderTextColor="#6b7280"
                />
              </View>
            )}

            {/* Un compte Stripe existe mais n'est pas encore activé (charges_enabled=false) :
                bouton pour rouvrir/terminer l'onboarding Stripe via la fenêtre dédiée. */}
            {isCelebrity && stripeLinked && !stripeChargesEnabled && (
              <TouchableOpacity
                style={[styles.activateButton, { backgroundColor: '#f59e0b' }]}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setShowStripeModal(true);
                }}
                activeOpacity={0.8}
              >
                <CreditCard size={18} color="#000" />
                <Text style={styles.activateButtonText}>
                  {t('celActivatePayments' as any) || 'Activer mes paiements'}
                </Text>
                <ArrowRight size={18} color="#000" />
              </TouchableOpacity>
            )}

            {isCelebrity && !stripeLinked && (
              <TouchableOpacity
                style={[styles.activateButton]}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  requireAuth(() => router.push('/celebrity-onboarding' as any), {
                    reason: 'Crée ton compte pour passer en mode célébrité',
                  });
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

            {!isCelebrity && (
              <TouchableOpacity
                style={[styles.createAccountButton, { backgroundColor: '#f59e0b' }]}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  // Devenir célébrité est irréversible ; activer exige un compte.
                  requireAuth(() => toggleCelebrityMode(), {
                    reason: 'Crée ton compte pour passer en mode célébrité',
                  });
                }}
                activeOpacity={0.7}
              >
                <Star size={18} color="#000000" fill="#000000" />
                <Text style={[styles.createAccountButtonText, { color: '#000000' }]}>
                  {t('enableCelebrityMode')}
                </Text>
                <ArrowRight size={18} color="#000000" />
              </TouchableOpacity>
            )}

            {isCelebrity && (
              isVerified ? (
                <View style={styles.statusBadgeVerified}>
                  <Check size={18} color="#10b981" />
                  <Text style={styles.statusBadgeVerifiedText}>{trUI('Mode Célébrité — Validé')}</Text>
                </View>
              ) : (
                <View style={styles.statusBadgePending}>
                  <Clock size={18} color="#f59e0b" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statusBadgePendingText}>{trUI('En cours de vérification')}</Text>
                    <Text style={styles.statusBadgePendingSub}>{trUI('Tu seras validé sous 5 à 10 min')}</Text>
                  </View>
                </View>
              )
            )}
          </View>
        </View>

        {isCelebrity && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>
              {t('myEarnings') || 'Mes gains'}
            </Text>

            <View style={styles.accountCard}>
              <View style={styles.accountCardHeader}>
                <View style={styles.accountAvatar}>
                  <TrendingUp size={26} color="#10b981" />
                </View>
                <View style={styles.accountCardInfo}>
                  <Text style={styles.accountCardName}>
                    {t('myEarnings') || 'Mes gains'}
                  </Text>
                  <Text style={styles.accountCardSubtitle}>
                    {t('myEarningsDesc' as any) || 'Vos revenus issus des sessions vidéo live et des dédicaces.'}
                  </Text>
                </View>
              </View>

              <View style={styles.earningsRow}>
                <Text style={styles.earningsRowLabel}>
                  {t('thisMonth' as any) || 'Ce mois-ci'}
                </Text>
                <Text style={styles.earningsRowValue}>
                  {earningsLoading ? '—' : formatEuros(monthEarningsCents)}
                </Text>
              </View>
              <View style={[styles.earningsRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.earningsRowLabel}>
                  {t('total' as any) || 'Total'}
                </Text>
                <Text style={styles.earningsRowValue}>
                  {earningsLoading ? '—' : formatEuros(totalEarningsCents)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.earningsDetailButton}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  router.push('/my-earnings' as any);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.earningsDetailButtonText}>
                  {t('viewDetail' as any) || 'Voir le détail'}
                </Text>
                <ArrowRight size={16} color="#10b981" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.galleryShortcut}
            onPress={() => router.push('/gallery' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.galleryShortcutIcon}>
              <Images size={22} color="#3b82f6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.galleryShortcutTitle}>{t('myGallery') || 'Mes créations'}</Text>
              <Text style={styles.galleryShortcutSub}>{t('myGalleryDesc') || 'Retrouvez toutes vos photos signées et dédicaces sauvegardées.'}</Text>
            </View>
            <ChevronRight size={18} color="#6b7280" />
          </TouchableOpacity>
        </View>

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
            onPress={() => handlePress('documents')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
              <FileText size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('docsMenuItem' as any) || 'Mes documents'}</Text>
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
          <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>{t('helpSection' as any) || 'Aide'}</Text>

          <TouchableOpacity
            style={[styles.menuItem, isRTL && styles.menuItemRTL]}
            onPress={() => handlePress('faq')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
              <HelpCircle size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('faqTitle' as any) || 'FAQ - Questions fréquentes'}</Text>
          </TouchableOpacity>

        </View>

        {(user?.email || '').toLowerCase() === 'jc@clickzou.fr' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isRTL && styles.menuTextRTL]}>{trUI('Administration')}</Text>
            <TouchableOpacity
              style={[styles.menuItem, isRTL && styles.menuItemRTL]}
              onPress={() => handlePress('admin')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIcon, isRTL && styles.menuIconRTL]}>
                <Shield size={24} color="#f59e0b" strokeWidth={2} />
              </View>
              <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{trUI('Tableau de bord admin')}</Text>
            </TouchableOpacity>
          </View>
        )}

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
            <Text style={[styles.menuText, isRTL && styles.menuTextRTL]}>{t('legalDocuments' as any) || 'Documents légaux'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Plyz v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            {t('offlineApp')}
          </Text>
        </View>
      </ScrollView>

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
          refreshStripeCharges(accountId);
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
  galleryShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  galleryShortcutIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryShortcutTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  galleryShortcutSub: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 2,
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
  celebrityActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 4,
  },
  celebrityActiveBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10b981',
  },
  becomeFanButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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
  statusBadgeVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  statusBadgeVerifiedText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10b981',
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  statusBadgePendingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f59e0b',
  },
  statusBadgePendingSub: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(245,158,11,0.8)',
    marginTop: 2,
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
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  earningsRowLabel: {
    fontSize: 14,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  earningsRowValue: {
    fontSize: 18,
    color: '#10b981',
    fontWeight: '700',
  },
  earningsDetailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  earningsDetailButtonText: {
    fontSize: 15,
    color: '#10b981',
    fontWeight: '600',
  },
});
