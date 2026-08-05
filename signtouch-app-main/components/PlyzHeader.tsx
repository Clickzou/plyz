import React from 'react';
import { View, Image, StyleSheet, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PenSquare } from 'lucide-react-native';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';

// Logo Plyz dans une pastille blanche, à placer en haut des écrans principaux
// (le logo a un texte foncé : la pastille blanche le rend lisible sur le fond sombre de l'app).
export default function PlyzHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isCelebrity } = useCelebrityMode();
  // Sur certains Android (edge-to-edge), le safe area n'est pas répercuté (insets.top = 0) :
  // on compense avec la hauteur de la barre de statut pour que le logo ne passe pas dessous.
  const extraTop = insets.top === 0 && Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;
  return (
    // `box-none` et non `none` : le conteneur reste transparent aux gestes, mais
    // le raccourci de publication doit, lui, rester cliquable.
    <View style={[styles.wrap, { paddingTop: 6 + extraTop }]} pointerEvents="box-none">
      {/* Raccourci de publication, réservé aux célébrités. Sans lui, publier
          imposait de passer par l'onglet Événements puis une carte enfouie :
          une célébrité ne devrait pas avoir à chercher où publier. */}
      {isCelebrity && (
        <TouchableOpacity
          style={[styles.publishButton, { top: 6 + extraTop }]}
          onPress={() => router.push('/create-post')}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <PenSquare size={20} color="#10b981" strokeWidth={2} />
        </TouchableOpacity>
      )}
      <View style={styles.pill} pointerEvents="none">
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
  publishButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    zIndex: 11,
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
