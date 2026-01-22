# Correction du bug : Disparition des signatures et textes après changement d'effet

## Problème initial

Lorsqu'un utilisateur :
1. Ouvrait une photo avec signature et/ou texte depuis la galerie
2. Cliquait sur le bouton Effet (violet) pour accéder à l'écran des filtres
3. Sélectionnait n'importe quel filtre (y compris "Aucun") et validait

**Résultat bugué** : La signature et le texte disparaissaient complètement de la photo

## Cause du bug

L'écran des effets (`photo-editor-canvas.tsx`) exportait le canvas Fabric.js comme une image "aplatie" contenant uniquement :
- La photo de base
- Le filtre appliqué

Cette image aplatie écrasait `memory.uri` (l'image finale), supprimant ainsi tous les overlays (signatures et textes) qui n'étaient pas présents dans le canvas Fabric.js.

## Solution implémentée

### 1. Séparation des données

Restructuration de la mémoire pour séparer clairement :

- **`memory.baseUri`** : Photo de base avec filtre appliqué (sans overlays)
- **`memory.textOverlays`** : Calques de texte stockés séparément
- **`memory.signatureOverlays`** : Calques de signature stockés séparément
- **`memory.filter`** : Nom du filtre appliqué
- **`memory.uri`** : Image composite finale (base + overlays)

### 2. Modifications dans `photo-editor-canvas.tsx`

#### Validation Web (lignes 494-552)
```typescript
const updatedMemory: Memory = {
  ...memory,
  baseUri: dataURL,                          // ✅ Sauvegarde de l'image de base avec filtre
  filter: currentFilter !== 'none' ? currentFilter : undefined,
  isEdited: true,
  textOverlays: memory.textOverlays,         // ✅ Préservation des textes
  signatureOverlays: memory.signatureOverlays, // ✅ Préservation des signatures
};

// ✅ Redirection vers edit.tsx pour régénération automatique
router.replace({
  pathname: '/edit',
  params: { memoryId: updatedMemory.id, autoSave: 'true' },
});
```

#### Validation Mobile/WebView (lignes 579-619)
Même logique appliquée pour la version mobile

### 3. Modifications dans `edit.tsx`

#### Ajout du paramètre autoSave (lignes 417-418)
```typescript
const params = useLocalSearchParams<{ memoryId: string; autoSave?: string }>();
const { memoryId, autoSave } = params;
```

#### Auto-sauvegarde après changement de filtre (lignes 517-524)
```typescript
useEffect(() => {
  if (autoSave === 'true' && memory && !saving) {
    console.log('🔄 AutoSave activé, sauvegarde automatique de l\'image composite');
    setTimeout(() => {
      handleSave();
    }, 500);
  }
}, [autoSave, memory]);
```

### 4. Flux de données corrigé

```
Utilisateur clique sur Effet
    ↓
photo-editor-canvas.tsx
    ↓
Sélectionne un filtre et valide
    ↓
Sauvegarde:
  - baseUri = image de base + filtre
  - textOverlays = préservés
  - signatureOverlays = préservés
  - filter = nom du filtre
    ↓
Redirection automatique vers edit.tsx avec autoSave=true
    ↓
edit.tsx détecte autoSave=true
    ↓
Régénération automatique de l'image composite:
  - Combine baseUri + textOverlays + signatureOverlays
  - Sauvegarde le résultat dans memory.uri
    ↓
Redirection automatique vers result.tsx
    ↓
Affichage de l'image finale complète
```

## Résultat

✅ Les signatures et textes sont **toujours préservés** lors du changement d'effet
✅ Le filtre "Aucun" fonctionne correctement sans supprimer les overlays
✅ Tous les autres filtres appliquent l'effet uniquement sur la photo de base
✅ L'image finale affichée contient toujours tous les éléments (base + filtre + overlays)

## Tests recommandés

1. Créer une photo avec signature et texte
2. Sauvegarder et ouvrir depuis la galerie
3. Tester chaque filtre (Noir & Blanc, Sépia, etc.)
4. Vérifier que la signature et le texte restent visibles
5. Tester spécifiquement le filtre "Aucun"
6. Vérifier que le ratio de l'image reste correct

## Fichiers modifiés

- `app/photo-editor-canvas.tsx` (lignes 494-552, 579-619)
- `app/edit.tsx` (lignes 417-418, 517-524)
