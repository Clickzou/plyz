import { useEffect } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

/**
 * Point d'entrée de l'éditeur photo
 *
 * Sur Web: Redirige vers photo-editor-canvas qui utilise Fabric.js importé localement
 * Sur Mobile: Affiche un message d'erreur (Fabric.js nécessite un DOM)
 */
export default function PhotoEditorScreen() {
  const params = useLocalSearchParams<{ memoryId?: string; imageUri?: string }>();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Sur Web, rediriger vers le composant canvas qui utilise Fabric.js local
      router.replace({
        pathname: '/photo-editor-canvas',
        params: {
          memoryId: params.memoryId,
          imageUri: params.imageUri,
        },
      });
    }
  }, []);

  // Sur mobile, afficher un message
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>
          L'éditeur photo avancé n'est disponible que sur Web.
        </Text>
        <Text style={styles.subtext}>
          Fabric.js nécessite un environnement DOM pour fonctionner.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Chargement...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtext: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
});
