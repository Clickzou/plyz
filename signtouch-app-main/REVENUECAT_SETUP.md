# Configuration RevenueCat pour les Abonnements

## Pourquoi RevenueCat ?

RevenueCat est la solution recommandée pour gérer les abonnements et achats in-app sur mobile (iOS et Android). Il gère automatiquement :
- Les achats sur App Store (iOS)
- Les achats sur Google Play (Android)
- La validation des reçus
- Le renouvellement automatique
- Les remboursements
- Les analyses et statistiques

## Étapes d'Installation

### 1. Créer un compte RevenueCat

1. Allez sur [https://www.revenuecat.com/](https://www.revenuecat.com/)
2. Créez un compte gratuit
3. Créez un nouveau projet

### 2. Configurer les Produits

Dans le dashboard RevenueCat :

1. **Créer des produits dans App Store Connect (iOS)**
   - Produit ID: `signtouch_trial_7days` (essai 7 jours)
   - Produit ID: `signtouch_monthly` (mensuel 2.99€)
   - Produit ID: `signtouch_yearly` (annuel 19.99€)

2. **Créer des produits dans Google Play Console (Android)**
   - Même IDs que pour iOS

3. **Configurer dans RevenueCat**
   - Créer un "Entitlement" appelé "premium"
   - Associer tous vos produits à cet entitlement

### 3. Installer le SDK RevenueCat

**Important** : Cette étape nécessite d'exporter le projet Bolt vers votre machine locale.

```bash
# Exporter le projet et ouvrir dans votre éditeur (VS Code, Cursor, etc.)
npx expo install react-native-purchases
```

### 4. Configurer RevenueCat dans le Code

Dans votre fichier `app/_layout.tsx`, ajoutez l'initialisation :

```typescript
import { useEffect } from 'react';
import Purchases from 'react-native-purchases';

export default function RootLayout() {
  useEffect(() => {
    // Initialiser RevenueCat
    if (Platform.OS === 'ios') {
      Purchases.configure({ apiKey: 'VOTRE_CLE_IOS' });
    } else if (Platform.OS === 'android') {
      Purchases.configure({ apiKey: 'VOTRE_CLE_ANDROID' });
    }
  }, []);

  // ... reste du code
}
```

### 5. Implémenter l'Achat

Dans `components/SubscriptionOfferModal.tsx`, remplacez le code de simulation :

```typescript
const handleSubscribe = async () => {
  setIsSubscribing(true);

  try {
    // Récupérer les packages disponibles
    const offerings = await Purchases.getOfferings();

    let packageToPurchase;

    if (selectedPlan === 'trial') {
      // Package avec essai gratuit de 7 jours
      packageToPurchase = offerings.current?.availablePackages.find(
        pkg => pkg.product.identifier === 'signtouch_trial_7days'
      );
    } else if (selectedPlan === 'yearly') {
      packageToPurchase = offerings.current?.annual;
    } else if (selectedPlan === 'monthly') {
      packageToPurchase = offerings.current?.monthly;
    }

    if (packageToPurchase) {
      // Effectuer l'achat
      const purchaseResult = await Purchases.purchasePackage(packageToPurchase);

      // Vérifier si l'utilisateur a accès au premium
      if (purchaseResult.customerInfo.entitlements.active['premium']) {
        await setStatus('paid');
        console.log('✅ Abonnement activé !');
        onClose();
      }
    }
  } catch (error) {
    console.error('Erreur lors de l\'achat:', error);
    // Gérer l'erreur (l'utilisateur a annulé, erreur réseau, etc.)
  } finally {
    setIsSubscribing(false);
  }
};
```

### 6. Vérifier le Statut d'Abonnement

Dans `contexts/SubscriptionContext.tsx`, ajoutez une vérification avec RevenueCat :

```typescript
useEffect(() => {
  const checkSubscription = async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo();

      if (customerInfo.entitlements.active['premium']) {
        setStatus('paid');
      } else {
        setStatus('free');
      }
    } catch (error) {
      console.error('Erreur vérification abonnement:', error);
    }
  };

  checkSubscription();
}, []);
```

## Configuration des Stores

### App Store Connect (iOS)

1. Créez votre app dans App Store Connect
2. Allez dans "App Store > Achats intégrés"
3. Créez 3 abonnements auto-renouvelables :
   - 7 jours gratuits puis 19.99€/an
   - 2.99€/mois
   - 19.99€/an

### Google Play Console (Android)

1. Créez votre app dans Google Play Console
2. Allez dans "Monétisation > Produits > Abonnements"
3. Créez les mêmes 3 abonnements

## Test en Mode Sandbox

### iOS
- Créez un compte sandbox dans App Store Connect
- Utilisez-le pour tester les achats sans payer

### Android
- Ajoutez des testeurs dans Google Play Console
- Ils pourront tester les achats gratuitement

## Important

**Le système d'abonnement actuel est une simulation**. Pour un vrai système de paiement :

1. Vous DEVEZ exporter le projet depuis Bolt
2. Installer RevenueCat sur votre machine locale
3. Configurer les produits dans les consoles App Store et Google Play
4. Tester avec les comptes sandbox

**Note** : Les achats in-app ne fonctionnent pas dans l'environnement Bolt/preview web. Ils nécessitent une vraie app mobile.

## Ressources

- [Documentation RevenueCat](https://docs.revenuecat.com/)
- [RevenueCat avec Expo](https://docs.revenuecat.com/docs/reactnative)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [Google Play Console](https://play.google.com/console/)
