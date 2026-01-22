# RevenueCat - Quick Start

Guide ultra-rapide pour démarrer avec RevenueCat dans ton projet.

## En 5 étapes

### 1. Exporter le projet depuis Bolt

Tu DOIS travailler localement car RevenueCat nécessite du code natif.

1. Télécharge le projet depuis Bolt
2. Ouvre-le dans VS Code ou Cursor
3. Ouvre un terminal dans le dossier du projet

### 2. Installer RevenueCat

```bash
npm install react-native-purchases
npx expo install expo-dev-client
```

### 3. Ajouter le plugin dans app.json

Modifie ton `app.json` :

```json
{
  "expo": {
    "name": "SignTouch",
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

### 4. Ajouter les clés API

Crée un compte sur [RevenueCat](https://app.revenuecat.com/signup), puis ajoute dans ton `.env` :

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=rcb_ta_cle_ios
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=rcb_ta_cle_android
```

### 5. Build et teste

```bash
# Pour iOS
npx expo run:ios

# Pour Android
npx expo run:android
```

## Fichiers déjà créés

Les fichiers suivants sont déjà prêts dans ton projet :

- `utils/revenueCat.ts` - Service RevenueCat
- `REVENUECAT_INTEGRATION_GUIDE.md` - Guide complet

## Configuration des produits dans RevenueCat

Va sur [app.revenuecat.com](https://app.revenuecat.com) et crée :

1. **Un projet** "SignTouch"
2. **3 produits** :
   - `annual_19_99_trial` - Annuel avec essai 7 jours (€19.99/an)
   - `annual_19_99` - Annuel direct (€19.99/an)
   - `monthly_2_99` - Mensuel (€2.99/mois)
3. **Un entitlement** "premium"
4. **Un offering** "default" avec les 3 produits

## Test avec Sandbox

**iOS** : Settings > App Store > Sandbox Account
**Android** : Ajoute ton email comme testeur dans Google Play Console

## Support

- Guide complet : `REVENUECAT_INTEGRATION_GUIDE.md`
- Documentation : [revenuecat.com/docs](https://www.revenuecat.com/docs)
- Dashboard : [app.revenuecat.com](https://app.revenuecat.com)

## Important

- RevenueCat ne fonctionne PAS sur web
- Tu dois tester sur un appareil réel ou simulateur
- Utilise les comptes sandbox pour les tests
- N'oublie pas de configurer App Store Connect et Google Play Console
