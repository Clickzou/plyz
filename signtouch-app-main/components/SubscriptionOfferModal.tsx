import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { setLastSubscriptionOfferDate } from '@/utils/subscriptionStorage';
import { useRouter } from 'expo-router';
import { useTranslation } from '@/contexts/LanguageContext';

interface SubscriptionOfferModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
}

export default function SubscriptionOfferModal({ visible, onClose, onPurchaseSuccess }: SubscriptionOfferModalProps) {
  const [alertBeforeEnd, setAlertBeforeEnd] = useState(true);
  const { status } = useSubscription();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (visible) {
      console.log('[SubscriptionOfferModal] Modal is now visible');
    }
  }, [visible]);

  const handleGoToPaywall = async () => {
    await setLastSubscriptionOfferDate(Date.now());
    onClose();
    setTimeout(() => {
      router.push('/paywall');
    }, 300);
  };

  const handleContinueFree = async () => {
    await setLastSubscriptionOfferDate(Date.now());
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleContinueFree}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleContinueFree}
            activeOpacity={0.8}
          >
            <X size={24} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <Text style={styles.headerTitle}>{t('designYourTrial')}</Text>
            </View>

            <View style={styles.contentContainer}>
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <View style={styles.checkIconNew}>
                    <Check size={20} color="#00C853" strokeWidth={3} />
                  </View>
                  <Text style={styles.benefitText}>{t('enjoyFirst7Days')}</Text>
                </View>

                <View style={styles.benefitItem}>
                  <View style={styles.checkIconNew}>
                    <Check size={20} color="#00C853" strokeWidth={3} />
                  </View>
                  <Text style={styles.benefitText}>{t('cancelFromApp')}</Text>
                </View>

                <View style={styles.benefitItem}>
                  <View style={styles.checkIconNew}>
                    <Check size={20} color="#00C853" strokeWidth={3} />
                  </View>
                  <Text style={styles.benefitText}>{t('unlimitedAccessFeatures')}</Text>
                </View>

                <View style={styles.benefitItem}>
                  <View style={styles.checkIconNew}>
                    <Check size={20} color="#00C853" strokeWidth={3} />
                  </View>
                  <Text style={styles.benefitText}>{t('noIntrusiveAds')}</Text>
                </View>
              </View>

              <View style={styles.plansPreview}>
                <View style={styles.planPreviewItem}>
                  <Text style={styles.planPreviewTitle}>{t('free7Days')}</Text>
                  <Text style={styles.planPreviewSubtext}>{t('sevenDays')}</Text>
                </View>
                <View style={styles.planPreviewItem}>
                  <Text style={styles.planPreviewTitle}>{t('oneYear')}</Text>
                  <Text style={styles.planPreviewSubtext}>€29.99 <Text style={styles.savingText}>(-50%)</Text></Text>
                </View>
                <View style={styles.planPreviewItem}>
                  <Text style={styles.planPreviewTitle}>{t('oneMonth')}</Text>
                  <Text style={styles.planPreviewSubtext}>€4.99</Text>
                </View>
              </View>

              <View style={styles.alertContainer}>
                <Text style={styles.alertText}>{t('alertBeforeTrialEnd')}</Text>
                <Switch
                  value={alertBeforeEnd}
                  onValueChange={setAlertBeforeEnd}
                  trackColor={{ false: '#3e3e3e', true: '#00C853' }}
                  thumbColor={alertBeforeEnd ? '#ffffff' : '#f4f3f4'}
                />
              </View>

              <TouchableOpacity
                style={styles.subscribeButtonNew}
                onPress={handleGoToPaywall}
                activeOpacity={0.8}
              >
                <Text style={styles.subscribeButtonTextNew}>
                  {t('tryForFree') || 'Essayer gratuitement'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.trialInfoText}>
                {t('trialThenYearly')}
              </Text>

              <View style={styles.legalContainer}>
                <Text style={styles.legalText}>
                  {t('paymentLegalText')}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#000000',
    borderRadius: 0,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  headerContainer: {
    paddingTop: 80,
    paddingBottom: 32,
    paddingHorizontal: 24,
    backgroundColor: '#000000',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  contentContainer: {
    padding: 24,
    paddingTop: 32,
  },
  benefitsList: {
    marginBottom: 32,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkIconNew: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 200, 83, 0.2)',
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
  plansPreview: {
    marginBottom: 24,
  },
  planPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    paddingVertical: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#2a2a2a',
  },
  planPreviewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  planPreviewSubtext: {
    fontSize: 14,
    color: '#999999',
  },
  savingText: {
    color: '#4ade80',
    fontWeight: '700',
  },
  alertContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  alertText: {
    flex: 1,
    fontSize: 15,
    color: '#ffffff',
    marginRight: 12,
  },
  subscribeButtonNew: {
    backgroundColor: '#00C853',
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 12,
  },
  subscribeButtonTextNew: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  trialInfoText: {
    fontSize: 13,
    color: '#999999',
    textAlign: 'center',
    marginBottom: 24,
  },
  legalContainer: {
    marginTop: 16,
  },
  legalText: {
    fontSize: 11,
    color: '#666666',
    lineHeight: 17,
    textAlign: 'left',
    marginBottom: 16,
  },
});
