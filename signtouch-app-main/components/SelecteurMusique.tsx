import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useAudioPlayer } from 'expo-audio';
import { X, Search, Play, Pause, Music, Check, Volume2, Mic } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// Chargement paresseux : expo-video est un module natif. L'aperçu est un
// confort, il ne doit jamais empêcher de choisir une musique.
let VideoView: any = null;
let useVideoPlayer: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-video');
  VideoView = mod.VideoView;
  useVideoPlayer = mod.useVideoPlayer;
} catch {
  VideoView = null;
}
const apercuDispo = !!VideoView && !!useVideoPlayer && Platform.OS !== 'web';

export interface Musique {
  id: string;
  titre: string;
  artiste: string;
  licence: 'cc0' | 'domaine_public' | 'cc_by';
  attribution: string | null;
  url_fichier: string;
  duree_sec: number;
  ambiance: string | null;
}

export interface ChoixMusique {
  musique: Musique | null;
  volumeVideo: number;
  volumeMusique: number;
}

interface Props {
  visible: boolean;
  /** Vidéo en cours de publication, pour l'aperçu. */
  videoUri: string | null;
  choixInitial?: ChoixMusique;
  onClose: () => void;
  onValider: (choix: ChoixMusique) => void;
}

function duree(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Aperçu : la vidéo et la musique jouées ensemble, aux volumes choisis. */
function Apercu({
  videoUri, musique, volumeVideo, volumeMusique,
}: { videoUri: string; musique: Musique | null; volumeVideo: number; volumeMusique: number }) {
  const player = useVideoPlayer(videoUri, (p: any) => {
    p.loop = true;
    p.muted = false;
  });

  // Le volume suit le curseur en direct : on règle à l'oreille, pas en
  // relançant la lecture après chaque essai.
  useEffect(() => {
    if (!player) return;
    try { player.volume = volumeVideo; } catch {}
  }, [volumeVideo, player]);

  useEffect(() => {
    if (!player) return;
    try { player.play(); } catch {}
    return () => { try { player.pause(); } catch {} };
  }, [player]);

  return (
    <View style={styles.apercuCadre}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      {!musique && (
        <View style={styles.apercuVoile}>
          <Text style={styles.apercuVoileTxt}>Choisis un morceau ci-dessous</Text>
        </View>
      )}
    </View>
  );
}

export default function SelecteurMusique({
  visible, videoUri, choixInitial, onClose, onValider,
}: Props) {
  const insets = useSafeAreaInsets();
  const hauteurClavier = useKeyboardHeight();

  const [catalogue, setCatalogue] = useState<Musique[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [ambiance, setAmbiance] = useState<string | null>(null);
  const [choisie, setChoisie] = useState<Musique | null>(choixInitial?.musique ?? null);
  const [volumeVideo, setVolumeVideo] = useState(choixInitial?.volumeVideo ?? 1);
  const [volumeMusique, setVolumeMusique] = useState(choixInitial?.volumeMusique ?? 0.3);
  // Morceau en cours de pré-écoute dans la liste (≠ morceau retenu).
  const [enEcoute, setEnEcoute] = useState<string | null>(null);

  const lecteur = useAudioPlayer(null);
  const lecteurRef = useRef(lecteur);
  lecteurRef.current = lecteur;

  useEffect(() => {
    if (!visible) return;
    setChargement(true);
    setErreur(false);
    fetch(`${API_BASE}/api/musiques`)
      .then(r => r.json())
      .then(d => setCatalogue(Array.isArray(d?.musiques) ? d.musiques : []))
      .catch(() => setErreur(true))
      .finally(() => setChargement(false));
  }, [visible]);

  // Une pré-écoute qui continue après la fermeture, c'est un son fantôme dont
  // on ne trouve plus la source.
  useEffect(() => {
    if (visible) return;
    try { lecteurRef.current?.pause(); } catch {}
    setEnEcoute(null);
  }, [visible]);

  // Dans l'aperçu, la musique se joue en même temps que la vidéo, au volume
  // réglé : c'est le seul moyen d'entendre le mélange avant de publier.
  useEffect(() => {
    if (!choisie || !lecteurRef.current) return;
    try { lecteurRef.current.volume = volumeMusique; } catch {}
  }, [volumeMusique, choisie]);

  const ambiances = useMemo(() => {
    const set = new Set<string>();
    catalogue.forEach(m => { if (m.ambiance) set.add(m.ambiance); });
    return Array.from(set).sort();
  }, [catalogue]);

  const listeFiltree = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return catalogue.filter(m => {
      if (ambiance && m.ambiance !== ambiance) return false;
      if (!q) return true;
      return m.titre.toLowerCase().includes(q) || m.artiste.toLowerCase().includes(q);
    });
  }, [catalogue, recherche, ambiance]);

  const basculerEcoute = (m: Musique) => {
    const l = lecteurRef.current;
    if (!l) return;
    try {
      if (enEcoute === m.id) {
        l.pause();
        setEnEcoute(null);
        return;
      }
      l.replace({ uri: m.url_fichier });
      l.volume = volumeMusique;
      l.play();
      setEnEcoute(m.id);
    } catch {
      setEnEcoute(null);
    }
  };

  const valider = () => {
    try { lecteurRef.current?.pause(); } catch {}
    onValider({ musique: choisie, volumeVideo, volumeMusique });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.feuille,
            {
              marginBottom: hauteurClavier,
              paddingBottom: hauteurClavier > 0 ? 10 : insets.bottom + 10,
            },
          ]}
        >
          <View style={styles.entete}>
            <Text style={styles.titre}>Ajouter une musique</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={22} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Aperçu : on voit et on entend AVANT de publier. Sans lui, on
              découvrirait le mélange une fois la vidéo en ligne. */}
          {apercuDispo && videoUri ? (
            <Apercu
              videoUri={videoUri}
              musique={choisie}
              volumeVideo={volumeVideo}
              volumeMusique={volumeMusique}
            />
          ) : null}

          {/* Les deux volumes. Celui de la vidéo d'abord : sur Plyz, ce qu'on
              entend en premier c'est la voix de la personne, la musique vient
              en dessous. */}
          {choisie && (
            <View style={styles.volumes}>
              <View style={styles.ligneVolume}>
                <Mic size={16} color="#9ca3af" />
                <Text style={styles.labelVolume}>Ta voix</Text>
                <Slider
                  style={styles.curseur}
                  minimumValue={0}
                  maximumValue={1.5}
                  value={volumeVideo}
                  onValueChange={setVolumeVideo}
                  minimumTrackTintColor="#10b981"
                  maximumTrackTintColor="rgba(255,255,255,0.18)"
                  thumbTintColor="#10b981"
                />
                <Text style={styles.valeurVolume}>{Math.round(volumeVideo * 100)}%</Text>
              </View>
              <View style={styles.ligneVolume}>
                <Volume2 size={16} color="#9ca3af" />
                <Text style={styles.labelVolume}>Musique</Text>
                <Slider
                  style={styles.curseur}
                  minimumValue={0}
                  maximumValue={1.5}
                  value={volumeMusique}
                  onValueChange={setVolumeMusique}
                  minimumTrackTintColor="#8b5cf6"
                  maximumTrackTintColor="rgba(255,255,255,0.18)"
                  thumbTintColor="#8b5cf6"
                />
                <Text style={styles.valeurVolume}>{Math.round(volumeMusique * 100)}%</Text>
              </View>
            </View>
          )}

          <View style={styles.rechercheBoite}>
            <Search size={17} color="#6b7280" />
            <TextInput
              style={styles.rechercheChamp}
              value={recherche}
              onChangeText={setRecherche}
              placeholder="Rechercher un titre ou un artiste…"
              placeholderTextColor="#6b7280"
            />
            {!!recherche && (
              <TouchableOpacity onPress={() => setRecherche('')} hitSlop={8}>
                <X size={16} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>

          {ambiances.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filtres}
              contentContainerStyle={{ gap: 8, paddingRight: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                style={[styles.puce, !ambiance && styles.puceActive]}
                onPress={() => setAmbiance(null)}
              >
                <Text style={[styles.puceTxt, !ambiance && styles.puceTxtActive]}>Toutes</Text>
              </TouchableOpacity>
              {ambiances.map(a => (
                <TouchableOpacity
                  key={a}
                  style={[styles.puce, ambiance === a && styles.puceActive]}
                  onPress={() => setAmbiance(ambiance === a ? null : a)}
                >
                  <Text style={[styles.puceTxt, ambiance === a && styles.puceTxtActive]}>{a}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {chargement ? (
            <View style={styles.centre}><ActivityIndicator color="#10b981" /></View>
          ) : erreur ? (
            <View style={styles.centre}>
              <Text style={styles.vide}>Impossible de charger les musiques.</Text>
            </View>
          ) : listeFiltree.length === 0 ? (
            <View style={styles.centre}>
              <Music size={28} color="#374151" />
              <Text style={styles.vide}>
                {catalogue.length === 0
                  ? 'Aucune musique disponible pour le moment.'
                  : 'Aucun morceau ne correspond.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={listeFiltree}
              keyExtractor={m => m.id}
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const retenue = choisie?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.morceau, retenue && styles.morceauRetenu]}
                    onPress={() => setChoisie(retenue ? null : item)}
                    activeOpacity={0.8}
                  >
                    <TouchableOpacity
                      style={styles.boutonEcoute}
                      onPress={() => basculerEcoute(item)}
                      hitSlop={8}
                    >
                      {enEcoute === item.id
                        ? <Pause size={16} color="#fff" fill="#fff" />
                        : <Play size={16} color="#fff" fill="#fff" />}
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.morceauTitre} numberOfLines={1}>{item.titre}</Text>
                      <Text style={styles.morceauArtiste} numberOfLines={1}>
                        {item.artiste}
                        {item.duree_sec > 0 ? ` · ${duree(item.duree_sec)}` : ''}
                      </Text>
                    </View>
                    {retenue && <Check size={18} color="#10b981" />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            />
          )}

          <View style={styles.pied}>
            <TouchableOpacity
              style={styles.sansMusique}
              onPress={() => {
                setChoisie(null);
                try { lecteurRef.current?.pause(); } catch {}
                setEnEcoute(null);
                onValider({ musique: null, volumeVideo: 1, volumeMusique: 0.3 });
              }}
            >
              <Text style={styles.sansMusiqueTxt}>Sans musique</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.valider, !choisie && styles.validerInactif]}
              onPress={valider}
              disabled={!choisie}
            >
              <Check size={18} color={choisie ? '#052e1f' : '#6b7280'} />
              <Text style={[styles.validerTxt, !choisie && { color: '#6b7280' }]}>Utiliser</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 14,
    height: '88%',
  },
  entete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  titre: { color: '#fff', fontSize: 17, fontWeight: '800' },

  apercuCadre: {
    height: 170, borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 12,
  },
  apercuVoile: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12,
  },
  apercuVoileTxt: {
    color: '#e5e7eb', fontSize: 12, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },

  volumes: { gap: 6, marginBottom: 12 },
  ligneVolume: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  labelVolume: { color: '#9ca3af', fontSize: 12, width: 56 },
  curseur: { flex: 1, height: 32 },
  valeurVolume: { color: '#d1d5db', fontSize: 12, width: 42, textAlign: 'right' },

  rechercheBoite: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
  },
  rechercheChamp: { flex: 1, color: '#fff', fontSize: 14, padding: 0 },

  filtres: { flexGrow: 0, marginTop: 10, marginBottom: 4 },
  puce: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  puceActive: { backgroundColor: '#10b981' },
  puceTxt: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  puceTxtActive: { color: '#052e1f' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  vide: { color: '#6b7280', fontSize: 14, textAlign: 'center' },

  morceau: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12,
    borderWidth: 1, borderColor: 'transparent',
  },
  morceauRetenu: {
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderColor: 'rgba(16,185,129,0.45)',
  },
  boutonEcoute: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  morceauTitre: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
  morceauArtiste: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },

  pied: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 },
  sansMusique: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  sansMusiqueTxt: { color: '#9ca3af', fontSize: 14.5, fontWeight: '600' },
  valider: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 12, backgroundColor: '#10b981',
  },
  validerInactif: { backgroundColor: 'rgba(255,255,255,0.08)' },
  validerTxt: { color: '#052e1f', fontSize: 14.5, fontWeight: '800' },
});
