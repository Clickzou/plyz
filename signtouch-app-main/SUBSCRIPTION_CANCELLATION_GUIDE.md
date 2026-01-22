# Guide d'annulation d'abonnement

Ce document explique comment les utilisateurs peuvent annuler leur essai gratuit ou abonnement.

## Comment fonctionne l'essai gratuit de 7 jours

### Ce que l'utilisateur doit savoir

1. L'essai gratuit nécessite **une carte bancaire valide**
2. Pendant 7 jours, l'utilisateur n'est **pas débité**
3. À la fin des 7 jours :
   - **Si l'utilisateur n'annule PAS** → il sera automatiquement débité de €19.99 pour l'abonnement annuel
   - **Si l'utilisateur annule** → aucun débit, l'abonnement s'arrête

### Règles importantes

- L'annulation doit être faite **au moins 24 heures avant la fin** de la période d'essai
- L'utilisateur peut annuler à tout moment pendant les 7 jours
- Après annulation, l'accès Premium continue jusqu'à la fin de la période d'essai
- Aucun remboursement prorata si l'utilisateur annule après avoir été débité

## Comment annuler l'abonnement

L'annulation se fait **uniquement via le store** (Apple App Store ou Google Play Store), pas dans l'application.

### Sur iOS (iPhone/iPad)

#### Méthode 1 : Depuis l'appareil

1. Ouvre l'app **Réglages** (Settings)
2. Touche ton **nom** en haut de l'écran
3. Touche **Abonnements**
4. Sélectionne **SignTouch**
5. Touche **Annuler l'abonnement**
6. Confirme l'annulation

#### Méthode 2 : Depuis le Mac

1. Ouvre l'**App Store**
2. Clique sur ton **nom** en bas de la barre latérale
3. Clique sur **Informations sur le compte**
4. Fais défiler jusqu'à **Abonnements**
5. Clique sur **Gérer** à côté de SignTouch
6. Clique sur **Annuler l'abonnement**

### Sur Android (Google Play)

#### Méthode 1 : Depuis l'appareil

1. Ouvre l'app **Google Play Store**
2. Touche ton **profil** en haut à droite
3. Touche **Paiements et abonnements** > **Abonnements**
4. Sélectionne **SignTouch**
5. Touche **Annuler l'abonnement**
6. Suis les instructions à l'écran

#### Méthode 2 : Depuis un navigateur

1. Va sur [play.google.com/store/account/subscriptions](https://play.google.com/store/account/subscriptions)
2. Trouve **SignTouch**
3. Clique sur **Gérer**
4. Clique sur **Annuler l'abonnement**

## Ce qui se passe après l'annulation

### Pendant l'essai gratuit (7 jours)

- L'accès Premium **continue** jusqu'à la fin des 7 jours
- **Aucun débit** ne sera effectué à la fin de la période
- Après les 7 jours, l'utilisateur repasse en mode gratuit

### Après avoir été débité (abonnement actif)

- L'accès Premium **continue** jusqu'à la fin de la période payée
- Pour l'abonnement annuel : jusqu'à la fin de l'année
- Pour l'abonnement mensuel : jusqu'à la fin du mois
- **Aucun remboursement** pour la période déjà payée

## Restaurer un abonnement annulé

Si l'utilisateur change d'avis et veut se réabonner :

1. Retourne dans l'app **SignTouch**
2. Va dans **Compte** > **Abonnement**
3. Sélectionne un plan et confirme

## Ajouter un bouton "Gérer l'abonnement" dans l'app

### Pour iOS

Tu peux ajouter un lien direct vers les paramètres d'abonnement :

```typescript
import { Linking } from 'react-native';

const openSubscriptionManagement = () => {
  Linking.openURL('https://apps.apple.com/account/subscriptions');
};
```

### Pour Android

```typescript
import { Linking } from 'react-native';

const openSubscriptionManagement = () => {
  // Remplace com.tonapp.signtouch par ton package name
  Linking.openURL('https://play.google.com/store/account/subscriptions?package=com.tonapp.signtouch');
};
```

### Avec RevenueCat (recommandé)

RevenueCat fournit une méthode pour ouvrir directement la gestion des abonnements :

```typescript
import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

const openSubscriptionManagement = async () => {
  if (Platform.OS === 'ios') {
    await Purchases.showManagementUI();
  } else {
    // Android
    const customerInfo = await Purchases.getCustomerInfo();
    const managementURL = customerInfo.managementURL;
    if (managementURL) {
      Linking.openURL(managementURL);
    }
  }
};
```

## Intégration dans l'écran Account

Ajoute un bouton "Gérer mon abonnement" dans `app/account.tsx` :

```typescript
<TouchableOpacity
  style={styles.menuItem}
  onPress={openSubscriptionManagement}
>
  <Settings size={20} color="#ffffff" />
  <Text style={styles.menuItemText}>
    {t('manageSubscription')}
  </Text>
  <ChevronRight size={20} color="#666" />
</TouchableOpacity>
```

Et ajoute la traduction dans `locales/fr.ts` :

```typescript
manageSubscription: 'Gérer mon abonnement',
```

## Webhooks RevenueCat (pour synchroniser avec Supabase)

Pour être notifié quand un utilisateur annule, configure les webhooks RevenueCat :

1. Va dans **RevenueCat Dashboard** > **Integrations** > **Webhooks**
2. Ajoute ton URL de webhook (par exemple, une Edge Function Supabase)
3. Écoute l'événement `CANCELLATION`
4. Mets à jour le statut de l'abonnement dans ta base de données

Exemple d'Edge Function :

```typescript
Deno.serve(async (req) => {
  const event = await req.json();

  if (event.type === 'CANCELLATION') {
    const userId = event.app_user_id;

    // Mets à jour le statut dans Supabase
    await supabase
      .from('subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date() })
      .eq('user_id', userId);
  }

  return new Response('OK', { status: 200 });
});
```

## Questions fréquentes

**Q : L'utilisateur peut-il annuler depuis l'app ?**
R : Non, l'annulation doit se faire via le store (Apple ou Google). C'est une exigence des plateformes.

**Q : L'utilisateur sera-t-il remboursé s'il annule pendant l'essai ?**
R : Il n'y a rien à rembourser car il n'a pas encore été débité.

**Q : L'utilisateur sera-t-il remboursé s'il annule après avoir payé ?**
R : Non, il n'y a pas de remboursement prorata. L'accès continue jusqu'à la fin de la période payée.

**Q : Que se passe-t-il si l'utilisateur oublie d'annuler ?**
R : Il sera débité automatiquement à la fin de l'essai. Il peut ensuite annuler mais ne sera pas remboursé.

**Q : L'utilisateur peut-il obtenir un rappel avant la fin de l'essai ?**
R : Oui, tu peux implémenter des notifications push locales dans l'app pour rappeler à l'utilisateur 24h avant la fin de l'essai.

## Conformité légale

Assure-toi que ton app respecte :

- Les conditions d'Apple App Store et Google Play Store
- Les lois de protection du consommateur (notamment européennes)
- Le RGPD pour les utilisateurs européens

Les mentions légales actuelles dans ton app (`paymentLegalText`) sont conformes et transparentes.
