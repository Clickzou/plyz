# Système de connexion centralisé

## Vue d'ensemble

Ce système centralise la connexion utilisateur dans une seule modal réutilisable. Les utilisateurs peuvent acheter un abonnement sans créer de compte, et la modal de connexion s'affiche dans deux contextes :
1. **Post-achat** : après un achat réussi (si non connecté)
2. **Manuel** : depuis "Mon abonnement" (si non connecté)

## Principe

1. L'utilisateur peut acheter un abonnement sans être connecté
2. Après un achat réussi, une modal apparaît lui proposant de créer un compte
3. Si l'utilisateur clique "Plus tard" **dans le contexte post-achat**, la modal ne réapparaîtra pas pendant 7 jours
4. Si l'utilisateur clique sur "Mon abonnement" sans être connecté, la modal s'ouvre **sans cooldown**
5. Si l'utilisateur est déjà connecté, la modal ne s'affiche jamais

## Architecture

### Composants

#### PostPurchaseAccountModal (`components/PostPurchaseAccountModal.tsx`)

Modal qui propose à l'utilisateur de créer un compte après un achat.

**Fonctionnalités :**
- Design moderne et responsive
- Champ email avec validation
- Envoi de magic link (connexion sans mot de passe)
- Gestion des états (loading, success, error)
- Fermeture automatique si l'utilisateur se connecte
- Support multi-plateforme (iOS/Android/Web)

**Props :**
- `visible`: boolean - Contrôle l'affichage de la modal
- `onClose`: () => void - Callback appelé lors de la fermeture

#### SubscriptionOfferModal (`components/SubscriptionOfferModal.tsx`)

Modal d'abonnement mise à jour pour déclencher le système post-achat.

**Nouvelle prop :**
- `onPurchaseSuccess`: () => void - Callback appelé après un achat réussi

### Utilitaires

#### postPurchaseAccountStorage.ts (`utils/postPurchaseAccountStorage.ts`)

Gère le stockage du cooldown de 7 jours dans AsyncStorage.

**Fonctions :**
- `setAccountPromptSnooze()`: Définit le cooldown de 7 jours
- `getAccountPromptSnoozeUntil()`: Récupère la date de fin du cooldown
- `clearAccountPromptSnooze()`: Supprime le cooldown
- `isAccountPromptSnoozed()`: Vérifie si le cooldown est actif

#### postPurchaseAccount.ts (`utils/postPurchaseAccount.ts`)

Logique de décision pour afficher la modal.

**Fonctions :**
- `setPostPurchaseAccountCallback(callback)`: Enregistre le callback d'affichage automatique (post-achat)
- `setManualAccountModalCallback(callback)`: Enregistre le callback d'affichage manuel
- `showAccountModal()`: Ouvre la modal manuellement (depuis "Mon abonnement")
- `maybeShowPostPurchaseAccountModal(purchaseSuccess, isUserConnected)`: Décide si la modal doit s'afficher après achat

**Conditions d'affichage automatique (post-achat) :**
1. `purchaseSuccess === true` (achat réussi)
2. `isUserConnected === false` (utilisateur non connecté)
3. Pas de cooldown actif (l'utilisateur n'a pas cliqué "Plus tard" récemment)

**Affichage manuel :**
- Appelé depuis `account.tsx` quand l'utilisateur clique sur "Mon abonnement" sans être connecté
- Aucune condition de cooldown
- Ouvre la modal immédiatement

### Intégration

#### _layout.tsx

Le fichier principal qui coordonne le système.

**État :**
- `showPostPurchaseAccount`: Contrôle l'affichage de la modal
- `isPostPurchaseContext`: Détermine si le contexte est post-achat (true) ou manuel (false)

**Callbacks :**
- `handlePurchaseSuccess()`: Appelé après un achat réussi, définit le contexte comme post-achat et vérifie si la modal doit s'afficher
- `handleClosePostPurchaseAccount()`: Active le cooldown **uniquement si contexte post-achat**, puis ferme la modal

**Enregistrement des callbacks :**
- `setPostPurchaseAccountCallback()`: Ouvre la modal avec contexte post-achat (cooldown activé à la fermeture)
- `setManualAccountModalCallback()`: Ouvre la modal avec contexte manuel (pas de cooldown)

#### account.tsx

Écran compte simplifié sans section "Connexion compte".

**Comportement "Mon abonnement" :**
- Si `user` existe : navigation vers `/subscription`
- Si `user` est null : appel de `showAccountModal()` pour ouvrir la modal

**Section déconnexion :**
- Affichée uniquement si `user` existe
- Bouton dans un menuItem standard avec email en sous-texte
- Pas de champ email ni de section complexe

## Traductions

Toutes les traductions ont été ajoutées pour les 15 langues supportées :

