import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Trophy, Sparkles, Camera, MessageCircle } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoTranslate } from '@/utils/translation';

interface Fan {
  fan_id: string;
  nom: string;
  avatar_url: string | null;
  rencontres: number;
  messages: number;
  points: number;
  premiere_heure: boolean;
}

/** Les trois premières places se voient de loin. Au-delà, c'est une liste. */
const MEDAILLES = ['🥇', '🥈', '🥉'];

/**
 * Les plus grands fans d'une personnalité.
 *
 * ⚠️ CE QUI N'EST PAS COMPTÉ, ET POURQUOI : l'argent dépensé.
 * Classer les fans sur ce qu'ils ont payé transformerait une communauté en
 * liste de clients, ferait de la fidélité une question de moyens, et
 * s'afficherait publiquement — ce qui serait indécent. On compte ce qui se
 * voit : les rencontres vécues et la présence dans l'espace.
 *
 * Le même écran des deux côtés : le fan y trouve sa place et une raison de
 * revenir, la personnalité y découvre les visages qui la suivent depuis le
 * début. C'est l'un des rares endroits où la star apprend quelque chose sur
 * ses fans qu'aucun réseau social ne lui dira.
 */
export default function TopFansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ celebrityId?: string; nom?: string }>();
  const celebrityId = String(params.celebrityId || '');

  const [fans, setFans] = useState<Fan[]>([]);
  const [chargement, setChargement] = useState(true);

  const trUI = useAutoTranslate([
    'Ses plus grands fans',
    'Tes plus grands fans',
    'Personne au classement pour l’instant.',
    'Le classement se remplit avec les rencontres et les messages.',
    'rencontre',
    'rencontres',
    'message',
    'messages',
    'Première heure',
    'Toi',
    'Il te réclamait avant même ton arrivée.',
    'Ils te réclamaient avant même ton arrivée.',
  ]);

  const chezMoi = !!user && user.id === celebrityId;

  const charger = useCallback(async () => {
    if (!celebrityId) return;
    setChargement(true);
    const { data } = await supabase.rpc('top_fans', { p_celebrity: celebrityId, p_limite: 10 });
    setFans((data || []) as Fan[]);
    setChargement(false);
  }, [celebrityId]);

  useEffect(() => { charger(); }, [charger]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.retour} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titre} numberOfLines={1}>
          {chezMoi ? trUI('Tes plus grands fans') : trUI('Ses plus grands fans')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {chargement ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={fans}
          keyExtractor={(f) => f.fan_id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}
          onRefresh={charger}
          refreshing={false}
          ListHeaderComponent={
            <View style={styles.entete}>
              <Trophy size={17} color="#f59e0b" />
              <Text style={styles.enteteTxt}>
                {trUI('Le classement se remplit avec les rencontres et les messages.')}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.vide}>{trUI('Personne au classement pour l’instant.')}</Text>
          }
          renderItem={({ item, index }) => {
            const moi = user?.id === item.fan_id;
            return (
              <View style={[styles.ligne, moi && styles.ligneMoi]}>
                <Text style={styles.rang}>
                  {MEDAILLES[index] || `${index + 1}`}
                </Text>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarVide]}>
                    <Text style={styles.avatarTxt}>{(item.nom || '?')[0].toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nomLigne}>
                    <Text style={styles.nom} numberOfLines={1}>
                      {moi ? trUI('Toi') : item.nom}
                    </Text>
                    {item.premiere_heure && (
                      <View style={styles.badgePremiere}>
                        <Sparkles size={10} color="#f59e0b" />
                        <Text style={styles.badgePremiereTxt}>{trUI('Première heure')}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.stats}>
                    {item.rencontres > 0 && (
                      <View style={styles.stat}>
                        <Camera size={11} color="#10b981" />
                        <Text style={styles.statTxt}>
                          {item.rencontres}{' '}
                          {item.rencontres > 1 ? trUI('rencontres') : trUI('rencontre')}
                        </Text>
                      </View>
                    )}
                    {item.messages > 0 && (
                      <View style={styles.stat}>
                        <MessageCircle size={11} color="#60a5fa" />
                        <Text style={styles.statTxt}>
                          {item.messages}{' '}
                          {item.messages > 1 ? trUI('messages') : trUI('message')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  retour: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  titre: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },

  entete: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14,
    padding: 12, borderRadius: 13,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.28)',
  },
  enteteTxt: { color: '#fcd34d', fontSize: 12.5, lineHeight: 18, flex: 1 },

  ligne: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    padding: 11, marginBottom: 9, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  // Le fan se trouve lui-même du premier coup d'œil : sans cela, un
  // classement de dix lignes se lit deux fois.
  ligneMoi: {
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.45)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  rang: { color: '#e5e7eb', fontSize: 17, fontWeight: '900', width: 26, textAlign: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarVide: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  nomLigne: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  nom: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  badgePremiere: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  badgePremiereTxt: { color: '#f59e0b', fontSize: 10, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 12, marginTop: 3 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTxt: { color: '#9ca3af', fontSize: 12 },

  vide: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
