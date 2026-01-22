# Guide d'intégration RevenueCat

Ce guide explique comment intégrer RevenueCat pour gérer les abonnements et l'essai gratuit de 7 jours dans ton application SignTouch.

## Pourquoi RevenueCat ?

RevenueCat gère automatiquement :
- Les abonnements Apple App Store et Google Play Store
- Les essais gratuits avec débit automatique après la période d'essai
- La validation des reçus côté serveur
- La synchronisation multi-appareils
- Les analytics d'abonnement
- Les renouvellements automatiques
- Les annulations et remboursements

## Prérequis IMPORTANTS

⚠️ **RevenueCat nécessite du code natif et ne fonctionne PAS dans l'environnement Bolt.**

Tu DOIS :
1. **Exporter le projet** depuis Bolt
2. **Ouvrir le projet localement** (VS Code, Cursor, etc.)
3. **Créer un development build** avec `npx expo run:ios` ou `npx expo run:android`
4. **Tester sur un appareil réel** ou simulateur

## Étape 1 : Configuration RevenueCat

### 1.1 Créer un compte RevenueCat

1. Va sur [https://app.revenuecat.com/signup](https://app.revenuecat.com/signup)
2. Crée un compte gratuit
3. Crée un nouveau projet "SignTouch"

### 1.2 Configurer les stores

**Pour iOS (App Store) :**
1. Dans RevenueCat, va dans **Project Settings > Apple App Store**
2. Entre ton Bundle ID (exemple : `com.tonnom.signtouch`)
3. Configure l'App Store Connect API Key :
   - Va dans App Store Connect
   - Users and Access > Keys > App Store Connect API
   - Génère une nouvelle clé
   - Télécharge le fichier .p8
   - Upload dans RevenueCat

**Pour Android (Google Play) :**
1. Dans RevenueCat, va dans **Project Settings > Google Play Store**
2. Entre ton Package Name (exemple : `com.tonnom.signtouch`)
3. Configure le Service Account :
   - Va dans Google Play Console
   - Setup > API Access
   - Crée un service account
   - Donne les permissions nécessaires
   - Télécharge le JSON
   - Upload dans RevenueCat

### 1.3 Créer les produits (Offerings)

Dans RevenueCat Dashboard :

1. Va dans **Products**
2. Crée les produits suivants :

**Produit 1 : Abonnement Annuel avec Essai**
- Product ID iOS : `annual_19_99_trial`
- Product ID Android : `annual_19_99_trial`
- Type : Subscription
- Duration : 1 Year
- Trial : 7 days
- Prix : €19.99

**Produit 2 : Abonnement Annuel Direct**
- Product ID iOS : `annual_19_99`
- Product ID Android : `annual_19_99`
- Type : Subscription
- Duration : 1 Year
- Prix : €19.99

**Produit 3 : Abonnement Mensuel**
- Product ID iOS : `monthly_2_99`
- Product ID Android : `monthly_2_99`
- Type : Subscription
- Duration : 1 Month
- Prix : €2.99

3. Va dans **Offerings**
4. Crée un offering "default" avec ces 3 produits

### 1.4 Récupérer les clés API

1. Dans RevenueCat, va dans **Project Settings > API Keys**
2. Copie :
   - **Public API Key** (pour iOS)
   - **Public API Key** (pour Android)
   - Ou utilise la même clé pour les deux plateformes

## Étape 2 : Installation dans le projet Expo

### 2.1 Installer le SDK RevenueCat

```bash
npm install react-native-purchases
npx expo install expo-dev-client
```

### 2.2 Ajouter la configuration dans app.json

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-purchases",
        {
          "ios": {
            "usesStoreKit2IfAvailable": true
          }
        }
      ]
    ]
  }
}
```

### 2.3 Créer un fichier d'environnement

Ajoute dans ton fichier `.env` :

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=rcb_votre_cle_ios
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=rcb_votre_cle_android
```

⚠️ **N'oublie pas d'ajouter ces variables à ton fichier `.gitignore`**

## Étape 3 : Mise à jour du code

### 3.1 Créer un service RevenueCat

Crée le fichier `utils/revenueCat.ts` :

