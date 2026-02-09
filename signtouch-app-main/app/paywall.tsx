import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Crown,
  Check,
  Gift,
  X,
  ArrowLeft,
  Ticket,
  RotateCcw,
} from 'lucide-react-native';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { validatePromoCode, getPromoPremiumStatus } from '@/utils/promoCodeStorage';
import {
  isAvailable as isRCAvailable,
  getSubscriptionOfferings,
  purchaseSubscription,
  restorePurchases,
  SubscriptionOffering,
} from '@/utils/revenueCat';

type PlanType = 'trial' | 'yearly' | 'monthly';

const FALLBACK_PLANS: { type: PlanType; priceString: string; saving?: string }[] = [
  { type: 'trial', priceString: '' },
  { type: 'yearly', priceString: '€29.99', saving: '-50%' },
  { type: 'monthly', priceString: '€4.99' },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { setStatus } = useSubscription();
  const { t } = useLanguage();
  const { getPostAuthRedirect, clearPostAuthRedirect } = useAuth();
  const params = useLocalSearchParams();
  const fromAccount = params.fromAccount === 'true';

  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [promoPremiumExpires, setPromoPremiumExpires] = useState<string | null>(null);

  const [offerings, setOfferings] = useState<SubscriptionOffering[]>([]);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('trial');

  useEffect(() => {
    checkPromoPremium();
    loadOfferings();
  }, []);

  const checkPromoPremium = async () => {
    const status = await getPromoPremiumStatus();
    if (status.isActive && status.expiresAt) {
      setPromoPremiumExpires(status.expiresAt);
    }
  };

  const loadOfferings = async () => {
    setLoadingOfferings(true);
    try {
      const products = await getSubscriptionOfferings();
      setOfferings(products);
    } catch (error) {
      console.error('[Paywall] Error loading offerings:', error);
    } finally {
      setLoadingOfferings(false);
    }
  };

  const findPackageForPlan = (plan: PlanType): SubscriptionOffering | undefined => {
    if (plan === 'trial') {
      return offerings.find(
        (o) =>
          o.identifier.includes('trial') ||
          o.packageType === 'ANNUAL' ||
          o.identifier.includes('yearly') ||
          o.identifier.includes('annual')
      );
    }
    if (plan === 'yearly') {
      return offerings.find(
        (o) =>
          o.packageType === 'ANNUAL' ||
          o.identifier.includes('yearly') ||
          o.identifier.includes('annual')
      );
    }
    if (plan === 'monthly') {
      return offerings.find(
        (o) =>
          o.packageType === 'MONTHLY' ||
          o.identifier.includes('monthly')
      );
    }
    return undefined;
  };

  const getPriceForPlan = (plan: PlanType): string => {
    const offering = findPackageForPlan(plan);
    if (offering) return offering.priceString;
    const fallback = FALLBACK_PLANS.find((p) => p.type === plan);
    return fallback?.priceString || '';
  };

  const handlePromoSubmit = async () => {
    if (!promoCode.trim()) return;

    setPromoLoading(true);
    setPromoMessage(null);

    const result = await validatePromoCode(promoCode);

    setPromoMessage({ text: result.message, success: result.success });
    setPromoLoading(false);

    if (result.success) {
      await setStatus('paid');
      setTimeout(() => {
        setShowPromoModal(false);
        navigateAfterPurchase();
      }, 1500);
    }
  };

  const navigateAfterPurchase = async () => {
    const returnPath = await getPostAuthRedirect();
    if (returnPath) {
      await clearPostAuthRedirect();
      router.replace(returnPath as any);
    } else {
      router.replace('/');
    }
  };

  const handleSubscribe = async (plan: PlanType) => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    if (!isRCAvailable() || offerings.length === 0) {
      console.log('[Paywall] RevenueCat not available, activating locally for plan:', plan);
      await setStatus('paid');
      navigateAfterPurchase();
      return;
    }

    const offering = findPackageForPlan(plan);
    if (!offering) {
      console.error('[Paywall] No matching offering for plan:', plan);
      Alert.alert('Error', 'This product is not available right now.');
      return;
    }

    setPurchasing(true);
    try {
      const result = await purchaseSubscription(offering.rcPackage);

      if (result.success) {
        await setStatus('paid');
        navigateAfterPurchase();
      } else if (result.cancelled) {
        console.log('[Paywall] Purchase cancelled by user');
      } else {
        Alert.alert('Error', result.error || 'An error occurred during purchase.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An error occurred during purchase.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (!isRCAvailable()) {
      Alert.alert('Info', 'Restore is only available on the mobile app.');
      return;
    }

    setRestoring(true);
    try {
      const result = await restorePurchases();

      if (result.success && result.isPremium) {
        await setStatus('paid');
        Alert.alert('Success', 'Your purchases have been restored!', [
          { text: 'OK', onPress: () => navigateAfterPurchase() },
        ]);
      } else if (result.success && !result.isPremium) {
        Alert.alert('Info', 'No previous purchases found.');
      } else {
        Alert.alert('Error', result.error || 'Failed to restore purchases.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to restore purchases.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        {fromAccount ? (
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
        <Text style={styles.headerTitleCentered}>{t('subscriptionTitle')}</Text>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <X size={22} color="#888" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {promoPremiumExpires && (
          <View style={styles.promoActiveBanner}>
            <Ticket size={24} color="#10b981" />
            <View style={styles.promoActiveText}>
              <Text style={styles.promoActiveTitle}>
                {t('promoCodeActive') || 'Code promo actif'}
              </Text>
              <Text style={styles.promoActiveExpiry}>
                {t('premiumUntil') || 'Premium jusqu\'au'} {new Date(promoPremiumExpires).toLocaleDateString()}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.hero}>
          <View style={styles.crownContainer}>
            <Crown size={60} color="#10b981" strokeWidth={2} />
          </View>
          <Text style={styles.heroTitle}>{t('designYourTrial')}</Text>
          <Text style={styles.heroSubtitle}>
            {t('appDescriptionShare')}
          </Text>
        </View>

        <View style={styles.benefitsSection}>
          <View style={styles.benefitItem}>
            <View style={styles.checkIcon}>
              <Check size={20} color="#10b981" strokeWidth={3} />
            </View>
            <Text style={styles.benefitText}>{t('enjoyFirst7Days')}</Text>
          </View>

          <View style={styles.benefitItem}>
            <View style={styles.checkIcon}>
              <Check size={20} color="#10b981" strokeWidth={3} />
            </View>
            <Text style={styles.benefitText}>{t('cancelFromApp')}</Text>
          </View>

          <View style={styles.benefitItem}>
            <View style={styles.checkIcon}>
              <Check size={20} color="#10b981" strokeWidth={3} />
            </View>
            <Text style={styles.benefitText}>{t('unlimitedAccessFeatures')}</Text>
          </View>

          <View style={styles.benefitItem}>
            <View style={styles.checkIcon}>
              <Check size={20} color="#10b981" strokeWidth={3} />
            </View>
            <Text style={styles.benefitText}>{t('noIntrusiveAds')}</Text>
          </View>
        </View>

        <View style={styles.plansSection}>
          <TouchableOpacity
            style={[
              styles.planCard,
              styles.planCardFeatured,
              selectedPlan === 'trial' && styles.planCardSelected,
            ]}
            onPress={() => setSelectedPlan('trial')}
            activeOpacity={0.8}
          >
            <View style={styles.planHeader}>
              <View style={styles.planLeft}>
                <Text style={styles.planName}>{t('free7Days')}</Text>
              </View>
              {selectedPlan === 'trial' && (
                <View style={styles.selectedBadge}>
                  <Check size={18} color="#fff" strokeWidth={3} />
                </View>
              )}
            </View>
            <Text style={styles.planDescription}>
              {t('trialThenYearly')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'yearly' && styles.planCardSelected,
            ]}
            onPress={() => setSelectedPlan('yearly')}
            activeOpacity={0.8}
          >
            <View style={styles.planHeader}>
              <View style={styles.planLeft}>
                <Text style={styles.planName}>{t('oneYear')}</Text>
                <Text style={styles.planPrice}>{getPriceForPlan('yearly')}</Text>
              </View>
              <View style={styles.planRight}>
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>-50%</Text>
                </View>
                {selectedPlan === 'yearly' && (
                  <View style={styles.selectedBadge}>
                    <Check size={18} color="#fff" strokeWidth={3} />
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.planDescription}>
              {t('yearlyPrice29')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'monthly' && styles.planCardSelected,
            ]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.8}
          >
            <View style={styles.planHeader}>
              <View style={styles.planLeft}>
                <Text style={styles.planName}>{t('oneMonth')}</Text>
                <Text style={styles.planPrice}>{getPriceForPlan('monthly')}</Text>
              </View>
              {selectedPlan === 'monthly' && (
                <View style={styles.selectedBadge}>
                  <Check size={18} color="#fff" strokeWidth={3} />
                </View>
              )}
            </View>
            <Text style={styles.planDescription}>
              {t('monthlyPrice4')}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.subscribeButton, (purchasing || restoring) && styles.buttonDisabled]}
          onPress={() => handleSubscribe(selectedPlan)}
          disabled={purchasing || restoring}
          activeOpacity={0.8}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.subscribeButtonText}>
              {selectedPlan === 'trial' ? (t('tryForFree') || 'Essayer gratuitement') : (t('subscribeNow') || 'S\'abonner')}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.promoButton}
          onPress={() => setShowPromoModal(true)}
          activeOpacity={0.7}
        >
          <Gift size={20} color="#f59e0b" />
          <Text style={styles.promoButtonText}>{t('havePromoCode') || 'Vous avez un code promo ?'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.restoreButton, restoring && styles.buttonDisabled]}
          onPress={handleRestore}
          disabled={restoring}
          activeOpacity={0.7}
        >
          {restoring ? (
            <ActivityIndicator color="#10b981" size="small" />
          ) : (
            <>
              <RotateCcw size={16} color="#10b981" />
              <Text style={styles.restoreButtonText}>{t('restorePurchases')}</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t('autoRenewal')}
          </Text>
          <Text style={styles.footerSubtext}>
            {t('securePayment')}
          </Text>
          <View style={styles.legalContainer}>
            <Text style={styles.legalText}>
              {t('paymentLegalText')}
            </Text>
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => router.push('/privacy')}>
                <Text style={styles.legalLinkText}>{t('privacyPolicy')}</Text>
              </TouchableOpacity>
              <Text style={styles.legalSeparator}> • </Text>
              <TouchableOpacity onPress={() => router.push('/terms')}>
                <Text style={styles.legalLinkText}>{t('termsOfUse')}</Text>
              </TouchableOpacity>
            </View>
          </View>
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
                styles.promoMessageText,
                promoMessage.success ? styles.promoMessageSuccess : styles.promoMessageError
              ]}>
                {promoMessage.text}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.promoSubmitButton, promoLoading && styles.buttonDisabled]}
              onPress={handlePromoSubmit}
              disabled={promoLoading}
            >
              {promoLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.promoSubmitButtonText}>{t('validate') || 'Valider'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleCentered: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  promoActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  promoActiveText: {
    marginLeft: 12,
    flex: 1,
  },
  promoActiveTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  promoActiveExpiry: {
    fontSize: 14,
    color: '#a3a3a3',
    marginTop: 2,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  crownContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
  },
  benefitsSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  benefitText: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    lineHeight: 22,
  },
  plansSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  planCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#2a2a2a',
  },
  planCardFeatured: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
  },
  planCardSelected: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planLeft: {
    flex: 1,
  },
  planRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 2,
  },
  planPrice: {
    fontSize: 14,
    color: '#999999',
  },
  saveBadge: {
    backgroundColor: '#4ade80',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  saveBadgeText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  selectedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  planDescription: {
    fontSize: 13,
    color: '#999999',
    lineHeight: 18,
  },
  subscribeButton: {
    backgroundColor: '#10b981',
    marginHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 12,
  },
  subscribeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  promoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  promoButtonText: {
    fontSize: 15,
    color: '#f59e0b',
    fontWeight: '500',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 12,
  },
  restoreButtonText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 18,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
  },
  legalContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  legalText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  legalLinkText: {
    fontSize: 11,
    color: '#10b981',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 11,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalBackdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  promoMessageText: {
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
  promoSubmitButton: {
    width: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  promoSubmitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
