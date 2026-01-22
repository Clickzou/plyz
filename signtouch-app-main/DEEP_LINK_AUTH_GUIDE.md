# Guide : Authentification par lien email (Deep Linking)

## Vue d'ensemble du flow

L'authentification par lien email permet aux utilisateurs de se connecter sans mot de passe :

1. **Utilisateur entre son email** → Écran Account
2. **Clique sur "Recevoir un lien de connexion"** → Email envoyé par Supabase
3. **Ouvre l'email et clique sur le lien** → L'app SignTouch s'ouvre automatiquement
4. **Écran "Connexion en cours..."** s'affiche 1-2 secondes
5. **Redirection automatique vers /account** → Utilisateur connecté

---

## Configuration technique

### 1. Deep Link Scheme
- **Scheme configuré** : `signtouch://`
- **Fichier** : `app.json` ligne 8
- L'URL générée est : `signtouch://auth-callback?token_hash=xxx&type=magiclink`

### 2. AuthContext
- **Fonction** : `sendMagicLink(email)`
- **URL de redirection** : Utilise `Linking.createURL('auth-callback')` qui génère :
  - En dev Expo Go : `exp://192.168.x.x:8081/--/auth-callback`
  - En production : `signtouch://auth-callback`
- **Fichier** : `contexts/AuthContext.tsx` lignes 78-97

### 3. Auth Callback
- **Route** : `/auth-callback`
- **Gestion du deep link** :
  1. Récupère l'URL via `Linking.useURL()` et `Linking.getInitialURL()`
  2. Extrait `token_hash` et `type` des paramètres
  3. Appelle `supabase.auth.verifyOtp()` pour établir la session
  4. Redirige vers `/account`
- **Fichier** : `app/auth-callback.tsx`

---

## Comment tester sur Expo Go

### Prérequis
- Expo Go installé sur votre téléphone (iOS ou Android)
- L'app SignTouch en cours d'exécution (`npm run dev`)
- Accès à votre boîte email sur le même téléphone

### Étapes de test

#### 1. Préparer l'environnement
```bash
# Démarrer l'app en mode développement
npm run dev

# Scanner le QR code avec Expo Go
```

#### 2. Tester le flow complet

**Étape A : Demander le lien**
1. Ouvrir l'app dans Expo Go
2. Aller dans l'onglet "Compte" (Account)
3. Dans la section "Connexion compte" :
   - Entrer votre adresse email
   - Observer le texte d'aide : "Aucun mot de passe requis"
   - Cliquer sur "Recevoir un lien de connexion"
4. Vérifier le message de succès : "Lien envoyé ! Vérifiez votre email"

**Étape B : Ouvrir le lien**
1. Ouvrir votre application email sur le même téléphone
2. Trouver l'email de Supabase (vérifier spam si nécessaire)
3. Cliquer sur le lien de connexion dans l'email

**Étape C : Redirection automatique**
1. L'app SignTouch devrait s'ouvrir automatiquement dans Expo Go
2. Observer l'écran "Connexion en cours..." (1-2 secondes)
3. Être redirigé vers l'écran Account
4. Vérifier que votre email est affiché
5. Le bouton "Se déconnecter" doit être visible

### 3. Tester les cas d'erreur

**Lien expiré**
1. Demander un lien de connexion
2. Attendre que le lien expire (généralement 60 minutes)
3. Cliquer sur le lien expiré
4. Vérifier que le message d'erreur s'affiche : "Lien invalide ou expiré"
5. Cliquer sur "Retour au compte"

**Lien sans token**
1. Ouvrir manuellement l'URL : `exp://192.168.x.x:8081/--/auth-callback`
2. Vérifier le message : "Aucun lien de connexion détecté"

---

## Troubleshooting

### Le lien n'ouvre pas l'app
**Cause** : Expo Go ne reconnaît pas le scheme en développement

**Solution** :
- En dev, Expo Go utilise des URLs spéciales du type `exp://...`
- Le lien doit pointer vers l'URL Expo, pas vers `signtouch://`
- Vérifier que `Linking.createURL()` génère la bonne URL pour l'environnement

### L'app s'ouvre mais la connexion échoue
**Causes possibles** :
1. Le token n'est pas extrait correctement des paramètres URL
2. Supabase n'établit pas la session

**Debug** :
```typescript
// Ajouter des logs dans auth-callback.tsx
console.log('URL reçue:', url);
console.log('Token hash:', token_hash);
console.log('Type:', type);
```

### Email non reçu
1. Vérifier le dossier spam
2. Vérifier la configuration Supabase (Auth > Email Templates)
3. Vérifier que l'email est valide
4. Vérifier les logs Supabase (Auth > Logs)

### Session ne persiste pas
- Vérifier que `onAuthStateChange` dans `AuthContext.tsx` fonctionne
- Vérifier que la session est bien sauvegardée par Supabase
- Redémarrer l'app et vérifier si l'utilisateur reste connecté