```typescript
import Purchases, { PurchasesOfferings } from 'react-native-purchases';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const REVENUECAT_IOS_KEY = Constants.expoConfig?.extra?.revenueCatIosKey || '';
const REVENUECAT_ANDROID_KEY = Constants.expoConfig?.extra?.revenueCatAndroidKey || '';

export const initRevenueCat = async () => {
  try {
    if (Platform.OS === 'ios') {
      await Purchases.configure({ apiKey: REVENUECAT_IOS_KEY });
    } else if (Platform.OS === 'android') {
      await Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY });
    }

    // Active le mode debug en développement
    if (__DEV__) {
      await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    }
  } catch (error) {
    console.error('Error initializing RevenueCat:', error);
  }
};

export const getOfferings = async (): Promise<PurchasesOfferings | null> => {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (error) {
    console.error('Error getting offerings:', error);
    return null;
  }
};

export const purchasePackage = async (packageToPurchase: any) => {
  try {
    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
    return customerInfo;
  } catch (error: any) {
    if (!error.userCancelled) {
      console.error('Error purchasing package:', error);
    }
    throw error;
  }
};

export const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (error) {
    console.error('Error restoring purchases:', error);
    throw error;
  }
};

export const getCustomerInfo = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('Error getting customer info:', error);
    return null;
  }
};

export const checkSubscriptionStatus = async (): Promise<boolean> => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();

    // Vérifie si l'utilisateur a un entitlement actif
    // Tu peux créer un entitlement "premium" dans RevenueCat
    return customerInfo.entitlements.active['premium'] !== undefined;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
};

export const setUserId = async (userId: string) => {
  try {
    await Purchases.logIn(userId);
  } catch (error) {
    console.error('Error setting user ID:', error);
  }
};

export const logout = async () => {
  try {
    await Purchases.logOut();
  } catch (error) {
    console.error('Error logging out:', error);
  }
};
```

### 3.2 Mettre à jour le SubscriptionContext

Modifie `contexts/SubscriptionContext.tsx` pour intégrer RevenueCat :

```typescript
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  initRevenueCat,
  checkSubscriptionStatus,
  setUserId as setRevenueCatUserId,
  logout as logoutRevenueCat
} from '@/utils/revenueCat';
import { useAuth } from '@/contexts/AuthContext';

export type SubscriptionStatus = 'free' | 'trial' | 'paid';

interface SubscriptionContextType {
  status: SubscriptionStatus;
  loading: boolean;
  refreshStatus: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<SubscriptionStatus>('free');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (Platform.OS !== 'web') {
      initRevenueCat();
    }
  }, []);

  useEffect(() => {
    if (user && Platform.OS !== 'web') {
      setRevenueCatUserId(user.id);
    }
  }, [user]);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    if (Platform.OS === 'web') {
      setLoading(false);
      return;
    }

    try {
      const isPremium = await checkSubscriptionStatus();
      setStatus(isPremium ? 'paid' : 'free');
    } catch (error) {
      console.error('Error loading subscription status:', error);
      setStatus('free');
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async () => {
    await loadStatus();
  };

  return (
    <SubscriptionContext.Provider value={{ status, loading, refreshStatus }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};
```

### 3.3 Mettre à jour l'écran d'abonnement

Modifie `app/subscription.tsx` pour utiliser RevenueCat :

