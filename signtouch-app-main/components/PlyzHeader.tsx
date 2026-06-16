import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Logo Plyz dans une pastille blanche, à placer en haut des écrans principaux
// (le logo a un texte foncé : la pastille blanche le rend lisible sur le fond sombre de l'app).
export default function PlyzHeader() {
  return (
    <View style={styles.wrap} pointerEvents="none">
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
