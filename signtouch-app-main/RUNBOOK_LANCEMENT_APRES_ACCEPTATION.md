# 🚀 RUNBOOK — À FAIRE UNE FOIS LES APPS ACCEPTÉES

> ### 📌 ÉTAT AU 04/08/2026 — **PLYZ EST EN LIGNE SUR LES DEUX STORES**
> - **App Store** : version 1.0 approuvée par Apple le **15/07** et publiée le jour même → https://apps.apple.com/fr/app/id6788523821
> - **Google Play** : accepté, production 100 %, build du 30/07 (versionCode 11)
>
> ### 🚀 MISES À JOUR SOUMISES LE 04/08/2026 (soir) — les deux stores
> - **Android `15 (1.0.0)`** — AAB déposé à la main sur la Play Console (le `serviceAccountKeyPath` d'`eas.json` est un placeholder, `eas submit` ne marche pas). ✅ **ACCEPTÉE ET EN LIGNE le 05/08 vers minuit** (production 100 %, « Aucune modification non publiée »). Examen bouclé en quelques heures : une mise à jour d'app déjà approuvée passe bien plus vite qu'une première soumission. **Le bug de capture est donc corrigé pour tous les utilisateurs Android.**
> - **iOS `1.0.1 (17)`** — envoyé à App Store Connect le 04/08 à 21h42 UTC (soumission EAS `FINISHED`), **en attente de vérification**, jusqu'à 48 h.
>   ⚠️ **Piège rencontré** : le premier envoi (build 16, version 1.0.0) a été **refusé** — `Invalid Pre-Release Train, the train version '1.0.0' is closed` + `CFBundleShortVersionString must contain a higher version than the previously approved version`. Apple ferme définitivement une voie de version dès qu'elle est approuvée, et le numéro est inscrit DANS le build : il faut donc **bumper `app.json` PUIS recompiler**. Prochains numéros libres : iOS `1.0.2`/build 18, Android `versionCode 16` (déjà pré-réglé dans `app.json`, le build soumis était le 15).
>
> ### ✅ CLASSIFICATIONS PAR ÂGE — RÉGLÉ LE 05/08/2026
> - **Apple** : nouveau questionnaire « capacités de réseaux sociaux » rempli (échéance Apple du 07/09 traitée). Réponses : contenu généré par les utilisateurs **OUI**, réseaux sociaux **OUI**, messagerie/chat **OUI**, réseaux sociaux désactivés pour les <13 ans **NON** (Plyz n'utilise pas l'API de tranche d'âge d'Apple), contrôle parental / validation d'âge / accès web libre / publicité **NON**. Résultat calculé : **13+** (171 pays), 16+ (2 pays), A16 Brésil, 15+ Corée. Marqué « Modifiée » → publié avec la prochaine version.
> - **Google Play** : **nouveau questionnaire IARC rempli et envoyé le 05/08**. L'ancien certificat (`2c29d9f0-…`, envoyé le 08/07) restait valide, mais Google avait inscrit « Classification du contenu » dans l'onglet **Attention requise** de *Contenu de l'application*, avec échéance — il fallait donc bien le refaire. (J'avais d'abord conseillé de ne pas y toucher : c'était une erreur de lecture, l'onglet « Attention requise » n'avait pas été ouvert.)
>   **Réponses données** (à réutiliser si le questionnaire est redemandé) — Catégorie : *Tous les autres types d'applications* (surtout **pas** « Social ou Communication », qui contredirait le positionnement place de marché défendu devant Apple) · Contenu embarqué dans le package : Non · Partage de contenu entre utilisateurs : **Oui** · UGC source principale : **Oui** · Nudité : Non · Violence réelle : Non · Blocage : **Oui** · Signalement : **Oui** · Modération des conversations : Non · Interactions limitables aux amis : Non · Contenu en ligne : **Oui** · Violence / Sexualité / Langue : Non · Substances réglementées : Non · Produits soumis à l'âge : Non · Partage de position avec d'autres utilisateurs : **Non** (vérifié dans `utils/geofence.ts` : la position du fan est comparée sur son appareil et n'est ni transmise ni stockée) · Articles numériques : **Non** (prestations du monde réel, paiements Stripe hors facturation Play) · Crypto/NFT/play-to-earn : Non · Navigateur : Non · Actualité/éducation : Non.
>   Classification précédente, à titre de repère : TEEN (Amérique du Nord), USK 12 (Allemagne), IARC 12+, plusieurs 12 régionaux, et pour l'Europe **PEGI « Accord parental recommandé »** (icône « ! » orange) — c'est ce libellé, et non « PEGI 12 », qui s'affiche sur la fiche publique française. Ce n'est pas un défaut : l'IARC l'attribue aux applications (≠ jeux) à contenu utilisateur et messagerie. ⏳ **À vérifier quand Google aura traité l'envoi** : que la nouvelle note reste équivalente.
>
> ⚠️ **Reste iOS.** Le bug de capture (aucun paiement d'événement dédicace encaissé) et les autres défauts corrigés le 04/08 sont réglés côté Android depuis le 05/08, mais **la version App Store en ligne les contient encore** tant qu'Apple n'a pas validé le build `1.0.1 (17)`.

> **But de ce fichier :** dès que les apps sont validées (Google Play et/ou App Store), on suit cette liste dans l'ordre pour passer Plyz en **production réelle**. Tant que ce n'est pas fait, l'app est encore en **mode test** (aucun vrai paiement, données de démo, serveur qui peut dormir).
>
> **Quand JC dit « les apps sont acceptées » / « Google a accepté » / « c'est validé » → dérouler ce runbook.**
>
> Dernière mise à jour de l'audit : **2026-07-24**. Sources : mémoire projet (`project_avant_publication`, `project_paiements_stripe`, `project_securite_audit2`, `project_contenu_demo`, `project_traduction_auto`, `project_google_refus_broken_functionality`, `project_site_email_plyz`).
>
> Légende : 🔴 = **bloquant** (à faire absolument avant d'ouvrir au public) · 🟠 = **important** (à faire au lancement) · 🟡 = **à décider / non bloquant**.

---

## ✅ AVANCEMENT — session du 03-04/08/2026

**🎉 GOOGLE PLAY A ACCEPTÉ** : app en ligne (production 100 %, build du 30/07), 0 installation à ce stade.

**FAIT ce soir :**
- ✅ **§5 Email OTP** — migré de `mail.signtouch.click` vers **ZeptoMail** (`Plyz <noreply@plyz.io>`, `smtp.zeptomail.eu`/587/`emailapikey`). DKIM + CNAME `bounce-zem` + **DMARC** posés chez OVH. **mail-tester 8,5/10**, « parfaitement authentifié ». Cause du refus Google corrigée à la racine. Détails : mémoire `project_email_zeptomail`.
- ✅ Serveur : `replyTo` → `contact@plyz.io` + logo `<img>` remplacé par le wordmark texte (anti-spam). Déployé sur Replit.
- ✅ **§1 Stripe LIVE** — nouvelle clé secrète du compte **Plyz** (l'ancienne n'avait jamais servi → le serveur tournait bien sur le mauvais compte), webhook `Plyz serveur prod` + secret, **Connect actif en réel**, `STRIPE_MODE=live`, republié. Serveur vérifié : `{"status":"ok","stripe":true}`.
- ✅ Nom public « Plyz » + libellé de relevé « APP PLYZ BY CLICKZOU » : **déjà corrects**, rien à changer.
- ✅ §4 — env EAS production et retrait de `/api/_diag/stripe` : **déjà faits**, vérifiés.
- ✅ **§10 bypass reviewer RETIRÉ** du code (le mot de passe était en clair dans l'APK publié) + `versionCode` 11 / `buildNumber` iOS 12. Typecheck OK.
- ✅ Compte `jc@clickzou.fr` (JayC) passé en **célébrité vérifiée** (⚠️ trigger `trg_protect_celeb_flags`, cf mémoire dédiée).
- ✅ Codes promo de test 100 % créés (cf mémoire `project_codes_promo_test`).
- 🔄 **Builds EAS lancés** : Android `239b9a1d` (versionCode 11) et iOS `0caca410` (build 12).

**PROCHAINES ÉTAPES (dans l'ordre) :**
1. Récupérer l'AAB → **soumettre sur Play Console** (nouvelle version production).
2. ~~Envoyer le build iOS + répondre à Apple 3.1.1 + événement démo pour le reviewer~~ — ❌ **CETTE LIGNE ÉTAIT FAUSSE**. Vérifié le 04/08 dans l'historique App Store Connect : Apple a **approuvé** la version 1.0 le **15/07 à 02h03** (« Prête pour la publication »), et JC l'a **publiée le 15/07 à 14h57**. Le refus 3.1.1 du 13/07 a été surmonté par la resoumission du 14/07. Fiche publique vivante : https://apps.apple.com/fr/app/id6788523821 (Plyz — CLICKZOU, gratuit, iOS 15.1+). **Plyz est en ligne sur les DEUX stores.** La réponse 3.1.1 et l'événement démo ne sont plus nécessaires ; le build iOS 16 est une simple **mise à jour**.
3. **Test de paiement réel** — ⚠️ les comptes Stripe Connect créés en mode test sont **inutilisables en live** : il faut réinscrire un compte célébrité avec IBAN + pièce d'identité réels.
4. Puis §3 nettoyage des données de test (dont les comptes créés par les envois mail-tester), §6 monitoring, §2 réactivation de l'abonnement Replit Core.

**REPORTÉ (non bloquant)** : code partenaire 0 % de commission pour les premiers influenceurs — conception figée dans la mémoire `project_commission_influenceurs`.

### 🔍 AUDIT AVANT PUBLICATION (fait le 04/08/2026, ~01h30)

**Sain** : 8 endpoints sensibles testés sans JWT → **401** (protégés) ; serveur live stable ; garde-fou paiement présent (les boutons de réservation ne s'affichent que si la célébrité a un `stripe_account_id`).

**⚠️ CONSTAT CENTRAL — l'app est techniquement saine mais COMMERCIALEMENT VIDE** : l'API de prod servait 10 célébrités dont **aucune n'a de compte Stripe valide en réel**, et JayC n'a **aucun tarif** (`pricing` absent). ⇒ **Rien n'est réservable, pour personne.** C'est le motif exact du refus Google de juillet (« Broken Functionality ») → **soumettre à Apple dans cet état = risque de rejet**.

**Nettoyage FAIT (vérifié en réel sur l'API)** :
- `stripe_account_id` de **test** effacés (JayC `acct_1Tr1LT…` et Play Reviewer `acct_1Tys5Q…`) — ils auraient fait échouer tout paiement en live.
- **Play Reviewer masqué** (`is_listed = false`) — il apparaissait dans la liste publique. L'API ne renvoie plus que 9 célébrités.

**🔴 BLOQUANT AVANT SOUMISSION (à faire par JC)** :
> ✅ **Points 1, 2 et 3 FAITS le 04/08 après-midi** — compte Connect réel `acct_1U0eNmAYpnt7V5BS` créé et actif (transferts autorisés, vérifié par Stripe au moment du paiement), tarifs renseignés, et test de bout en bout réussi (voir la section ci-dessous).

1. ~~**Inscription Stripe Connect en RÉEL** depuis l'app~~ (Play Store, la version publiée pointe déjà sur le serveur en mode live — aucun rebuild nécessaire). ⚠️ Comptes **Express** (`type:'express'`, index.js:934/2034) ⇒ **impossible de rattacher un compte Stripe existant**. JC a décidé (04/08) de créer un **compte PERSO** (évite les flux circulaires Clickzou→Clickzou) : prévoir nom, date de naissance, adresse, **IBAN perso**, **pièce d'identité**.
2. **Renseigner les tarifs** de JayC (1-2 € pour tester à moindres frais).
3. **Test de bout en bout** : réserver → payer → capture → facture.

**🟠 Restants** : `/api/verify-payment` non authentifié (fuite de métadonnées si l'id de session fuite) ; `/api/check-event-access` non authentifié (TODO assumé) ; aucune alerte active ; spend cap Supabase activé (couperait l'app en cas de succès) ; abo Replit expirant le 22/01/2027.

**🟡 À décider** : les 8 profils de démo portent encore le badge « vérifié » alors que ces personnes n'existent pas (noms inventés, pas de risque droit à l'image). Recommandation : les **garder** (sinon l'app paraît vide au reviewer) mais **retirer le badge**. ⚠️ Nécessite de désactiver temporairement `trg_protect_celeb_flags` (cf mémoire dédiée).

### 🐛 REVUE DE CODE DES FLUX D'ARGENT (04/08/2026, nuit) — 3 BUGS CORRIGÉS

1. **🔴 BLOQUANT — les boutons de réservation ne s'affichaient JAMAIS** (corrigé + déployé + vérifié). Depuis le commit sécurité `3231b49` (05/07), `/api/celebrity/:id` retire `stripe_account_id` de la réponse publique (fuite PII, à juste titre) — or l'app testait exactement ce champ pour afficher « Réserver un appel vidéo » / « Demander un autographe ». Toujours `undefined` ⇒ aucun bouton, pour aucune célébrité, **parcours d'achat cassé depuis un mois** sans que ça se voie (aucun test d'achat depuis le 04/07). Fix : le serveur expose `can_accept_payments` (booléen, jamais l'identifiant), qui inclut `charges_enabled`.
2. **🔴 ARGENT — transfert silencieusement absent en live** (corrigé, commit `2ea2a88`). `/api/create-checkout-session` créait la session **sans `transfer_data`** si le compte de la célébrité ne pouvait pas recevoir de transfert : le fan payait, **la plateforme encaissait 100 % et la célébrité ne touchait rien**, sans alerte (le seul `warn` était conditionné à `isTestMode`). Le flux événement bloquait déjà ce cas « comme le flux vidéo »… que le flux vidéo ne faisait pas. Fix : 403 `TRANSFERS_NOT_ACTIVE` en live + log qui n'affiche plus une destination fictive.
3. **🟠 COMPTA — `/api/capture-payment` capturait sans rien écrire** (corrigé, commit `2ea2a88`) : `payment_captured` restait `false` (⇒ encaissement **invisible dans les revenus** de la célébrité, qui se calculent sur ce flag) et **aucune facture** n'était émise, alors que `/api/end-fan-call` fait les deux. Les DEUX chemins sont utilisés par l'app (`video-call.tsx:737` et `:784`). Fix aligné, en best-effort ; pas de double facture (`createInvoice` idempotent sur `transaction_ref`).

**Vérifiés SANS défaut** : `capture-payment` (auth + propriété + idempotence), `cancel-payment` (célébrité OU fan, refus si déjà capturé), `end-fan-call` (compare-and-set anti-race AVANT Stripe, verrou relâché si échec), webhook Stripe (signature `constructEvent`, tentative de forge journalisée, facture autographe idempotente), 8 endpoints sensibles testés sans JWT → 401.

**⚠️ RESTE À DÉPLOYER** : commit `2ea2a88` (correctifs 2 et 3) → `git pull` + **Republish** sur Replit. Les builds Android 12 / iOS 13 restent valables (ces correctifs sont côté serveur uniquement).

**PAS ENCORE REVU** (à poursuivre) : capture/libération en masse des événements (`capture-event-payments`, `release-event-payments`), génération des factures/DAC7, parcours live vidéo (file d'attente, Daily), `join-event`.

### ✅ TEST DE BOUT EN BOUT RÉUSSI (04/08/2026, après-midi) — 1er encaissement réel

**Parcours complet prouvé en mode LIVE** : réservation → paiement réel par carte → pré-autorisation → dédicace publiée → **capture** → split 85/15 → **facture émise**.

Preuve (événement « Test Escala », code FDGM5Y) : `event_paid_fans.payment_captured = true`, 100 centimes, `pi_3U0iiMAVRRCVL5ZQ2rlYWZPV` ; facture **PLYZ-2026-000013**, commission 0,15 € (15 %).

**🔴 BUG CRITIQUE TROUVÉ ET CORRIGÉ — la capture n'était JAMAIS déclenchée.** Les deux écrans qui ouvrent la séance de dédicace passaient le prix via `event.price_cents` / `createdSession.price_cents` — **une colonne qui n'existe pas** dans `event_sessions` (le prix ne vit que dans `event_payment_configs` côté serveur, et en AsyncStorage côté appareil). L'écran recevait donc toujours `priceCents = 0`, et la capture, conditionnée à `priceCents > 0`, était court-circuitée en silence. Conséquence en production : **aucun événement dédicace payant n'aurait été encaissé** — fan débité en pré-autorisation, célébrité jamais payée, argent rendu au bout de ~7 jours, sans la moindre erreur visible. Correctif : l'écran de dédicace lit le prix auprès du serveur (`get-event-payment-config`). Répare aussi l'affichage des gains, le compteur de fans payants et la logique de remboursement en fin de séance, tous faussés par le même zéro.

**Autres correctifs de la session :**
- **Capture silencieuse** : l'appel `capture-event-payments` ignorait le code de réponse (`fetch` ne lève pas d'exception sur 403/500). Un refus serveur passait inaperçu. La réponse est désormais lue et journalisée.
- **Retour de paiement web** : les paramètres n'étaient lus que dans `window.location.search`, alors que le retour passe par un `router.replace` — l'écran pouvait se monter avant la mise à jour de l'URL, et le bloc de vérification était sauté EN SILENCE (le fan revoyait « Payer », risque de double débit). Lecture des deux sources + 5 réessais + filet de secours `check-event-access` sur web + l'URL n'est plus effacée en cas d'échec.
- **Écran « Événement expiré » inaccessible** : la branche du formulaire de recherche captait le cas, rendant l'écran (et son encadré « tu ne seras pas débité ») **inatteignable** — code mort depuis toujours. Idem pour l'écran « événement programmé ».
- **Prolongation inatteignable** : le bandeau n'existait que sur l'écran de dédicace, et l'onglet « Passés » n'offrait aucun chemin pour rouvrir une séance terminée. Bandeau extrait en composant partagé (`components/EventPastEndBanner.tsx`) + bouton **« Reprendre la séance »** sur les événements terminés, visible 1 h après la fin (durée du délai de grâce avant libération des pré-autorisations).
- **Colonne `extended_minutes`** ajoutée à `event_sessions` (la prolongation la lisait sans qu'elle existe). Requête enregistrée dans le SQL Editor Supabase, conformément à la convention du projet (pas de dossier `migrations/`).

**⚠️ CONSTATS NON BLOQUANTS, à traiter plus tard :**
- `event_assets` n'a ni `original_photo_url` ni `signature_metadata` : la publication passe grâce à un repli, mais la photo originale et les métadonnées de signature ne sont pas conservées (2 × HTTP 400 à chaque publication).
- Le `.env` **local** contient encore la clé Stripe live de l'ancien compte `clickzou.fr` (`acct_1NWFzy…`). Sans effet tant que rien ne tourne en local, mais trompeur.
- Avertissement React Web répété « Unexpected text node » sur les écrans célébrité (cosmétique).
- `/api/verify-event-payment` et `/api/get-event-payment-config` répondent **sans authentification** et exposent `fan_id`, `event_session_id` et le compte Stripe destinataire. À fermer avant l'ouverture au public.
- Les écrans de revenus restent pollués par les **données de test de juillet** (2 567 € de dédicaces fictives) → §3.

### ✅ LIVE VIDÉO VALIDÉ AUSSI (04/08/2026, ~16h30) — les 2 sources de revenus sont prouvées

**Les deux issues testées en argent réel :**
- **Célébrité raccroche avant la fin** → pré-autorisation **Annulée** chez Stripe, aucune facture, fan non débité. ✅
- **Appel mené jusqu'au bout du minuteur** → **capturé**, factures `PLYZ-2026-000014` puis `PLYZ-2026-000015` (`video_call`, 2,00 €, commission 0,30 €), écran de notation côté fan. ✅

**Vérifié aussi** : le compte Connect `acct_1U0eNmAYpnt7V5BS` est **Activé** et **reçoit réellement l'argent** (solde 2,50 €). Le split 85/15 arrive bien à destination — le compteur « volume de transfert 0,00 € » de la page d'accueil Stripe est trompeur, ne pas s'y fier.

**🔴 BUG CRITIQUE #2 TROUVÉ ET CORRIGÉ — aucune célébrité au nom accentué ne pouvait vendre d'appel vidéo.** Le `cancelUrl` envoyé à Stripe interpolait `celebrityName` (texte libre) **sans `encodeURIComponent`**, alors que le `successUrl` juste au-dessus et le `fanName` de la même ligne l'encodaient. Stripe refusait l'URL invalide → 500 → l'app affichait « Échec de l'achat », message générique qui masquait la cause. Portée : Béatrice, Zoé, Noël, Frédéric, Jean-François… une grande partie des noms français. Corrigé, et la même protection appliquée par précaution au flux dédicace (dont les URL ne transportent qu'un code alphanumérique — défaut absent, vérifié par scan).

**Autre correctif** : le fan lisait **« Vous ne serez pas débité »** APRÈS avoir été débité. À l'expiration du minuteur, l'hôte quitte la salle Daily en premier ; le fan classait cette fin normale en « la célébrité a raccroché », affichait l'écran de remboursement et lançait même une annulation — qui n'échouait que parce que la capture serveur avait gagné la course. Une course entre deux téléphones décidait de ce que lisait le client. Corrigé par reclassement : un départ survenu **après** la durée prévue est une fin normale.

**⚠️ RESTE OUVERT (non bloquant)** :
- **Incohérence entre les deux flux** : `create-checkout-session` (vidéo) exige `payouts_enabled`, `create-event-checkout` (dédicace) non. Une célébrité pourrait vendre des dédicaces mais pas des appels vidéo sans comprendre pourquoi. À aligner.
- **Messages d'erreur génériques** : « Échec de l'achat » masque le motif serveur, qui n'existe que dans la console. Deux diagnostics de la journée ont été ralentis par ça.
- **Web uniquement** : recharger l'URL d'un appel terminé y fait rejoindre une salle vide. Sans objet sur les apps mobiles (écrans non adressables par URL). Le corriger proprement suppose de distinguer une reconnexion accidentelle légitime d'un appel déjà terminé.

---

## ⚡ TL;DR — l'ordre à suivre

1. 🔴 [Stripe en mode LIVE](#1--stripe--passer-en-mode-live) (le vrai argent)
2. 🔴 [Serveur Replit en production](#2--serveur-replit--déploiement-production) + tous les secrets
3. 🔴 [Nettoyer les données de test](#3--nettoyage-des-données-de-test) (faux comptes, transactions)
4. 🔴 [Rebuild EAS](#4--rebuild-eas-avec-les-bonnes-variables) avec les bonnes variables + retirer les endpoints de debug
5. 🟠 [Fiabiliser l'email OTP](#5--email-otp--fiabiliser-la-délivrabilité-planzoho) (migration vers plyz.io/Zoho)
6. 🟠 [Monitoring & alertes](#6--monitoring--alertes) (Sentry, UptimeRobot, Stripe, Supabase)
7. 🟠 [Durcissements sécurité restants](#7--sécurité--durcissements-restants)
8. 🟡 [Contenu de démo : garder ou retirer](#8--contenu-de-démo--garder-ou-retirer)
9. 🟡 [Légal : clauses à faire valider](#9--légal--clauses-à-finaliser)
10. 🟡 [Sort du bypass reviewer](#10--sort-du-bypass-reviewer)

---

## 1. 🔴 STRIPE — passer en mode LIVE

**Aujourd'hui : mode TEST** (aucun vrai paiement). Le bon compte plateforme est **Plyz = `acct_1SzE31AVRRCVL5ZQ`** (société Clickzou, IBAN Crédit Agricole …3677, libellé relevé « APP PLYZ BY CLICKZOU »).

⚠️ **Piège connu (cause du blocage de juillet)** : `SECRET_KEY_LIVE_STRIPE` dans Replit contient aujourd'hui la clé live de **clickzou.fr** (`acct_1NWFzy…`, PAS de Connect) = **le mauvais compte**. Il faut la remplacer par la clé live **du compte Plyz**.

À faire (Dashboard Stripe + Secrets Replit) :
- [ ] Récupérer la **clé secrète LIVE du compte Plyz** (`sk_live_51SzE31…`) → la mettre dans `SECRET_KEY_LIVE_STRIPE` (Replit).
- [ ] Mettre le secret Replit **`STRIPE_MODE=live`**.
- [ ] **Activer Connect en mode LIVE** sur le compte Plyz (aujourd'hui activé en test).
- [ ] **Recréer le webhook en LIVE** → `https://plyz-app.replit.app/api/stripe-webhook`, événements `checkout.session.completed` + `payment_intent.succeeded` → mettre le nouveau secret dans `STRIPE_WEBHOOK_SECRET` (Replit).
- [ ] Régler le **nom public de l'entreprise = « Plyz »** sur le compte LIVE (sinon l'écran d'onboarding Connect affiche « clickzou.fr » car `business_profile.name=null`).
- [ ] Vérifier le **libellé de relevé** = « App Plyz by Clickzou » (≤ 22 car.).
- [ ] **Republier** le Deployment Replit après chaque changement de secret.
- [ ] **Test réel** : un vrai paiement de bout en bout (split 85/15, capture, virement, facture).

---

## 2. 🔴 SERVEUR REPLIT — déploiement production

Le backend est sur **Replit** (plan Core, ⚠️ **abonnement annulé, expire le 22/01/2027 → à réactiver**). Il doit tourner en **Deployment** (URL stable `plyz-app.replit.app`), pas en mode dev qui s'endort.

- [ ] **Réactiver l'abonnement Replit Core**.
- [ ] S'assurer que le **Deployment prod** (`plyz-app.replit.app`) est actif et à jour (`git pull` depuis plyz.git + Republish).
- [ ] Vérifier **TOUS les secrets du Deployment prod** (pas seulement du workspace dev) :
  - [ ] `STRIPE_MODE=live` + `SECRET_KEY_LIVE_STRIPE` (compte Plyz) + `STRIPE_WEBHOOK_SECRET` (live)
  - [ ] `ANTHROPIC_API_KEY` (sinon la **traduction auto** ne marche pas en prod — l'app affiche l'original sans planter)
  - [ ] `DAILY_API_KEY` (nouvelle clé rotée) + **supprimer** `EXPO_PUBLIC_DAILY_API_KEY` s'il traîne
  - [ ] `SMTP_*` (voir §5 — à faire pointer vers Zoho/plyz.io)
  - [ ] `GOOGLE_SAFE_BROWSING_KEY` (modération des liens site web des célébrités) si activé
  - [ ] Secrets Supabase (URL + service_role)
- [ ] `npm install` fait dans `server/` (dépendances nodemailer, etc.).

---

## 3. 🔴 NETTOYAGE DES DONNÉES DE TEST

Repartir d'une base propre **juste avant l'ouverture** (pas avant : on en a besoin pour tester).

**⚠️ NE JAMAIS SUPPRIMER** le compte admin **`jc@clickzou.fr`** → user_id **`e7c06a67-2cd0-4aa1-bbf6-477fbb162ce8`** (projet actuel `qoitixdpcqlzgyusbgdx`).

- [ ] Supprimer **tous les comptes utilisateurs de test**, notamment :
  - les 8 comptes démo `demo-*@plyz-demo.local` (voir §8 — décider AVANT)
  - `jayc.events@gmail.com` (fan test, `cec8b9f5`)
  - `plyz.review@gmail.com` (compte reviewer — voir §10)
  - `31.macha@gmail.com` et tout autre compte de test créé pendant les essais
- [ ] Vider les tables de transactions/revenus : `fan_transactions`, `celebrity_earnings`, `event_paid_fans`, `payout_*`, `store_settlements`, etc.
- [ ] Supprimer les **comptes Stripe Connect de test** (Dashboard Stripe + références en base : `stripe_account_id`, comptes orphelins `acct_1TpWV2…`, `acct_1TpVzo…`, `acct_1Tlt…`).
- [ ] Nettoyer les données de test résiduelles : `celebrity_pricing` de JayC, `celebrity_profiles.is_listed=true` de JayC.
- [ ] Vider/valider les **buckets Storage** (`events`, `memories`) : retirer les images de test.

---

## 4. 🔴 REBUILD EAS (avec les bonnes variables)

Certaines fonctionnalités sont **natives** → présentes seulement après un nouveau build (vidéo de bienvenue `expo-video`, Sentry, permissions notifications).

- [x] **VÉRIFIÉ 2026-08-03** — l'environnement EAS profil `production` (`eas.json:40-48`) contient déjà les **vraies valeurs** (plus de placeholders) : `EXPO_PUBLIC_STRIPE_SERVER_URL` = `https://plyz-app.replit.app`, vrai DSN Sentry, projet Supabase `qoitixdpcqlzgyusbgdx`.
- [x] **VÉRIFIÉ 2026-08-03** — l'endpoint de debug `GET /api/_diag/stripe` est **déjà retiré** (`server/index.js:1039`, commentaire « Ne pas réintroduire en prod »).
- [ ] ⚠️ `submit.production.android.serviceAccountKeyPath` = encore le placeholder `./path/to/api-key.json` → sans effet tant que JC soumet à la main sur la Play Console, à corriger si on veut `eas submit`.
- [ ] Incrémenter le **version code / build number** (actuellement `app.json` : `versionCode: 10`, `buildNumber: "1"`, `version: "1.0.0"`).
- [ ] ⚠️ **Retirer le bypass reviewer** (`components/WelcomeAuthScreen.tsx:59-60`) — le mot de passe `PlyzReview2026!` est en clair dans l'APK publié. Cf §10.
- [ ] `eas build --platform android --profile production` (AAB) et/ou `--platform ios`.
- [ ] Tester l'**APK/IPA autonome** (pas seulement le dev client) avant de pousser en prod sur les stores.

---

## 5. 🟠 EMAIL OTP — fiabiliser la délivrabilité (plan Zoho)

**C'est la cause du refus Google** (le code de connexion n'arrive pas chez les nouveaux utilisateurs). Cf `project_google_refus_broken_functionality`.

**Diagnostic :** Supabase a un **Send Email Hook actif** qui envoie le code via le SMTP maison **`mail.signtouch.click`** → mauvaise réputation + marque incohérente (signtouch vs Plyz) → **spam/blocage** vers les boîtes qui ne connaissent pas l'expéditeur. La génération du code est OK (prouvé).

**Bonne nouvelle :** `plyz.io` est **déjà branché sur Zoho** avec **SPF + DKIM validés**, et l'alias **`noreply@plyz.io`** existe déjà (cf `project_site_email_plyz`). Presque rien à créer.

À faire :
- [ ] Repointer l'envoi (Send Email Hook / serveur) : SMTP **`smtp.zoho.eu`**, auth = `contact@clickzou.fr` + **mot de passe d'application Zoho**, `From = "Plyz <noreply@plyz.io>"`. Mettre à jour les secrets `SMTP_HOST/PORT/USER/PASS/FROM` (Replit + le hook).
- [ ] Ajouter un enregistrement **DMARC** sur plyz.io (chez OVH, la zone DNS) — recommandé, pas encore fait.
- [ ] **Résilier l'OVH Email Pro pour plyz.io** (économie) UNE FOIS confirmé que plus aucun envoi ne dépend d'un compte OVH.
- [ ] **Test de délivrabilité** : envoyer un code à un **Gmail neuf** (vérifier qu'il arrive **en boîte de réception**, pas en spam) + score **mail-tester.com** ≥ 8/10.
- [ ] Vérifier que le `checkFail` MX/SPF vu dans OVH est bien **normal** (les MX pointent vers Zoho).

> ⚠️ Ce point protège **iOS aussi** (même flux de connexion) et tous les vrais utilisateurs, pas seulement Google.

---

## 6. 🟠 MONITORING & ALERTES

JC veut être averti de **tout problème** sur **jc@clickzou.fr**.

- [ ] **Sentry** (crashes + erreurs JS app/web/serveur) : installer/activer juste avant la mise en ligne (~30 min), DSN dans `EXPO_PUBLIC_SENTRY_DSN`. ⚠️ Sentry ne capture PAS un bouton inerte sans exception → garder le bouton **« Signaler un problème »** en complément.
- [x] **UptimeRobot** — ✅ **CONFIGURÉ LE 05/08**. Compte gratuit (50 moniteurs, contrôle toutes les 5 min), alertes vers `jc@clickzou.fr`.
  Moniteur principal : type **Keyword** sur `https://plyz-app.replit.app/api/health`, mot-clé `"stripe":true`, déclenchement **« when keyword does not exist »**. Vérifié Up 100 %.
  💡 **Pourquoi Keyword plutôt que HTTP** : si Stripe se déconnecte, le serveur continue de répondre 200 OK et une surveillance HTTP classique ne verrait rien. Le mot-clé détecte la panne serveur **et** la panne de paiement. Le moniteur HTTP initial a été supprimé pour ne pas recevoir deux alertes par incident.
  ⚠️ Le type de moniteur **ne se modifie pas après création** chez UptimeRobot : pour changer, il faut créer un nouveau moniteur et supprimer l'ancien (attendre que le nouveau affiche « Up » avant de supprimer).
  Second moniteur : HTTP simple sur `https://plyz.io` (site vitrine).
- [ ] **Stripe** : vérifier que les notifications paiements/litiges/virements arrivent sur le bon email.
- [x] **Supabase spend cap** — ✅ **VÉRIFIÉ LE 05/08 : « Spend cap is disabled »**. Le risque décrit ici (base basculée en lecture seule un jour d'affluence) **n'existe pas**. Aucune option d'alerte de budget n'est proposée par Supabase : le seul indicateur est la ligne « Projected Costs » de la page Billing de l'organisation. À titre de repère, projection au 05/08 = **54,89 $/mois** (25 $ de plan Pro + le compute de 4 projets : palladia, radici, Signtouch V2, clickzou-site-web — 3 d'entre eux ne concernent pas Plyz). MFA Supabase : déjà activée le 29/06.
- [x] **Alertes intrusion + dashboard** — ✅ **DÉPLOYÉ ET VÉRIFIÉ DE BOUT EN BOUT LE 05/08.** Test réel : un appel de `/api/admin/health-check` sans droits renvoie 403, crée une ligne `service_alerts` (`security` / `critical`, avec IP et URL) **et** envoie l'e-mail à jc@clickzou.fr — reçu **6 secondes plus tard**, depuis `noreply@plyz.io`, donc la chaîne **survit à la migration ZeptoMail du 03/08**. Le lien vers https://plyz.io/tableaustats est présent dans le mail.
  ⚠️ **5 alertes restent ouvertes** dans le dashboard, toutes issues des tests (3 × accès admin refusé les 04-05/08, 2 × `billing` du 07/07 « paiement capturé sans facture »). À marquer résolues pour repartir d'un tableau propre — sinon un vrai incident se noiera dedans.
  💡 Méthode de vérification, réutilisable : lire la table en REST avec la `SUPABASE_SERVICE_ROLE_KEY` du `.env` racine (`GET /rest/v1/service_alerts?order=created_at.desc`).

---

## 7. 🟠 SÉCURITÉ — durcissements restants

Le gros de l'audit sécurité #1 et #2 est **corrigé et testé**. Restent des points **mineurs non bloquants** (cf `project_securite_audit2`) :

- [ ] `scripts/sync-root-env.cjs` copie **tout** le `.env` racine (y compris service_role, sk_live) vers `signtouch-app-main/.env.local` → **filtrer pour ne copier QUE les `EXPO_PUBLIC_*`**.
- [ ] Retirer la mention de la clé Daily dans `README.md:35`.
- [ ] Résiduels faibles : policies `session_ratings` (fausse note possible, recomptée serveur), buckets `events`/`memories` listing, policies device-based sur `event_*`, `pg_trgm`. À durcir **plus tard** (risque de casse, impact faible, aucune fuite d'argent/email).
- [ ] Confirmer que la **MFA admin (TOTP)** reste activée dans Supabase Authentication.

---

## 8. 🟡 CONTENU DE DÉMO — garder ou retirer

8 célébrités fictives (`demo-*@plyz-demo.local`) + posts + événements + galerie, injectés pour les captures stores (visages 100% inventés). Cf `project_contenu_demo`.

- [ ] **Décider** : garder ce contenu vitrine au lancement (app « vivante ») OU le retirer (comptes fictifs).
- [ ] Si on garde pour la France : remettre le contenu **en FR** → `node server/seed-lang.cjs fr` (⚠️ actuellement basculé en EN pour les captures anglaises).
- [ ] Ne PAS confondre avec les comptes de test de JC (à supprimer, eux — §3).

---

## 9. 🟡 LÉGAL — clauses à finaliser

CGU/CGV validées, mais **à compléter puis REVALIDER par l'avocat** (`assets/legal/cgv.ts`, 15 langues) :
- [ ] Article **« Conditions de paiement et de débit »** (vidéo : débité si l'appel a eu lieu / non débité si la célébrité ne se connecte pas ; dédicace : débité seulement si photo transmise).
- [ ] Clause de **limitation de responsabilité technique** (batterie/réseau/matériel/app fermée). ⚠️ La clause « débité malgré un souci technique côté fan » est délicate en droit conso FR (risque « clause abusive ») → **avocat**.
- [ ] Clause **droit à l'image clubs/organisations** (le club garantit détenir les droits ; Plyz décline toute responsabilité).

---

## 10. 🟡 SORT DU BYPASS REVIEWER

Si un **accès reviewer** (mot de passe ou test OTP pour `plyz.review@gmail.com`) a été ajouté pour faire passer la review :
- [ ] **Décider** : le garder (risque faible, compte dédié sans privilège) OU le retirer au prochain build.
- [ ] Si on le retire du code → prévoir un nouveau build EAS.
- [ ] Ne pas supprimer le compte reviewer trop tôt si Google/Apple peuvent re-tester lors d'une future mise à jour.

---

## 📌 POST-LANCEMENT (chantiers non bloquants, à planifier après)

- **Notifications PUSH serveur** (compte validé, rappels événement 1h/2min même app fermée, avec lien plyz.io) — aujourd'hui seulement des rappels locaux.
- **Partage viral riche** (pages web plyz.io/post/[id] et /evenement/[code] + deep links universels) pour les boutons Partager.
- **Bug** : événement rejoint par un fan qui disparaît au refresh (persistance en AsyncStorage, pas en base → table `fan_joined_events` à créer).
- **Compteur réservations** « X fans ont réservé » sur événements futurs (bloqué : réservations en local).
- **Modération photos** (profil + posts, Claude vision).
- **Scalabilité** (RLS `select auth.uid()`, polling → Realtime) avant grand volume.

---

*Ce runbook est aussi indexé dans la mémoire projet (`project_avant_publication`, `project_google_refus_broken_functionality`). Tenir à jour au fil des tâches cochées.*
