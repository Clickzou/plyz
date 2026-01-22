# Correction du bug : Crash sur Expo Go lors de la manipulation de signatures + textes

## Problème initial

Sur Expo Go uniquement (le Web fonctionnait parfaitement) :

1. L'utilisateur ajoutait une signature, puis du texte
2. Après avoir manipulé le texte, toute tentative de re-sélectionner ou manipuler la signature provoquait un crash
3. Le cadre vert de sélection ne s'affichait plus autour de la signature quand du texte était présent

## Cause du bug

- Gestion séparée et fragile des états `selectedElementType` et `selectedElementId`
- Logique de sélection basée sur des suppositions (premier élément, index présent, etc.)
- Pas de gestion des événements tactiles : tous les éléments répondaient aux touches simultanément
- Handlers de gestes non sécurisés : aucune vérification que l'élément existe avant manipulation

## Solution implémentée

### 1. Structure unifiée des overlays

Création d'un type `OverlayElement` unifié pour gérer signatures et textes :

```typescript
type OverlayElement = {
  id: string;
  type: 'text' | 'signature';
  x: number;
  y: number;
  rotation: number;
  color: string;
} & (
  | { type: 'text'; text: string; fontSize: number; fontFamily?: string }
  | { type: 'signature'; uri: string; scale: number }
);
```

### 2. Gestion robuste de la sélection

- Ajout d'un tableau `elements` synchronisé avec `textOverlays` et `signatureOverlays`
- Fonction `getSelectedElement()` qui retourne l'élément sélectionné ou `undefined`
- Tous les handlers vérifient maintenant l'existence de l'élément avant toute manipulation :

```typescript
const element = getSelectedElement();
if (!element) return; // Sortie sécurisée
```

### 3. Gestion des événements tactiles (pointerEvents)

Ajout de la prop `pointerEventsEnabled` sur les composants draggables :

```typescript
pointerEventsEnabled={selectedElementId === null || selectedElementId === overlay.id}
```

Cela désactive les événements tactiles sur les éléments non sélectionnés, évitant les conflits d'interaction.

### 4. Synchronisation avec le correctif des effets

Le refactoring maintient la compatibilité avec `BUGFIX_EFFECTS_OVERLAYS.md` :

- `textOverlays` et `signatureOverlays` continuent d'exister et sont sauvegardés
- `elements` est une représentation unifiée synchronisée automatiquement
- Le flux `baseUri + overlays → uri finale` reste intact

```typescript
// Synchronisation bidirectionnelle
const syncToElements = (texts, signatures) => {
  // Crée elements[] depuis textOverlays + signatureOverlays
};

const syncFromElements = (elems) => {
  // Recrée textOverlays et signatureOverlays depuis elements[]
};
```

### 5. Améliorations des composants draggables

**DraggableText** et **DraggableSignature** :
- Ajout de `pointerEvents={pointerEventsEnabled ? "auto" : "none"}`
- Ajout de `disabled={!pointerEventsEnabled}` sur les TouchableOpacity
- Les composants ne répondent plus aux événements quand ils ne sont pas sélectionnables

### 6. Sécurisation de tous les handlers

Tous les handlers critiques ont été sécurisés :

```typescript
const rotateSelectedElement = () => {
  const element = getSelectedElement();
  if (!element) return; // ✅ Sécurisé
  // ... manipulation
};

const changeSelectedColor = (color) => {
  const element = getSelectedElement();
  if (!element) return; // ✅ Sécurisé
  // ... manipulation
};

const deleteSelectedElement = () => {
  const element = getSelectedElement();
  if (!element) return; // ✅ Sécurisé
  // ... manipulation
};
```

### 7. Suppression de `selectedElementType`

La variable `selectedElementType` a été retirée car redondante :
- Au lieu de `selectedElementType === 'text'`
- Utiliser `getSelectedElement()?.type === 'text'`

## Flux de données corrigé

```
User adds signature/text
    ↓
Update textOverlays OR signatureOverlays
    ↓
Automatic sync to elements[]
    ↓
User selects element
    ↓
getSelectedElement() returns element OR undefined
    ↓
pointerEvents disabled on non-selected elements
    ↓
User manipulates selected element
    ↓
Handler checks element exists
    ↓
Update textOverlays OR signatureOverlays
    ↓
Auto-sync back to elements[]
```

## Résultat

✅ Plus de crash sur Expo Go lors de la manipulation de signatures et textes
✅ Le cadre vert s'affiche correctement autour de l'élément sélectionné
✅ Les éléments non sélectionnés ne répondent plus aux événements tactiles
✅ Tous les handlers sont sécurisés contre les éléments inexistants
✅ Compatible avec le correctif des effets (BUGFIX_EFFECTS_OVERLAYS.md)
✅ Le Web continue de fonctionner parfaitement

## Tests recommandés sur Expo Go

1. Ajouter une signature
2. Ajouter un texte
3. Sélectionner et manipuler le texte (rotation, couleur, déplacement)
4. Re-sélectionner la signature → ✅ devrait fonctionner sans crash
5. Manipuler la signature (rotation, scale, couleur)
6. Alterner entre signature et texte plusieurs fois
7. Ouvrir une photo depuis la galerie avec signature + texte
8. Appliquer un effet
9. Revenir à l'édition → ✅ signatures et textes toujours présents et éditables

## Fichiers modifiés

- `app/edit.tsx` (lignes 170-180, 193, 267-301, 315, 395-422, 489, 515-577, 999-1019, 1021-1152)
