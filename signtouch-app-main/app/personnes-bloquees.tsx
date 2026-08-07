import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, UserX } from 'lucide-react-native';
import { showConfirm } from '@/utils/alertHelper';
import { useAutoTranslate } from '@/utils/translation';
import { listerBlocages, debloquer, type PersonneBloquee } from '@/utils/blocages';

/**
 * Les personnes que j'ai bloquées.
 *
 * Un blocage sans moyen de le défaire est une impasse : on bloque sur un coup
 * de colère, et six mois plus tard on ne comprend plus pourquoi on ne voit
 * plus quelqu'un. Les stores exigent l'un ET l'autre.
 */
export default function PersonnesBloqueesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [liste, setListe] = useState<PersonneBloquee[]>([]);
  const [chargement, setChargement] = useState(true);

  const trUI = useAutoTranslate([
    'Personnes bloquées',
    'Tu n’as bloqué personne.',
    'Une personne bloquée ne voit plus tes messages dans la Fan zone, et tu ne vois plus les siens. Elle n’en est pas informée.',
    'Débloquer',
    'Débloquer cette personne ?',
    'Vous vous reverrez dans la Fan zone.',
    'Annuler',
    'Bloquée le',
  ]);

  const charger = useCallback(async () => {
    setChargement(true);
    setListe(await listerBlocages());
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const retirer = (p: PersonneBloquee) => {
    showConfirm(
      trUI('Débloquer cette personne ?'),
      trUI('Vous vous reverrez dans la Fan zone.'),
      [
        { text: trUI('Annuler'), style: 'cancel' },
        {
          text: trUI('Débloquer'),
          onPress: async () => {
            if (await debloquer(p.bloque_id)) {
              setListe((l) => l.filter((x) => x.bloque_id !== p.bloque_id));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.retour} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titre}>{trUI('Personnes bloquées')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.explication}>
        {trUI('Une personne bloquée ne voit plus tes messages dans la Fan zone, et tu ne vois plus les siens. Elle n’en est pas informée.')}
      </Text>

      {chargement ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={liste}
          keyExtractor={(p) => p.bloque_id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={styles.vide}>
              <UserX size={40} color="#374151" />
              <Text style={styles.videTxt}>{trUI('Tu n’as bloqué personne.')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.ligne}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarVide]}>
                  <Text style={styles.avatarTxt}>{(item.nom || '?')[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.nom} numberOfLines={1}>{item.nom}</Text>
                <Text style={styles.depuis}>
                  {trUI('Bloquée le')} {new Date(item.depuis).toLocaleDateString()}
                </Text>
              </View>
              <TouchableOpacity style={styles.btn} onPress={() => retirer(item)} activeOpacity={0.8}>
                <Text style={styles.btnTxt}>{trUI('Débloquer')}</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  retour: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  titre: { color: '#fff', fontSize: 17, fontWeight: '800' },
  explication: {
    color: '#9ca3af', fontSize: 13, lineHeight: 19,
    marginHorizontal: 16, marginBottom: 6,
  },
  ligne: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 11, marginBottom: 8, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarVide: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  nom: { color: '#fff', fontSize: 15, fontWeight: '700' },
  depuis: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  btn: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  btnTxt: { color: '#e5e7eb', fontSize: 13, fontWeight: '700' },
  vide: { alignItems: 'center', gap: 12, marginTop: 50 },
  videTxt: { color: '#6b7280', fontSize: 14 },
});
