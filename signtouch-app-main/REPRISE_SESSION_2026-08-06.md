# REPRISE DE SESSION — nuit du 5 au 6 août 2026

> **Quand JC dit « go » : lire ce fichier en entier, puis reprendre au § ACTION IMMÉDIATE.**
> Ce document remplace la version précédente (dont le § ACTION IMMÉDIATE est réglé).

---

## ACTION IMMÉDIATE

**Une seule chose à faire, et c'est JC qui la fait dans l'application.**

Une demande d'appel vidéo attend d'être acceptée :

| | |
|---|---|
| Identifiant | `ea3e10bf-c2d9-4d33-a849-63ac17cdc520` |
| Statut | `pending` (tarif correctement figé : **1,00 € / 2 min**) |
| Créée le | 6 août à 00 h 28 |
| Expire le | 7 août à 22 h 10 UTC — **48 h**, donc encore valable |

**Chemin dans l'app installée sur le téléphone de JC** (l'accès a changé depuis, voir plus bas) :
**onglet Compte → tout en bas → « Mes appels vidéo »** (icône caméra violette, sous « Mes documents »).

Connecté en **célébrité**, saisir la date au format **exact** `2026-08-06T14:30` puis **Accepter**.

> ⚠️ Sur l'APK actuellement installé, une date mal tapée ne produit **aucun message** :
> le bouton ne fait rien. Le correctif existe (commit `1880141`) mais n'est pas dans cette build.

**Ce qu'on vérifie ensuite** (script prêt : `scratchpad/watch_accept.js`, ou `check_vcr.js`) :
1. statut `accepted` et `scheduled_at` renseigné en base ;
2. l'heure affichée côté fan = la même heure locale que celle tapée (même fuseau) ;
3. e-mail « Votre appel vidéo privé est accepté » chez le fan, **avec le bouton « Régler mon créneau »** ;
4. aucune ligne `service=email` dans `service_alerts` (une ligne = envoi raté).

Puis : **paiement de 1 €** — c'est lui qui tranchera la question Stripe restée ouverte.

---

## ÉTAT DES DÉPLOIEMENTS AU MOMENT DE L'ARRÊT

| Quoi | État |
|---|---|
| Serveur Replit | ✅ à jour jusqu'à `4158b90` — **`git pull` fait, Republish à confirmer** pour ce dernier commit |
| Site plyz.io | ✅ à jour, `plyz.io/appel-video` répond 200 (vérifié) |
| Build Android `d72b89b3` | ✅ **TERMINÉE** — https://expo.dev/artifacts/eas/eOGrc8lFlWNJP_9rzljSoc1_fFD-r-rqTFcAP08RiFY.apk |
| Build iOS 18 | envoyée sur App Store Connect (abandonnée par JC : « ios sert à rien ») |

⚠️ **La build Android terminée contient le code jusqu'à `4d4900a` seulement.**
Les correctifs d'application de cette session (`1880141`, `ea9c3f7`) n'y sont pas.
Une nouvelle build sera nécessaire — mais **pas pour les tests en cours**, qui se jouent
tous côté serveur.

---

## CE QUI A ÉTÉ FAIT DANS CETTE SESSION

### Le blocage de départ, résolu

Le serveur Replit tournait un code périmé. Cause : **`git pull` fait, Republish oublié**
— le code était sur le disque mais l'ancien processus tournait toujours en mémoire.
Une fois republié, la demande suivante est partie avec le bon tarif (**1,00 € / 2 min**,
vérifié en base) et **l'e-mail est arrivé** chez la célébrité, expéditeur `noreply@plyz.io`,
en boîte de réception.

### Commits (poussés sur `plyz` ET `origin`)

| Commit | Objet |
|---|---|
| `0e682f4` | 4 écritures serveur qui répondaient « c'est fait » sans vérifier leur erreur |
| `ea9c3f7` | Bouton d'accès direct dans les e-mails + 2 échecs silencieux corrigés |
| `7a50c01` | ⚠️ **commit inutile** (voir « erreur de diagnostic » plus bas), inoffensif |
| `1880141` | Validation de la date du créneau avant appel serveur |
| `4158b90` | E-mail sur **chaque** étape (refus, annulation, expiration) |

Dépôt du site (`Clickzou/plyz-site`) : `0c9e1ff` (page de rebond) + `5393942` (routeur de langue).

### Les bugs trouvés — tous silencieux, encore

