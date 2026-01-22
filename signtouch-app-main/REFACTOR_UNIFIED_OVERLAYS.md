# Refactoring : Système unifié d'overlays

## Objectif

Remplacer la gestion séparée de `textOverlays` et `signatureOverlays` par un seul tableau `overlays` comme source unique de vérité, tout en maintenant la compatibilité avec le système de sauvegarde des effets.

## Problème initial

L'ancienne architecture utilisait deux tableaux séparés :
- `textOverlays[]` pour les textes
- `signatureOverlays[]` pour les signatures
- `selectedElementId` + `selectedElementType` pour la sélection

Cela causait :
- Duplication de logique pour chaque type d'overlay
- Risque d'incohérence entre les états
- Complexité accrue pour gérer la sélection
- Code difficile à maintenir et à étendre

## Solution implémentée

### 1. Type unifié `OverlayElement`

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

### 2. Source unique de vérité

**Avant :**
```typescript
const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
const [signatureOverlays, setSignatureOverlays] = useState<SignatureOverlay[]>([]);
const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
const [selectedElementType, setSelectedElementType] = useState<'text' | 'signature' | null>(null);
```

**Après :**
```typescript
const [overlays, setOverlays] = useState<OverlayElement[]>([]);
const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
```

### 3. Handlers unifiés et sécurisés

Tous les handlers suivent maintenant ce pattern :

```typescript
const updateOverlayPosition = (id: string, x: number, y: number) => {
  const overlay = overlays.find(o => o.id === id);
  if (!overlay) {
    console.warn('updateOverlayPosition: overlay not found', id);
    return; // ✅ Sortie sécurisée
  }

  setOverlays(prevOverlays =>
    prevOverlays.map(o =>
      o.id === id ? { ...o, x, y } : o
    )
  );
};
```

**Handlers unifiés créés :**
- `updateOverlayPosition(id, x, y)` - remplace updateTextPosition et updateSignaturePosition
- `updateOverlayRotation(id, rotation)` - remplace updateTextRotation et updateSignatureRotation
- `updateOverlayScale(id, value)` - remplace updateTextScale et updateSignatureScale (gère fontSize pour texte, scale pour signature)
- `removeOverlay(id)` - remplace removeTextOverlay et removeSignatureOverlay
- `selectOverlay(id)` - remplace selectElement
- `getSelectedOverlay()` - remplace getSelectedElement
- `rotateSelectedOverlay(delta)` - remplace rotateSelectedElement
- `deleteSelectedOverlay()` - remplace deleteSelectedElement

### 4. Compatibilité avec le système de sauvegarde

Pour maintenir la compatibilité avec `BUGFIX_EFFECTS_OVERLAYS.md`, nous avons créé des fonctions de conversion :

```typescript
// Chargement depuis la mémoire
const loadOverlaysFromMemory = (texts: TextOverlay[], signatures: SignatureOverlay[]) => {
  const newOverlays: OverlayElement[] = [
    ...texts.map(t => ({ ...t, type: 'text' as const })),
    ...signatures.map(s => ({ ...s, type: 'signature' as const })),
  ];
  setOverlays(newOverlays);
};

// Sauvegarde vers la mémoire
const getTextOverlays = (): TextOverlay[] => {
  return overlays
    .filter((o): o is Extract<OverlayElement, { type: 'text' }> => o.type === 'text')
    .map(o => ({ id: o.id, text: o.text, color: o.color, ... }));
};

const getSignatureOverlays = (): SignatureOverlay[] => {
  return overlays
    .filter((o): o is Extract<OverlayElement, { type: 'signature' }> => o.type === 'signature')
    .map(o => ({ id: o.id, uri: o.uri, x: o.x, ... }));
};
```

### 5. Rendu unifié

**Avant :**
```typescript
{!saving && textOverlays.map(overlay => (
  <DraggableText key={overlay.id} overlay={overlay} ... />
))}
{!saving && signatureOverlays.map(overlay => (
  <DraggableSignature key={overlay.id} overlay={overlay} ... />
))}
```

