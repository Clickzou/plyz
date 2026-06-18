import React from 'react';
import { View, Image, StyleSheet, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Logo Plyz dans une pastille blanche, à placer en haut des écrans principaux
// (le logo a un texte foncé : la pastille blanche le rend lisible sur le fond sombre de l'app).
export default function PlyzHeader() {
  const insets = useSafeAreaInsets();
  // Sur certains Android (edge-to-edge), le safe area n'est pas répercuté (insets.top = 0) :
  // on compense avec la hauteur de la barre de statut pour que le logo ne passe pas dessous.
  const extraTop = insets.top === 0 && Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;
  return (
    <View style={[styles.wrap, { paddingTop: 6 + extraTop }]} pointerEvents="none">
      <View style={styles.pill}>
        <Image
          source={require('../assets/logo-plyz.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 10,
    position: 'relative',
    zIndex: 10,
    elevation: 10,
  },
  pill: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  logo: {
    width: 92,
    height: 30,
  },
});