1. **Annulation qui n'annule pas** (`0e682f4`). Quatre écritures en base ne vérifiaient
   pas leur erreur et répondaient `ok` quoi qu'il arrive. L'écran affichait « annulé »,
   la demande restait ouverte, et toute nouvelle demande était refusée pour
   « demande déjà en cours » — sans rien pour l'expliquer. **C'est ce que JC a vécu.**
   Le plus coûteux des quatre n'était pas l'annulation mais **l'enregistrement de la
   session Stripe** : sans son identifiant en base, le fan payait puis la confirmation
   échouait sur `no_checkout_session` — argent immobilisé en autorisation, prestation
   jamais marquée payée. Le paiement est désormais refusé d'emblée et la session Stripe
   expirée, plutôt que d'encaisser dans le vide.

2. **E-mail perdu = e-mail envoyé** (`ea9c3f7`). `vcrEmail` échouait en silence par
   construction : ni SMTP absent ni erreur d'envoi ne laissaient de trace. Rien ne
   distinguait un e-mail parti d'un e-mail perdu — c'est ce qui a coûté le début de
   soirée. Chaque échec écrit maintenant dans `service_alerts` (service `email`).

3. **Liste vide au lieu d'une erreur** (`ea9c3f7`). L'écran des appels vidéo lisait un
   refus du serveur (401, panne) comme « zéro demande » et affichait une liste vide
   rassurante.

4. **Bouton Accepter sans effet** (`1880141`). `new Date(saisie).toISOString()` était
   évalué dans le `onPress`, hors de tout `try` : sur un champ vide ou mal tapé,
   l'exception se produisait avant même d'atteindre le serveur. Rien ne s'affichait.

5. **Trois étapes sans e-mail** (`4158b90`). Refus, annulation et expiration ne
   partaient qu'en notification push — inutile si l'app n'est pas installée ou si les
   notifications sont refusées. Ce sont pourtant les messages qu'il est le plus grave
   de manquer : sans l'e-mail d'annulation, on se présente à un rendez-vous qui n'aura
   pas lieu. L'expiration prévient désormais **aussi la célébrité** : une demande
   laissée sans réponse est une vente perdue, et rien ne le lui disait.

### Couverture e-mail, désormais complète

| Étape | Destinataire |
|---|---|
| Demande reçue | célébrité |
| Créneau proposé | fan |
| Paiement confirmé | célébrité |
| Refus | fan |
| Annulation | l'autre partie |
| Expiration | fan **et** célébrité |

Chaque e-mail porte un bouton vers `https://plyz.io/appel-video`, page de rebond qui
ouvre l'app. Elle ne lit rien en base et n'affiche aucune donnée : un e-mail se
transfère, une URL reste dans un historique — le détail de la demande ne doit exister
que derrière la connexion.

---

## LES DEUX PIÈGES QUI ONT COÛTÉ LE PLUS DE TEMPS

### 1. Deux dépôts distants (≈ 30 min perdues)

Le dossier local a **deux** remotes : `origin` = `Clickzou/signtouch`, `plyz` =
`Clickzou/plyz`. **Replit lit `plyz`.** Un `git push origin main` n'arrive jamais
jusqu'au serveur, et le `git pull` de JC répond « Already up to date » — en toute
sincérité. **Toujours `git push plyz main`** (pousser sur les deux par sécurité).
C'était déjà écrit dans la mémoire du projet et je ne l'ai pas appliqué.

### 2. Page 404 malgré un déploiement vert (≈ 40 min perdues)

Le site est multilingue (next-intl). `plyz-site/proxy.ts` intercepte toutes les URL
pour détecter la langue, **sauf celles listées dans son `matcher`**. Une page créée à
la racine de `app/` sans y être ajoutée est détournée vers une locale où elle n'existe
pas : **404 alors que le déploiement Vercel est vert et la page réellement construite**.
Signe distinctif : en-tête **`X-Matched-Path: /404`** — c'est Next qui refuse, pas un
cache périmé, inutile de chercher côté CDN.

**Erreur de diagnostic à ne pas refaire** : j'ai d'abord conclu que `plyz-site` était un
sous-module et que Vercel déployait le dépôt principal. **C'était faux.** Le compte
Clickzou a une dizaine de projets Vercel ; celui qui sert le site s'appelle **`plyz-site`**
(déploiement auto au push, build ~35 s), à ne pas confondre avec le projet voisin **`plyz`**
(build 3 s, c'est le dépôt de l'app). Le commit `7a50c01` est né de cette erreur ; il est
inutile mais inoffensif. **Vérifier quel projet sert le domaine avant de conclure.**

