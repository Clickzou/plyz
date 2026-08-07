# Vérifications à faire dès que l'APK est installé

> Tout ce qui a été livré le 7 août après-midi. **Rien de tout cela n'était
> testable avant** : le sélecteur de musique, l'écran de réclamation et les
> correctifs clavier ne sont dans aucune build antérieure.
>
> Dis **« go »** et on déroule ensemble, point par point.

## Avant de commencer — les prérequis

| Élément | Comment vérifier |
|---|---|
| Les 4 SQL passés | ✅ fait le 7/08 (musiques, abonnements, réclamations, vagues) |
| Serveur Replit à jour | `git pull` **puis Republish** — le pull seul ne suffit pas |
| Modération vidéo déployée | Poussée APRÈS le dernier Republish → refaire un tour |
| `ANTHROPIC_API_KEY` | ✅ présente dans les Secrets Replit |

---

## A — Le clavier (le plus gros correctif du jour)

Il ne s'agit pas de « pouvoir faire défiler » mais que **le champ actif remonte
tout seul** au-dessus du clavier.

- [ ] **A1** — Commentaires d'une publication : la liste défile, et le champ de
      saisie reste visible quand le clavier s'ouvre
- [ ] **A2** — Clavier ouvert, appuyer une seule fois sur « Répondre » ou
      « Supprimer » suffit (avant, le premier appui ne faisait que fermer le
      clavier)
- [ ] **A3** — Onboarding célébrité, étape 2/4 : le champ « Présentation » reste
      visible pendant la frappe
- [ ] **A4** — Écran Compte : « À propos de vous », tarif du tête-à-tête
- [ ] **A5** — Création d'événement, création de séance live
- [ ] **A6** — Rejoindre un événement (code, prénom)
- [ ] **A7** — Fenêtres : connexion, notation, signalement, demande d'appel vidéo
- [ ] **A8** — Fenêtre « Ajouter du texte » (signature, montage, résultat)

## B — Commentaires

- [ ] **B1** — Supprimer **son propre** commentaire → il disparaît, le compteur baisse
- [ ] **B2** — En tant que personnalité, supprimer le commentaire d'un fan sous
      SA publication → autorisé
- [ ] **B3** — Un fan ne peut PAS supprimer le commentaire d'un autre fan
- [ ] **B4** — Déconnecté : bouton vert « Connecte-toi pour commenter », et il
      **répond au toucher** (avant, champ mort sur Android)
- [ ] **B5** — Lire les commentaires reste possible sans compte

## C — Vidéos du fil

- [ ] **C1** — Une vidéo se lit **toute seule**, en boucle, **sans son**, quand
      la carte est à l'écran
- [ ] **C2** — Une seule vidéo à la fois (faire défiler : la précédente s'arrête)
- [ ] **C3** — Toucher la vidéo → plein écran **avec le son**
- [ ] **C4** — Publier une vidéo verticale et une horizontale

## D — Musique sur les vidéos ⭐ nouveau

- [ ] **D1** — Choisir une vidéo → bouton violet « Ajouter une musique »
- [ ] **D2** — Le sélecteur affiche **100 morceaux**, 5 ambiances (calme,
      inspirant, énergique, urbain, cinématique)
- [ ] **D3** — Recherche par titre ET par artiste
- [ ] **D4** — Filtre par ambiance
- [ ] **D5** — Pré-écoute : un morceau démarre, un second arrête le premier
- [ ] **D6** — Aperçu : la vidéo tourne avec la musique par-dessus
- [ ] **D7** — Les deux curseurs (**Ta voix** 100 %, **Musique** 30 %) changent
      le son **en direct**
- [ ] **D8** — Publier → la vidéo en ligne porte bien la musique au volume choisi
- [ ] **D9** — « Sans musique » fonctionne aussi

> ⚠️ **Le tri à l'oreille reste à faire.** Les 100 morceaux sont valides
> juridiquement (CC-BY, crédités) et techniquement, mais **je ne les ai jamais
> écoutés**. À surveiller : *Please Don't Wish Me A Merry Christmas*
> (saisonnier), *White Out -- Vocals* et *Ophelia's Song* (avec chant, gênant
> sous une voix), *Killer Robot Malaise*, *On Your Grave* (titres qui détonnent
> sous des coulisses). Donne-moi la liste à retirer, je les désactive.

