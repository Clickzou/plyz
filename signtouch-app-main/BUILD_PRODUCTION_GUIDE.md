# Guide de Build de Production - SignTouch

## Prérequis

Avant de commencer, assure-toi d'avoir :

1. **Node.js et npm** installés (version 18 ou supérieure)
2. **Un compte Expo** : [Inscription sur expo.dev](https://expo.dev/signup)
3. **EAS CLI installé** globalement

## Étape 1 : Installation et Configuration

### 1.1 Installer EAS CLI

```bash
npm install -g eas-cli
```

### 1.2 Se connecter à Expo

```bash
eas login
```

Entre tes identifiants Expo.

### 1.3 Configurer le projet

```bash
eas build:configure
```

Cette commande a déjà été faite (le fichier `eas.json` est créé).

## Étape 2 : Configuration des environnements

### 2.1 Vérifier les variables d'environnement

Assure-toi que ton fichier `.env` contient toutes les variables nécessaires :

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2.2 Configurer les secrets sur EAS (IMPORTANT)

Pour que tes variables d'environnement soient disponibles dans les builds :

```bash
# Ajouter les secrets un par un
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "your-supabase-url"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-supabase-anon-key"
```

Ou tu peux les ajouter depuis le dashboard Expo : [expo.dev](https://expo.dev)

## Étape 3 : Builds de Test (Preview)

### 3.1 Build Android (APK de test)

```bash
eas build --profile preview --platform android
```

Cette commande va :
- Créer un APK que tu peux installer directement sur Android
- Te donner un lien pour télécharger l'APK
- Durée : environ 10-20 minutes

### 3.2 Build iOS (pour TestFlight)

```bash
eas build --profile preview --platform ios
```

**Note** : Pour iOS, tu auras besoin d'un compte Apple Developer (99$/an).

## Étape 4 : Builds de Production

### 4.1 Build Android Production (APK/AAB)

**Pour un APK (installation directe)** :
```bash
eas build --profile production --platform android
```

**Pour un AAB (Google Play Store)** :
Modifie `eas.json` en changeant `"buildType": "apk"` en `"buildType": "aab"` dans la section production Android, puis :
```bash
eas build --profile production --platform android
```

### 4.2 Build iOS Production

```bash
eas build --profile production --platform ios
```

**Prérequis iOS** :
- Compte Apple Developer actif
- Certificats et profils de provisioning (EAS peut les créer automatiquement)

## Étape 5 : Tester les Builds

### Android
1. Télécharge l'APK depuis le lien fourni par EAS
2. Active "Sources inconnues" sur ton téléphone Android
3. Installe l'APK
4. Teste toutes les fonctionnalités

### iOS
1. Inscris ton appareil sur le portail Apple Developer
2. Télécharge le build depuis Expo
3. Installe via TestFlight ou installation directe (selon le profil)

## Étape 6 : Publication sur les Stores

### Google Play Store

1. **Crée un compte développeur Google Play** (frais unique de 25$)
2. **Prépare les assets** :
   - Icône de l'app (512x512 px)
   - Screenshots (min 2, max 8)
   - Description, titre, catégorie
3. **Upload le AAB** :
   ```bash
   eas submit --platform android
   ```

### Apple App Store

1. **Crée un compte Apple Developer** (99$/an)
2. **Prépare les assets** :
   - Screenshots pour différentes tailles d'écran
   - Description, mots-clés, catégorie
   - Politique de confidentialité (URL obligatoire)
3. **Upload vers App Store Connect** :
   ```bash
   eas submit --platform ios
   ```

## Étape 7 : Mises à jour OTA (Over-The-Air)

Pour les mises à jour JavaScript sans rebuild complet :

### 7.1 Activer les mises à jour

Modifie `app.json` :
```json
"updates": {
  "enabled": true,
  "fallbackToCacheTimeout": 0,
  "url": "https://u.expo.dev/[your-project-id]"
}
```

### 7.2 Publier une mise à jour

```bash
eas update --branch production --message "Description de la mise à jour"
```

## Commandes Utiles

```bash
# Voir tous tes builds
eas build:list

# Voir le statut d'un build
eas build:view [BUILD_ID]

# Annuler un build en cours
eas build:cancel [BUILD_ID]

# Voir les secrets du projet
eas secret:list

# Supprimer un secret
eas secret:delete --name SECRET_NAME
```

## Checklist Avant Publication

- [ ] Toutes les fonctionnalités testées
- [ ] Variables d'environnement configurées sur EAS
- [ ] Icônes et splash screen correctement configurés
- [ ] Permissions déclarées (caméra, galerie)
- [ ] Politique de confidentialité rédigée
- [ ] Conditions d'utilisation rédigées
- [ ] Screenshots préparés
- [ ] Description de l'app rédigée
- [ ] Catégorie choisie
- [ ] Version et build number mis à jour

## Budget Estimé

- **Compte Google Play Developer** : 25$ (unique)
- **Compte Apple Developer** : 99$/an
- **EAS Build** : Gratuit pour les premiers builds, puis plans payants disponibles

## Dépannage

### Erreur de build
```bash
eas build:view [BUILD_ID]
```
Consulte les logs pour voir l'erreur exacte.

### Problème de certificats iOS
```bash
eas credentials
```
Gère tes certificats et profils de provisioning.

### Build trop lent
Utilise `"resourceClass": "m-large"` dans `eas.json` (payant).

## Support

- **Documentation EAS** : https://docs.expo.dev/build/introduction/
- **Forum Expo** : https://forums.expo.dev/
- **Discord Expo** : https://chat.expo.dev/

---

**Bon build ! 🚀**