---

## POINTS OUVERTS

- **Stripe** : `stripe_charges_enabled = false` en base pour JayC alors que
  `can_accept_payments = true` (ce booléen ne dépend que de l'existence du compte).
  Le vrai contrôle se fait à la création du paiement (`CHARGES_NOT_ENABLED`).
  **Le paiement réel de 1 € n'a toujours pas été tenté** — c'est lui qui tranchera.
  Les clés Stripe du `.env` local **ne peuvent pas** interroger le compte connecté :
  seul le serveur Replit a la bonne clé. Ne pas rejouer ce diagnostic depuis la machine.
- **Saisie de la date au clavier** (`AAAA-MM-JJTHH:MM`) : pénible et fragile pour un
  utilisateur réel. Un vrai sélecteur de date serait à faire — signalé, pas fait.
- **Carte d'événement** : « ⏱ min » et « 👥 places » s'affichent sans leur valeur.
- **Version 1.0.2** : pas encore lancée pour les stores.

---

## RESTE À TESTER

### A — tout de suite, sans nouvelle build

1. **Accepter** la demande en attente → e-mail au fan, **heure juste** (fuseaux horaires)
2. **Payer 1 €** → e-mail de confirmation + facture générée
3. **Annuler** une demande → vérifier qu'elle passe bien à `cancelled` en base
   (c'est le bug corrigé, jamais reverifié depuis)

### B — nécessite d'installer la build `d72b89b3` (terminée, lien plus haut)

4. Pastille sur l'onglet Événements : 3 couleurs + battement quand c'est à soi d'agir
5. Entrée « Mes appels vidéo privés » sur la page Événements
6. Bouton « Rejoindre » sur les cartes du catalogue
7. Accès permanent « Mes paiements » + avertissement
8. Ouverture directe du suivi après une demande

### C — écrans jamais vérifiés

9. Les 2 encadrés **ambre** (créer une dédicace / en rejoindre une)
10. Les 2 encadrés **verts** (créer un live / en rejoindre un)
11. **Icône Publication** en haut à gauche, célébrités uniquement, 2 onglets
12. **Annonce automatique d'événement** : seule dans « Tout » et « Événements »,
    **jamais** dans « Posts » ; suit modification et suppression
13. Page **Événements** refondue : recherche + filtres En cours / À venir / Tous
14. La **photo dans Actu** qui s'affichait puis disparaissait
15. Plus aucune **célébrité fictive**

### D — avec deux Android (JC + sa mère)

16. **La visio en direct** — cœur de l'appel vidéo, jamais testé
17. Une **dédicace live** à deux

---

## PIÈGES TECHNIQUES, À NE PAS REFAIRE

- **`/healthz` et `/` renvoient 504** : ces routes n'existent pas et tombent dans le
  proxy Expo. Tester `/api/ping`, `/api/health`. Un **504 « Error occurred while trying
  to proxy » = route inexistante**, un **401 = route existante mais sans authentification** :
  c'est le test qui distingue « endpoint absent » de « serveur périmé ».
- **EAS reste bloqué** sur « Computing project fingerprint » : toujours lancer avec
  `EAS_SKIP_AUTO_FINGERPRINT=1`. `eas build:view` n'accepte pas `--non-interactive` ;
  utiliser `eas build:list --limit 1 --json --non-interactive`.
- **Watcher de build** : vérifier le code HTTP **et** le contenu. Une réponse d'erreur
  ne contient pas la chaîne cherchée non plus.
- **Bash + accents/backticks** : passer par un fichier `.js` dans le scratchpad plutôt
  que par `node -e`.
- **Images de JC** : recadrer légèrement (limite 2000 px quand la conversation en
  contient beaucoup, ses captures font 2048 px).

---

## RÈGLES DE TRAVAIL DE JC (rappel)

- **Tout problème repéré se corrige immédiatement**, même mineur, même sans impact réel.
- Non-développeur : explications simples, recommandation directe plutôt qu'un catalogue.
- Simuler les deux côtés (fan et célébrité), lire le code, traquer tous les bugs d'un
  coup — pas des correctifs un par un testés en boucle.
- **Quand il conteste un diagnostic, le prendre au sérieux.**
- **Ne pas partir en excursion.** Cette session a dérivé quarante minutes sur le site
  alors que le sujet était l'application ; JC l'a fait remarquer, à juste titre.