---

## Configuration Supabase (IMPORTANT)

### Problème : "localhost:3000/#error" ou "Ce site est inaccessible"

Si tu vois cette erreur quand tu cliques sur le lien de confirmation, c'est que Supabase n'est pas configuré pour accepter les URLs Expo Go.

**Voici comment corriger** :

### Étape 1 : Obtenir l'URL correcte

1. **Dans ton app, ajoute temporairement ce code dans `app/account.tsx`** :

```typescript
import * as Linking from 'expo-linking';

// Ajoute ce bouton temporaire dans le render
<TouchableOpacity
  onPress={() => {
    const url = Linking.createURL('auth-callback');
    console.log('URL de redirection:', url);
    alert('Copie cette URL:\n\n' + url);
  }}
  style={{ padding: 20, backgroundColor: '#10b981', margin: 20, borderRadius: 8 }}
>
  <Text style={{ color: '#fff', textAlign: 'center' }}>
    Obtenir l'URL de redirection
  </Text>
</TouchableOpacity>
```

2. **Clique sur ce bouton** et copie l'URL affichée. Elle ressemble à :
   - `exp://192.168.1.5:8081/--/auth-callback`
   - Ou une URL similaire avec ton adresse IP locale

### Étape 2 : Configurer Supabase Dashboard

1. **Va sur [https://app.supabase.com](https://app.supabase.com)**
2. **Sélectionne ton projet** (wwuxaoggbvgmyzcjlgfx)
3. **Va dans Authentication → URL Configuration** (dans le menu de gauche)
4. **Trouve la section "Redirect URLs"**
5. **Ajoute ces URLs** (une par ligne) :

```
exp://*:8081/--/auth-callback
exp://*.exp.direct/--/auth-callback
signtouch://auth-callback
http://localhost:3000/auth-callback
```

6. **Clique sur "Save"** en bas de la page

### Pourquoi ces URLs ?

- `exp://*:8081/--/auth-callback` : Pour Expo Go sur ton réseau local (l'IP peut changer)
- `exp://*.exp.direct/--/auth-callback` : Pour Expo Go avec tunnel
- `signtouch://auth-callback` : Pour l'app en production (après build)
- `http://localhost:3000/auth-callback` : Pour tester sur le web

### Étape 3 : Re-tester

1. **Retourne dans ton app**
2. **Va dans Account**
3. **Clique sur "Créer mon compte"**
4. **Entre ton email**
5. **Ouvre l'email sur ton téléphone**
6. **Clique sur le lien**
7. **L'app devrait s'ouvrir correctement maintenant !**

### Email Templates
Vérifier que le template d'email contient le bon lien :
```
{{ .ConfirmationURL }}
```

**Note importante** : Supabase génère automatiquement l'URL de confirmation en utilisant le `emailRedirectTo` que tu as configuré dans ton code. Le template d'email doit juste inclure `{{ .ConfirmationURL }}`.

---

## Build et production

### Pour tester en production (sans Expo Go)

1. **Build de développement** :
```bash
npx expo run:ios  # ou run:android
```

2. **Dans ce cas, le scheme `signtouch://` sera utilisé**

3. **Tester le même flow** mais le lien pointera vers `signtouch://auth-callback`

### Notes importantes
- Le deep linking fonctionne différemment entre Expo Go et les builds natifs
- En production, configurer les URL schemes dans `app.json` (déjà fait)
- Pour iOS, vérifier les Associated Domains si nécessaire
- Pour Android, vérifier les Intent Filters (gérés automatiquement par Expo)

---

## Validation complète

### Checklist de test
- [ ] L'utilisateur peut demander un lien de connexion
- [ ] L'email est bien reçu
- [ ] Cliquer sur le lien ouvre l'app
- [ ] L'écran "Connexion en cours..." s'affiche
- [ ] Redirection automatique vers /account
- [ ] L'email de l'utilisateur est affiché
- [ ] Le bouton "Se déconnecter" fonctionne
- [ ] Les liens expirés affichent une erreur appropriée
- [ ] Le message "Aucun mot de passe requis" est visible

### Test multi-langues
Vérifier que le texte "Aucun mot de passe requis" est traduit dans toutes les langues :
- ✅ Français : "Aucun mot de passe requis"
- ✅ Anglais : "No password required"
- ✅ Espagnol : "No se requiere contraseña"
- ✅ Allemand : "Kein Passwort erforderlich"
- ✅ Et 12 autres langues...

---

## Support et documentation

- **Expo Linking** : https://docs.expo.dev/guides/linking/
- **Supabase Auth** : https://supabase.com/docs/guides/auth/auth-magic-link
- **Expo Router** : https://docs.expo.dev/router/introduction/
