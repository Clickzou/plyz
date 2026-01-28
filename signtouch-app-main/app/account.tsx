import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Crown, Info, Heart, Share2, Globe, Check, FileText, Shield, LogOut, Gift, X } from 'lucide-react-native';
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
  const { t, language, setLanguage } = useTranslation();
  const { user, signOut } = useAuth();
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ text: string; success: boolean } | null>(null);
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
        router.push('/subscription');
      } else {
        showAccountModal();
      }
    } else if (action === 'share') {
      router.push('/share');
    } else if (action === 'language') {
      setShowLanguageModal(true);
    } else if (action === 'privacy') {
      router.push('/privacy');
    } else if (action === 'terms') {
      router.push('/terms');
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
    Alert.alert(
      'URL copiée!',
      `Cette URL a été copiée dans le presse-papiers:\n\n${url}\n\nAjoute-la dans Supabase Dashboard:\nAuthentication → URL Configuration → Redirect URLs`,
      [{ text: 'OK' }]
    );
  };

  const handleResetTrial = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await clearTrialData();
    await AsyncStorage.removeItem('@signtouch_device_id');
    // Also reset subscription status to free for testing
    if (Platform.OS === 'web') {
      localStorage.removeItem('subscription_status');
      alert('Données de trial et abonnement réinitialisées! Rafraîchissez la page pour voir le flux nouvel utilisateur.');
    } else {
      await AsyncStorage.removeItem('subscription_status');
      Alert.alert(
        'Trial réinitialisé',
        'Les données de trial ont été effacées. Redémarrez l\'app pour tester le flux nouvel utilisateur.',
        [{ text: 'OK' }]
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

        {__DEV__ && (
          <View style={styles.debugSection}>
            <Text style={styles.debugTitle}>🔧 Mode Debug</Text>
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
          <Text style={styles.sectionTitle}>{t('preferences')}</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handlePress('language')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <Globe size={24} color="#10b981" strokeWidth={2} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuText}>{t('language')}</Text>
              <Text style={styles.menuSubtext}>{getCurrentLanguageName()}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('application')}</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handlePress('subscription')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <Crown size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={styles.menuText}>{t('mySubscription')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => setShowPromoModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <Gift size={24} color="#f59e0b" strokeWidth={2} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuText}>{t('promoCode') || 'Code promo'}</Text>
              {promoPremiumExpires && (
                <Text style={styles.menuSubtextGreen}>
                  Premium jusqu'au {new Date(promoPremiumExpires).toLocaleDateString()}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {user && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <View style={styles.menuIcon}>
                <LogOut size={24} color="#ef4444" strokeWidth={2} />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>{t('signOut')}</Text>
                <Text style={styles.menuSubtext}>{user.email}</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handlePress('about')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <Info size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={styles.menuText}>{t('about')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('community')}</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handlePress('rate')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <Heart size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={styles.menuText}>{t('rateApp')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handlePress('share')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <Share2 size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={styles.menuText}>{t('shareApp')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Légal</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handlePress('privacy')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <Shield size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={styles.menuText}>{t('privacy')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handlePress('terms')}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              <FileText size={24} color="#10b981" strokeWidth={2} />
            </View>
            <Text style={styles.menuText}>{t('terms')}</Text>
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
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  menuSubtext: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
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
    color: '#fbbf24',
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
    color: '#fbbf24',
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
});
