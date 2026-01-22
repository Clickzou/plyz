# Guide : Écran de Réglages Photo (remplace les Effets)

## 📋 Changement effectué

Le système d'effets prédéfinis (Noir & Blanc, Sépia, etc.) a été **complètement supprimé** et remplacé par un écran de réglages manuels avec sliders.

---

## ✨ Nouvelle interface

### Barre du haut

- **Annuler (✕ rouge)** : Retour sans appliquer les modifications
- **Réinitialiser (↻ orange)** : Réinitialise tous les réglages à 0
- **Valider (✓ vert)** : Sauvegarde les réglages et retour à l'écran précédent

### Zone centrale

Photo affichée avec :
- Ratio respecté (mode COVER, pas de déformation)
- Overlays (signatures et textes) visibles mais non affectés par les réglages
- Application en temps réel des modifications

### Zone de réglages (en bas)

Trois sliders avec commandes :

#### 🌟 Luminosité
- Plage : -100 à +100
- Bouton **−** : diminue de 5
- Bouton **+** : augmente de 5
- Slider : ajustement continu
- Affichage numérique de la valeur actuelle

#### 🔲 Contraste
- Plage : -100 à +100
- Bouton **−** : diminue de 5
- Bouton **+** : augmente de 5
- Slider : ajustement continu
- Affichage numérique de la valeur actuelle

#### 🎨 Saturation
- Plage : -100 à +100
- Bouton **−** : diminue de 5
- Bouton **+** : augmente de 5
- Slider : ajustement continu
- Affichage numérique de la valeur actuelle

---

## 🎬 Comportement

1. **Application en temps réel** : Chaque modification du slider ou clic sur +/− applique immédiatement les réglages sur la photo
2. **Non-destructif** : Les overlays (signatures et textes) ne sont jamais affectés
3. **Sauvegarde** : Les réglages sont enregistrés dans `memory.adjustments`
4. **Réglages à 0** : Si tous les réglages sont à 0, `adjustments` n'est pas sauvegardé (undefined)

---

## 🏗️ Architecture technique

### Structure de données

```typescript
export interface PhotoAdjustments {
  brightness: number;  // -100 à +100
  contrast: number;    // -100 à +100
  saturation: number;  // -100 à +100
}

interface Memory {
  // ... autres champs
  adjustments?: PhotoAdjustments;
  filter?: string; // Désormais obsolète, sera undefined
}
```

### Fichiers modifiés

1. **utils/memoriesStorage.ts**
   - Ajout de l'interface `PhotoAdjustments`
   - Ajout du champ `adjustments` dans `Memory`

2. **app/photo-editor-canvas.tsx** (Version Web)
   - Suppression de la liste des filtres prédéfinis
   - Ajout des states : `brightness`, `contrast`, `saturation`
   - Nouvelle fonction `applyAdjustments()` : applique les réglages avec Fabric.js
   - Nouvelle interface avec sliders et boutons +/−
   - Sauvegarde des réglages dans `memory.adjustments`

3. **app/edit.tsx**
   - Suppression de `selectedFilter` et toutes références aux filtres
   - Suppression de `getFilterOverlay()`
   - Simplification : n'affiche que `baseUri` avec overlays

### Flux de données

```
Utilisateur ajuste un slider
    ↓
État mis à jour (brightness/contrast/saturation)
    ↓
useEffect détecte le changement
    ↓
applyAdjustments() appelée
    ↓
Fabric.js applique les filtres Brightness/Contrast/Saturation
    ↓
Canvas re-rendu en temps réel
    ↓
[Validation] →
    ↓
Export du canvas avec réglages appliqués
    ↓
Sauvegarde dans baseUri + adjustments
    ↓
Redirection vers edit.tsx avec autoSave=true
    ↓
edit.tsx charge baseUri (déjà avec réglages)
    ↓
edit.tsx ajoute overlays par-dessus
    ↓
Sauvegarde de l'image composite finale
    ↓
Affichage dans result.tsx
```

### Conversion des valeurs

Les sliders utilisent des valeurs de -100 à +100, converties pour Fabric.js :

```javascript
// -100 à +100 → -1.0 à +1.0 pour Fabric.js
if (brightness !== 0) {
  img.filters.push(new fabric.Image.filters.Brightness({
    brightness: brightness / 100
  }));
}
```

---

## ✅ Avantages de ce système

1. **Plus de problèmes de compatibilité** : Les filtres prédéfinis causaient des bugs avec certains formats d'image
2. **Contrôle précis** : L'utilisateur peut ajuster finement chaque paramètre
3. **Interface intuitive** : Boutons +/− + slider = facile à utiliser
4. **Temps réel** : Prévisualisation immédiate des modifications
5. **Non-destructif** : Les overlays restent toujours intacts
6. **Réversible** : Bouton Réinitialiser pour tout remettre à 0

