# REPRISE — nuit du 6 au 7 août 2026

> **Quand JC dit « go » : lire ce fichier en entier, puis dérouler la check-list de test.**
> Remplace `REPRISE_SESSION_2026-08-06.md`, dont l'action immédiate est réglée.

---

## AVANT TOUT — deux gestes de JC

| # | Geste | Pourquoi |
|---|---|---|
| 1 | **Republish Replit** | Le `git pull` est fait, mais le serveur tourne encore l'ancien code en mémoire. Sans Republish : pas de codes promo, pas de quota vidéo, pas de compteur de vues. **C'est le piège qui a déjà coûté une soirée.** |
| 2 | **Installer l'APK** `e3ff5c57` | Tout ce qui touche l'écran est dedans. |

✅ **Déjà fait :** `sql/vues_publications.sql` exécuté dans Supabase (vérifié en base).

---

## LE BUG DE LA SOIRÉE — résolu

**Supabase était réglé à 2 e-mails d'authentification par heure.** Deux. Pour le
projet entier. Au-delà, il répondait `429` et aucun code n'était envoyé — JC
recopiait le bon code, il était refusé, et le message d'erreur s'affichait en
anglais en petit sous le champ.

Porté à **10 000 000/h** par JC (Authentication → Rate Limits). Vérifié en
direct : un code repart. **Aucune app ne pouvait dépasser deux inscriptions par
heure.**

Il reste un délai anti-spam de 60 s par adresse — normal, présent partout, et
désormais annoncé par un décompte sur le bouton « Renvoyer le code ».

---

## CHECK-LIST DE TEST

### A — Compte et inscription

1. **Rejoindre sans compte** → la création de compte s'ouvre au clic sur les
   tuiles « Rejoindre » (écran Événements), depuis « Mon espace », et depuis
   « S'inscrire » sur la fiche d'une personnalité.
2. **Inscription** → e-mail, pseudo, photo. **Plus de nom, prénom ni adresse.**
3. **Plus de « Utilisateur »** : une demande d'appel vidéo doit arriver avec le
   pseudo ET la photo du fan.
4. **Mes documents** → encart bleu « Ajouter mes coordonnées » (facultatif).
5. **Commentaire sans compte** → toucher le champ ouvre la création de compte
   (avant la frappe, pas après).
6. **Signaler sans compte** → compte exigé, sur les trois écrans : fil, fiche
   personnalité, détail de publication.
7. **Code par e-mail erroné** → message en français qui dit quoi faire ; le
   bouton « Renvoyer » affiche un décompte de 60 s.

### B — Appels vidéo privés

8. **Créneau dépassé** → carte bordée de **rouge**, « Créneau dépassé — non
   payé », bouton de paiement disparu. **Des deux côtés.**
9. **Paiement de 1 €** → doit passer (le blocage venait d'une colonne périmée,
   le serveur interroge maintenant Stripe en direct).
10. **Pastille de l'onglet** → le vrai nombre à traiter ; un simple point rouge
    quand il n'y a qu'une annulation à apprendre.

### C — Notifications

11. **Au lancement** → écran rouge « Active les notifications » si elles ne sont
    pas autorisées. Sur un téléphone qui a déjà refusé : le bouton ouvre les
    **réglages Android** (seul moyen de rattraper un refus).
12. **Vérifier en base** qu'un jeton apparaît dans `user_push_tokens` après
    acceptation — sinon les notifications ne partiront jamais.

### D — Vidéos et médias

13. **Publier une vidéo** (personnalité) → galerie ou appareil photo, **30 s
    max**, portrait ET paysage acceptés.
14. **Encadré « Plyz n'est pas un réseau social comme les autres »** dès qu'une
    vidéo est choisie.
15. **Toucher une photo ou une vidéo** dans le fil → plein écran, fond noir.
    Sur une vidéo : **tourner le téléphone** doit passer en paysage.
16. **Vidéo > 30 s depuis la galerie** → refus expliqué.

### E — Codes promo (les trois parcours)

17. **Session live vidéo**, **dédicace programmée**, **appel vidéo privé** : le
    champ doit être présent sur les trois.
18. **Code partiel** (ex. −20 %) → « −20 % : 8,00 € au lieu de 10,00 € », bouton
    « Retirer », et le bouton de paiement affiche le **montant remisé**.
19. **Code 100 %** → aucune caisse ne s'ouvre, la place est acquise directement.
20. **Vérifier en base** que `used_count` n'augmente **qu'après un paiement
    abouti** — pas à la validation du code.
