# REPRISE DE SESSION — nuit du 5 au 6 août 2026

> Document écrit à la demande de JC avant un redémarrage de VS Code.
> **Quand JC dit « go » : lire ce fichier en entier, puis reprendre au § ACTION IMMÉDIATE.**

---

## ACTION IMMÉDIATE (la seule chose qui bloque tout le reste)

**Le serveur Replit tourne un code périmé.** Il lui manque le commit `5c46f72`
(tarif figé + e-mails des appels vidéo). Preuve relevée à 00 h 10 : une nouvelle
demande d'appel vidéo est partie avec `price_cents = 0` et `duration_minutes = null`,
et la notification push portait l'ancien libellé (sans le prix ni la durée).

**À faire faire à JC :** Replit → onglet **Shell** → `git pull` → bouton **Republish**.

**Vérification après coup** (à lancer soi-même, ne pas croire sur parole) :

```bash
cd "c:/Users/jc/Documents/CLICKZOU/1- PROJETS/SIGNTOUCH/dev/signtouch"
node -e "
const fs=require('fs');
const env=fs.readFileSync('.env','utf8');
const get=k=>{const m=env.match(new RegExp('^'+k+'=(.*)\$','m'));return m?m[1].trim().replace(/^[\"']|[\"']\$/g,''):null;};
const url=get('EXPO_PUBLIC_SUPABASE_URL'), key=get('SUPABASE_SERVICE_ROLE_KEY');
const h={apikey:key,Authorization:'Bearer '+key};
(async()=>{
  const r=await fetch(url+'/rest/v1/video_call_requests?select=*&order=created_at.desc&limit=2',{headers:h});
  for(const d of await r.json())
    console.log(d.status+' | '+((d.price_cents||0)/100).toFixed(2)+' EUR / '+(d.duration_minutes||'null')+' min');
})();
"
```

Puis demander à JC d'**annuler la demande en cours et d'en refaire une**.
Attendu : `1.00 EUR / 2 min` **et** un e-mail reçu côté célébrité.
Si le prix reste à 0, le redéploiement n'a pas pris — chercher pourquoi avant toute autre chose.

---

## CE QUI TOURNE EN CE MOMENT

