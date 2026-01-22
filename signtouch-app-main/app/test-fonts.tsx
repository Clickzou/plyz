import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFonts } from 'expo-font';
import { Kalam_400Regular } from '@expo-google-fonts/kalam';
import { Caveat_400Regular } from '@expo-google-fonts/caveat';
import { Handlee_400Regular } from '@expo-google-fonts/handlee';

export default function TestFontsScreen() {
  const [fontsLoaded] = useFonts({
    'Kalam-Regular': Kalam_400Regular,
    'Caveat-Regular': Caveat_400Regular,
    'Handlee-Regular': Handlee_400Regular,
  });

  if (!fontsLoaded) {
    return <Text>Chargement des polices...</Text>;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>System (par défaut)</Text>
        <Text style={styles.text}>Bonjour, ceci est un test</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Kalam-Regular</Text>
        <Text style={[styles.text, { fontFamily: 'Kalam-Regular' }]}>
          Bonjour, ceci est un test
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Caveat-Regular</Text>
        <Text style={[styles.text, { fontFamily: 'Caveat-Regular' }]}>
          Bonjour, ceci est un test
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Handlee-Regular</Text>
        <Text style={[styles.text, { fontFamily: 'Handlee-Regular' }]}>
          Bonjour, ceci est un test
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 20,
  },
  section: {
    marginBottom: 30,
    padding: 15,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  label: {
    color: '#10b981',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  text: {
    color: '#ffffff',
    fontSize: 24,
  },
});
