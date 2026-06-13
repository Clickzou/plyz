# Configuration du template email Supabase

## Objectif

Modifier l'email d'authentification pour remplacer "Magic Link" par "Lien de récupération Plyz".

## Instructions étape par étape

### 1. Accéder aux templates email

1. Ouvrez votre projet Supabase : https://supabase.com/dashboard
2. Sélectionnez votre projet : `wwuxaoggbvgmyzcjlgfx`
3. Dans le menu latéral, cliquez sur **Authentication**
4. Cliquez sur **Email Templates**
5. Sélectionnez **Magic Link** dans la liste des templates

### 2. Modifier le template

Remplacez le contenu actuel par ce template en anglais :

```html
<h2>Plyz Recovery Link</h2>

<p>Follow this link to log in to your account:</p>
<p><a href="{{ .ConfirmationURL }}">Log In</a></p>

<p>If you didn't request this email, you can safely ignore it.</p>

<p>Best regards,<br>Plyz Team</p>
```

### 3. Modifier l'objet de l'email

Dans le champ **Subject**, remplacez par :

```
Plyz Recovery Link
```

### 4. Sauvegarder

Cliquez sur **Save** en bas de la page.

## Résultat

Les utilisateurs recevront maintenant des emails avec :

**Objet :** Plyz Recovery Link

**Corps :**
> Plyz Recovery Link
>
> Follow this link to log in to your account:
>
> [Log In]
>
> If you didn't request this email, you can safely ignore it.
>
> Best regards,
> Plyz Team

## Version française (optionnel)

Si la majorité de vos utilisateurs sont francophones, vous pouvez utiliser ce template français :

```html
<h2>Lien de récupération Plyz</h2>

<p>Suivez ce lien pour vous connecter à votre compte :</p>
<p><a href="{{ .ConfirmationURL }}">Se connecter</a></p>

<p>Si vous n'avez pas demandé cet email, vous pouvez l'ignorer en toute sécurité.</p>

<p>Cordialement,<br>L'équipe Plyz</p>
```

**Objet (français) :** Lien de récupération Plyz

## Notes importantes

- Supabase ne permet qu'un seul template email par projet
- Vous ne pouvez pas envoyer des emails dans différentes langues automatiquement via le Dashboard
- Pour des emails multilingues, il faudrait utiliser un service externe comme Resend (non configuré actuellement)
- Le template s'applique immédiatement après sauvegarde

## Variables disponibles

Dans les templates Supabase, vous pouvez utiliser ces variables :

- `{{ .ConfirmationURL }}` - Le lien d'authentification
- `{{ .Token }}` - Le token d'authentification
- `{{ .TokenHash }}` - Le hash du token
- `{{ .SiteURL }}` - L'URL de votre site
- `{{ .Email }}` - L'email de l'utilisateur

## Test

Pour tester le nouveau template :

1. Ouvrez l'application Plyz
2. Allez sur l'écran **Account**
3. Entrez votre email
4. Cliquez sur "Recevoir un lien de connexion"
5. Vérifiez votre boîte email

Vous devriez recevoir un email avec le nouveau texte "Plyz Recovery Link".