| Quoi | Identifiant | État au moment de l'arrêt |
|---|---|---|
| Build Android (preview, APK) | `d72b89b3-c784-463e-94fb-0e73c9a8c90e` | en cours — contient TOUT le travail de la nuit |
| Build iOS 18 (production) | `121805d4-1b50-4255-b42d-22c7334ae1f0` | terminée, **envoyée sur App Store Connect**, en traitement TestFlight |
| Build Android annulée | `3f1d9fc7` | annulée volontairement (périmée avant d'avoir fini) |

Lien de la build Android :
https://expo.dev/accounts/clickzou/projects/signtouch/builds/d72b89b3-c784-463e-94fb-0e73c9a8c90e

**Facturation EAS** : le crédit inclus (45 $) est épuisé. Les builds
supplémentaires sont facturées — **≈ 2,00 $ pour 33 builds**, soit quelques
centimes l'unité. Le crédit se réinitialise le **8 août 2026**. JC a tranché :
« je ne suis pas à quelques euros », on ne s'arrête pas pour ça.

---

## CE QUI A ÉTÉ FAIT CETTE NUIT

### Dépôt principal (`plyz`, branche `main`) — poussé jusqu'à `4d4900a`

| Commit | Objet |
|---|---|
| `ee80264` | SQL modération : `DROP FUNCTION` avant recréation (erreur 42P13) + `.gitignore` des binaires de build |
| `c870717` | Dédicace : avertissement « présence sur place obligatoire, 1 km » sur les 2 écrans, 15 langues |
| `7bf5583` | Appel vidéo : « participez du monde entier, sans surtaxe » sur les 2 écrans, 15 langues |
| `dc3d839` | **Bug majeur** : tarifs jetés en silence + accès permanent aux paiements + iOS buildNumber 18 |
| `0c11b52` | Bouton « Rejoindre » sur les cartes du catalogue |
| `5c46f72` | **Bug majeur** : tarif figé à la demande + e-mails sur les 3 étapes de l'appel vidéo |
| `33b02ad` | Après une demande, le fan est emmené sur son suivi |
| `d3badb8` | Entrée « appels vidéo » sur l'écran Événements (les deux rôles) |
| `72ecdd6` | Pastille chiffrée sur l'onglet Événements de la barre du bas |
| `4d4900a` | Pastille : orange = attente, vert = validé, **rouge = refus/annulation/expiration** |

### Dashboard (`plyz-site`) — poussé jusqu'à `9641123`

- `31d736a` — modération des contenus signalés, sur la page `/tableaustats/signalements` existante
- `9641123` — motifs affichés en français, actions limitées au type de contenu visé

### Base de données

`sql/moderation_content_reports.sql` — **exécuté avec succès** (après ajout des
`DROP FUNCTION` en tête). Fonctions en place : `admin_list_content_reports`,
`admin_moderate_content`, `admin_count_pending_reports`.

---

## LES QUATRE BUGS TROUVÉS GRÂCE AUX TESTS DE JC

Tous corrigés. À garder en tête : **aucun ne remontait la moindre erreur** —
c'est le fil rouge de la session.

1. **Tarifs jetés en silence** (`dc3d839`) — `celebrity_pricing` partage sa clé
   primaire avec `celebrity_profiles` : PostgREST renvoie un **objet**, le serveur
   lisait `celebrity_pricing?.[0]` (undefined sur un objet). Aucune célébrité
   n'aurait pu rien vendre. Helper `firstPricing()` ajouté, 4 appels corrigés
   dont 2 sur des chemins de paiement.

2. **Accès aux paiements disparu** (`dc3d839`) — l'entrée « Activer mes paiements »
   n'existait que si l'app estimait les paiements inactifs. Une fois « plus tard »
   cliqué, plus aucun chemin de retour. Entrée rendue permanente.

3. **Tarif non figé** (`5c46f72`) — le serveur lisait le tarif pour le vérifier
   puis ne l'écrivait pas : `price_cents = 0`. Le fan aurait payé zéro.

4. **Aucun e-mail sur les appels vidéo** (`5c46f72`) — seule une notification push
   partait. Une demande expire en 48 h : notification manquée = vente perdue.
   E-mails ajoutés sur demande / acceptation / paiement.

---

## VALIDÉ EN VRAI PAR JC CETTE NUIT

- Version affichée : **1.0.1 (16)** (au lieu du « v1.0.0 » figé)
- Langues parlées sur le profil (FR 5★, EN 3★, ES 2★) avec drapeaux
- « À propos de vous » persistant
- Tarif d'appel vidéo enregistré (1 € / 2 min)
- Bouton « Demander un appel vidéo privé » enfin visible sur le profil
- **Chaîne de signalement complète** : app → e-mail (22 h 36) → dashboard →
  suppression → **contenu réellement disparu côté fan**
- Notifications push : 3 messages partis et marqués envoyés

---

## RESTE À TESTER

### A — dès que Replit est redéployé (APK actuel suffit)

1. **Refaire la demande d'appel vidéo** → attendu **1,00 € / 2 min** + **e-mail**
2. **Accepter côté célébrité** avec un créneau → e-mail au fan, **heure juste**
   (point le plus délicat : fuseaux horaires, `scheduled_at` est en UTC)
3. **Payer 1 €** → e-mail de confirmation + facture générée

### B — nécessite la build `d72b89b3`

4. Pastille sur l'onglet Événements : 3 couleurs + battement quand c'est à soi d'agir
5. Entrée « Mes appels vidéo privés » sur la page Événements
6. Bouton « Rejoindre » sur les cartes du catalogue
7. Accès permanent « Mes paiements » + avertissement
8. Ouverture directe du suivi après une demande

### C — écrans jamais vérifiés (build actuelle OU nouvelle)

9. Les 2 encadrés **ambre** (créer une dédicace / en rejoindre une)
10. Les 2 encadrés **verts** (créer un live / en rejoindre un)
11. **Icône Publication** en haut à gauche, célébrités uniquement, 2 onglets
12. **Annonce automatique d'événement** : apparaît seule dans « Tout » et
    « Événements », **jamais** dans « Posts » ; suit modification et suppression ;
    plus aucun bouton de publication manuelle
13. Page **Événements** refondue : recherche + filtres En cours / À venir / Tous
14. La **photo dans Actu** qui s'affichait puis disparaissait
15. Plus aucune **célébrité fictive**

### D — demain, avec deux Android (JC + sa mère)

16. **La visio en direct** — cœur de l'appel vidéo, jamais testé
17. Une **dédicace live** à deux

> L'iPhone du père est abandonné : JC a dit « ios sert à rien, je teste demain
> avec ma mère qui a aussi un android ». Ne pas relancer TestFlight de soi-même.

---

## POINTS OUVERTS, NON RÉSOLUS

- **Stripe** : `stripe_charges_enabled = false` en base pour JayC alors que
  `can_accept_payments = true` (ce booléen ne dépend que de l'existence du compte).
  Le vrai contrôle se fait à la création du paiement (`CHARGES_NOT_ENABLED`).
  **Le paiement réel de 1 € n'a pas encore été tenté** — c'est lui qui tranchera.
  Les clés Stripe du `.env` local **ne peuvent pas** interroger le compte connecté
  (« Only Stripe Connect platforms can work with other accounts ») : seul le
  serveur Replit a la bonne clé. Ne pas rejouer ce diagnostic depuis la machine.
- **Carte d'événement** : « ⏱ min » et « 👥 places » s'affichent sans leur valeur
  (repéré sur le profil célébrité, pas encore corrigé).
- **Version 1.0.2** : pas encore lancée pour les stores. iOS est en build 18,
  Android en versionCode 16. Apple examine toujours la 1.0.1 (build 17).

---

## PIÈGES RENCONTRÉS, À NE PAS REFAIRE

- **`/healthz` et `/` renvoient 504** sur le serveur : ces routes n'existent pas
  et tombent dans le proxy Expo, qui n'a rien en face. **Tester `/api/ping`,
  `/api/health` ou `/api/events`**, jamais la racine. J'ai conclu à tort à une
  panne de serveur pendant vingt minutes à cause de ça.
- **EAS reste bloqué** sur « Computing project fingerprint » (archive de 316 Mo) :
  toujours lancer avec `EAS_SKIP_AUTO_FINGERPRINT=1`. Sans ça, la commande tourne
  indéfiniment **sans rien créer ni rien afficher**.
- **Images de JC** : la conversation en contient beaucoup, la limite passe alors à
  2000 px. Ses captures font 2048 px de haut. Lui demander de **recadrer
  légèrement**, ne pas prétendre que le problème vient de son téléphone.
- **Watcher de build** : ne pas détecter « c'est prêt » par l'absence d'une chaîne
  (`"pricing":null`) — une réponse d'erreur du serveur ne la contient pas non plus,
  et produit un faux positif. Vérifier le code HTTP **et** le contenu.
- **Bash + accents/backticks** : passer par un fichier `.js` dans le scratchpad
  plutôt que par `node -e` avec du texte accentué.

---

## RÈGLES DE TRAVAIL DE JC (rappel)

- **Tout problème repéré se corrige immédiatement**, même mineur, même sans impact
  réel. Ne rien reporter à « plus tard ».
- Non-développeur : explications simples, recommandation directe plutôt qu'un
  catalogue d'options.
- Simuler les deux côtés (fan et célébrité), lire le code, traquer tous les bugs
  d'un coup — pas des correctifs un par un testés en boucle.
- Quand il conteste un diagnostic, **le prendre au sérieux** : il a eu raison deux
  fois cette nuit, et c'est ce qui a mené aux deux plus gros bugs.
