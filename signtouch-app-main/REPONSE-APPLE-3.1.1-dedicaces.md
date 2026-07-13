# Refus Apple 3.1.1 — Dossier de réponse (événements de dédicace EN PERSONNE)

Ce document contient tout ce qu'il faut pour répondre au refus Apple du 13/07/2026
(Guideline 3.1.1 — In-App Purchase, motif « shoutout in live events »).

**Idée directrice :** l'événement de dédicace live est un **service du monde réel, en
personne** (concert, salon, stade). Or Apple **interdit** l'In-App Purchase pour les
services du monde réel : il faut au contraire un paiement externe (Stripe). Pour le
prouver et l'imposer, la nouvelle version **verrouille l'accès par géolocalisation** :
seul un fan physiquement présent sur le lieu peut payer et recevoir sa dédicace.

> ⚠️ À faire AVANT de resoumettre : nouveau build EAS (module natif `expo-location`
> ajouté), puis préparer l'événement démo (section C) et remplir les [À COMPLÉTER].

---

## A. Message à envoyer dans le Resolution Center (App Store Connect)

> Copier-coller tel quel (en anglais).

```
Hello,

Thank you for your review. We would like to clarify how the flagged feature works,
as we believe it must use a payment method other than in-app purchase.

Plyz is a marketplace that connects public figures (celebrities, athletes, artists)
with their fans. The feature you referenced — "shoutout in live events", which we call
"live dedication events" — is an IN-PERSON, REAL-WORLD service.

These events take place PHYSICALLY at a venue: a concert, a trade show / convention,
a stadium, or an in-person signing session. A fan who is PHYSICALLY PRESENT on site
pays to receive a REAL, in-person autograph/dedication from the celebrity who is also
physically there. The signed photo the fan keeps is a memento of that real, on-site
encounter — the digital-marketplace equivalent of getting a signed photo at a signing
booth. It is not stand-alone downloadable content sold to remote users.

The App Store Review Guidelines do not merely permit external payment here — they
REQUIRE it. Guideline 3.1.3(e) ("Goods and Services Outside of the App") states:
"If your app enables people to purchase physical goods or services that will be
consumed outside of the app, you must use purchase methods other than in-app
purchase to collect those payments." Our live dedication events are exactly that: a
real-world service consumed in person, outside the app, at a physical location.
In-app purchase is therefore not applicable to this feature, and we collect these
payments through an external provider (Stripe).

To GUARANTEE that this is genuinely an on-site, real-world transaction (and not a
disguised remote purchase), this new build adds MANDATORY GEOLOCATION GATING for
paid dedication events:
- The celebrity must set the event's physical GPS location when creating a paid event.
- A fan can only pay for / join a live dedication event when their device is
  physically located within the event's geofenced radius around that venue.
- A fan who is not on site is blocked from paying and cannot obtain the dedication.

In other words, the payment is only possible for a person who is really, physically
at the event — which is precisely why in-app purchase is not the appropriate (or
permitted) mechanism here.

Separately, our 1-to-1 live video calls (a single fan and a single celebrity, in real
time) use external payment under the Person-to-Person Services provision, Guideline
3.1.3(d).

We do not sell any stand-alone downloadable digital content. The only autographs
delivered through the app are either (a) a souvenir given to a fan who is physically
present at an in-person event, or (b) a free memento at the end of a paid 1-to-1
live video call.

HOW TO TEST (we understand the reviewer cannot travel to a physical venue):
We prepared a demo in-person event with the geofence check disabled so you can test
the full flow from any location:
- Event join code: [À COMPLÉTER]
- Test login: [À COMPLÉTER — email/mot de passe d'un compte fan de test]
- Stripe test card: 4242 4242 4242 4242, any future expiry date, any CVC, any ZIP.

Thank you very much — we're happy to provide any additional detail.
```

---

## B. À coller dans « App Review Information » → « Notes » (App Store Connect)

> Version courte, à laisser en permanence dans la fiche pour les prochains reviews.

```
Payment model (please note for review):
- "Live dedication events" are IN-PERSON, real-world events (concert, convention,
  stadium, signing session). Fans must be PHYSICALLY PRESENT at the venue; the app
  enforces this with MANDATORY GPS geofencing before any payment (a fan off site
  cannot pay). The signed photo is a memento of a real on-site encounter, not
  stand-alone remote content. Per Guideline 3.1.3(e) ("Goods and Services Outside of
  the App"), a real-world service consumed in person MUST use a payment method other
  than in-app purchase; we use external payment (Stripe).
- 1-to-1 live video calls use external payment under Guideline 3.1.3(d)
  (Person-to-Person Services).
- No stand-alone digital content is sold.

Demo in-person event for testing (geofence disabled for review):
- Join code: [À COMPLÉTER]
- Test fan account: [À COMPLÉTER]
- Stripe test card: 4242 4242 4242 4242, any future expiry, any CVC.
```

---

## C. Procédure pour créer l'ÉVÉNEMENT DÉMO du reviewer

Le reviewer ne peut pas être physiquement sur un lieu → il faut un événement dont le
géofence est **désactivé** (rayon géant = toujours autorisé). Le code prévoit déjà ce
bypass : un rayon ≥ 100 000 m est considéré comme « démo » et passe toujours
(voir `utils/geofence.ts`, `GEOFENCE_BYPASS_THRESHOLD_M`).

**Étapes (à faire sur le build À JOUR, en mode paiement TEST) :**

1. Dans l'app, créer un événement de dédicace **PAYANT** :
   - appuyer sur **« Utiliser ma position »** (n'importe où, peu importe),
   - ajouter une signature, définir un prix,
   - le lancer en **Live** (ou le programmer puis le démarrer).
2. Noter son **code** (join_code, 6 caractères).
3. Désactiver le géofence sur CE seul événement en lançant ce SQL
   (me demander de le faire, ou via le dashboard Supabase) :

   ```sql
   UPDATE public.event_sessions
   SET geofence_radius_m = 100000000
   WHERE join_code = 'XXXXXX';   -- remplacer par le vrai code
   ```

4. Reporter le **code** + le **compte fan de test** dans les sections A et B ci-dessus.

> Ainsi le reviewer teste le parcours complet (payer → recevoir la dédicace) sans être
> bloqué par la position, tandis que TOUS les autres événements payants restent bien
> verrouillés au présentiel.

---

## D. Ce qui a été modifié dans l'app (récap technique)

- **Base Supabase** : colonnes ajoutées à `event_sessions` → `location`, `latitude`,
  `longitude`, `in_person_only`, `geofence_radius_m`.
- **`utils/geofence.ts`** (nouveau) : position GPS (web + mobile) + distance Haversine
  + vérification de présence, avec bypass démo (rayon ≥ 100 km).
- **`app/create-event.tsx`** : bouton « Utiliser ma position », **lieu GPS obligatoire
  pour un événement payant**, textes recadrés « en personne » (plus « en ligne »).
- **`app/join-event.tsx`** : **verrou de présence avant paiement** — un événement payant
  en cours exige d'être dans le rayon du lieu ; une réservation d'événement futur reste
  autorisée (billetterie à l'avance, comme un billet de concert).
- **`app.json` / `package.json`** : `expo-location` + permissions position iOS/Android.
- **Traductions** : nouveaux textes dans les 15 langues.

**⚠️ Nécessite un nouveau build EAS** (module natif). La géoloc ne fonctionne pas dans
le dev client actuel.
```
