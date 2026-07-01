# Notes de review — Apple App Store & Google Play

Textes à coller dans **App Store Connect → App Review Information → Notes** et dans **Google Play Console → App content / message au reviewer**. Objectif : cadrer Plyz comme **marketplace de services 1:1 en temps réel** (et non vente de contenu numérique) pour éviter l'obligation d'achat intégré (commission 30 %).

⚠️ **Avant de coller** : renseigner les identifiants des comptes de test (fan + célébrité) à la fin.

---

## 🇬🇧 ENGLISH (Apple App Store — App Review Notes)

Plyz is a MARKETPLACE for real-time, one-to-one personal services between fans and verified public figures (artists, singers, athletes, creators, clubs). It is NOT a digital-content store.

HOW IT WORKS
- Fans book and pay for a personalized service delivered by a real, identified person:
  1. A private 1:1 LIVE video call with the public figure (real-time).
  2. A LIVE DEDICATION: during an event, EACH fan is connected ONE-TO-ONE with the public figure in a private video room (2 participants), waits in an individual queue, and receives a PERSONALIZED dedication created live, specifically for them. It is a real-time, one-to-one, personalized interaction — NOT pre-made downloadable content, and NOT a simultaneous broadcast to a group.
  3. A personalized dedication/autograph requested from a specific identified person.
- Payments are processed by Stripe Connect. Each public figure is an identified provider who completes KYC (identity + bank account) and receives 85% of the payment; Plyz keeps a 15% platform commission. Plyz never stores card data.
- Payments use pre-authorization then capture AFTER the service is delivered. If the service does not take place, the fan is automatically refunded.

WHY NOT IN-APP PURCHASE
Per App Store Review Guideline 3.1.3(d), one-to-one real-time person-to-person experiences may use payment methods other than in-app purchase. Every paid interaction on Plyz is an individual, private, real-time service provided by an identified human provider — comparable to Cameo, Airbnb or Fiverr. Importantly, group "events" are in fact QUEUES of sequential private 1:1 calls (one fan at a time, each in a private 2-person room), NOT simultaneous one-to-many broadcasts.

There is NO subscription, NO virtual currency, NO tokens/credits, and NO downloadable premium content sold by Plyz. The app is free to download; only person-to-person services are paid.

TEST ACCOUNTS (login by email + one-time code)
- Fan account: __________________________
- Public-figure account: __________________________

Thank you for your review.

---

## 🇫🇷 FRANÇAIS (Google Play — message au relecteur / usage interne)

Plyz est une PLACE DE MARCHÉ de services personnalisés en temps réel, en tête-à-tête (1:1), entre des fans et des personnalités vérifiées (artistes, chanteurs, sportifs, créateurs, clubs). Ce n'est PAS une boutique de contenu numérique.

FONCTIONNEMENT
- Le fan réserve et paie une prestation personnalisée, réalisée par une personne réelle et identifiée :
  1. un appel vidéo privé 1:1 EN DIRECT avec la personnalité ;
  2. une DÉDICACE EN DIRECT : lors d'un événement, CHAQUE fan est connecté EN TÊTE-À-TÊTE avec la personnalité dans une salle vidéo privée (2 participants), attend dans une file individuelle, et reçoit une dédicace PERSONNALISÉE réalisée en direct, rien que pour lui. C'est une interaction individuelle, en temps réel et personnalisée — et NON un contenu pré-fabriqué téléchargeable, ni une diffusion simultanée à un groupe ;
  3. une dédicace/un autographe personnalisé commandé à une personne identifiée.
- Les paiements passent par Stripe Connect. Chaque personnalité est un prestataire identifié (vérification KYC : identité + IBAN) qui reçoit 85 % ; Plyz prélève 15 % de commission de plateforme. Plyz ne stocke aucune donnée bancaire.
- Pré-autorisation puis capture APRÈS la prestation. Si la prestation n'a pas lieu, le fan est remboursé automatiquement.

POURQUOI PAS D'ACHAT INTÉGRÉ
Les prestations sont des services de personne à personne, en temps réel, fournis par un prestataire humain identifié — comme Cameo, Airbnb ou Fiverr. Les « événements » de groupe sont en réalité des FILES d'appels 1:1 privés successifs (un fan à la fois, salle privée à 2 personnes), et non une diffusion 1-à-plusieurs simultanée. Aucun abonnement, aucune monnaie virtuelle, aucun crédit/jeton, aucun contenu premium téléchargeable vendu par Plyz.

COMPTES DE TEST (connexion par e-mail + code à usage unique)
- Compte fan : __________________________
- Compte personnalité : __________________________

---

## Rappels internes (ne pas coller)
- Bien fournir des comptes de test fonctionnels (fan + personnalité vérifiée avec paiement activé) ; le reviewer doit pouvoir aller au bout d'un parcours.
- Vérifier que la fiche store n'emploie aucun terme « contenu / débloquer / premium / abonnement » (fait 2026-07-01).
- ⚠️ CGU + Politique de confidentialité à REFAIRE (les textes actuels décrivent l'ancienne app « éditeur de photos local » — obsolètes pour la marketplace). À valider par un juriste avant soumission.