```typescript
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Crown, Check } from 'lucide-react-native';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getOfferings, purchasePackage } from '@/utils/revenueCat';
import type { PurchasesPackage } from 'react-native-purchases';

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const { refreshStatus } = useSubscription();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [packages, setPackages] = useState<{
    trial?: PurchasesPackage;
    annual?: PurchasesPackage;
    monthly?: PurchasesPackage;
  }>({});

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    if (Platform.OS === 'web') {
      setLoading(false);
      return;
    }

    try {
      const offerings = await getOfferings();
      if (offerings && offerings.current) {
        const availablePackages = offerings.current.availablePackages;

        setPackages({
          trial: availablePackages.find(pkg => pkg.product.identifier.includes('trial')),
          annual: availablePackages.find(pkg =>
            pkg.product.identifier.includes('annual') && !pkg.product.identifier.includes('trial')
          ),
          monthly: availablePackages.find(pkg => pkg.product.identifier.includes('monthly')),
        });
      }
    } catch (error) {
      console.error('Error loading offerings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (pkg: PurchasesPackage) => {
    if (Platform.OS === 'web') {
      alert('Les abonnements ne sont pas disponibles sur le web. Télécharge l\'app mobile.');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setPurchasing(true);
    try {
      await purchasePackage(pkg);
      await refreshStatus();
      router.back();
    } catch (error: any) {
      if (!error.userCancelled) {
        alert('Erreur lors de l\'achat. Réessaye plus tard.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color="#ffffff" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('subscriptionTitle')}</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.hero}>
          <View style={styles.crownContainer}>
            <Crown size={60} color="#10b981" strokeWidth={2} />
          </View>
          <Text style={styles.heroTitle}>{t('designYourTrial')}</Text>
          <Text style={styles.heroSubtitle}>{t('appDescriptionShare')}</Text>
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
          {packages.trial && (
            <TouchableOpacity
              style={[styles.planCard, styles.planCardFeatured]}
              onPress={() => handleSubscribe(packages.trial!)}
              activeOpacity={0.8}
              disabled={purchasing}
            >
              <View style={styles.planHeader}>
                <View style={styles.planLeft}>
                  <Text style={styles.planName}>{t('free7Days')}</Text>
                  <Text style={styles.planPrice}>
                    {packages.trial.product.priceString}/an
                  </Text>
                </View>
              </View>
              <Text style={styles.planDescription}>
                {t('trialThenYearly')}
              </Text>
            </TouchableOpacity>
          )}

          {packages.annual && (
            <TouchableOpacity
              style={styles.planCard}
              onPress={() => handleSubscribe(packages.annual!)}
              activeOpacity={0.8}
              disabled={purchasing}
            >
              <View style={styles.planHeader}>
                <View style={styles.planLeft}>
                  <Text style={styles.planName}>{t('oneYear')}</Text>
                  <Text style={styles.planPrice}>
                    {packages.annual.product.priceString}
                  </Text>
                </View>
              </View>
              <Text style={styles.planDescription}>
                {t('yearlyPrice19')}
              </Text>
            </TouchableOpacity>
          )}

          {packages.monthly && (
            <TouchableOpacity
              style={styles.planCard}
              onPress={() => handleSubscribe(packages.monthly!)}
              activeOpacity={0.8}
              disabled={purchasing}
            >
              <View style={styles.planHeader}>
                <View style={styles.planLeft}>
                  <Text style={styles.planName}>{t('oneMonth')}</Text>
                  <Text style={styles.planPrice}>
                    {packages.monthly.product.priceString}
                  </Text>
                </View>
              </View>
              <Text style={styles.planDescription}>
                {t('monthlyPrice2')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('autoRenewal')}</Text>
          <Text style={styles.footerSubtext}>{t('securePayment')}</Text>
          <View style={styles.legalContainer}>
            <Text style={styles.legalText}>{t('paymentLegalText')}</Text>
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

        {purchasing && (
          <View style={styles.purchasingOverlay}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.purchasingText}>{t('processing')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// Styles identiques à avant...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  // ... reste des styles
  purchasingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchasingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 16,
  },
});
```

## Étape 4 : Créer les entitlements dans RevenueCat

1. Va dans **RevenueCat Dashboard > Entitlements**
2. Crée un entitlement nommé `premium`
3. Associe tous tes produits à cet entitlement

## Étape 5 : Tester l'intégration

### 5.1 Build le projet

```bash
# Pour iOS
npx expo run:ios

# Pour Android
npx expo run:android
```

### 5.2 Tester avec le Sandbox

**iOS :**
1. Va dans Settings > App Store > Sandbox Account
2. Connecte-toi avec un compte test (créé dans App Store Connect)

**Android :**
1. Assure-toi que ton compte est un testeur dans Google Play Console
2. Télécharge l'APK de test

### 5.3 Vérifier les webhooks

RevenueCat peut envoyer des webhooks à ton backend Supabase pour synchroniser les statuts d'abonnement.

## Étape 6 : Synchronisation avec Supabase (Optionnel mais recommandé)

Pour garder une trace des abonnements dans ta base de données :

1. Crée une table `subscriptions` dans Supabase
2. Configure les webhooks RevenueCat pour notifier Supabase
3. Utilise les webhooks pour mettre à jour le statut dans ta DB

## Ressources

- Documentation officielle : [https://www.revenuecat.com/docs/getting-started/installation/expo](https://www.revenuecat.com/docs/getting-started/installation/expo)
- Dashboard RevenueCat : [https://app.revenuecat.com](https://app.revenuecat.com)
- Testing Guide : [https://www.revenuecat.com/docs/test-and-launch/sandbox](https://www.revenuecat.com/docs/test-and-launch/sandbox)

## Notes importantes

- **RevenueCat NE fonctionne PAS sur web** - uniquement iOS et Android
- Les tests doivent se faire sur un **appareil réel ou simulateur**, pas dans l'app web
- Utilise les **comptes sandbox** pour tester sans vrais paiements
- RevenueCat gère automatiquement les **validations de reçus**
- Les **webhooks** permettent de synchroniser avec ton backend