**Clés de traduction :**
- `postPurchaseTitle`: Titre de la modal
- `postPurchaseDescription`: Description expliquant les avantages
- `postPurchasePlaceholder`: Placeholder du champ email
- `postPurchaseSendLink`: Texte du bouton principal
- `postPurchaseLater`: Texte du bouton secondaire
- `postPurchaseSuccess`: Message de succès après envoi du lien
- `postPurchaseSecureLink`: Information sur le lien sécurisé

**Langues supportées :**
fr, en, es, de, pt, it, hi, ur, ar, zh, bn, ru, id, ja, ms

## Flux utilisateur

### Scénario 1 : Achat sans compte, accepte de créer un compte

1. Utilisateur non connecté achète un abonnement
2. Modal PostPurchaseAccount s'affiche automatiquement (contexte post-achat)
3. Utilisateur entre son email et clique "Recevoir un lien de connexion"
4. Email envoyé avec succès, message de confirmation affiché
5. Utilisateur clique sur le lien dans l'email
6. Utilisateur est connecté, ses photos et abonnement sont liés au compte

### Scénario 2 : Achat sans compte, refuse de créer un compte

1. Utilisateur non connecté achète un abonnement
2. Modal PostPurchaseAccount s'affiche automatiquement (contexte post-achat)
3. Utilisateur clique "Plus tard" ou ferme la modal
4. Cooldown de 7 jours est activé (car contexte post-achat)
5. La modal ne réapparaîtra pas automatiquement pendant 7 jours

### Scénario 3 : Achat avec compte existant

1. Utilisateur connecté achète un abonnement
2. Modal PostPurchaseAccount ne s'affiche PAS
3. L'abonnement est automatiquement lié au compte

### Scénario 4 : Accès "Mon abonnement" sans compte

1. Utilisateur non connecté clique sur "Mon abonnement"
2. Modal PostPurchaseAccount s'affiche immédiatement (contexte manuel)
3. Si l'utilisateur ferme la modal, **aucun cooldown n'est activé**
4. Il peut réessayer autant de fois qu'il veut

### Scénario 5 : Accès "Mon abonnement" avec compte

1. Utilisateur connecté clique sur "Mon abonnement"
2. Navigation directe vers l'écran `/subscription`
3. Pas de modal

## Tests et validation

### Vérifications effectuées

- ✅ Compilation TypeScript réussie
- ✅ Toutes les traductions ajoutées pour les 15 langues
- ✅ Modal stylisée et responsive
- ✅ Gestion du cooldown dans AsyncStorage (uniquement contexte post-achat)
- ✅ Intégration dans le flux d'achat
- ✅ Intégration dans l'écran compte via "Mon abonnement"
- ✅ Fermeture automatique si l'utilisateur se connecte
- ✅ Support multi-plateforme (iOS/Android/Web)
- ✅ Écran compte simplifié sans section "Connexion compte"
- ✅ Système de contexte (post-achat vs manuel) pour le cooldown

### Points d'attention pour les tests futurs

1. **Flow post-achat** : Tester achat → modal → connexion → cooldown si "Plus tard"
2. **Flow manuel** : Tester "Mon abonnement" → modal → pas de cooldown à la fermeture
3. **Vérifier le cooldown de 7 jours** (uniquement contexte post-achat)
4. **S'assurer que la modal ne s'affiche jamais** pour les utilisateurs connectés
5. **Navigation "Mon abonnement"** : Si connecté → écran, si non connecté → modal
6. **Tester la validation d'email** et l'envoi du magic link
7. **Vérifier que l'utilisateur peut réessayer** autant de fois qu'il veut depuis "Mon abonnement"

## Maintenance

### Modifier le délai du cooldown

Pour changer la durée du cooldown (actuellement 7 jours), modifier la constante dans `postPurchaseAccountStorage.ts`:

```typescript
const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000; // Changer ici
```

### Ajouter de nouvelles langues

1. Ajouter le fichier de langue dans `locales/`
2. Ajouter toutes les clés `postPurchase*` avec les traductions appropriées
3. Mettre à jour la liste des langues dans `locales/index.ts`

### Personnaliser le design

Le style de la modal se trouve dans `PostPurchaseAccountModal.tsx` dans l'objet `styles`. Tous les styles sont centralisés pour faciliter les modifications.

## Notes importantes

- **Une seule modal** : Le système utilise une seule modal réutilisable pour tous les contextes
- **Deux contextes** : Post-achat (avec cooldown) et Manuel (sans cooldown)
- Le système utilise le même mécanisme de magic link que la connexion principale
- Le cooldown est stocké localement (AsyncStorage), donc réinitialiser l'app l'efface
- Le cooldown **ne s'active que dans le contexte post-achat** (après un achat réussi)
- La modal se ferme automatiquement dès que l'utilisateur se connecte (via useEffect)
- Aucun guard d'authentification n'empêche l'accès aux fonctionnalités de l'app
- **Écran compte simplifié** : Plus de section "Connexion compte", la connexion se fait uniquement via la modal
- L'utilisateur peut réessayer autant de fois qu'il veut depuis "Mon abonnement"
