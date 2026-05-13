# Checklist pré-publication Plyz

Cette checklist te guide étape par étape pour t'assurer que tout est prêt avant de publier Plyz.

---

## Étape 1 : Corriger le problème d'authentification (PRIORITAIRE)

### Configurer Supabase pour la production

Actuellement, le lien de confirmation d'email redirige vers `localhost:3000`. Il faut **absolument** configurer Supabase avant la publication.

- [ ] Va sur [app.supabase.com](https://app.supabase.com)
- [ ] Ouvre ton projet : **wwuxaoggbvgmyzcjlgfx**
- [ ] Va dans **Authentication** → **URL Configuration**
- [ ] Ajoute ces URLs dans **Redirect URLs** :
  ```
  plyz://auth-callback
  https://ton-domaine.com/auth-callback
  ```
- [ ] **Supprime** les URLs de développement (`exp://...`) avant la publication
- [ ] Clique sur **Save**

**Important** : En production, les URLs Expo Go (`exp://...`) ne fonctionneront plus. Tu dois utiliser le scheme de l'app : `plyz://`

### Tester l'authentification en production

- [ ] Build l'app en mode production (voir étape 5)
- [ ] Installe l'app sur un vrai téléphone
- [ ] Crée un compte avec ton email
- [ ] Vérifie que tu reçois l'email
- [ ] Clique sur le lien dans l'email
- [ ] Vérifie que l'app s'ouvre correctement
- [ ] Vérifie que tu es bien connecté

---

## Étape 2 : Préparer les assets

### Icône de l'app

Tu as déjà une icône dans `assets/images/icon.png`.

- [ ] Vérifie que l'icône est à **1024x1024px**
- [ ] Vérifie que l'icône est en **PNG sans transparence** (fond noir)
- [ ] Optionnel : Améliore l'icône si nécessaire

### Créer une Feature Graphic (Android uniquement)

- [ ] Crée une image **1024x500px**
- [ ] Design suggestion :
  - Logo de l'app à gauche
  - Texte "Plyz - Signez vos photos" à droite
  - Fond dégradé noir/vert
- [ ] Sauvegarde dans `assets/images/feature-graphic.png`

### Prendre des screenshots

Tu as déjà des images d'écrans dans `assets/images/`. Utilise-les comme référence.

#### Pour iOS (iPhone)

Screenshots nécessaires : **iPhone 6.7"** (1290x2796px)

- [ ] **Screenshot 1** : Écran d'accueil avec les 4 boutons principaux
- [ ] **Screenshot 2** : Écran de prise de photo ou édition
- [ ] **Screenshot 3** : Écran d'ajout de signature avec les polices
- [ ] **Screenshot 4** : Résultat final avec photo signée
- [ ] **Screenshot 5** : Galerie de créations

**Comment les créer** :
1. Ouvre l'app sur un simulateur iPhone 15 Pro Max
2. Navigue vers chaque écran
3. Appuie sur `Cmd + S` pour sauvegarder
4. Optionnel : Ajoute du texte marketing avec Figma/Canva

#### Pour Android (Phone)

Screenshots nécessaires : **Minimum 2** (idéalement 5)

- [ ] Même chose que pour iOS
- [ ] Format : 1080x1920px minimum

### Créer un dossier assets

- [ ] Crée un dossier `store-assets/`
- [ ] Organise :
  ```
  store-assets/
    ios/
      screenshots/
        1-home.png
        2-camera.png
        3-signature.png
        4-result.png
        5-gallery.png
    android/
      screenshots/
        1-home.png
        2-camera.png
        3-signature.png
        4-result.png
        5-gallery.png
      feature-graphic.png
  ```

---

## Étape 3 : Préparer les textes

### Description de l'app

#### Version courte (80 caractères pour Play Store)

```
Signez vos photos facilement avec Plyz
```

#### Version longue (pour les deux stores)

```
Plyz vous permet de signer vos photos facilement et rapidement.

✨ FONCTIONNALITÉS

• Prenez une photo ou importez-en une depuis votre galerie
• Ajoutez votre signature personnalisée en quelques taps
• Choisissez parmi 50+ polices de caractères élégantes
• Personnalisez la taille, la couleur et la position
• Sauvegardez vos photos signées en haute qualité
• Gérez toutes vos créations dans la galerie intégrée
• Interface fluide et intuitive
• Disponible en 15 langues

📸 SIMPLE ET INTUITIF

En quelques secondes, ajoutez votre signature à n'importe quelle photo. Parfait pour les photographes, créateurs de contenu, ou toute personne voulant protéger ses images.

🔒 SÉCURISÉ ET PRIVÉ

Toutes vos photos restent sur votre appareil. Aucune donnée n'est envoyée vers des serveurs externes. Votre vie privée est respectée.

⭐ TOTALEMENT GRATUIT

Toutes les fonctionnalités sont accessibles gratuitement, sans abonnement.

💬 SUPPORT

Une question ? Un problème ? Contactez-nous à : support@plyz.app

Plyz est développé avec passion pour vous offrir la meilleure expérience de signature photo.
```

### Mots-clés (App Store uniquement)

Liste de mots-clés séparés par des virgules (100 caractères max) :

```
signature,photo,watermark,filigrane,image,photographer,photographie,sign,marque,brand
```

### Notes de version

```
🎉 Première version de Plyz !

• Signature de photos en quelques taps
• 50+ polices de caractères
• Galerie de créations
• Interface disponible en 15 langues
• Mode sombre
• Totalement gratuit

Merci d'avoir téléchargé Plyz ! N'hésitez pas à nous laisser un avis.
```

### Créer un email de support

- [ ] Crée un email dédié : `support@plyz.app` (ou utilise ton email perso)
- [ ] Configure les réponses automatiques si nécessaire

---

## Étape 4 : Créer la politique de confidentialité

### Option 1 : Utiliser un générateur (recommandé)

- [ ] Va sur [Termly](https://termly.io/products/privacy-policy-generator/) ou [PrivacyPolicies](https://www.privacypolicies.com/privacy-policy-generator/)
- [ ] Remplis le formulaire :
  - App name: Plyz
  - Données collectées: Email (pour l'authentification)
  - Services tiers: Supabase, Stripe
- [ ] Génère la politique
- [ ] Copie le HTML généré

### Option 2 : Créer manuellement

Crée un fichier `privacy-policy.html` avec ce contenu minimum :

```html
<!DOCTYPE html>
<html>
<head>
  <title>Plyz - Politique de Confidentialité</title>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #10b981; }
    h2 { color: #333; margin-top: 30px; }
  </style>
</head>
<body>
  <h1>Plyz - Politique de Confidentialité</h1>
  <p>Date de mise à jour : [DATE]</p>

  <h2>1. Données collectées</h2>
  <p>Plyz collecte uniquement votre adresse email pour l'authentification.</p>

  <h2>2. Utilisation des données</h2>
  <p>Votre email est utilisé uniquement pour vous permettre de vous connecter et sauvegarder vos préférences.</p>

  <h2>3. Stockage des photos</h2>
  <p>Toutes vos photos sont stockées localement sur votre appareil. Aucune photo n'est envoyée vers nos serveurs.</p>

  <h2>4. Services tiers</h2>
  <p>Nous utilisons :</p>
  <ul>
    <li>Supabase pour l'authentification sécurisée</li>
    <li>Stripe pour le traitement des paiements</li>
  </ul>

  <h2>5. Vos droits</h2>
  <p>Vous pouvez à tout moment :</p>
  <ul>
    <li>Supprimer votre compte</li>
    <li>Demander l'accès à vos données</li>
    <li>Demander la suppression de vos données</li>
  </ul>
  <p>Contactez-nous à : support@plyz.app</p>

  <h2>6. Contact</h2>
  <p>Pour toute question sur cette politique : support@plyz.app</p>
</body>
</html>
```

### Héberger la politique

**Option A : GitHub Pages (gratuit)** :
- [ ] Crée un repo GitHub : `plyz-privacy`
- [ ] Upload `privacy-policy.html`
- [ ] Active GitHub Pages dans Settings
- [ ] URL finale : `https://ton-username.github.io/plyz-privacy/privacy-policy.html`

**Option B : Ton propre site** :
- [ ] Upload sur ton hébergement web
- [ ] URL : `https://ton-domaine.com/privacy-policy.html`

### Créer aussi les Terms of Service (optionnel mais recommandé)

- [ ] Crée un fichier similaire `terms-of-service.html`
- [ ] Héberge de la même manière

---

## Étape 5 : Créer les comptes développeur

### Apple Developer Program

- [ ] Va sur [developer.apple.com](https://developer.apple.com)
- [ ] Clique sur "Account"
- [ ] Inscris-toi au Apple Developer Program
- [ ] Paie les 99€/an
- [ ] Attends la validation (24-48h)
- [ ] Accepte tous les accords légaux

### Google Play Console

- [ ] Va sur [play.google.com/console](https://play.google.com/console)
- [ ] Crée un compte développeur
- [ ] Paie les 25€ (paiement unique)
- [ ] Remplis les informations requises
- [ ] Accepte les accords développeur

---

## Étape 6 : Builder l'app

### Installer les outils

- [ ] Installe EAS CLI : `npm install -g eas-cli`
- [ ] Connecte-toi : `eas login`
- [ ] Configure le projet : `eas build:configure`

### Configurer eas.json

- [ ] Vérifie que `eas.json` existe
- [ ] Modifie si nécessaire :

```json
{
  "build": {
    "production": {
      "ios": {
        "buildType": "app-store"
      },
      "android": {
        "buildType": "app-bundle"
      }
    },
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "ton-email@example.com",
        "ascAppId": "1234567890"
      },
      "android": {
        "serviceAccountKeyPath": "./service-account.json"
      }
    }
  }
}
```

### Build iOS

- [ ] Lance le build : `eas build --platform ios --profile production`
- [ ] Suis les instructions pour créer les certificats
- [ ] Attends la fin du build (20-30 min)
- [ ] Télécharge le fichier `.ipa` si nécessaire

### Build Android

- [ ] Lance le build : `eas build --platform android --profile production`
- [ ] Attends la fin du build (15-20 min)
- [ ] Télécharge le fichier `.aab`

### Tester les builds

**iOS avec TestFlight** :
- [ ] Upload le build sur App Store Connect
- [ ] Invite des testeurs via TestFlight
- [ ] Teste toutes les fonctionnalités
- [ ] Corrige les bugs si nécessaire

**Android avec Internal Testing** :
- [ ] Upload le build sur Play Console
- [ ] Active Internal Testing
- [ ] Invite des testeurs
- [ ] Teste toutes les fonctionnalités
- [ ] Corrige les bugs si nécessaire

---

## Étape 7 : Préparer App Store Connect (iOS)

### Créer l'app

- [ ] Va sur [App Store Connect](https://appstoreconnect.apple.com)
- [ ] Clique sur "My Apps" → "+" → "New App"
- [ ] Remplis :
  - Platform: iOS
  - Name: Plyz
  - Primary Language: Français
  - Bundle ID: com.plyz.app
  - SKU: plyz-2024

### Remplir les informations

- [ ] **App Information** :
  - Name: Plyz
  - Subtitle: Signez vos photos facilement
  - Category: Photo & Video
  - Privacy Policy URL: [ton URL]
  - Support URL: [ton URL ou email]

- [ ] **Pricing and Availability** :
  - Price: Free
  - Availability: Tous les pays

- [ ] **Prepare for Submission** :
  - Screenshots: Upload tous les screenshots
  - Description: Copie la description longue
  - Keywords: Copie les mots-clés
  - Support Information: Email de support
  - Age Rating: 4+
  - App Review Information:
    - Notes: "L'app nécessite un compte pour sauvegarder les préférences"
    - Demo Account: Crée un compte de test

### Upload le build

- [ ] Dans "Build", sélectionne le build uploadé
- [ ] Attends que le build soit traité

---

## Étape 8 : Préparer Play Console (Android)

### Créer l'app

- [ ] Va sur [Play Console](https://play.google.com/console)
- [ ] Clique sur "Create app"
- [ ] Remplis :
  - App name: Plyz
  - Default language: Français
  - App or game: App
  - Free or paid: Free
  - Declarations: Accepte les termes

### Remplir le Store Listing

- [ ] **Main store listing** :
  - Short description (80 caractères)
  - Full description
  - App icon (512x512px)
  - Feature graphic (1024x500px)
  - Screenshots (minimum 2)
  - Contact details (email)

### Configurer le contenu

- [ ] **App content** :
  - Privacy policy: URL
  - Ads: Non (si tu n'as pas de pubs)
  - Content rating: Remplis le questionnaire → PEGI 3
  - Target audience: Tous les âges
  - News app: Non
  - COVID-19 tracing: Non
  - Data safety: Remplis le formulaire

### Data Safety (important)

Réponds aux questions sur les données collectées :
- [ ] Collectes-tu des données ? **Oui**
- [ ] Quelles données ? **Email uniquement**
- [ ] Pourquoi ? **Authentification**
- [ ] Les données sont-elles chiffrées ? **Oui**
- [ ] Les utilisateurs peuvent-ils demander la suppression ? **Oui**

---

## Étape 9 : Soumettre pour review

### iOS (App Store)

- [ ] Vérifie que tout est rempli dans App Store Connect
- [ ] Vérifie que le build est sélectionné
- [ ] Clique sur "Submit for Review"
- [ ] Réponds aux questions additionnelles
- [ ] Confirme la soumission
- [ ] Attends la review (24-48h généralement)

### Android (Play Store)

- [ ] Va dans Release → Production
- [ ] Clique sur "Create new release"
- [ ] Upload le fichier `.aab`
- [ ] Entre les release notes
- [ ] Définis le rollout (commence avec 20% si tu veux)
- [ ] Review tous les détails
- [ ] Clique sur "Start rollout to Production"
- [ ] Attends la review (quelques heures à 2 jours)

---

## Étape 10 : Pendant la review

### Surveiller le statut

- [ ] Check App Store Connect quotidiennement
- [ ] Check Play Console quotidiennement
- [ ] Réponds rapidement si des infos supplémentaires sont demandées

### Préparer le marketing

- [ ] Crée des posts pour les réseaux sociaux
- [ ] Prépare un site web pour l'app (optionnel)
- [ ] Prépare un email pour tes contacts
- [ ] Crée des visuels marketing

### Si l'app est rejetée

- [ ] Lis attentivement les raisons du rejet
- [ ] Corrige les problèmes identifiés
- [ ] Re-build si nécessaire
- [ ] Re-soumets avec une note expliquant les corrections

---

## Étape 11 : Après l'acceptation

### Le jour du lancement

- [ ] Vérifie que l'app est bien visible sur les stores
- [ ] Télécharge l'app et teste une dernière fois
- [ ] Partage sur les réseaux sociaux
- [ ] Envoie des emails à tes contacts
- [ ] Demande à tes amis de laisser des avis

### Les premières semaines

- [ ] Réponds à tous les avis (positifs et négatifs)
- [ ] Surveille les crashes dans les consoles
- [ ] Note les bugs remontés par les utilisateurs
- [ ] Prépare une première mise à jour si nécessaire

### Optimisation continue

- [ ] Analyse les métriques (téléchargements, rétention)
- [ ] Optimise les screenshots si le taux de conversion est faible
- [ ] Expérimente avec différents textes de description
- [ ] Ajoute des mots-clés supplémentaires
- [ ] Mets à jour régulièrement pour rester dans les nouveautés

---

## Problèmes courants et solutions

### "Invalid Bundle Identifier" (iOS)

**Cause** : Le Bundle ID ne correspond pas
**Solution** : Vérifie que `bundleIdentifier` dans `app.json` correspond à celui dans App Store Connect

### "Missing Privacy Policy" (les deux stores)

**Cause** : URL de la politique non accessible
**Solution** : Vérifie que ton URL est publique et accessible depuis un navigateur

### "App crashes on launch" (les deux stores)

**Cause** : Erreur dans le code ou configuration manquante
**Solution** : Teste avec TestFlight/Internal Testing avant de soumettre

### "Redirect URL not working" (authentification)

**Cause** : URLs Supabase mal configurées
**Solution** : Utilise `plyz://auth-callback` en production, pas `exp://`

---

## Timeline estimé

### Si tu travailles à temps plein

- **Jour 1-2** : Création des comptes développeur (attente de validation)
- **Jour 3** : Préparation des assets (screenshots, descriptions)
- **Jour 4** : Builds et tests avec TestFlight/Internal Testing
- **Jour 5** : Corrections des bugs trouvés
- **Jour 6** : Soumission aux stores
- **Jour 7-9** : Attente de la review et publication

### Si tu travailles à temps partiel

Compte environ 2-3 semaines du début à la fin.

---

## Contacts utiles

### Support technique

- **Expo** : https://chat.expo.dev
- **Supabase** : https://supabase.com/dashboard/support
- **Stripe** : https://support.stripe.com

### Documentations

- **EAS Build** : https://docs.expo.dev/build/introduction/
- **App Store Review Guidelines** : https://developer.apple.com/app-store/review/guidelines/
- **Play Store Policy** : https://play.google.com/about/developer-content-policy/

---

## Dernier conseil

**Ne te précipite pas !** Prends le temps de bien tester l'app avant de soumettre. Une première impression négative est difficile à rattraper.

Bonne chance avec le lancement de Plyz ! 🚀
