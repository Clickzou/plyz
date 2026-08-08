import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, BadgeCheck, Camera, Play } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { useAutoTranslate } from '@/utils/translation';
import { estUneVideo } from '@/utils/media';
import VisionneuseMedia, { type MediaVisionnable } from '@/components/VisionneuseMedia';

interface EvenementPasse {
  id: string;
  titre: string;
  starts_at: string;
  nb_presents: number;
  moi_present: boolean;
}

interface Souvenir {
  id: string;
  photo_url: string;
  fan_id: string;
  fan_nom: string;
  fan_avatar: string | null;
  quand: string;
  /** Vraie rencontre passée par l'app, ou photo publiée par un fan. */
  verifiee: boolean;
  message: string | null;
}

/**
 * Le mur des rencontres.
 *
 * Il ne demande RIEN à personne : les dédicaces réalisées dorment déjà en base
 * depuis le premier jour, dans la file d'attente des événements. Elles
 * n'étaient montrées qu'à leur destinataire. Les rassembler, c'est exposer la
 * seule preuve qu'aucun réseau social ne peut copier — ces gens-là ont
 * réellement rencontré la personne, l'application le sait, et elle peut le
 * certifier.
 *
 * C'est aussi ce qui donne envie au suivant : voir cinquante visages qui l'ont
 * fait vaut mieux que n'importe quelle promesse commerciale.
 */
