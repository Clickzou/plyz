# Guide d'installation de la police Pumpkind Custard

## Étapes d'installation

### 1. Télécharger la police

Recherchez et téléchargez la police **Pumpkind Custard** depuis l'un de ces sites :
- [DaFont](https://www.dafont.com/)
- [Google Fonts](https://fonts.google.com/)
- [Font Squirrel](https://www.fontsquirrel.com/)
- [1001 Fonts](https://www.1001fonts.com/)

Vous devez obtenir un fichier avec l'extension `.ttf` (TrueType Font).

### 2. Placer le fichier de police

Une fois téléchargé :
1. Renommez le fichier en : `PumpkindCustard.ttf`
2. Placez-le dans le dossier : `/assets/fonts/`
3. Le chemin complet doit être : `/assets/fonts/PumpkindCustard.ttf`

### 3. Structure du dossier

```
project/
├── assets/
│   └── fonts/
│       ├── PumpkindCustard.ttf  ← Votre fichier .ttf
│       └── README.md
├── app/
├── components/
└── ...
```

### 4. Redémarrer l'application

Après avoir placé la police :
- **Sur Expo Go** : Fermez complètement l'app et redémarrez-la
- **Sur Web** : Rafraîchissez le navigateur (Ctrl+R ou Cmd+R)
- **Build natif** : Rebuild l'application

### 5. Vérification

Le logo "SignTouch" sur l'écran d'accueil devrait s'afficher avec la police Pumpkind Custard.

Si la police n'est pas trouvée, l'application utilisera la police système par défaut sans crasher.

## Dépannage

### La police ne s'affiche pas

1. Vérifiez que le fichier s'appelle exactement : `PumpkindCustard.ttf`
2. Vérifiez qu'il est dans le bon dossier : `/assets/fonts/`
3. Vérifiez que l'extension est bien `.ttf` (pas `.otf`)
4. Redémarrez complètement l'application

### Message d'erreur au chargement

Si vous voyez "Pumpkind Custard font not found" dans les logs :
- C'est normal si le fichier n'est pas encore placé
- L'application utilisera une police de fallback
- Placez le fichier .ttf et redémarrez

### Police de remplacement temporaire

Si vous n'avez pas encore la police Pumpkind Custard, vous pouvez temporairement :
1. Télécharger une police script similaire (ex: Pacifico, Sacramento)
2. La renommer en `PumpkindCustard.ttf`
3. La placer dans `/assets/fonts/`

## Alternatives

Si vous ne trouvez pas Pumpkind Custard, voici des polices script similaires :
- Pacifico (ludique, arrondie)
- Sacramento (élégante, script)
- Satisfy (manuscrite)
- Caveat (décontractée)
- Dancing Script (fluide)

Ces polices sont disponibles gratuitement sur Google Fonts.

## Code technique

Le chargement de la police est géré dans `/app/index.tsx` :

```typescript
await Font.loadAsync({
  PumpkindCustard: require('@/assets/fonts/PumpkindCustard.ttf'),
});
```

Et appliquée au logo :

```typescript
logoText: {
  fontSize: 68,
  fontFamily: 'PumpkindCustard',
  color: '#ffffff',
  // ...
}
```
