import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, HelpCircle, Check, Users } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoTranslate } from '@/utils/translation';

interface Question {
  id: string;
  titre: string;
  contenu: string | null;
  nb_soutiens: number;
  nb_messages: number;
  created_at: string;
  auteur_id: string;
  auteur_nom: string;
  auteur_avatar: string | null;
  soutenu: boolean;
  repondue: boolean;
}

/**
 * Les questions des fans — le même écran des deux côtés.
 *
 * Côté personnalité, c'est sa liste de travail : ce à quoi ses fans attendent
 * une réponse, la plus demandée en premier. Côté fan, c'est ce que la
 * communauté veut savoir — et la preuve que sa question n'est pas tombée dans
 * un puits.
 *
 * Une seule liste, un seul ordre, pour les deux : deux écrans auraient fini
 * par ne plus dire la même chose.
 *
 * ⚠️ Ces questions sont la matière du dossier envoyé à un agent (« voici les
 * dix questions que vos fans vous posent le plus », voir `dossier_invitation`).
 * Elles ne sont jamais reformulées : ce sont les mots des fans.
 */
export default function QuestionsFansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ celebrityId?: string; nom?: string }>();
  const celebrityId = String(params.celebrityId || '');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [chargement, setChargement] = useState(true);

  const trUI = useAutoTranslate([
    'Les questions de tes fans',
    'Les questions des fans',
    'Personne n’a encore posé de question.',
    'Aucune question ici pour l’instant. Sois le premier à en poser une.',
    'fan veut savoir',
    'fans veulent savoir',
    'Moi aussi',
    'Répondu',
    'Répondre',
    'Voir',
    'Réponds à celles qui montent : chaque réponse se voit dans l’espace de tes fans, et tu n’as à le faire qu’une fois.',
  ]);

  // La personnalité chez elle : c'est ce qui change le titre et le bouton.
  const chezMoi = !!user && user.id === celebrityId;

  const charger = useCallback(async () => {
    if (!celebrityId) return;
    setChargement(true);
    const { data } = await supabase.rpc('fz_questions', {
      p_celebrity: celebrityId, p_star: null, p_limite: 100,
    });
    setQuestions((data || []) as Question[]);
    setChargement(false);
  }, [celebrityId]);

  useEffect(() => { charger(); }, [charger]);

  const soutenir = async (q: Question) => {
    if (!user || chezMoi) return;
    const soutenu = !q.soutenu;
    setQuestions((actuel) => actuel.map((x) => (x.id === q.id
      ? { ...x, soutenu, nb_soutiens: Math.max(0, x.nb_soutiens + (soutenu ? 1 : -1)) }
      : x)));
    try {
      if (soutenu) {
        await supabase.from('fanzone_soutiens').insert({ sujet_id: q.id, fan_id: user.id });
      } else {
        await supabase.from('fanzone_soutiens').delete()
          .eq('sujet_id', q.id).eq('fan_id', user.id);
      }
    } catch {
      setQuestions((actuel) => actuel.map((x) => (x.id === q.id
        ? { ...x, soutenu: q.soutenu, nb_soutiens: q.nb_soutiens } : x)));
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.retour} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titre} numberOfLines={1}>
          {chezMoi ? trUI('Les questions de tes fans') : trUI('Les questions des fans')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {chezMoi && (
        <Text style={styles.aide}>
          {trUI('Réponds à celles qui montent : chaque réponse se voit dans l’espace de tes fans, et tu n’as à le faire qu’une fois.')}
        </Text>
      )}

      {chargement ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={questions}
          keyExtractor={(q) => q.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}
          onRefresh={charger}
          refreshing={false}
          ListEmptyComponent={
            <Text style={styles.vide}>
              {chezMoi
                ? trUI('Personne n’a encore posé de question.')
                : trUI('Aucune question ici pour l’instant. Sois le premier à en poser une.')}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.carte}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: '/fan-sujet',
                params: { id: item.id, titre: item.titre, celebrityId },
              } as any)}
            >
              <View style={styles.haut}>
                {item.auteur_avatar ? (
                  <Image source={{ uri: item.auteur_avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarVide]}>
                    <Text style={styles.avatarTxt}>{(item.auteur_nom || '?')[0].toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.auteur} numberOfLines={1}>{item.auteur_nom}</Text>
                {item.repondue && (
                  <View style={styles.repondue}>
                    <Check size={11} color="#10b981" />
                    <Text style={styles.reponduTxt}>{trUI('Répondu')}</Text>
                  </View>
                )}
              </View>

              <View style={styles.questionLigne}>
                <HelpCircle size={16} color="#f59e0b" />
                <Text style={styles.question}>{item.titre}</Text>
              </View>
              {!!item.contenu && (
                <Text style={styles.detail} numberOfLines={3}>{item.contenu}</Text>
              )}

              <View style={styles.bas}>
                {/* Le nombre est mis en avant : « 47 fans veulent savoir » dit à
                    la personnalité par quoi commencer, « une question » non. */}
                <View style={styles.compteur}>
                  <Users size={12} color="#9ca3af" />
                  <Text style={styles.compteurTxt}>
                    {item.nb_soutiens + 1}{' '}
                    {item.nb_soutiens + 1 > 1 ? trUI('fans veulent savoir') : trUI('fan veut savoir')}
                  </Text>
                </View>

                {chezMoi ? (
                  <View style={styles.btnRepondre}>
                    <Text style={styles.btnRepondreTxt}>{trUI('Répondre')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.soutien, item.soutenu && styles.soutienActif]}
                    onPress={() => soutenir(item)}
                    activeOpacity={0.85}
                    hitSlop={6}
                  >
                    <Text style={[styles.soutienTxt, item.soutenu && styles.soutienTxtActif]}>
                      {trUI('Moi aussi')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
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
    paddingHorizontal: 16, paddingBottom: 8,
  },
  retour: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  titre: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  aide: {
    color: '#9ca3af', fontSize: 12.5, lineHeight: 18,
    marginHorizontal: 16, marginBottom: 8,
  },

  carte: {
    padding: 13, marginBottom: 10, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  haut: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarVide: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  auteur: { color: '#9ca3af', fontSize: 12.5, fontWeight: '600', flex: 1 },
  repondue: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(16,185,129,0.14)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  reponduTxt: { color: '#10b981', fontSize: 10, fontWeight: '800' },

  questionLigne: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  question: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 21, flex: 1 },
  detail: { color: '#cbd5e1', fontSize: 13.5, lineHeight: 19, marginTop: 7 },

  bas: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11 },
  compteur: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  compteurTxt: { color: '#9ca3af', fontSize: 12, fontWeight: '600' },
  soutien: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  soutienActif: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  soutienTxt: { color: '#f59e0b', fontSize: 12, fontWeight: '800' },
  soutienTxtActif: { color: '#052e1f' },
  btnRepondre: {
    backgroundColor: '#10b981', borderRadius: 9,
    paddingHorizontal: 13, paddingVertical: 7,
  },
  btnRepondreTxt: { color: '#052e1f', fontSize: 12.5, fontWeight: '800' },

  vide: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40, lineHeight: 20 },
});
