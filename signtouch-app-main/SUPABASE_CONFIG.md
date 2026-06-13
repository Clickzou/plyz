# Configuration Supabase pour l'authentification par lien email

## ⚠️ PROBLÈME : "localhost:3000/#error" ou "Ce site est inaccessible"

Si tu vois cette erreur quand tu cliques sur le lien de confirmation d'email, c'est que Supabase essaie de rediriger vers `localhost:3000` au lieu de l'app mobile. Suis ces étapes pour corriger :

### Solution rapide en 3 étapes

#### Étape 1 : Obtenir l'URL de redirection

1. **Ouvre ton app dans Expo Go**
2. **Va dans l'onglet "Compte"**
3. **Tu verras un encadré jaune "Mode Debug"** en haut de l'écran
4. **Clique sur "Obtenir l'URL de redirection Supabase"**
5. **Note l'URL affichée** (elle est automatiquement copiée), par exemple : `exp://192.168.1.5:8081/--/auth-callback`

#### Étape 2 : Configurer Supabase

1. **Va sur [https://app.supabase.com](https://app.supabase.com)**
2. Ouvre ton projet : **wwuxaoggbvgmyzcjlgfx**
3. Dans le menu latéral, clique sur **Authentication**
4. Clique sur **URL Configuration**
5. Dans la section **Redirect URLs**, ajoute ces 4 URLs :

```
exp://*:8081/--/auth-callback
exp://*.exp.direct/--/auth-callback
plyz://auth-callback
http://localhost:3000/auth-callback
```

6. **Clique sur "Save"**

#### Étape 3 : Re-tester

1. Retourne dans ton app
2. Clique sur "Créer mon compte"
3. Entre ton email
4. Ouvre l'email sur ton téléphone
5. Clique sur le lien
6. L'app devrait s'ouvrir correctement maintenant !

---

## URLs de redirection à autoriser

Pour que l'authentification par lien email fonctionne, vous devez configurer les URLs de redirection dans votre dashboard Supabase.

### Accéder à la configuration

1. Allez sur [supabase.com](https://supabase.com)
2. Ouvrez votre projet : **wwuxaoggbvgmyzcjlgfx**
3. Dans le menu latéral, cliquez sur **Authentication**
4. Cliquez sur **URL Configuration**

---

## URLs à ajouter

### Configuration recommandée (2024)

Ajoutez ces URLs dans la section **Redirect URLs** :

```
exp://*:8081/--/auth-callback
exp://*.exp.direct/--/auth-callback
plyz://auth-callback
http://localhost:3000/auth-callback
```

**Explication** :
- `exp://*:8081/--/auth-callback` : Pour Expo Go sur réseau local (l'IP peut changer, le `*` accepte toutes les IPs)
- `exp://*.exp.direct/--/auth-callback` : Pour Expo Go avec tunnel
- `plyz://auth-callback` : Pour l'app en production (après build)
- `http://localhost:3000/auth-callback` : Pour tester sur le web

### Pourquoi être précis avec les URLs ?

Les anciennes URLs génériques comme `exp://*` peuvent être refusées par Supabase pour des raisons de sécurité. Les URLs spécifiques avec le chemin `/--/auth-callback` sont plus fiables.

---

## Configuration complète recommandée

Voici la liste complète des URLs de redirection à ajouter :

```
exp://*:8081/--/auth-callback
exp://*.exp.direct/--/auth-callback
plyz://auth-callback
http://localhost:3000/auth-callback
```

### Screenshot de configuration

Dans le dashboard Supabase, la section devrait ressembler à :

```
┌──────────────────────────────────────────────────┐
│ Redirect URLs                                    │
├──────────────────────────────────────────────────┤
│ exp://*:8081/--/auth-callback                    │
│ exp://*.exp.direct/--/auth-callback              │
│ plyz://auth-callback                        │
│ http://localhost:3000/auth-callback              │
└──────────────────────────────────────────────────┘
```

---

## Vérification de la configuration

### Test 1 : Envoi de l'email
1. Allez dans l'onglet **Account** de l'app
2. Entrez votre email et cliquez sur "Recevoir un lien de connexion"
3. Si vous recevez un email → Configuration OK
4. Si vous n'en recevez pas → Vérifier les templates d'email

### Test 2 : Lien de redirection
1. Ouvrez l'email reçu
2. Inspectez le lien (sans cliquer)
3. Il doit contenir l'une de ces URLs :
   - En dev : `exp://...`
   - En prod : `plyz://...`

### Test 3 : Ouverture de l'app
1. Cliquez sur le lien dans l'email
2. L'app doit s'ouvrir automatiquement
3. Si une erreur de redirection apparaît → Vérifier les URLs autorisées

---

## Templates d'email

### Vérifier le template

1. Dans Supabase Dashboard → **Authentication** → **Email Templates**
2. Sélectionner **Magic Link**
3. Vérifier que le template contient :

```html
<a href="{{ .ConfirmationURL }}">Confirmer votre email</a>
```

### Template personnalisé (optionnel)

Vous pouvez personnaliser le template pour Plyz :

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button {
      display: inline-block;
      background: #10b981;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Connexion à Plyz</h1>
    <p>Cliquez sur le bouton ci-dessous pour vous connecter :</p>
    <a href="{{ .ConfirmationURL }}" class="button">
      Se connecter
    </a>
    <p style="color: #666; font-size: 14px;">
      Ce lien expire dans 60 minutes.<br>
      Si vous n'avez pas demandé cette connexion, ignorez cet email.
    </p>
  </div>
</body>
</html>
```

---

## Sécurité

### Rate Limiting

Supabase limite automatiquement les tentatives de connexion pour éviter les abus :
- **6 tentatives par heure** par adresse IP
- **3 tentatives par minute** par email

### Expiration des liens

Les liens de connexion expirent automatiquement après :
- **60 minutes** par défaut
- Configurable dans **Authentication** → **Policies**

### Validation des emails

Par défaut, Supabase **ne nécessite pas de confirmation d'email**.

Si vous voulez activer la confirmation :
1. **Authentication** → **Email** → **Enable email confirmations**
2. L'utilisateur devra cliquer sur le lien avant de pouvoir se connecter

---

## Dépannage

### Erreur : "Email rate limit exceeded"

**Cause** : Trop de demandes de lien de connexion

**Solution** :
- Attendre quelques minutes
- Vérifier que vous n'envoyez pas de requêtes en boucle

### Erreur : "Invalid email OTP"

**Cause** : Le token dans l'URL est invalide ou expiré

**Solutions** :
- Demander un nouveau lien
- Vérifier que l'horloge du téléphone est correcte
- Vérifier les logs Supabase pour plus de détails

### Erreur : "Redirect URL not allowed"

**Cause** : L'URL de redirection n'est pas dans la liste autorisée

**Solution** :
1. Vérifier dans **URL Configuration** que l'URL est bien ajoutée
2. Ajouter le pattern avec wildcard : `exp://*` ou `plyz://*`
3. Sauvegarder et attendre 1-2 minutes

### Les emails ne sont pas reçus

**Causes possibles** :
1. Email dans le spam
2. Serveur SMTP non configuré (utiliser le SMTP Supabase par défaut)
3. Email invalide

**Debug** :
1. **Authentication** → **Logs** : Vérifier les tentatives d'envoi
2. Tester avec un autre email
3. Vérifier la configuration SMTP

---

## Logs et monitoring

### Consulter les logs

1. **Authentication** → **Logs**
2. Filtrer par type : **Magic Link**
3. Vérifier les erreurs éventuelles

### Logs utiles à surveiller

- `auth.magiclink.sent` : Lien envoyé avec succès
- `auth.magiclink.verified` : Lien vérifié avec succès
- `auth.error` : Erreurs d'authentification

---

## Checklist de configuration

- [ ] URLs de redirection ajoutées dans Supabase
- [ ] Pattern `exp://*` pour Expo Go
- [ ] Pattern `plyz://*` pour production
- [ ] Template d'email vérifié
- [ ] Rate limiting configuré
- [ ] Expiration des liens configurée (60 min par défaut)
- [ ] Logs consultés pour vérifier le bon fonctionnement

---

## Ressources

- **Dashboard Supabase** : https://supabase.com/dashboard/project/wwuxaoggbvgmyzcjlgfx
- **Documentation Supabase Auth** : https://supabase.com/docs/guides/auth
- **Magic Link Guide** : https://supabase.com/docs/guides/auth/auth-magic-link
