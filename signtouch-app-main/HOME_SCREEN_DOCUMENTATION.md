# Documentation - Écran d'accueil SignTouch

## Vue d'ensemble

L'écran d'accueil présente :
- Un fond dégradé vert lumineux
- 10 bulles animées contenant des silhouettes de sportifs (#2E7D32)
- Le logo "SignTouch" en police Pumpkind Custard
- Un bouton pour prendre une photo
- Une barre de navigation en bas

## Structure des animations

### 10 Bulles animées

Chaque bulle contient une silhouette de sportif/chanteur :

1. **Footballeur** ⚽
2. **Joueur de cricket** 🏏
3. **Basketteur** 🏀
4. **Joueur de hockey sur gazon** 🏑
5. **Joueur de tennis** 🎾
6. **Joueur de volley** 🏐
7. **Joueur de tennis de table** 🏓
8. **Joueur de baseball** ⚾
9. **Rugbyman** 🏉
10. **Chanteur/Chanteuse** 🎤

### Caractéristiques des silhouettes

- **Couleur exacte** : `#2E7D32` (vert foncé)
- **Style** : Silhouettes plates / flat design
- **Taille** : 60% de la taille de la bulle
- **Technique** : SVG avec react-native-svg
- **Fichier** : `/components/SportSilhouettes.tsx`

### Caractéristiques des bulles

- **Tailles** : Entre 90px et 140px (variées)
- **Fond** : Semi-transparent blanc (rgba(255, 255, 255, 0.25))
- **Bordure** : 2px, rgba(255, 255, 255, 0.4)
- **Ombre** : Légère ombre portée
- **Forme** : Cercle parfait (borderRadius: 1000)

### Animation de chaque bulle

Chaque bulle anime 3 propriétés en boucle infinie :

1. **translateX** : Déplacement horizontal (±17 à ±25px)
2. **translateY** : Déplacement vertical (±18 à ±25px)
3. **scale** : Zoom léger (0.94 à 1.06)

#### Paramètres d'animation

- **Durée** : Entre 7500ms et 11500ms (random pour chaque bulle)
- **Délai initial** : Entre 0ms et 3000ms (décalage pour effet asynchrone)
- **Mouvement** : Aller-retour fluide
- **Native Driver** : Activé pour performances optimales

#### Séquence d'animation

```
Delay initial → [
  translateX: 0 → moveX → 0
  translateY: 0 → moveY → 0
  scale: 1 → scaleMax → scaleMin → 1
] → Recommence en boucle
```

### Configuration des bulles

Les 10 bulles sont configurées dans le tableau `bubbleConfigs` :

```typescript
const bubbleConfigs: BubbleConfig[] = [
  {
    size: 120,           // Taille en px
    top: '8%',          // Position verticale
    left: '5%',         // Position horizontale
    duration: 8000,     // Durée de l'animation (ms)
    moveX: 20,          // Déplacement horizontal (px)
    moveY: -25,         // Déplacement vertical (px)
    scaleMin: 0.95,     // Scale minimum
    scaleMax: 1.05,     // Scale maximum
    delay: 0            // Délai avant démarrage (ms)
  },
  // ... 9 autres bulles
];
```

## Police Pumpkind Custard

### Configuration

- **Nom de la police** : PumpkindCustard
- **Fichier** : `/assets/fonts/PumpkindCustard.ttf`
- **Chargement** : Avec `expo-font` via `Font.loadAsync()`
- **Application** : `fontFamily: 'PumpkindCustard'`

### Installation

Voir le fichier `FONT_INSTALLATION_GUIDE.md` pour les instructions détaillées.

Si la police n'est pas trouvée, l'application utilisera la police système par défaut sans crasher.

## Layers (z-index)

L'ordre d'affichage des éléments :

1. **Fond** : LinearGradient vert (z-index: auto)
2. **Bulles** : Silhouettes animées (z-index: auto, pointerEvents: none)
3. **Logo** : Texte "SignTouch" (z-index: 11)
4. **Bouton** : Bouton caméra (z-index: 12)
5. **Navigation** : Barre de navigation (z-index: auto)

## Interactions

- **Bulles** : `pointerEvents="none"` → Ne bloquent pas les interactions
- **Bouton** : Toujours cliquable, lance la caméra (`/camera`)
- **Animations** : Ne bloquent jamais l'interface utilisateur
- **Performance** : Utilisation de `useNativeDriver: true` pour fluidité

## Fichiers modifiés/créés

### Créés
- `/components/SportSilhouettes.tsx` - Composants SVG des silhouettes
- `/assets/fonts/README.md` - Instructions pour la police
- `/FONT_INSTALLATION_GUIDE.md` - Guide complet d'installation
- `/HOME_SCREEN_DOCUMENTATION.md` - Ce fichier

### Modifiés
- `/app/index.tsx` - Écran d'accueil avec animations

## Architecture technique

### État et Refs

```typescript
const [fontsLoaded, setFontsLoaded] = useRef(false);

const bubbleAnimations = useRef(
  bubbleConfigs.map(() => ({
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    scale: new Animated.Value(1),
  }))
).current;
```

### Hooks principaux

1. **useEffect #1** : Chargement de la police
2. **useEffect #2** : Nettoyage localStorage (web uniquement)
3. **useEffect #3** : Lancement des animations des bulles

### Nettoyage

Les animations sont arrêtées au démontage du composant :

```typescript
return () => {
  animations.forEach((anim) => anim.stop());
};
```

## Performance

- **Native Driver** : Toutes les animations utilisent le native driver
- **Propriétés animées** : translateX, translateY, scale (optimisées)
- **Éviter** : Pas d'animation de layout, couleur ou opacity (coûteux)
- **Optimisation** : Animations décalées pour éviter les pics de calcul

## Compatibilité

- ✅ **Web** : Testé et fonctionnel
- ✅ **Expo Go** : Compatible
- ✅ **iOS** : Compatible (nécessite build)
- ✅ **Android** : Compatible (nécessite build)

## Personnalisation

### Changer la taille d'une bulle

Modifier `size` dans `bubbleConfigs`

### Changer la position d'une bulle

Modifier `top/bottom` et `left/right` dans `bubbleConfigs`

### Changer la vitesse d'animation

Modifier `duration` dans `bubbleConfigs`

### Changer l'amplitude du mouvement

Modifier `moveX` et `moveY` dans `bubbleConfigs`

### Changer la couleur des silhouettes

Modifier `SILHOUETTE_COLOR` dans `/components/SportSilhouettes.tsx`

### Changer le fond des bulles

Modifier `backgroundColor` et `borderColor` dans `styles.bubble`

## Dépannage

### Les animations sont saccadées
- Vérifier que `useNativeDriver: true` est présent
- Réduire le nombre de bulles
- Augmenter les durées d'animation

### Le bouton ne répond pas
- Vérifier que `pointerEvents="none"` est sur les bulles
- Vérifier le z-index du bouton (doit être > 10)

### La police ne s'affiche pas
- Voir `FONT_INSTALLATION_GUIDE.md`
- Vérifier que le fichier .ttf est bien placé
- Redémarrer l'application

### Les silhouettes ne s'affichent pas
- Vérifier que `react-native-svg` est installé
- Vérifier l'import dans index.tsx
- Vérifier la console pour les erreurs

## Notes importantes

- Ne jamais bloquer l'interface avec les animations
- Toujours nettoyer les animations au démontage
- Utiliser `pointerEvents="none"` sur les éléments décoratifs
- Privilégier le native driver pour les performances