**Après :**
```typescript
{!saving && overlays.map(overlay => {
  if (overlay.type === 'text') {
    return <DraggableText key={overlay.id} overlay={overlay} ... />;
  } else {
    return <DraggableSignature key={overlay.id} overlay={overlay} ... />;
  }
})}
```

### 6. Sélection simplifiée

**Avant :**
- `selectedElementId` + `selectedElementType`
- Besoin de vérifier les deux variables

**Après :**
- `selectedOverlayId` uniquement
- `getSelectedOverlay()?.type` pour connaître le type

```typescript
// Avant
if (selectedElementId && selectedElementType === 'text') { ... }

// Après
if (selectedOverlayId && getSelectedOverlay()?.type === 'text') { ... }
```

## Flux de données

```
┌─────────────────────────────────────────────────────┐
│                  Source de vérité                    │
│                   overlays: []                       │
└──────────────────┬──────────────────┬────────────────┘
                   │                  │
          ┌────────▼────────┐  ┌─────▼──────┐
          │  Affichage UI   │  │ Sauvegarde │
          │  DraggableText  │  │  Memory    │
          │ DraggableSigna  │  │            │
          └─────────────────┘  │getTextOverlays()
                               │getSignatureOverlays()
                               └────────────┘
```

### Cycle de vie complet

1. **Chargement :** `loadMemory()` → `loadOverlaysFromMemory()` → `setOverlays()`
2. **Manipulation :** User tap → `selectOverlay(id)` → `setSelectedOverlayId(id)`
3. **Modification :** User drag → `updateOverlayPosition(id, x, y)` → `setOverlays(...)`
4. **Sauvegarde :** `handleSave()` → `getTextOverlays()` + `getSignatureOverlays()` → `updateMemory()`

## Avantages

✅ **Code plus simple** : Un seul tableau au lieu de deux
✅ **Sélection robuste** : `selectedOverlayId` uniquement, pas de type séparé
✅ **Handlers sécurisés** : Tous vérifient l'existence avec `overlays.find()`
✅ **Extensible** : Facile d'ajouter de nouveaux types d'overlays
✅ **Compatible** : Maintient le flux des effets intact
✅ **Type-safe** : TypeScript garantit la cohérence des types

## Compatibilité avec BUGFIX_EFFECTS_OVERLAYS.md

Le système reste 100% compatible :

- `baseUri` : Toujours utilisé pour stocker la photo de base + filtre
- `textOverlays` / `signatureOverlays` : Toujours sauvegardés dans Memory
- `uri` : Toujours l'image finale recomposée
- **Les overlays ne disparaissent jamais après application d'un effet**

## Tests recommandés

1. ✅ Ajouter une signature
2. ✅ Ajouter un texte
3. ✅ Sélectionner la signature → le cadre vert apparaît
4. ✅ Sélectionner le texte → le cadre vert se déplace
5. ✅ Alterner plusieurs fois entre signature et texte
6. ✅ Modifier couleur, rotation, position
7. ✅ Supprimer un overlay (appui long)
8. ✅ Sauvegarder → vérifier que tout est persisté
9. ✅ Ouvrir depuis galerie → appliquer un effet → vérifier que les overlays restent
10. ✅ Aucun crash sur Expo Go

## Fichiers modifiés

- `app/edit.tsx` : Refactoring complet du système d'overlays

## Migration

Si vous aviez du code qui utilisait :
- `textOverlays` → utilisez `overlays.filter(o => o.type === 'text')`
- `signatureOverlays` → utilisez `overlays.filter(o => o.type === 'signature')`
- `selectedElementId` → utilisez `selectedOverlayId`
- `selectedElementType` → utilisez `getSelectedOverlay()?.type`
- `selectElement(id, type)` → utilisez `selectOverlay(id)`
