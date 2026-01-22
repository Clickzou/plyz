# Activation de la police Pumpkind Custard

## Statut actuel

Pour l'instant, l'application utilise la **police système par défaut** pour le logo "SignTouch".

Pour activer la police **Pumpkind Custard**, suivez les étapes ci-dessous.

---

## Étape 1 : Obtenir la police

1. Téléchargez la police **Pumpkind Custard** (fichier `.ttf`)
2. Renommez-la en : `PumpkindCustard.ttf`
3. Placez-la dans : `/assets/fonts/PumpkindCustard.ttf`

---

## Étape 2 : Activer le chargement de la police

Dans le fichier `/app/index.tsx`, remplacez le code suivant :

### Code actuel (police désactivée)

```typescript
useEffect(() => {
  async function loadFonts() {
    setFontsLoaded.current = true;
    SplashScreen.hideAsync();
  }
  loadFonts();
}, []);
```

### Par ce code (police activée)

```typescript
useEffect(() => {
  async function loadFonts() {
    try {
      await Font.loadAsync({
        PumpkindCustard: require('@/assets/fonts/PumpkindCustard.ttf'),
      });
      console.log('Pumpkind Custard font loaded successfully');
    } catch (error) {
      console.error('Failed to load Pumpkind Custard font:', error);
    } finally {
      setFontsLoaded.current = true;
      SplashScreen.hideAsync();
    }
  }
  loadFonts();
}, []);
```

---

## Étape 3 : Redémarrer l'application

- **Expo Go** : Fermez et rouvrez l'application
- **Web** : Rafraîchissez le navigateur
- **Build natif** : Rebuild l'application

---

## Vérification

Le logo "SignTouch" devrait maintenant s'afficher avec la police Pumpkind Custard.

Le style appliqué est :

```typescript
logoText: {
  fontSize: 68,
  fontFamily: 'PumpkindCustard',
  color: '#ffffff',
  textShadowColor: 'rgba(0, 0, 0, 0.25)',
  textShadowOffset: { width: 0, height: 4 },
  textShadowRadius: 12,
}
```

---

## Alternative : Utiliser une police similaire

Si vous ne trouvez pas Pumpkind Custard, vous pouvez utiliser une police script similaire :

### Avec une police Google Font

1. Installer une police via expo-google-fonts :
```bash
npm install @expo-google-fonts/pacifico
```

2. Modifier l'import dans `/app/index.tsx` :
```typescript
import { useFonts, Pacifico_400Regular } from '@expo-google-fonts/pacifico';
```

3. Charger la police :
```typescript
const [fontsLoaded] = useFonts({
  Pacifico_400Regular,
});
```

4. Modifier le style :
```typescript
logoText: {
  fontFamily: 'Pacifico_400Regular',
  // ...
}
```

### Polices script recommandées

- **Pacifico** : Ludique et arrondie
- **Sacramento** : Élégante et script
- **Satisfy** : Manuscrite
- **Caveat** : Décontractée
- **Dancing Script** : Fluide

---

## Dépannage

### Erreur "Cannot find module"

- Vérifiez que le fichier est bien nommé `PumpkindCustard.ttf`
- Vérifiez le chemin : `/assets/fonts/PumpkindCustard.ttf`
- Vérifiez les permissions de lecture du fichier

### La police ne s'affiche pas

- Redémarrez complètement l'application
- Sur Web, videz le cache du navigateur
- Vérifiez la console pour les erreurs

### Build échoue

- Vérifiez que le fichier .ttf n'est pas corrompu
- Essayez de reconvertir la police en .ttf
- Utilisez un validateur de police en ligne
