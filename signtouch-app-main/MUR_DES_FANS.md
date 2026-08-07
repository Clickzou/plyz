# Le mur des fans — dossier complet

> Analyse du 7 août 2026. JC veut un espace où les fans échangent, envoient des
> photos et des vidéos, et forment des groupes autour d'une personnalité.
>
> **Décision prise : reporté, pas abandonné.** « Réclame ta star » a été fait
> d'abord — deux jours au lieu d'un mois, aucun risque réglementaire, et il
> sert le même but (faire venir les personnalités) de façon bien plus directe.
>
> Ce document existe pour qu'on n'ait pas à refaire l'analyse le jour où l'on
> décide d'y aller.

---

## 1. Pourquoi ce n'était pas le bon premier pas

**Ce n'est pas le vrai objectif.** Le but de JC n'est pas le mur, c'est que les
fans fassent venir les personnalités. Le mur y contribue indirectement,
lentement, et au prix fort. La demande collective y répond directement.

**Cela contredit la vision affichée.** « Plyz n'est PAS un réseau social de
plus » — or un mur où les fans discutent entre eux *est* un réseau social de
plus, en concurrence frontale avec Discord, Instagram et Reddit, où ces
communautés existent déjà depuis des années.

**Cameo, le plus proche concurrent, n'en a pas.** Il recrute ses talents par
démarchage et par agents. Aucun acteur du secteur n'a fait décoller un réseau
social de fans.

---

## 2. L'état des lieux technique (audit du 7 août)

| Brique nécessaire | État |
|---|---|
| Modération des images | ✅ Claude vision + nsfwjs en repli |
| Modération des vidéos | ✅ **fait le 7/08** (planche contact → Claude) |
| Signalement de contenu | ✅ `/api/report` + table `content_reports` |
| Blocage entre utilisateurs | ❌ n'existe qu'en célébrité → fan |
| Messagerie | ❌ aucune |
| Vérification d'âge | ⚠️ déclarative (une case), par appareil |

La modération vidéo étant faite, **le principal verrou technique est levé**.
Restent le blocage entre utilisateurs et la question de l'âge.

---

## 3. Ce qui reste vraiment bloquant

### Les obligations des stores

Apple 1.2 et Google exigent, pour tout espace communautaire :
1. un filtrage du contenu répréhensible ;
2. un mécanisme de signalement ;
3. **un blocage entre utilisateurs** ;
4. **une réponse aux signalements sous 24 heures**.

Les points 3 et 4 manquent. Le 4 n'est pas un problème de code : c'est une
astreinte humaine, 7 jours sur 7. JC est seul.

### Le DSA

Obligations de modération, de notification et de recours. Elles s'appliquent
déjà, mais un espace communautaire en élargit considérablement la portée.

### Les mineurs — le vrai danger

Les fans de célébrités sont massivement des adolescents. Un espace de
discussion + des photos + aucun contrôle d'âge réel, c'est le scénario qui fait
fermer des applications, et qui fait du mal à de vraies personnes.

**Sans messages privés, le risque baisse énormément.** C'est le point le plus
important de tout ce document.

### Le positionnement face à Apple

Plyz est présenté comme une **marketplace de prestations**, pas un service de
contenu numérique — c'est ce qui justifie de ne pas verser 30 % à Apple. Le
social gratuit ne casse pas cet argument, mais il l'affaiblit et attire
l'attention. ⚠️ Ne JAMAIS faire payer l'accès à un groupe : ce serait du
contenu numérique, donc 30 %.

---

## 4. La version que je défendrais, si on y va

Par ordre d'importance :

1. **Un espace par personnalité**, jamais un mur global. La communauté se
   fédère autour de quelqu'un, pas dans le vide. La table `abonnements`
   (créée le 7/08) donne déjà qui suit qui.
2. **Réservé aux abonnés** de cette personnalité.
3. **Aucun message privé.** C'est là que surviennent les drames avec des
   mineurs, et cela n'apporte rien à l'objectif de faire venir des stars.
4. **Photos oui, vidéos plus tard.** On sait filtrer les deux depuis le 7/08,
   mais commencer par le moins lourd.
5. **Éphémère autour des événements** : le fil s'ouvre 24 h avant une séance et
   se ferme après. Cela crée l'urgence, limite la surface à modérer, et sert
   directement les ventes.
6. **Blocage entre utilisateurs** — obligatoire pour les stores, à faire avant
   toute ouverture.

## 5. Ce qu'il faudrait construire

| Chantier | Effort estimé |
|---|---|
| Table des messages + RLS par personnalité | 0,5 j |
| Écran du fil (liste, écriture, photo) | 1,5 j |
| Blocage entre utilisateurs (table + UI + filtrage) | 1 j |
| Signalement d'un message + file de modération | 1 j |
| Ouverture/fermeture automatique autour des événements | 0,5 j |
| Écran d'administration pour traiter les signalements | 1 j |
| **Total** | **~5,5 jours** |

Auxquels s'ajoute l'astreinte : quelqu'un doit traiter les signalements sous
24 h, tous les jours.

## 6. Le déclencheur

**Ne pas ouvrir le mur tant que « Réclame ta star » n'a pas prouvé qu'une
communauté existe.** Si dans un mois personne ne réclame personne, le mur serait
vide — et un espace communautaire vide fait plus de mal que pas d'espace du
tout.

Seuil raisonnable pour rouvrir le sujet : **une personnalité qui dépasse 250
réclamations**, ou un événement qui rassemble régulièrement plusieurs dizaines
de fans.

---

## 7. Les autres idées du même échange, par utilité

1. **Parrainage entre fans** — chaque fan qui en amène un autre gagne une
   réduction. Multiplicateur de tout le reste. *(~1 j)*
2. **Les rangs Bronze/Argent/Or/Diamant** — déjà calculés dans
   `FollowContext.tsx`, **jamais affichés**. Un fan qui voit son rang revient ;
   un « Fan n°1 » montré à la star crée un attachement des deux côtés. Presque
   gratuit à finir. *(~0,5 j)*
3. **Cagnotte collective** — plusieurs fans offrent un appel. ⚠️ Dès qu'il y a
   plusieurs spectateurs, on sort du tête-à-tête et Apple reprend 30 %
   (voir `project_apple_3_1_3_person_to_person`). Avis juridique AVANT.
4. **Pages publiques de réclamation** sur `plyz.io/reclame/[nom]` — référencées
   par Google. Quelqu'un qui cherche « contacter [star] » tombe sur Plyz.
   Acquisition gratuite et continue. *(~1 j)*