---

## 🔄 Migration des anciennes données

Les memories avec `filter` (ancien système) continueront de fonctionner :
- Le champ `filter` sera ignoré
- Seul `adjustments` est utilisé désormais
- Les anciennes photos s'affichent normalement (baseUri sans réglages)

---

## 🚀 Extensions futures possibles

Les réglages suivants peuvent être ajoutés facilement :

1. **Température** : Ajout d'un filtre de température de couleur
2. **Netteté** : Filtre Convolute avec matrice de sharpening
3. **Ombres/Hautes lumières** : Réglages sélectifs des zones claires/sombres
4. **Teinte** : Rotation de teinte (Hue)
5. **Vibrance** : Alternative plus subtile à la saturation

Chaque nouveau réglage nécessite :
- Ajout d'un champ dans `PhotoAdjustments`
- Ajout d'un state dans `photo-editor-canvas.tsx`
- Ajout d'un slider dans l'interface
- Ajout d'un filtre Fabric.js dans `applyAdjustments()`

---

## 🎯 Usage de l'API Fabric.js

### Filtres disponibles

```javascript
// Luminosité : -1 à +1
new fabric.Image.filters.Brightness({ brightness: 0.5 })

// Contraste : -1 à +1
new fabric.Image.filters.Contrast({ contrast: 0.3 })

// Saturation : -1 à +1
new fabric.Image.filters.Saturation({ saturation: 0.7 })

// Autres filtres disponibles pour extensions futures :
new fabric.Image.filters.HueRotation({ rotation: 0.5 })  // Teinte
new fabric.Image.filters.Blur({ blur: 0.3 })             // Flou/Netteté
new fabric.Image.filters.Gamma({ gamma: [1, 0.5, 2.1] }) // Gamma RGB
```

### Application des filtres

```javascript
// Réinitialiser les filtres
img.filters = [];

// Ajouter les filtres actifs
if (brightness !== 0) {
  img.filters.push(new fabric.Image.filters.Brightness({
    brightness: brightness / 100
  }));
}

// Appliquer et re-rendre
img.applyFilters();
canvas.renderAll();
```

---

## 💡 Code exemple

### Ajout d'un nouveau réglage (Netteté)

1. **Ajouter dans PhotoAdjustments** :
```typescript
export interface PhotoAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;  // NOUVEAU
}
```

2. **Ajouter le state** :
```typescript
const [sharpness, setSharpness] = useState(0);
```

3. **Ajouter le slider** :
```tsx
<div style={styles.adjustmentRow}>
  <label style={styles.adjustmentLabel}>Netteté</label>
  <div style={styles.adjustmentControls}>
    <button onClick={() => setSharpness(Math.max(-100, sharpness - 5))}>−</button>
    <input type="range" min="-100" max="100" value={sharpness}
      onChange={(e) => setSharpness(Number(e.target.value))} />
    <button onClick={() => setSharpness(Math.min(100, sharpness + 5))}>+</button>
    <span>{sharpness}</span>
  </div>
</div>
```

4. **Appliquer le filtre** :
```typescript
if (sharpness !== 0) {
  const matrix = sharpness > 0 
    ? [0, -1, 0, -1, 5, -1, 0, -1, 0]  // Netteté
    : [1, 1, 1, 1, 1, 1, 1, 1, 1];     // Flou
  img.filters.push(new fabric.Image.filters.Convolute({
    matrix: matrix
  }));
}
```

---

## 🐛 Dépannage

### Les sliders ne répondent pas

**Solution** :
- Vérifiez que `useEffect` avec les dépendances `[brightness, contrast, saturation, loading]` est bien présent
- Vérifiez que `applyAdjustments()` est appelée dans le useEffect

### L'image ne se met pas à jour en temps réel

**Solution** :
- Vérifiez que `originalImageRef.current` existe
- Vérifiez que `fabricCanvasRef.current` existe
- Vérifiez les logs console pour les erreurs Fabric.js

### Les overlays disparaissent

**Solution** :
- Ce bug a été corrigé ! Les overlays sont maintenant préservés dans `memory.textOverlays` et `memory.signatureOverlays`
- L'image de base avec réglages est sauvegardée séparément dans `baseUri`

---

## 📚 Ressources

- **Documentation Fabric.js** : http://fabricjs.com/docs/
- **API Filtres Fabric.js** : http://fabricjs.com/image-filters
- **React State Hooks** : https://react.dev/reference/react/hooks

---

Voilà ! Vous disposez maintenant d'un système de réglages photo flexible et non-destructif ! 🎉
