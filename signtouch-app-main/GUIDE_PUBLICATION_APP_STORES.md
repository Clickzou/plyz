# Guide complet : Publier SignTouch sur Apple App Store et Google Play Store

Ce guide te accompagne pas à pas pour publier ton app SignTouch sur les stores mobiles.

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Préparation de l'app](#préparation-de-lapp)
4. [Configuration des comptes développeur](#configuration-des-comptes-développeur)
5. [Configuration RevenueCat](#configuration-revenuecat)
6. [Build de l'app](#build-de-lapp)
7. [Soumission App Store (iOS)](#soumission-app-store-ios)
8. [Soumission Play Store (Android)](#soumission-play-store-android)
9. [Après la publication](#après-la-publication)
10. [Checklist finale](#checklist-finale)

---

## Vue d'ensemble

Pour publier SignTouch, tu vas devoir :

1. **Créer des comptes développeur** (Apple et Google) - Coût : 99€/an (Apple) + 25€ unique (Google)
2. **Configurer RevenueCat** pour les abonnements
3. **Préparer les assets** (icônes, screenshots, descriptions)
4. **Builder l'app** avec Expo EAS
5. **Soumettre l'app** aux stores
6. **Attendre la validation** (1-3 jours Apple, quelques heures Google)

**Temps estimé total** : 2-3 jours de travail

---

## Prérequis

### Comptes nécessaires

- [ ] Compte Apple Developer (99€/an)
- [ ] Compte Google Play Console (25€ unique)
- [ ] Compte Expo (gratuit)
- [ ] Compte RevenueCat (gratuit jusqu'à 10k$/mois)

### Outils nécessaires

- [ ] Node.js installé
- [ ] Expo CLI installé (`npm install -g expo-cli`)
- [ ] EAS CLI installé (`npm install -g eas-cli`)
- [ ] Un Mac pour le build iOS (ou utiliser EAS Build)

### Informations à préparer

- [ ] Nom de l'app dans les stores (peut être différent de "SignTouch")
- [ ] Description courte (80 caractères max)
- [ ] Description longue (4000 caractères max)
- [ ] Mots-clés pour l'App Store
- [ ] Catégorie principale (Photo & Video)
- [ ] Email de support
- [ ] URL du site web (optionnel)
- [ ] Politique de confidentialité (URL publique requise)

---

## Préparation de l'app

### 1. Vérifier que tout fonctionne

Avant de builder, teste toutes les fonctionnalités :

```bash
# Démarre l'app
npm run dev

# Teste sur un vrai téléphone avec Expo Go
# Scanner le QR code et tester :
```

**Checklist de test** :
- [ ] Prendre une photo avec la caméra
- [ ] Importer une photo de la galerie
- [ ] Ajouter une signature
- [ ] Changer la police de la signature
- [ ] Sauvegarder la photo signée
- [ ] Créer un compte utilisateur
- [ ] Se connecter avec le lien email
- [ ] Changer de langue
- [ ] Partager l'app

### 2. Mettre à jour les informations de l'app

Modifie `app.json` :

```json
{
  "expo": {
    "name": "SignTouch",
    "slug": "signtouch",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "signtouch",

    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.signtouch.app",
      "buildNumber": "1"
    },

    "android": {
      "package": "com.signtouch.app",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/icon.png",
        "backgroundColor": "#000000"
      }
    }
  }
}
```

**Important** : Change `com.signtouch.app` par un identifiant unique si nécessaire.

### 3. Créer les assets pour les stores

Tu auras besoin de :

#### Pour iOS (App Store)

- **Icône de l'app** : 1024x1024px (déjà dans `assets/images/icon.png`)
- **Screenshots iPhone** :
  - iPhone 6.7" (1290x2796px) : Minimum 3 screenshots
  - iPhone 6.5" (1242x2688px) : Minimum 3 screenshots
- **Screenshots iPad** (optionnel mais recommandé) :
  - iPad Pro 12.9" (2048x2732px) : Minimum 2 screenshots

#### Pour Android (Play Store)

- **Icône de l'app** : 512x512px
- **Feature Graphic** : 1024x500px (bannière en haut de la page store)
- **Screenshots** :
  - Téléphone : 1080x1920px minimum, 3840x2160px maximum
  - Minimum 2 screenshots, maximum 8

#### Comment créer les screenshots

1. **Utilise un émulateur ou un vrai téléphone**
2. **Ouvre l'app et navigue vers les écrans importants** :
   - Écran d'accueil avec les fonctionnalités
   - Écran de prise de photo
   - Écran d'ajout de signature
   - Écran de résultat avec photo signée
   - Écran de galerie
3. **Prends des captures d'écran**
4. **Optionnel** : Ajoute du texte marketing sur les screenshots avec Figma ou Canva

### 4. Créer une politique de confidentialité

**Obligatoire** pour les deux stores. Tu dois héberger une politique de confidentialité publique.

Crée un fichier `privacy-policy.html` et héberge-le sur :
- GitHub Pages (gratuit)
- Ton propre site web
- Un service comme Termly (génère automatiquement)

**Contenu minimum** :
- Quelles données tu collectes (email, photos locales)
- Comment tu utilises les données
- Avec qui tu partages les données (Supabase)
- Comment les utilisateurs peuvent supprimer leurs données
- Contact pour les questions

Exemple de structure :
```
SignTouch - Politique de Confidentialité

1. Données collectées
   - Adresse email (pour l'authentification)
   - Photos (stockées localement sur l'appareil)

2. Utilisation des données
   - Email : Authentification et communication
   - Photos : Traitement local uniquement

3. Partage des données
   - Supabase (hébergement sécurisé des comptes)
   - Aucune autre donnée n'est partagée avec des tiers

4. Droits des utilisateurs
   - Suppression du compte : contact@signtouch.app
   - Accès aux données : contact@signtouch.app

Date de mise à jour : [Date]
```

---

## Configuration des comptes développeur

### Apple Developer Program

1. **Va sur [developer.apple.com](https://developer.apple.com)**
2. **Clique sur "Account"**
3. **Inscris-toi au Apple Developer Program** (99€/an)
4. **Attends la validation** (24-48h généralement)
5. **Accepte les accords légaux**

### Google Play Console

1. **Va sur [play.google.com/console](https://play.google.com/console)**
2. **Crée un compte développeur** (25€ unique)
3. **Remplis les informations** (nom, adresse, etc.)
4. **Accepte les accords développeur**

---

## Configuration RevenueCat

RevenueCat gère les abonnements in-app. C'est **essentiel** car ton app utilise déjà le code RevenueCat.

### 1. Créer un compte RevenueCat

1. **Va sur [revenuecat.com](https://www.revenuecat.com)**
2. **Inscris-toi gratuitement**
3. **Crée un nouveau projet** : "SignTouch"

### 2. Configurer iOS

1. **Dans RevenueCat Dashboard** → Apps → Add App → iOS
2. **Entre les informations** :
   - App name: SignTouch
   - Bundle ID: `com.signtouch.app`
3. **Shared Secret** :
   - Va sur [App Store Connect](https://appstoreconnect.apple.com)
   - Users and Access → Shared Secret → Generate
   - Copie le secret dans RevenueCat

### 3. Configurer Android

1. **Dans RevenueCat Dashboard** → Apps → Add App → Android
2. **Entre les informations** :
   - App name: SignTouch
   - Package name: `com.signtouch.app`
3. **Service Credentials** :
   - Suis le guide RevenueCat pour créer un service account
   - Upload le fichier JSON dans RevenueCat

### 4. Créer les produits d'abonnement

Dans RevenueCat → Products :

1. **Crée un produit** : "SignTouch Premium"
   - Product ID: `signtouch_premium_monthly`
   - Type: Subscription
   - Duration: 1 month
   - Price: (à définir, ex: 4.99€)

2. **Crée les offerings** :
   - Default offering: Premium
   - Package: Monthly

### 5. Créer les produits dans les stores

#### App Store Connect

1. **Va sur App Store Connect** → My Apps → (ton app) → Features → In-App Purchases
2. **Crée un Auto-Renewable Subscription**
3. **Entre les infos** :
   - Product ID: `signtouch_premium_monthly` (même que RevenueCat)
   - Reference Name: SignTouch Premium Monthly
   - Subscription Group: Premium Subscriptions
   - Duration: 1 month
   - Price: 4.99€

#### Google Play Console

1. **Va sur Play Console** → (ton app) → Monetization → Subscriptions
2. **Crée un produit d'abonnement**
3. **Entre les infos** :
   - Product ID: `signtouch_premium_monthly`
   - Name: SignTouch Premium
   - Billing period: 1 month
   - Price: 4.99€

### 6. Mettre à jour le code

Dans `.env`, ajoute ta clé RevenueCat :

```bash
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=rcb_your_ios_key_here
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=rcb_your_android_key_here
```

**Important** : Tu dois récupérer ces clés dans RevenueCat Dashboard → API Keys

---

## Build de l'app

### 1. Installer EAS CLI

```bash
npm install -g eas-cli
```

### 2. Configurer EAS

```bash
# Se connecter à Expo
eas login

# Configurer le projet
eas build:configure
```

Cela crée un fichier `eas.json`. Modifie-le si nécessaire :

```json
{
  "build": {
    "production": {
      "ios": {
        "buildType": "app-store"
      },
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### 3. Build iOS

```bash
# Build pour l'App Store
eas build --platform ios --profile production
```

Tu devras :
- Créer un Apple Distribution Certificate
- Créer un Provisioning Profile
- EAS te guidera dans le processus

**Durée** : 20-30 minutes

Une fois terminé, tu auras un fichier `.ipa` que tu pourras uploader sur App Store Connect.

### 4. Build Android

```bash
# Build pour le Play Store
eas build --platform android --profile production
```

**Durée** : 15-20 minutes

Une fois terminé, tu auras un fichier `.aab` (Android App Bundle) que tu pourras uploader sur Play Console.

---

## Soumission App Store (iOS)

### 1. Créer l'app dans App Store Connect

1. **Va sur [App Store Connect](https://appstoreconnect.apple.com)**
2. **Clique sur "My Apps"** → "+" → "New App"
3. **Remplis les informations** :
   - Platform: iOS
   - Name: SignTouch
   - Primary Language: Français
   - Bundle ID: com.signtouch.app
   - SKU: signtouch-001

### 2. Remplir les informations de l'app

Dans l'onglet **App Information** :
- **Name** : SignTouch
- **Subtitle** : Signez vos photos facilement
- **Category** : Photo & Video
- **Privacy Policy URL** : [ton URL]
- **Support URL** : [ton site ou email]

Dans l'onglet **Pricing and Availability** :
- **Price** : Free
- **Availability** : Tous les pays

### 3. Préparer la soumission

Dans **Version 1.0** → **Prepare for Submission** :

1. **Screenshots** : Upload tes screenshots
2. **Description** :
   ```
   SignTouch vous permet de signer vos photos facilement et rapidement.

   FONCTIONNALITÉS :
   • Prenez une photo ou importez-en une depuis votre galerie
   • Ajoutez votre signature personnalisée
   • Choisissez parmi 50+ polices différentes
   • Sauvegardez et partagez vos photos signées
   • Gérez vos créations dans la galerie intégrée
   • Interface disponible en 15 langues

   SIMPLE ET INTUITIF
   En quelques secondes, signez n'importe quelle photo et partagez-la.

   SÉCURISÉ ET PRIVÉ
   Toutes vos photos restent sur votre appareil. Aucune donnée n'est partagée.
   ```

3. **Keywords** :
   ```
   signature,photo,watermark,image,sign,filigrane,photographer,marque
   ```

4. **Support Information** :
   - Email: ton-email@domain.com
   - Phone: (optionnel)
   - URL: (optionnel)

5. **Age Rating** :
   - Répondre aux questions → Probablement 4+

6. **App Review Information** :
   - Sign-In Required: Oui
   - Demo Account: Crée un compte de test
   - Notes: "L'app nécessite un compte pour sauvegarder les signatures"

### 4. Uploader le build

1. **Dans Xcode ou avec Transporter**
2. **Sélectionne le fichier .ipa** généré par EAS
3. **Upload vers App Store Connect**
4. **Attends le traitement** (5-10 minutes)
5. **Sélectionne le build** dans "Build" section

### 5. Soumettre pour review

1. **Vérifie que tout est rempli**
2. **Clique sur "Submit for Review"**
3. **Réponds aux questions additionnelles**
4. **Confirme la soumission**

**Délai de review** : 24-48 heures généralement

---

## Soumission Play Store (Android)

### 1. Créer l'app dans Play Console

1. **Va sur [Play Console](https://play.google.com/console)**
2. **Clique sur "Create app"**
3. **Remplis les informations** :
   - App name: SignTouch
   - Default language: Français
   - App or game: App
   - Free or paid: Free

### 2. Remplir le questionnaire

Tu devras répondre à plusieurs questions sur :
- Type d'app
- Catégorie (Photography)
- Privacy policy
- Ads (Non si tu n'en as pas)
- etc.

### 3. Configurer le Store Listing

Dans **Store presence** → **Main store listing** :

1. **Short description** (80 caractères) :
   ```
   Signez vos photos facilement avec SignTouch
   ```

2. **Full description** (4000 caractères) :
   ```
   SignTouch vous permet de signer vos photos facilement et rapidement.

   FONCTIONNALITÉS :
   • Prenez une photo ou importez-en une depuis votre galerie
   • Ajoutez votre signature personnalisée
   • Choisissez parmi 50+ polices différentes
   • Sauvegardez et partagez vos photos signées
   • Gérez vos créations dans la galerie intégrée
   • Interface disponible en 15 langues

   SIMPLE ET INTUITIF
   En quelques secondes, signez n'importe quelle photo et partagez-la.

   SÉCURISÉ ET PRIVÉ
   Toutes vos photos restent sur votre appareil. Aucune donnée n'est partagée.

   GRATUIT AVEC OPTION PREMIUM
   Utilisez gratuitement les fonctionnalités de base. Passez en Premium pour débloquer toutes les polices et fonctionnalités avancées.
   ```

3. **Graphics** :
   - App icon: 512x512px
   - Feature graphic: 1024x500px
   - Screenshots: Minimum 2

4. **Contact details** :
   - Email: ton-email@domain.com
   - Website: (optionnel)
   - Phone: (optionnel)

### 4. Configurer le Content Rating

Dans **Policy** → **App content** → **Content ratings** :

1. **Commence le questionnaire**
2. **Sélectionne la catégorie** : Utility, Productivity, Communication, or Other
3. **Réponds aux questions**
4. **Obtiens ta classification** (probablement PEGI 3 ou Everyone)

### 5. Configurer la politique de confidentialité

Dans **Policy** → **App content** → **Privacy policy** :

1. **Entre l'URL** de ta politique de confidentialité
2. **Sauvegarde**

### 6. Uploader le build

Dans **Release** → **Production** → **Create new release** :

1. **Upload ton fichier .aab**
2. **Entre les Release notes** :
   ```
   Première version de SignTouch !

   • Signature de photos
   • 50+ polices de caractères
   • Galerie de créations
   • Interface multilingue
   ```

3. **Définis l'audience** (tous les pays)
4. **Review les détails**

### 7. Soumettre pour review

1. **Clique sur "Review release"**
2. **Vérifie tous les détails**
3. **Clique sur "Start rollout to Production"**

**Délai de review** : Quelques heures à 1-2 jours

---

## Après la publication

### 1. Surveiller les reviews

- Réponds aux avis utilisateurs rapidement
- Note les bugs remontés
- Remercie les avis positifs

### 2. Analyser les métriques

Dans **App Store Connect** et **Play Console**, regarde :
- Nombre de téléchargements
- Taux de conversion
- Taux de rétention
- Crashes

### 3. Préparer les mises à jour

Pour publier une mise à jour :

1. **Modifie le code**
2. **Incrémente la version** dans `app.json` :
   ```json
   {
     "version": "1.0.1",
     "ios": { "buildNumber": "2" },
     "android": { "versionCode": 2 }
   }
   ```
3. **Build avec EAS** : `eas build --platform all --profile production`
4. **Soumets la nouvelle version** sur les stores

---

## Checklist finale

### Avant le build

- [ ] Tous les tests passent
- [ ] L'authentification fonctionne
- [ ] Les URLs de redirection Supabase sont configurées
- [ ] RevenueCat est configuré
- [ ] Les clés API sont dans `.env`
- [ ] Les icônes sont à 1024x1024px
- [ ] La version est correcte dans `app.json`

### Assets préparés

- [ ] Icône de l'app (1024x1024px)
- [ ] Screenshots iPhone (minimum 3)
- [ ] Screenshots iPad (minimum 2, optionnel)
- [ ] Screenshots Android (minimum 2)
- [ ] Feature Graphic Android (1024x500px)
- [ ] Politique de confidentialité (URL publique)

### Comptes créés

- [ ] Apple Developer Program (payé)
- [ ] Google Play Console (payé)
- [ ] RevenueCat configuré
- [ ] Produits d'abonnement créés
- [ ] Service accounts configurés

### Informations prêtes

- [ ] Description de l'app (FR + EN minimum)
- [ ] Mots-clés pour l'App Store
- [ ] Email de support
- [ ] Compte de test pour Apple Review
- [ ] Release notes

### Soumission

- [ ] Build iOS uploadé sur App Store Connect
- [ ] Build Android uploadé sur Play Console
- [ ] Informations de l'app remplies
- [ ] Screenshots uploadés
- [ ] Content rating complété
- [ ] Soumis pour review

---

## Conseils importants

### 1. Temps de review

- **Apple** : 24-48h généralement, peut aller jusqu'à 1 semaine
- **Google** : Quelques heures à 2 jours

### 2. Causes de rejet fréquentes

#### Apple

- Manque de compte de test fonctionnel
- Politique de confidentialité manquante ou non accessible
- Bugs ou crashes
- Fonctionnalités non documentées
- In-App Purchases mal configurés

#### Google

- Politique de confidentialité manquante
- Permissions non justifiées
- Crashes au démarrage
- Content rating incorrect

### 3. Si ton app est rejetée

1. **Lis attentivement les raisons**
2. **Corrige les problèmes**
3. **Re-build si nécessaire**
4. **Re-soumets avec une note expliquant les corrections**

### 4. Optimisation de la page store

- **Mets des screenshots attrayants** avec du texte marketing
- **Écris une description claire** des bénéfices
- **Mets à jour régulièrement** pour rester dans les nouveautés
- **Réponds aux avis** pour montrer que l'app est maintenue

### 5. Marketing

Après la publication :
- Partage sur les réseaux sociaux
- Crée un site web pour l'app
- Demande aux amis de laisser des avis
- Utilise des hashtags pertinents
- Contacte des blogs spécialisés

---

## Ressources utiles

### Documentation

- **Expo** : https://docs.expo.dev
- **EAS Build** : https://docs.expo.dev/build/introduction/
- **RevenueCat** : https://docs.revenuecat.com
- **App Store Connect** : https://help.apple.com/app-store-connect/
- **Play Console** : https://support.google.com/googleplay/android-developer

### Outils

- **EAS CLI** : https://github.com/expo/eas-cli
- **Transporter** (Apple) : https://apps.apple.com/app/transporter/id1450874784
- **fastlane** (automatisation) : https://fastlane.tools

### Support

- **Expo Discord** : https://chat.expo.dev
- **RevenueCat Discord** : https://www.revenuecat.com/community

---

## Prochaines étapes recommandées

1. **Crée les comptes développeur** (commence par là car la validation prend du temps)
2. **Prépare les assets** (screenshots, icônes, descriptions)
3. **Configure RevenueCat**
4. **Fais un build de test** avec EAS
5. **Teste sur TestFlight (iOS) et Internal Testing (Android)**
6. **Corrige les bugs trouvés**
7. **Soumets aux stores**
8. **Prépare ton plan marketing**

Bonne chance avec le lancement de SignTouch ! 🚀