## E — Abonnements et notifications ⭐ nouveau

- [ ] **E1** — Suivre une personnalité depuis un second compte
- [ ] **E2** — Cette personnalité publie un post → le fan reçoit **une notification**
- [ ] **E3** — Elle crée un **événement live** → notification aussi (deux chemins
      différents dans le code, tester les DEUX)
- [ ] **E4** — Se désabonner → plus de notification
- [ ] **E5** — Les abonnements survivent à une réinstallation (ils sont en base
      maintenant, plus seulement sur le téléphone)

## F — Réclame ta star ⭐ nouveau

- [ ] **F1** — Découvrir → bouton orange « Ta star n'est pas là ? Réclame-la »
- [ ] **F2** — Réclamer un **nom connu** (ex. Omar Sy) → accepté, entre au
      classement, compteur affiché
- [ ] **F3** — Réclamer un **nom inventé** → enregistré MAIS message expliquant
      qu'il faut confirmer qu'il s'agit d'une personnalité publique
- [ ] **F4** — Réclamer **« Paris »** → refusé du classement (Wikidata confirme
      que ce n'est pas un être humain)
- [ ] **F5** — Réclamer deux fois la même personne → une seule réclamation comptée
- [ ] **F6** — Le bouton « Partager » propose un message contenant le NOM de la star
- [ ] **F7** — « Mes réclamations » liste ce qu'on attend

## G — Modération ⭐ nouveau

- [ ] **G1** — Publier une vidéo ordinaire → acceptée. Journal Replit :
      `[Moderation] vidéo → OK`
- [ ] **G2** — Si le journal dit `vidéo publiée SANS contrôle` → **me le dire**,
      FFmpeg n'est pas joignable depuis le déploiement
- [ ] **G3** — Une photo inappropriée reste refusée (contrôle inchangé)

## H — Compte personnalité

- [ ] **H1** — « Enregistrer » et « Activer mes paiements » ne se touchent plus
- [ ] **H2** — Compte non validé : bouton discret **« Revenir en mode fan »**
- [ ] **H3** — Y revenir, **fermer et rouvrir l'app** → on est toujours fan
      (c'est le point qui échouait avant : la base remettait le mode célébrité)
- [ ] **H4** — Une célébrité **validée** ne voit PAS ce bouton
- [ ] **H5** — Le badge d'attente s'affiche « En cours de vérification » et non
      « Under Review » (cache de traduction corrigé le 7/08)

## I — Sur le web (hors app)

- [ ] **I1** — https://plyz.io/retrait-reclamation s'affiche
- [ ] **I2** — La page est **traduite** (tester /en/, /ja/, /es/)
- [ ] **I3** — Envoyer un retrait sur un nom de test → message de confirmation
      immédiat, et **e-mail reçu** sur jc@clickzou.fr
- [ ] **I4** — Le nom retiré disparaît du classement dans l'app
- [ ] **I5** — Lien « Retirer mon nom » présent en pied de page

---

## Ce qui ne peut PAS être testé par l'APK

- **Les vagues coordonnées** : elles se déclenchent à 50 réclamations. Pour les
  éprouver, il faudrait 50 comptes — ou me demander de baisser le palier
  temporairement.
- **La notification d'arrivée d'une star** : elle demande un appel
  d'administration (`/api/reclamations/arrivee`), volontairement manuel.

## Points connus, à ne pas signaler comme bugs

- La recherche de **Découvrir** n'a pas de garde-fou clavier : son champ est en
  haut de l'écran, le clavier ne peut pas le cacher.
- Les pages juridiques (CGV, confidentialité) restent en français. Seule la page
  de retrait a été traduite, parce qu'elle sert à exercer un droit.
- La modération vidéo ne voit ni le **son**, ni ce qui se passe **entre deux
  vignettes** (une image toutes les 3 s). C'est un garde-fou, pas une garantie.