21. **Côté personnalité** → « Mes documents » explique les deux cas : remise
    (« vous percevez moins ») et **contrôle d'identité à 0 €** (aucune perte).

### F — Faire vendre les personnalités

22. **Publier sans aucun événement à venir** → fenêtre « Tes fans t'ont vue,
    ils ne peuvent rien réserver », avec le bouton **Créer un événement** et
    l'explication : dédicace = sur place, live vidéo = partout.
23. **Page Compte (mode personnalité)** → encadré « X fans ont vu vos
    publications / 0 événement à réserver », rouge et avec bouton si zéro.
24. **11ᵉ vidéo sans événement** → refus expliqué (modèle économique de Plyz),
    avec le bouton pour créer. **Les photos restent illimitées.**

### G — Divers

25. **Barre du bas** → « Dédicace » sous l'appareil photo.
26. **Menu Événements côté fan** → liste vide : bouton « Rejoindre un
    événement » (il n'y avait aucune issue).
27. **Page Compte côté fan** → bloc ambre « Devenir personnalité » avec les
    trois arguments (avant, c'était l'ancienne présentation).
28. **Avis sur l'app** → proposé après **deux prestations menées à terme**.

---

## SÉCURITÉ — trois portes fermées cette nuit

- **`/api/create-account-link`** : acceptait n'importe quel identifiant de compte
  Stripe sans authentification. Un lien d'onboarding donne accès aux
  **informations bancaires**. Connexion exigée + vérification du propriétaire.
- **`/api/use-promo-code`** et **`/api/use-event-promo-code`** : une campagne
  entière s'épuisait en boucle sans un seul achat. Connexion + 20 appels/heure.
  ⚠️ Les appels côté app envoyaient `fetch` sans jeton : passés à `authedFetch`
  dans le même mouvement, sinon les codes cassaient en silence.
- **`callNextFan`** refermait l'appel précédent sans lire l'erreur : la file
  pouvait rester bloquée sans un mot.

Audit complet par ailleurs : **aucune redirection cassée** (59 écrans), aucun
style fantôme, aucun bouton mort.

---

## POINTS OUVERTS

- **Modération vidéo** : le contrôle automatique ne sait pas lire une vidéo.
  Elles partent sans ce garde-fou (tracé dans les journaux du serveur), et ne
  reposent que sur le signalement. À renforcer — motif de retrait possible chez
  Google.
- **Sous-titres des vidéos** : proposé, pas fait. Transcription (~0,003 $/vidéo)
  puis traduction par le système existant, affichée sous la vidéo si la langue
  diffère de celle du fan.
- **Treize langues** : les conditions (section 4) et les nouveaux textes ne sont
  écrits qu'en français et en anglais ; les autres retombent sur l'anglais.
- **Archive EAS de 316 Mo** : envoi long et fragile (un échec cette nuit). Un
  `.easignore` réglerait ça.
- **Crédits de build EAS épuisés** : les builds suivantes sont facturées à
  l'usage. Grouper les tests avant chaque build.

---

## PIÈGES — rappel

- **Toujours `git push plyz main`** (Replit lit `plyz`, pas `origin`).
- **Un `git pull` sans Republish ne change rien** : l'ancien processus tourne.
- **504 « proxy » = route inexistante** ; **401 = route existante non
  authentifiée**. C'est le test qui distingue « endpoint absent » de « serveur
  périmé ».
- **EAS** : toujours `EAS_SKIP_AUTO_FINGERPRINT=1`.
- **Bash + accents/backticks** : passer par un fichier `.js` ou un heredoc
  `python - <<'PYEOF'`, jamais par `-c` avec des accents.

---

## RÈGLES DE TRAVAIL DE JC

- **Les deux côtés.** Toute modification d'un côté (personnalité / fan) impose
  d'examiner ET de proposer l'équivalent de l'autre côté. L'interface diverge
  selon le mode — c'est ce qui a fait croire à un travail perdu.
- **Tout problème repéré se corrige immédiatement.**
- **Chaque message à une personnalité porte un bouton d'action**, jamais un
  simple avertissement.
- **Vérifier soi-même les destinations des boutons** : JC ne peut pas le faire.
- Non-développeur : explications simples, recommandation directe.
- **Quand il conteste un diagnostic, le prendre au sérieux** — il avait raison
  sur le code promo et sur les codes OTP.
- **Ne pas partir en excursion.**