export default function MurRencontresScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ celebrityId?: string; nom?: string }>();
  const celebrityId = String(params.celebrityId || '');

  const [souvenirs, setSouvenirs] = useState<Souvenir[]>([]);
  const [passes, setPasses] = useState<EvenementPasse[]>([]);
  const [chargement, setChargement] = useState(true);
  const [pleinEcran, setPleinEcran] = useState<MediaVisionnable | null>(null);

  const trUI = useAutoTranslate([
    'Le mur des rencontres',
    'Personne n’a encore de souvenir à montrer ici.',
    'Chaque photo est une rencontre qui a vraiment eu lieu.',
    'Rencontre vérifiée',
    'Tu y étais ?',
    'J’y étais',
    'fan y était',
    'fans y étaient',
  ]);

  // Deux colonnes : une photo de dédicace se regarde, elle ne se parcourt pas
  // en vignettes minuscules.
  const taille = (width - 16 * 2 - 10) / 2;

  const charger = useCallback(async () => {
    if (!celebrityId) return;
    setChargement(true);
    const [mur, evts] = await Promise.all([
      supabase.rpc('mur_rencontres', { p_celebrity: celebrityId, p_limite: 60 }),
      supabase.rpc('evenements_passes', { p_celebrity: celebrityId, p_limite: 5 }),
    ]);
    setSouvenirs((mur.data || []) as Souvenir[]);
    setPasses((evts.data || []) as EvenementPasse[]);
    setChargement(false);
  }, [celebrityId]);

  useEffect(() => { charger(); }, [charger]);

  /**
   * « J'y étais. »
   *
   * Tout le monde n'est pas passé par la file d'attente : on peut être venu,
   * avoir attendu, être reparti sans dédicace. Ces gens-là étaient là, et
   * c'est la seule façon qu'ils ont de le dire.
   */
  const basculerPresence = async (evt: EvenementPasse) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const present = !evt.moi_present;
    setPasses((actuel) => actuel.map((e) => (e.id === evt.id
      ? { ...e, moi_present: present, nb_presents: Math.max(0, e.nb_presents + (present ? 1 : -1)) }
      : e)));
    try {
      if (present) {
        await supabase.from('jetais').insert({ session_id: evt.id, fan_id: user.id });
      } else {
        await supabase.from('jetais').delete()
          .eq('session_id', evt.id).eq('fan_id', user.id);
      }
    } catch {
      setPasses((actuel) => actuel.map((e) => (e.id === evt.id
        ? { ...e, moi_present: evt.moi_present, nb_presents: evt.nb_presents } : e)));
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.retour} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titre} numberOfLines={1}>{trUI('Le mur des rencontres')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {chargement ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={souvenirs}
          keyExtractor={(s) => s.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30, gap: 10 }}
          onRefresh={charger}
          refreshing={false}
          ListHeaderComponent={
            <View>
              <View style={styles.entete}>
                <Camera size={16} color="#10b981" />
                <Text style={styles.enteteTxt}>
                  {trUI('Chaque photo est une rencontre qui a vraiment eu lieu.')}
                </Text>
              </View>

              {/* Les événements récents : y étiez-vous ? Le compteur qui en
                  sort dit à la personnalité combien de personnes se sont
                  déplacées pour elle — un chiffre qu'aucune billetterie ne lui
                  donne, parce qu'il compte aussi ceux qui n'ont rien acheté. */}
              {passes.length > 0 && (
                <View style={styles.blocPasses}>
                  <Text style={styles.blocTitre}>{trUI('Tu y étais ?')}</Text>
                  {passes.map((e) => (
                    <View key={e.id} style={styles.lignePasse}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.passeTitre} numberOfLines={1}>{e.titre}</Text>
                        <Text style={styles.passeMeta}>
                          {e.nb_presents}{' '}
                          {e.nb_presents > 1 ? trUI('fans y étaient') : trUI('fan y était')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.btnPresent, e.moi_present && styles.btnPresentActif]}
                        onPress={() => basculerPresence(e)}
                        activeOpacity={0.85}
                      >
                        {e.moi_present && <BadgeCheck size={12} color="#052e1f" />}
                        <Text
                          style={[styles.btnPresentTxt, e.moi_present && styles.btnPresentTxtActif]}
                        >
                          {trUI('J’y étais')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.vide}>{trUI('Personne n’a encore de souvenir à montrer ici.')}</Text>
          }
          renderItem={({ item }) => {
            const video = estUneVideo(item.photo_url);
            return (
              <TouchableOpacity
                style={[styles.vignette, { width: taille, height: taille * 1.25 }]}
                activeOpacity={0.9}
                onPress={() => setPleinEcran({
                  uri: item.photo_url, estVideo: video, titre: item.message || item.fan_nom,
                })}
              >
                <Image
                  source={{
                    uri: video
                      ? item.photo_url.split('?')[0].replace(/\.[^./]+$/, '-poster.jpg')
                      : item.photo_url,
                  }}
                  style={StyleSheet.absoluteFill as any}
                  resizeMode="cover"
                />
                {video && (
                  <View style={styles.lecture}>
                    <Play size={20} color="#052e1f" fill="#052e1f" />
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.85)']}
                  style={styles.voile}
                />
                <View style={styles.pied}>
                  <Text style={styles.fanNom} numberOfLines={1}>{item.fan_nom}</Text>
                  {/* Le badge n'est PAS décoratif : il sépare une dédicace
                      réellement délivrée par l'app d'une photo qu'un fan a
                      publiée. Les confondre viderait la preuve de son sens. */}
                  {item.verifiee && (
                    <View style={styles.verifie}>
                      <BadgeCheck size={11} color="#10b981" />
                      <Text style={styles.verifieTxt}>{trUI('Rencontre vérifiée')}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <VisionneuseMedia media={pleinEcran} onClose={() => setPleinEcran(null)} />
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
    flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12,
    padding: 12, borderRadius: 13,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.28)',
  },
  enteteTxt: { color: '#6ee7b7', fontSize: 12.5, lineHeight: 18, flex: 1 },

  blocPasses: { marginBottom: 14 },
  blocTitre: {
    color: '#9ca3af', fontSize: 12.5, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  lignePasse: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 11, marginBottom: 8, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  passeTitre: { color: '#fff', fontSize: 14, fontWeight: '700' },
  passeMeta: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  btnPresent: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.45)',
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  btnPresentActif: { backgroundColor: '#10b981', borderColor: '#10b981' },
  btnPresentTxt: { color: '#10b981', fontSize: 12.5, fontWeight: '800' },
  btnPresentTxtActif: { color: '#052e1f' },

  vignette: {
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  lecture: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  voile: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  pied: { position: 'absolute', left: 9, right: 9, bottom: 9, gap: 4 },
  fanNom: { color: '#fff', fontSize: 13, fontWeight: '800' },
  verifie: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.45)',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  verifieTxt: { color: '#10b981', fontSize: 9.5, fontWeight: '800' },

  vide: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
