import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CreditCard, Shield, CheckCircle, Lock, Info, Video, PenTool, Gem } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { showAlert } from '@/utils/alertHelper';
import { ensureCanPay } from '@/utils/banGuard';
import { isAgeCertified, certifyAge } from '@/utils/ageCertification';
import AgeCertificationModal from '@/components/AgeCertificationModal';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

export default function PurchaseSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, isBanned, banUntil } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const params = useLocalSearchParams<{
    celebrityId: string;
    celebrityName: string;
    sessionId: string;
    priceCents: string;
    durationMinutes: string;
    celebrityStripeAccountId: string;
    fanName: string;
    // 'video' = session live vidéo (retour vers join-live-session). Sinon dédicace (join-event).
    flow?: string;
    // Données déjà uploadées avant le paiement (à retrouver au retour).
    resumePhotoUrl?: string;
    resumeMessage?: string;
  }>();

  const [purchasing, setPurchasing] = useState(false);
  const [purchaseComplete, setPurchaseComplete] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);

  const priceCents = parseInt(params.priceCents || '0', 10);
  const priceEuros = (priceCents / 100).toFixed(2);

  useEffect(() => {
    const url = Platform.OS === 'web' ? window.location.href : '';
    if (url.includes('payment-success') || url.includes('checkout_session_id')) {
      handlePaymentReturn();
    }
  }, []);

  const handlePaymentReturn = async () => {
    setPurchaseComplete(true);

    let checkoutSessionId = '';
    if (Platform.OS === 'web') {
      const urlParams = new URLSearchParams(window.location.search);
      checkoutSessionId = urlParams.get('checkout_session_id') || '';
    }

    setTimeout(() => {
      router.replace({
        pathname: '/payment-success',
        params: {
          checkout_session_id: checkoutSessionId,
          live_session_id: params.sessionId || '',
          celebrity_id: params.celebrityId || '',
          celebrity_name: params.celebrityName || '',
          duration_minutes: params.durationMinutes || '5',
          price_cents: params.priceCents || '0',
          fan_name: params.fanName || '',
          celebrity_stripe_account_id: params.celebrityStripeAccountId || '',
          flow: params.flow || '',
          resume_photo_url: params.resumePhotoUrl || '',
          resume_message: params.resumeMessage || '',
        },
      });
    }, 1500);
  };

  // Compte exigé avant de payer. Une fois connecté, proceedPayment reprend le flux.
  const handleStripeCheckout = () => {
    requireAuth(() => proceedPayment(), {
      reason: 'Crée ton compte pour payer en toute sécurité',
    });
  };

  const proceedPayment = async () => {
    if (!ensureCanPay(isBanned, banUntil)) return;
    // Certification de majorité obligatoire avant tout paiement.
    if (!(await isAgeCertified())) {
      setShowAgeModal(true);
      return;
    }
    setPurchasing(true);
    try {
      const currentOrigin = Platform.OS === 'web'
        ? window.location.origin
        : STRIPE_SERVER_URL;

      const response = await fetch(`${STRIPE_SERVER_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: params.sessionId,
          celebrityId: params.celebrityId,
          celebrityName: params.celebrityName,
          priceCents: priceCents,
          currency: 'eur',
          celebrityStripeAccountId: params.celebrityStripeAccountId || '',
          successUrl: `${currentOrigin}/payment-success?checkout_session_id={CHECKOUT_SESSION_ID}&live_session_id=${params.sessionId}&celebrity_id=${params.celebrityId}&celebrity_name=${encodeURIComponent(params.celebrityName || '')}&duration_minutes=${params.durationMinutes || '5'}&price_cents=${params.priceCents || '0'}&fan_name=${encodeURIComponent(params.fanName || '')}&celebrity_stripe_account_id=${params.celebrityStripeAccountId || ''}&flow=${params.flow || ''}&resume_photo_url=${encodeURIComponent(params.resumePhotoUrl || '')}&resume_message=${encodeURIComponent(params.resumeMessage || '')}`,
          cancelUrl: `${currentOrigin}/purchase-session?sessionId=${params.sessionId}&celebrityId=${params.celebrityId}&celebrityName=${params.celebrityName}&priceCents=${params.priceCents}&durationMinutes=${params.durationMinutes}&celebrityStripeAccountId=${params.celebrityStripeAccountId || ''}&fanName=${encodeURIComponent(params.fanName || '')}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Checkout session creation failed');
      }

      if (data.url) {
        if (Platform.OS === 'web') {
          window.location.href = data.url;
        } else {
          await Linking.openURL(data.url);
        }
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error: any) {
      console.error('[Purchase] Stripe Checkout error:', error);
      const errorMsg = error?.message || '';
      if (errorMsg.includes('cannot accept payments') || errorMsg.includes('CHARGES_NOT_ENABLED') || errorMsg.includes('Onboarding')) {
        showAlert(
          t('error') || 'Erreur',
          t('celebrityAccountNotReady') || "Le compte de paiement de cette célébrité n'est pas encore activé. Veuillez réessayer plus tard."
        );
      } else {
        showAlert(
          t('error') || 'Erreur',
          t('purchaseFailed') || "Échec de l'achat"
        );
      }
      setPurchasing(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2030', '#0a1628']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('preAuthorization') || 'Pré-autorisation'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {purchaseComplete ? (
          <View style={styles.centeredContent}>
            <CheckCircle size={64} color="#10B981" />
            <Text style={styles.successTitle}>{t('authorizationSuccess') || 'Pré-autorisation réussie !'}</Text>
            <Text style={styles.successMessage}>
              {t('redirectingToQueue') || 'Redirection vers la file d\'attente...'}
            </Text>
            <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 16 }} />
          </View>
        ) : purchasing ? (
          <View style={styles.centeredContent}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>{t('processingPurchase') || 'Redirection vers le paiement...'}</Text>
          </View>
        ) : (
          <View style={styles.paymentContent}>
            {params.celebrityName && (
              <View style={styles.celebrityCard}>
                <Text style={styles.celebrityLabel}>{t('sessionWith') || 'Session avec'}</Text>
                <Text style={styles.celebrityName}>{params.celebrityName}</Text>
              </View>
            )}

            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>{t('totalAmount') || 'Montant total'}</Text>
              <Text style={styles.priceAmount}>{priceEuros}€</Text>
            </View>

            <View style={styles.valueCard}>
              <Text style={styles.valueTitle}>
                {(t('valueSectionTitle') || 'Ton moment exclusif avec {celebrityName}').replace('{celebrityName}', params.celebrityName || '')}
              </Text>

              <View style={styles.valueItem}>
                <View style={styles.valueIconWrap}>
                  <Video size={20} color="#10B981" />
                </View>
                <Text style={styles.valueItemText}>
                  {(t('valuePointLive') || 'Un face-à-face vidéo EN DIRECT, rien que toi et {celebrityName}').replace('{celebrityName}', params.celebrityName || '')}
                </Text>
              </View>

              <View style={styles.valueItem}>
                <View style={styles.valueIconWrap}>
                  <PenTool size={20} color="#10B981" />
                </View>
                <Text style={styles.valueItemText}>
                  {t('valuePointDedication') || '+ ta dédicace personnalisée (photo + signature) à la fin'}
                </Text>
              </View>

              <View style={styles.valueItem}>
                <View style={styles.valueIconWrap}>
                  <Gem size={20} color="#10B981" />
                </View>
                <Text style={styles.valueItemText}>
                  {t('valuePointKeepsake') || 'Un souvenir unique, à garder pour toujours'}
                </Text>
              </View>
            </View>

            <View style={styles.preAuthInfo}>
              <Info size={18} color="#3b82f6" />
              <Text style={styles.preAuthText}>
                {t('preAuthExplanation') || 'Le montant est réservé sur votre carte mais ne sera débité qu\'après un appel vidéo réussi. Si l\'appel n\'a pas lieu, aucun montant ne sera prélevé.'}
              </Text>
            </View>

            <View style={styles.securityFeatures}>
              <View style={styles.securityItem}>
                <Shield size={18} color="#10B981" />
                <Text style={styles.securityText}>{t('stripeSecurePayment') || 'Paiement 100% sécurisé'}</Text>
              </View>
              <View style={styles.securityItem}>
                <Lock size={18} color="#10B981" />
                <Text style={styles.securityText}>{t('encryptedData') || 'Données chiffrées SSL'}</Text>
              </View>
              <View style={styles.securityItem}>
                <CreditCard size={18} color="#10B981" />
                <Text style={styles.securityText}>{t('cbVisa') || 'CB, Visa, Mastercard, Apple Pay'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.payButton}
              onPress={handleStripeCheckout}
              disabled={purchasing}
            >
              <Shield size={22} color="#ffffff" />
              <Text style={styles.payButtonText}>
                {(t('authorizePayment') || 'Autoriser {amount}€').replace('{amount}', priceEuros)}
              </Text>
            </TouchableOpacity>

            <View style={styles.stripeInfo}>
              <Text style={styles.stripeLogo}>stripe</Text>
              <Text style={styles.stripeText}>
                {t('poweredByStripe') || 'Paiement sécurisé par Stripe'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <AgeCertificationModal
        visible={showAgeModal}
        onClose={() => setShowAgeModal(false)}
        onConfirm={async () => {
          await certifyAge(user?.id || null, user?.email || null);
          setShowAgeModal(false);
          proceedPayment();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    flexGrow: 1,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  paymentContent: {
    flex: 1,
    gap: 20,
  },
  celebrityCard: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  celebrityLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  celebrityName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginTop: 4,
  },
  priceCard: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  priceLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
  },
  priceAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: '#10B981',
  },
  valueCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    padding: 20,
    gap: 16,
  },
  valueTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
    lineHeight: 25,
  },
  valueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  valueIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueItemText: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
  },
  preAuthInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  preAuthText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },
  securityFeatures: {
    gap: 12,
    paddingVertical: 8,
  },
  securityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  securityText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 18,
    gap: 10,
    marginTop: 8,
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  stripeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  stripeLogo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#635BFF',
    fontStyle: 'italic',
  },
  stripeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 16,
  },
  successMessage: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
    textAlign: 'center',
  },
});
