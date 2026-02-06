import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ShoppingCart, AlertCircle, CheckCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { showAlert } from '@/utils/alertHelper';
import { getAvailableProducts, purchaseSession, isAvailable, SessionProduct } from '@/utils/revenueCat';
import { supabase } from '@/utils/supabase';

export default function PurchaseSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{
    celebrityId: string;
    celebrityName: string;
    sessionId: string;
    priceCents: string;
    durationMinutes: string;
  }>();

  const [products, setProducts] = useState<SessionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseComplete, setPurchaseComplete] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    if (!isAvailable()) {
      setLoading(false);
      return;
    }
    const available = await getAvailableProducts();
    setProducts(available);
    setLoading(false);
  };

  const handlePurchase = async (product: SessionProduct) => {
    setPurchasing(true);
    try {
      const result = await purchaseSession(product.rcPackage);

      if (result.cancelled) {
        setPurchasing(false);
        return;
      }

      if (!result.success) {
        showAlert(t('error') || 'Error', result.error || t('purchaseFailed') || 'Purchase failed');
        setPurchasing(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create_paid_session_intent', {
        body: {
          celebrity_id: params.celebrityId,
          product_id: result.productId,
          duration_minutes: parseInt(params.durationMinutes || '5', 10),
          rc_transaction_id: result.transactionId,
          platform: Platform.OS === 'ios' ? 'apple' : 'google',
          gross_amount_cents: parseInt(params.priceCents || '0', 10),
          currency: 'EUR',
        },
      });

      if (error) {
        showAlert(t('error') || 'Error', t('sessionCreationFailed') || 'Failed to create session');
        setPurchasing(false);
        return;
      }

      setPurchaseComplete(true);
      setPurchasing(false);

      setTimeout(() => {
        router.replace({
          pathname: '/video-call',
          params: {
            roomUrl: '',
            sessionId: data.session_id,
            isHost: 'false',
            userName: '',
            durationPerFan: params.durationMinutes || '5',
            otherUserName: params.celebrityName || '',
            priceCents: params.priceCents || '0',
            celebrityId: params.celebrityId || '',
          },
        });
      }, 1500);
    } catch (error) {
      console.error('[Purchase] Error:', error);
      showAlert(t('error') || 'Error', t('purchaseFailed') || 'Purchase failed');
      setPurchasing(false);
    }
  };

  const renderWebFallback = () => (
    <View style={styles.centeredContent}>
      <AlertCircle size={48} color="#f59e0b" />
      <Text style={styles.webTitle}>{t('nativeRequired') || 'Native App Required'}</Text>
      <Text style={styles.webMessage}>
        {t('purchaseNativeOnly') || 'In-app purchases are only available on the iOS and Android apps. Please download SignTouch from the App Store or Google Play.'}
      </Text>
    </View>
  );

  const renderProducts = () => {
    if (loading) {
      return (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>{t('loadingProducts') || 'Loading products...'}</Text>
        </View>
      );
    }

    if (products.length === 0) {
      return (
        <View style={styles.centeredContent}>
          <AlertCircle size={48} color="#f59e0b" />
          <Text style={styles.webTitle}>{t('noProducts') || 'No Products Available'}</Text>
          <Text style={styles.webMessage}>
            {t('noProductsMessage') || 'Session products are not configured yet.'}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.productsContainer}>
        <Text style={styles.sectionTitle}>{t('chooseSession') || 'Choose a session'}</Text>
        {products.map((product) => (
          <TouchableOpacity
            key={product.identifier}
            style={styles.productCard}
            onPress={() => handlePurchase(product)}
            disabled={purchasing}
          >
            <View style={styles.productInfo}>
              <Text style={styles.productTitle}>{product.title}</Text>
              <Text style={styles.productDescription}>{product.description}</Text>
            </View>
            <View style={styles.productPrice}>
              <Text style={styles.priceText}>{product.priceString}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a0a0a', '#1a1a2e']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('purchaseSession') || 'Purchase Session'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {params.celebrityName && (
        <View style={styles.celebrityBanner}>
          <Text style={styles.celebrityLabel}>{t('sessionWith') || 'Session with'}</Text>
          <Text style={styles.celebrityName}>{params.celebrityName}</Text>
          {params.priceCents && parseInt(params.priceCents) > 0 && (
            <Text style={styles.sessionPrice}>
              {(parseInt(params.priceCents) / 100).toFixed(2)} €
            </Text>
          )}
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {purchaseComplete ? (
          <View style={styles.centeredContent}>
            <CheckCircle size={64} color="#10B981" />
            <Text style={styles.successTitle}>{t('purchaseSuccess') || 'Purchase Successful!'}</Text>
            <Text style={styles.successMessage}>
              {t('redirectingToCall') || 'Redirecting to your video call...'}
            </Text>
            <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 16 }} />
          </View>
        ) : purchasing ? (
          <View style={styles.centeredContent}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>{t('processingPurchase') || 'Processing purchase...'}</Text>
          </View>
        ) : Platform.OS === 'web' ? (
          renderWebFallback()
        ) : (
          renderProducts()
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
  celebrityBanner: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  celebrityLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  celebrityName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginTop: 4,
  },
  sessionPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    flexGrow: 1,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  webTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    textAlign: 'center',
  },
  webMessage: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 16,
  },
  productsContainer: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  productInfo: {
    flex: 1,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  productDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  productPrice: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
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
