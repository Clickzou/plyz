import React, { useState, useEffect } from 'react';
import { getDateLocale } from '@/utils/dateLocale';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
  Share,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Clock, Users, DollarSign, Play, Info, ChevronDown, ChevronUp, Calendar, Bell, Check, Copy, Send, Minus, Plus, AlertTriangle, Video } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';
import { createLiveSession } from '@/utils/liveSessionStorage';
import StripeConnectModal from '@/components/StripeConnectModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { getOrCreateDeviceId } from '@/utils/ratingsStorage';
import { getStripeAccountId } from '@/utils/userProfile';
import { scheduleCelebrityReminders } from '@/utils/scheduleReminders';
import { authedFetch } from '@/utils/authedFetch';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import QRCodeSvg from 'react-native-qrcode-svg';

const formatDuration = (minutes: number): string => {
  if (minutes < 1) {
    return `${Math.round(minutes * 60)} sec`;
  } else if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (mins === 0) {
      return `${hours}h`;
    }
    return `${hours}h${mins.toString().padStart(2, '0')}`;
  }
};

const PRICE_OPTIONS = [
  { label: '2€', value: 200 },
  { label: '5€', value: 500 },
  { label: '10€', value: 1000 },
  { label: '20€', value: 2000 },
  { label: '50€', value: 5000 },
  { label: '100€', value: 10000 },
];

// Demande caméra + micro DÈS la création/lancement de la session pour que les
// permissions soient déjà accordées le jour de l'appel vidéo (sinon getUserMedia
// échoue côté Daily → écran noir). Ne bloque JAMAIS la création : on informe juste.
async function requestVideoPermissionsEarly(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (Platform.OS === 'android') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PermissionsAndroid } = require('react-native');
      if (PermissionsAndroid?.requestMultiple) {
        await PermissionsAndroid.requestMultiple([
          'android.permission.CAMERA',
          'android.permission.RECORD_AUDIO',
        ]);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExpoCamera = require('expo-camera');
    if (ExpoCamera?.requestCameraPermissionsAsync) {
      await ExpoCamera.requestCameraPermissionsAsync();
      if (ExpoCamera.requestMicrophonePermissionsAsync) {
        await ExpoCamera.requestMicrophonePermissionsAsync();
      }
    }
  } catch (e) {
    // On n'empêche pas la création de session si la demande échoue.
    console.warn('[CreateSession] Early cam/mic permission request failed:', e);
  }
}

const PLYZ_FEES = 0.15; // 15% Plyz
const STRIPE_PERCENT = 0.029; // 2.9% Stripe
const STRIPE_FIXED = 30; // 0.30€ par transaction (en centimes)

