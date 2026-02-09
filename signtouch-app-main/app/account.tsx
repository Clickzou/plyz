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
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { router } from 'expo-router';
import {
  Crown,
  Info,
  Heart,
  Share2,
  Globe,
  Check,
  FileText,
  LogOut,
  Gift,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import BottomNav from '@/components/BottomNav';
import { useTranslation } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Language } from '@/locales';
import { showAccountModal } from '@/utils/postPurchaseAccount';
import { validatePromoCode, getPromoPremiumStatus } from '@/utils/promoCodeStorage';
import { clearTrialData } from '@/utils/trialStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ✅ AJOUT */
import { useSubscription } from '@/contexts/SubscriptionContext';

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
  const { user, signOut } = useAuth();

  /* ✅ AJOUT */
  const { status } = useSubscription();

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] =
    useState<{ text: string; success: boolean } | null>(null);
  const [promoPremiumExpires, setPromoPremiumExpires] = useState<string | null>(null);

  useEffect(() => {
    checkPromoPremium();
  }, []);

  const checkPromoPremium = async () => {
    const status = await getPromoPremiumStatus();
    if (status.isActive && status.expiresAt) {
      setPromoPremiumExpires(status.expiresAt);
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
    return LANGUAGES.find((lang) => lang.code === language)?.name || 'English';
  };

  const handleSignOut = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await signOut();
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('account')}</Text>
          <Text style={styles.subtitle}>SignTouch</Text>

          {/* ✅ AJOUT VISIBLE */}
          <Text style={styles.subtitle}>Subscription: {status}</Text>
        </View>

        {/* 👉 LE RESTE DE TON ÉCRAN EST STRICTEMENT INCHANGÉ */}

        {/* ... tout le reste de ton JSX reste identique ... */}

      </ScrollView>

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1 },
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
});