export default function CreateLiveSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const trUI = useAutoTranslate(['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Fermer', 'Heures', 'Minutes', 'Valider']);
  const { user } = useAuth();

  const [celebrityName, setCelebrityName] = useState('');
  const [durationPerFan, setDurationPerFan] = useState(0.5);
  const [totalDuration, setTotalDuration] = useState(30);
  const [price, setPrice] = useState(5000); // Prix par défaut 50€
  const [isCustomPrice, setIsCustomPrice] = useState(false);
  const [customPriceText, setCustomPriceText] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [showStripeConnect, setShowStripeConnect] = useState(false);
  const [, setStripeConnected] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionTime, setSessionTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [scheduledConfirmation, setScheduledConfirmation] = useState<{code: string, sessionId: string, scheduledAt: string} | null>(null);
  const [confirmCopied, setConfirmCopied] = useState(false);

  const WEEKDAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAYS = language === 'fr' ? WEEKDAYS_FR : WEEKDAYS_EN;

  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    const days: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const locale = language === 'fr' ? getDateLocale() : 'en-US';
    return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handleSelectDate = (day: number) => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    setSessionDate(`${year}-${mm}-${dd}`);
    setShowDatePicker(false);
  };

  const changeMonth = (direction: number) => {
    const newMonth = new Date(calendarMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    setCalendarMonth(newMonth);
  };

  const getScheduledStartDate = (): string | undefined => {
    if (isLive || !sessionTime) return undefined;
    const [hours, minutes] = sessionTime.split(':').map(Number);
    const startDate = new Date(sessionDate);
    startDate.setHours(hours, minutes, 0, 0);
    return startDate.toISOString();
  };

  const calculatedMaxFans = Math.floor(totalDuration / durationPerFan);
  
  const handleDurationPerFanChange = (value: number) => {
    setDurationPerFan(value);
    const minTotalDuration = value * 2;
    if (totalDuration < minTotalDuration) {
      setTotalDuration(Math.min(minTotalDuration, 60));
    }
    if (totalDuration > 60) {
      setTotalDuration(60);
    }
  };

  const handleTotalDurationChange = (value: number) => {
    if (value >= durationPerFan) {
      setTotalDuration(value);
    } else {
      setTotalDuration(durationPerFan);
    }
  };
  
  const minTotalDuration = Math.max(1, durationPerFan);

  // Bornes/pas des sliders (mêmes valeurs que les props Slider) pour les boutons +/-
  const PER_FAN_MIN = 0.5;
  const PER_FAN_MAX = 60;
  const PER_FAN_STEP = 0.5;
  const TOTAL_MAX = 60;
  const TOTAL_STEP = 1;

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const stepDurationPerFan = (direction: number) => {
    const next = clamp(
      Math.round((durationPerFan + direction * PER_FAN_STEP) * 10) / 10,
      PER_FAN_MIN,
      PER_FAN_MAX
    );
    handleDurationPerFanChange(next);
  };

  const stepTotalDuration = (direction: number) => {
    const next = clamp(totalDuration + direction * TOTAL_STEP, minTotalDuration, TOTAL_MAX);
    handleTotalDurationChange(next);
  };

  const handlePriceSelect = (value: number) => {
    setPrice(value);
    setIsCustomPrice(false);
    setCustomPriceText('');
  };

  const handleCustomPriceChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setCustomPriceText(numericText);
    if (numericText) {
      setPrice(parseInt(numericText) * 100);
    } else {
      setPrice(0);
    }
  };

  const checkStripeConnectStatus = async (): Promise<string | null> => {
    try {
      if (user?.id) {
        return await getStripeAccountId(user.id);
      }
      return await AsyncStorage.getItem('stripe_connect_account_id');
    } catch {
      return null;
    }
  };

  const handleStripeConnected = async (accountId: string) => {
    try {
      setStripeAccountId(accountId);
      setStripeConnected(true);
      setShowStripeConnect(false);
      proceedToCreateSession(accountId);
    } catch (error) {
      console.error('[CreateSession] Error saving Stripe status:', error);
    }
  };

  // Retour depuis l'onboarding Stripe (lien profond plyz://...?stripe_return=1) :
  // on récupère le compte fraîchement créé et on le mémorise, sans créer de session.
  useEffect(() => {
    if (!params?.stripe_return) return;
    (async () => {
      const id = await checkStripeConnectStatus();
      if (id) {
        setStripeAccountId(id);
        showAlert(
          t('stripeConnectVerifiedTitle') || 'Compte Stripe connecté',
          t('stripeConnectVerifiedDesc') || 'Votre compte Stripe est connecté. Vous pouvez maintenant créer votre session.'
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.stripe_return]);

  const handleCreateSession = async () => {
    console.log('[CreateSession] Button pressed, name:', celebrityName);

    // Déclenche la popup caméra + micro dès maintenant (sans bloquer la création).
    // Objectif : permissions déjà accordées le jour de l'appel vidéo.
    requestVideoPermissionsEarly();

    let hasError = false;

    if (!celebrityName.trim()) {
      setNameError(true);
      hasError = true;
    }

    if (!isLive && !sessionTime) {
      hasError = true;
      showAlert(t('error') || 'Erreur', t('liveSessionTimeRequired') || 'Veuillez sélectionner une heure pour la session programmée');
      return;
    }

    if (!isLive && sessionTime) {
      const [h, m] = sessionTime.split(':').map(Number);
      const scheduledDate = new Date(sessionDate);
      scheduledDate.setHours(h, m, 0, 0);
      if (scheduledDate <= new Date()) {
        showAlert(t('error') || 'Erreur', t('liveSessionPastDate') || 'La date et heure doivent être dans le futur');
        return;
      }
    }
    
    if (hasError) {
      console.log('[CreateSession] Validation failed - name:', !celebrityName.trim());
      showAlert(t('error') || 'Erreur', t('liveSessionNameRequired') || 'Veuillez entrer votre nom');
      return;
    }
    setNameError(false);

    // Une session vidéo est toujours payante : un compte Stripe est requis
    const existingAccountId = stripeAccountId || await checkStripeConnectStatus();
    if (!existingAccountId) {
      setShowStripeConnect(true);
      return;
    }

    setStripeAccountId(existingAccountId);
    proceedToCreateSession(existingAccountId);
  };

  const proceedToCreateSession = async (accountId?: string) => {
    const finalStripeAccountId = accountId || stripeAccountId;

    setIsCreating(true);
    setNameError(false);
    console.log('[CreateSession] Starting session creation...');
    try {
      const deviceId = await getOrCreateDeviceId();
      const celebrityId = user?.id || deviceId;
      let session;

      // Plus de photo de couverture ici : le selfie unique est pris à l'étape
      // « Dédicace personnalisée » du dashboard, qui renseigne ensuite cover_photo_url.
      const uploadedPhotoUrl: string | null = null;

      const SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';
      console.log('[CreateSession] Calling server to create session, celebrityId:', celebrityId);
      
      const scheduledAt = getScheduledStartDate();
      try {
        const response = await authedFetch(`${SERVER_URL}/api/create-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            celebrity_id: celebrityId,
            celebrity_name: celebrityName.trim(),
            duration_minutes: totalDuration,
            duration_per_fan_minutes: durationPerFan,
            max_slots: calculatedMaxFans,
            price_cents: price,
            cover_photo_url: uploadedPhotoUrl,
            celebrity_stripe_account_id: finalStripeAccountId,
            scheduled_at: scheduledAt || null,
          }),
        });
        
        const result = await response.json();
        
        if (response.ok && result.session) {
          session = result.session;
          console.log('[CreateSession] Server created session successfully:', session.id, session.code);
        } else {
          console.error('[CreateSession] Server error:', JSON.stringify(result));
        }
      } catch (serverError) {
        console.error('[CreateSession] Server call failed:', serverError);
      }
      
      if (!session) {
        console.log('[CreateSession] Server failed, trying direct Supabase insert...');
        session = await createLiveSession(
          celebrityId,
          celebrityName.trim(),
          totalDuration,
          calculatedMaxFans,
          price,
          durationPerFan,
          uploadedPhotoUrl,
          finalStripeAccountId,
          scheduledAt || null
        );
        if (session && scheduledAt) {
          console.log('[CreateSession] Scheduled session created, will show in events via live_sessions query');
        }
      }
      
      if (!session) {
        console.error('[CreateSession] Both server and direct insert failed');
        showAlert(t('error'), t('liveSessionCreateError'));
        setIsCreating(false);
        return;
      }

      console.log('Session created:', session);

      if (scheduledAt && session) {
        const notified = await scheduleCelebrityReminders({
          eventName: celebrityName.trim(),
          scheduledAt: scheduledAt,
          eventCode: session.code,
          eventId: session.id,
          type: 'live_session',
        });
        console.log('[CreateSession] Notifications scheduled:', notified);
      }

      if (scheduledAt) {
        setScheduledConfirmation({ code: session.code, sessionId: session.id, scheduledAt: scheduledAt });
      } else {
        router.replace({
          pathname: '/live-session-dashboard',
          params: { 
            sessionId: session.id,
          },
        });
      }
    } catch (error) {
      console.error('Error creating session:', error);
      showAlert(t('error'), t('liveSessionCreateError'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleShareEvent = async () => {
    if (!scheduledConfirmation) return;
    const code = scheduledConfirmation.code;

    // Date/heure formatée pour le placeholder {date}
    let when = '';
    try {
      const scheduledDate = new Date(scheduledConfirmation.scheduledAt);
      if (!isNaN(scheduledDate.getTime())) {
        when = scheduledDate.toLocaleString(language === 'fr' ? getDateLocale() : 'en-US', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        });
      }
    } catch {}

    // Durée par fan formatée (« X sec » / « X min ») via formatDuration
    const duration = formatDuration(durationPerFan);

    let message = (t('shareEventMessage') || 'Rejoins ma session live sur Plyz ! Code : {code}')
      .replace('{code}', code)
      .replace('{date}', when)
      .replace('{duration}', duration);

    try {
      await Share.share({ message });
    } catch (error) {
      // Sur web, Share.share peut échouer -> fallback presse-papier
      try {
        await Clipboard.setStringAsync(message);
        showAlert(
          t('success') || 'OK',
          language === 'fr' ? 'Texte copié dans le presse-papier !' : 'Text copied to clipboard!'
        );
      } catch {
        console.error('Share/clipboard failed:', error);
      }
    }
  };

  if (scheduledConfirmation) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', borderRadius: 50, width: 60, height: 60, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 16 }}>
            <Check size={32} color="#10B981" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 8 }}>
            {language === 'fr' ? 'Session programmée !' : 'Session scheduled!'}
          </Text>
          <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 }}>
            {language === 'fr' 
              ? `Votre session live est programmée pour le ${new Date(scheduledConfirmation.scheduledAt).toLocaleDateString(language === 'fr' ? getDateLocale() : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })} à ${new Date(scheduledConfirmation.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : `Your live session is scheduled for ${new Date(scheduledConfirmation.scheduledAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${new Date(scheduledConfirmation.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            }
          </Text>

          <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 }}>
            {language === 'fr' ? 'Partagez Ce Code Avec Vos Fans' : 'Share This Code With Your Fans'}
          </Text>

          <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 16 }}>
            <QRCodeSvg value={`plyz://join/${scheduledConfirmation.code}`} size={180} />
          </View>

          <Text style={{ fontSize: 28, fontWeight: '800', color: '#10B981', letterSpacing: 6, marginBottom: 8 }}>
            {scheduledConfirmation.code}
          </Text>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginBottom: 24 }}
            onPress={async () => {
              await Clipboard.setStringAsync(scheduledConfirmation.code);
              setConfirmCopied(true);
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setTimeout(() => setConfirmCopied(false), 2000);
            }}
          >
            {confirmCopied ? <Check size={16} color="#10B981" /> : <Copy size={16} color="#fff" />}
            <Text style={{ color: confirmCopied ? '#10B981' : '#fff', marginLeft: 8, fontSize: 14 }}>
              {confirmCopied ? (language === 'fr' ? 'Copié !' : 'Copied!') : (language === 'fr' ? 'Copier le code' : 'Copy code')}
            </Text>
          </TouchableOpacity>

          <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', borderRadius: 12, padding: 16, marginBottom: 24, width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Bell size={18} color="#3b82f6" />
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#3b82f6', marginLeft: 8 }}>
                {language === 'fr' ? 'Rappels activés' : 'Reminders enabled'}
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: '#93c5fd', lineHeight: 20 }}>
              {language === 'fr'
                ? 'Vous recevrez une notification 1 heure avant et 2 minutes avant le début de votre session. Retrouvez cette session dans "Mes événements" pour la lancer le jour J.'
                : 'You will receive a notification 1 hour before and 2 minutes before your session starts. Find this session in "My Events" to launch it on the day.'
              }
            </Text>
          </View>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f59e0b', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', marginBottom: 12 }}
            onPress={() => {
              const scheduledDate = new Date(scheduledConfirmation.scheduledAt);
              router.push({
                pathname: '/create-post',
                params: {
                  prefillKind: 'event',
                  prefillTitle: language === 'fr' ? 'Session Live Vidéo' : 'Live Video Session',
                  prefillBody: `${language === 'fr' ? '🎥 Rejoignez-moi pour une session live vidéo exclusive, en tête-à-tête face à face ! Un moment privé et unique, rien que pour vous, en direct sur Plyz 💜' : '🎥 Join me for an exclusive one-on-one live video session, face to face! A private, unique moment just for you, live on Plyz 💜'}\n\n${language === 'fr' ? 'Code' : 'Code'}: ${scheduledConfirmation.code}`,
                  prefillDate: scheduledDate.toISOString(),
                },
              });
            }}
          >
            <Send size={18} color="#000" />
            <Text style={{ color: '#000', fontSize: 16, fontWeight: '700' }}>
              {language === 'fr' ? 'Publier dans le fil Actu' : 'Publish to Feed'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', marginBottom: 12 }}
            onPress={handleShareEvent}
          >
            <Send size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
              {t('share') || 'Partager'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ backgroundColor: '#10B981', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12 }}
            onPress={() => router.replace('/celebrity-menu')}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              {language === 'fr' ? 'Voir mes événements' : 'View my events'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' }}
            onPress={() => router.replace('/')}
          >
            <Text style={{ color: '#9ca3af', fontSize: 14 }}>
              {language === 'fr' ? "Retour à l'accueil" : 'Back to home'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('createLiveSession')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 64 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.stepsContainer}>
          <Text style={styles.stepsTitle}>{t('liveSessionStepsTitle' as any) || 'Comment ça marche ?'}</Text>
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <Text style={styles.stepText}>{t('liveSessionStep1' as any) || 'Prenez un selfie et remplissez les infos de la session'}</Text>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <Text style={styles.stepText}>{t('liveSessionStep2' as any) || 'Partagez le code ou le QR code avec vos fans'}</Text>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <Text style={styles.stepText}>{t('liveSessionStep3' as any) || 'Les fans rejoignent la file d\'attente et paient'}</Text>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
            <Text style={styles.stepText}>{t('liveSessionStep4' as any) || 'Lancez la session et appelez vos fans en vidéo un par un'}</Text>
          </View>
        </View>

        <View style={styles.ideasCard}>
          <View style={styles.ideasHeaderRow}>
            <Video size={20} color="#a78bfa" />
            <Text style={styles.ideasTitle}>{t('liveSessionIdeasTitle' as any) || 'Que faire en session live vidéo ?'}</Text>
          </View>
          <Text style={styles.ideasIntro}>{t('liveSessionIdeasIntro' as any) || 'Une session live, c\'est une visio en direct où tes fans passent un par un. Quelques idées pour t\'inspirer :'}</Text>

          <View style={styles.ideaRow}>
            <Text style={styles.ideaEmoji}>🎤</Text>
            <Text style={styles.ideaText}>{t('liveSessionIdeaStar' as any) || 'Star / artiste : un tête-à-tête privé et exclusif avec chaque fan'}</Text>
          </View>
          <View style={styles.ideaRow}>
            <Text style={styles.ideaEmoji}>⚽</Text>
            <Text style={styles.ideaText}>{t('liveSessionIdeaTeam' as any) || 'Club de sport / équipe : le responsable filme l\'équipe (vestiaire, entraînement, coulisses) ; ex. 1 min par fan, chaque fan voit le live à tour de rôle'}</Text>
          </View>
          <View style={styles.ideaRow}>
            <Text style={styles.ideaEmoji}>👨‍🍳</Text>
            <Text style={styles.ideaText}>{t('liveSessionIdeaExpert' as any) || 'Expert / créateur : mini-consultation, coulisses ou démonstration en direct'}</Text>
          </View>
          <View style={styles.ideaRow}>
            <Text style={styles.ideaEmoji}>💡</Text>
            <Text style={styles.ideaText}>{t('liveSessionIdeaPrinciple' as any) || 'Principe : tu choisis la durée par fan et le prix ; les fans passent un par un en visio'}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('liveSessionYourName')}</Text>
        <TextInput
          style={[styles.nameInput, nameError && styles.nameInputError]}
          placeholder={t('liveSessionNamePlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={celebrityName}
          onChangeText={(text) => {
            setCelebrityName(text);
            if (text.trim()) setNameError(false);
          }}
          maxLength={50}
        />
        {nameError && (
          <Text style={styles.errorText}>{t('liveSessionNameRequired') || 'Veuillez entrer votre nom'}</Text>
        )}

        <TouchableOpacity
          style={[styles.liveToggle, isLive && styles.liveToggleActive]}
          onPress={() => setIsLive(!isLive)}
          activeOpacity={0.7}
        >
          <View style={styles.liveToggleLeft}>
            <View style={[styles.liveIndicator, isLive && styles.liveIndicatorActive]}>
              <Text style={styles.liveIndicatorText}>LIVE</Text>
            </View>
            <Text style={[styles.liveToggleText, isLive && styles.liveToggleTextActive]}>
              {t('liveSessionStartNow') || 'Démarrer immédiatement'}
            </Text>
          </View>
          <View style={[styles.toggleSwitch, isLive && styles.toggleSwitchActive]}>
            <View style={[styles.toggleKnob, isLive && styles.toggleKnobActive]} />
          </View>
        </TouchableOpacity>

        {!isLive && (
          <>
            <View style={styles.scheduleSection}>
              <View style={styles.sectionHeaderRow}>
                <Calendar size={18} color="#22c55e" />
                <Text style={styles.sectionTitle}>{t('eventDate') || 'Date'}</Text>
              </View>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.datePickerText}>{formatDisplayDate(sessionDate)}</Text>
                <Calendar size={20} color="#10B981" />
              </TouchableOpacity>
            </View>

            <View style={styles.scheduleSection}>
              <View style={styles.sectionHeaderRow}>
                <Clock size={18} color="#10B981" />
                <Text style={styles.sectionTitle}>{t('eventTime') || 'Heure'}</Text>
              </View>
              <TouchableOpacity 
                style={styles.timePickerButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={[styles.timePickerButtonText, !sessionTime && styles.timePickerButtonPlaceholder]}>
                  {sessionTime || 'HH:MM'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>{t('liveSessionDurationPerFan') || 'Durée par Fan'}</Text>
        <View style={styles.sliderContainer}>
          <View style={styles.sliderValueContainer}>
            <Clock size={18} color="#10B981" />
            <Text style={styles.sliderValue}>{formatDuration(durationPerFan)}</Text>
          </View>
          <View style={styles.sliderRow}>
            <TouchableOpacity
              style={[styles.stepButton, durationPerFan <= PER_FAN_MIN && styles.stepButtonDisabled]}
              onPress={() => stepDurationPerFan(-1)}
              disabled={durationPerFan <= PER_FAN_MIN}
              activeOpacity={0.7}
            >
              <Minus size={20} color={durationPerFan <= PER_FAN_MIN ? 'rgba(255,255,255,0.3)' : '#10B981'} />
            </TouchableOpacity>
            <Slider
              style={styles.sliderFlex}
              minimumValue={PER_FAN_MIN}
              maximumValue={PER_FAN_MAX}
              step={PER_FAN_STEP}
              value={durationPerFan}
              onValueChange={handleDurationPerFanChange}
              minimumTrackTintColor="#10B981"
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#10B981"
            />
            <TouchableOpacity
              style={[styles.stepButton, durationPerFan >= PER_FAN_MAX && styles.stepButtonDisabled]}
              onPress={() => stepDurationPerFan(1)}
              disabled={durationPerFan >= PER_FAN_MAX}
              activeOpacity={0.7}
            >
              <Plus size={20} color={durationPerFan >= PER_FAN_MAX ? 'rgba(255,255,255,0.3)' : '#10B981'} />
            </TouchableOpacity>
          </View>
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>30 sec</Text>
            <Text style={styles.sliderLabel}>1h</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('liveSessionTotalDuration') || 'Durée Totale'}</Text>
        <View style={styles.sliderContainer}>
          <View style={styles.sliderValueContainer}>
            <Clock size={18} color="#10B981" />
            <Text style={styles.sliderValue}>{formatDuration(totalDuration)}</Text>
          </View>
          <View style={styles.sliderRow}>
            <TouchableOpacity
              style={[styles.stepButton, totalDuration <= minTotalDuration && styles.stepButtonDisabled]}
              onPress={() => stepTotalDuration(-1)}
              disabled={totalDuration <= minTotalDuration}
              activeOpacity={0.7}
            >
              <Minus size={20} color={totalDuration <= minTotalDuration ? 'rgba(255,255,255,0.3)' : '#10B981'} />
            </TouchableOpacity>
            <Slider
              style={styles.sliderFlex}
              minimumValue={minTotalDuration}
              maximumValue={TOTAL_MAX}
              step={TOTAL_STEP}
              value={totalDuration}
              onValueChange={handleTotalDurationChange}
              minimumTrackTintColor="#10B981"
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#10B981"
            />
            <TouchableOpacity
              style={[styles.stepButton, totalDuration >= TOTAL_MAX && styles.stepButtonDisabled]}
              onPress={() => stepTotalDuration(1)}
              disabled={totalDuration >= TOTAL_MAX}
              activeOpacity={0.7}
            >
              <Plus size={20} color={totalDuration >= TOTAL_MAX ? 'rgba(255,255,255,0.3)' : '#10B981'} />
            </TouchableOpacity>
          </View>
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>{formatDuration(minTotalDuration)}</Text>
            <Text style={styles.sliderLabel}>1h</Text>
          </View>
        </View>

        <View style={styles.calculatedFansCard}>
          <Users size={20} color="#10B981" />
          <Text style={styles.calculatedFansText}>
            {t('liveSessionCalculatedFans') || 'Nombre de fans'}: <Text style={styles.calculatedFansNumber}>{calculatedMaxFans}</Text>
          </Text>
        </View>

        <Text style={styles.sectionTitle}>{t('liveSessionPrice')}</Text>
        <Text style={styles.sectionSubtitle}>{t('liveSessionPriceHint')}</Text>
        <View style={styles.optionsRow}>
          {PRICE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                !isCustomPrice && price === option.value && styles.optionButtonActive,
              ]}
              onPress={() => handlePriceSelect(option.value)}
            >
              <DollarSign size={16} color={!isCustomPrice && price === option.value ? '#10B981' : '#fff'} />
              <Text
                style={[
                  styles.optionText,
                  !isCustomPrice && price === option.value && styles.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[
              styles.optionButton,
              isCustomPrice && styles.optionButtonActive,
            ]}
            onPress={() => setIsCustomPrice(true)}
          >
            <DollarSign size={16} color={isCustomPrice ? '#10B981' : '#fff'} />
            <Text
              style={[
                styles.optionText,
                isCustomPrice && styles.optionTextActive,
              ]}
            >
              {t('liveSessionCustomPrice') || 'Autre'}
            </Text>
          </TouchableOpacity>
        </View>
        {isCustomPrice && (
          <View style={styles.customPriceContainer}>
            <TextInput
              style={styles.customPriceInput}
              placeholder="Ex: 15"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={customPriceText}
              onChangeText={handleCustomPriceChange}
              keyboardType="numeric"
              maxLength={4}
            />
            <Text style={styles.customPriceLabel}>€ par signature</Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('yourEarnings') || 'Vos revenus'}</Text>
          {(() => {
            const grossCents = price * calculatedMaxFans;
            const plyzFeesCents = grossCents * PLYZ_FEES;
            const afterPlyzCents = grossCents - plyzFeesCents;
            const stripePercentCents = afterPlyzCents * STRIPE_PERCENT;
            const stripeFixedCents = STRIPE_FIXED * calculatedMaxFans;
            const stripeTotalCents = stripePercentCents + stripeFixedCents;
            const netCents = afterPlyzCents - stripeTotalCents;
            
            return (
              <Text style={styles.revenueAmount}>
                {(netCents / 100).toFixed(0)}€
              </Text>
            );
          })()}
        </View>

        <TouchableOpacity
          style={styles.paymentInfoToggle}
          onPress={() => setShowPaymentInfo(!showPaymentInfo)}
        >
          <View style={styles.paymentInfoToggleLeft}>
            <Info size={18} color="#fbbf24" />
            <Text style={styles.paymentInfoToggleText}>{t('paymentDelaysTitle')}</Text>
          </View>
          {showPaymentInfo ? <ChevronUp size={18} color="rgba(255,255,255,0.6)" /> : <ChevronDown size={18} color="rgba(255,255,255,0.6)" />}
        </TouchableOpacity>

        {showPaymentInfo && (
          <View style={styles.paymentInfoCard}>
            <Text style={styles.paymentInfoIntro}>{t('paymentDelaysIntro')}</Text>

            <View style={styles.paymentPlatformCard}>
              <Text style={styles.paymentPlatformTitle}>💳 {t('paymentStripeTitle')}</Text>
              <View style={styles.paymentDelayBadge}>
                <Clock size={14} color="#635bff" />
                <Text style={styles.paymentDelayText}>{t('paymentStripeDelay')}</Text>
              </View>
              <Text style={styles.paymentExampleText}>{t('paymentStripeExample')}</Text>
            </View>

          </View>
        )}

        <View style={styles.endEarlyWarningCard}>
          <AlertTriangle size={20} color="#fbbf24" />
          <Text style={styles.endEarlyWarningText}>
            {t('celebrityEndEarlyWarning' as any) ||
              '⚠️ Important : si tu mets fin à un appel avant la fin de sa durée, le fan est intégralement remboursé et tu n\'es PAS payé(e) pour cette session. Va au bout de chaque appel pour être crédité(e).'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createButton, isCreating && styles.createButtonDisabled]}
          onPress={handleCreateSession}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#10B981" />
          ) : (
            <>
              {isLive ? (
                <Play size={24} color="#ffffff" fill="#ffffff" />
              ) : (
                <Calendar size={24} color="#ffffff" />
              )}
              <Text style={styles.createButtonText}>
                {isLive ? (t('liveSessionStart') || 'Démarrer la Session') : (t('liveSessionSchedule') || 'Programmer la Session')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
          <Pressable style={styles.calendarModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calendarNavBtn}>
                <Text style={styles.calendarNavText}>{'<'}</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthText}>
                {calendarMonth.toLocaleDateString(language === 'fr' ? getDateLocale() : 'en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calendarNavBtn}>
                <Text style={styles.calendarNavText}>{'>'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekdaysRow}>
              {WEEKDAYS.map((day, wdIndex) => (
                <Text key={day} style={styles.weekdayText}>{trUI(WEEKDAYS_FR[wdIndex])}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {getCalendarDays().map((day, index) => {
                const isSelected = !!day && sessionDate ===
                  `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const today = new Date();
                const isToday = !!day &&
                  today.getDate() === day && 
                  today.getMonth() === calendarMonth.getMonth() && 
                  today.getFullYear() === calendarMonth.getFullYear();
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dayCell,
                      isSelected && styles.dayCellSelected,
                      isToday && !isSelected && styles.dayCellToday,
                    ]}
                    onPress={() => day && handleSelectDate(day)}
                    disabled={!day}
                  >
                    <Text style={[
                      styles.dayText,
                      isSelected && styles.dayTextSelected,
                      isToday && !isSelected && styles.dayTextToday,
                    ]}>
                      {day || ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.calendarCloseBtn} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.calendarCloseBtnText}>{trUI('Fermer')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showTimePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowTimePicker(false)}>
          <Pressable style={styles.timePickerModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.timePickerTitle}>{t('eventTime') || 'Heure'}</Text>
            <View style={styles.timePickerColumns}>
              <View style={styles.timePickerColumn}>
                <Text style={styles.timePickerLabel}>{trUI('Heures')}</Text>
                <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.timePickerItem, selectedHour === i && styles.timePickerItemSelected]}
                      onPress={() => setSelectedHour(i)}
                    >
                      <Text style={[styles.timePickerItemText, selectedHour === i && styles.timePickerItemTextSelected]}>
                        {String(i).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <Text style={styles.timePickerSeparator}>:</Text>
              <View style={styles.timePickerColumn}>
                <Text style={styles.timePickerLabel}>{trUI('Minutes')}</Text>
                <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false}>
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.timePickerItem, selectedMinute === m && styles.timePickerItemSelected]}
                      onPress={() => setSelectedMinute(m)}
                    >
                      <Text style={[styles.timePickerItemText, selectedMinute === m && styles.timePickerItemTextSelected]}>
                        {String(m).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.timePickerConfirmBtn}
              onPress={() => {
                setSessionTime(`${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`);
                setShowTimePicker(false);
              }}
            >
              <Text style={styles.timePickerConfirmText}>{trUI('Valider')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <StripeConnectModal
        visible={showStripeConnect}
        onClose={() => setShowStripeConnect(false)}
        onConnected={handleStripeConnected}
        celebrityName={celebrityName}
        userId={user?.id}
        returnPath="create-live-session"
        lang={language}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ideasCard: {
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.30)',
    padding: 16,
    marginBottom: 20,
  },
  ideasHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  ideasTitle: {
    flex: 1,
    color: '#c4b5fd',
    fontSize: 16,
    fontWeight: '700',
  },
  ideasIntro: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  ideaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  ideaEmoji: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 1,
  },
  ideaText: {
    color: '#e5e7eb',
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },
  stepsContainer: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    padding: 16,
    marginBottom: 20,
  },
  stepsTitle: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  stepText: {
    color: '#d1d5db',
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  nameInputError: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  sectionHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
    textAlign: 'center',
  },
  selfieContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 3,
    borderColor: 'rgba(16, 185, 129, 0.5)',
    borderStyle: 'dashed',
    alignSelf: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  selfieContainerError: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  selfiePreviewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  selfiePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 80,
  },
  retakeSelfieButton: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    transform: [{ translateX: -40 }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  retakeSelfieText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  selfiePrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  selfieIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfiePromptText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  optionButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sliderContainer: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  sliderValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sliderValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderFlex: {
    flex: 1,
    height: 40,
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  calculatedFansCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  calculatedFansText: {
    fontSize: 16,
    color: '#fff',
  },
  calculatedFansNumber: {
    fontWeight: '700',
    color: '#10B981',
    fontSize: 18,
  },
  customPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  customPriceInput: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  customPriceLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  optionTextActive: {
    color: '#10B981',
  },
  summaryCard: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  revenueAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#4ade80',
    textAlign: 'center',
  },
  revenueExplanation: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  feesBreakdown: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  feeRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  feeLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  feeLabelTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  feeValue: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  feeValueNegative: {
    fontSize: 13,
    color: '#f87171',
  },
  feeValueTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4ade80',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  summaryValueHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ade80',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 12,
  },
  summaryLabelSmall: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  summaryValueSmall: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  summaryLabelHighlight: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4ade80',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#188661',
    borderRadius: 30,
    paddingVertical: 18,
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  paymentInfoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
  },
  paymentInfoToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentInfoToggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fbbf24',
  },
  paymentInfoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  endEarlyWarningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
  },
  endEarlyWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#fde68a',
    lineHeight: 20,
    fontWeight: '600',
  },
  paymentInfoIntro: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
    marginBottom: 16,
  },
  paymentPlatformCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  paymentPlatformTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  paymentDelayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
  },
  paymentDelayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  paymentExampleText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
  },
  paymentNoteCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  paymentNoteText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  liveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  liveToggleActive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  liveToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liveIndicator: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveIndicatorActive: {
    backgroundColor: '#ef4444',
  },
  liveIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1,
  },
  liveToggleText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  liveToggleTextActive: {
    color: '#ef4444',
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    padding: 2,
  },
  toggleSwitchActive: {
    backgroundColor: '#ef4444',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  scheduleSection: {
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    marginTop: 12,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  datePickerText: {
    fontSize: 16,
    color: '#ffffff',
    textTransform: 'capitalize',
  },
  timePickerButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  timePickerButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
  },
  timePickerButtonPlaceholder: {
    color: 'rgba(255,255,255,0.4)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  calendarNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarNavText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  calendarMonthText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#10B981',
    borderRadius: 20,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 20,
  },
  dayText: {
    fontSize: 16,
    color: '#ffffff',
  },
  dayTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  dayTextToday: {
    color: '#10B981',
    fontWeight: '600',
  },
  calendarCloseBtn: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  calendarCloseBtnText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  timePickerModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  timePickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  timePickerColumns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickerColumn: {
    alignItems: 'center',
    width: 80,
  },
  timePickerLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
  },
  timePickerScroll: {
    height: 200,
  },
  timePickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginVertical: 2,
  },
  timePickerItemSelected: {
    backgroundColor: '#10B981',
  },
  timePickerItemText: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    textAlign: 'center',
  },
  timePickerItemTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  timePickerSeparator: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: '700',
    marginHorizontal: 10,
  },
  timePickerConfirmBtn: {
    marginTop: 20,
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  timePickerConfirmText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
  },
});
