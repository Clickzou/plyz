import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator,
  TextInput, Modal, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, MessageCircle, Tag, Image as ImageIcon, Plus, Pin, Lock,
  BadgeCheck, X, Star,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/utils/supabase';
import { showAlert } from '@/utils/alertHelper';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useAutoTranslate } from '@/utils/translation';
import { detecterCoordonnees } from '@/utils/filtreCoordonnees';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

type TypeSujet = 'discussion' | 'bon_plan' | 'photo';

interface Sujet {
  id: string;
  celebrity_id: string;
  auteur_id: string;
  type: TypeSujet;
  titre: string;
  contenu: string | null;
  media_url: string | null;
  epingle: boolean;
  ferme: boolean;
  nb_messages: number;
  dernier_le: string;
  auteur_nom: string;
  auteur_avatar: string | null;
  par_la_star: boolean;
}

const ONGLETS: { cle: TypeSujet | 'tout'; titre: string; Icone: any }[] = [
  { cle: 'tout', titre: 'Tout', Icone: Star },
  { cle: 'discussion', titre: 'Discussions', Icone: MessageCircle },
  { cle: 'bon_plan', titre: 'Bons plans', Icone: Tag },
  { cle: 'photo', titre: 'Photos', Icone: ImageIcon },
];

/**
 * L'espace d'une personnalité : tout ce que ses fans s'y disent.
 *
 * Un espace PAR personnalité, jamais un mur global — une communauté se fédère
 * autour de quelqu'un, et un espace global deviendrait un dépotoir impossible
 * à modérer. L'entrée se fait en suivant la personnalité, ce qui donne au
 * passage un signal utile à celle-ci.
 */
export default function FanGroupeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const params = useLocalSearchParams<{ celebrityId?: string; nom?: string }>();
  const celebrityId = String(params.celebrityId || '');

  const [sujets, setSujets] = useState<Sujet[]>([]);
  const [verifies, setVerifies] = useState<Set<string>>(new Set());
  const [filtre, setFiltre] = useState<TypeSujet | 'tout'>('tout');
  const [chargement, setChargement] = useState(true);
  const [refus, setRefus] = useState(false);

  const [creation, setCreation] = useState(false);
  const [type, setType] = useState<TypeSujet>('discussion');
  const [titre, setTitre] = useState('');
  const [contenu, setContenu] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const trUI = useAutoTranslate([
    'Tout', 'Discussions', 'Bons plans', 'Photos',
    'Ouvrir un sujet',
    'Rien ici pour l’instant. Ouvre le premier sujet.',
    'Suis cette personnalité pour entrer dans son espace.',
    'Titre',
    'De quoi veux-tu parler ?',
    'Ton message',
    'Publier',
    'Annuler',
    'Sujet non publié',
    'Les liens ne sont pas autorisés dans la Fan zone : c’est par là que passent les fausses pages et les arnaques aux fans.',
    'Les numéros de téléphone ne sont pas autorisés dans la Fan zone, ni le tien ni celui de quelqu’un d’autre.',
    'Impossible de publier ce sujet. Réessaie.',
    'réponse',
    'réponses',
    'Fermé',
    'A rencontré la star',
    'Espace fans',
    'Connecte-toi pour participer',
    'Ajouter une photo',
    'Photo refusée',
    'Cette image ne peut pas être publiée sur Plyz.',
    'L’image n’a pas pu être envoyée. Réessaie.',
  ]);

  const charger = useCallback(async () => {
    if (!celebrityId) return;
    setChargement(true);
    const { data, error } = await supabase
      .from('fanzone_sujets_public')
      .select('*')
      .eq('celebrity_id', celebrityId)
      .order('epingle', { ascending: false })
      .order('dernier_le', { ascending: false })
      .limit(100);

    // Zéro ligne sans erreur = les règles de lecture ont fermé la porte : on ne
    // suit pas cette personnalité. Le dire, plutôt que d'afficher un espace
    // vide qui laisse croire à une panne.
    setSujets((data || []) as Sujet[]);
    setRefus(!error && (data || []).length === 0);

    const { data: v } = await supabase.rpc('fz_fans_verifies', { p_celebrity: celebrityId });
    setVerifies(new Set((v || []).map((r: any) => r.fan_id)));
    setChargement(false);
  }, [celebrityId]);

  useEffect(() => { charger(); }, [charger]);

  /**
   * Choisir une photo et l'envoyer au serveur.
   *
   * Elle passe par `/api/upload-post-image`, qui la soumet au même juge que
   * les publications des personnalités : une image refusée là ne peut pas
   * arriver ici. Le contrôle ne doit pas dépendre de l'écran d'où vient la
   * photo — sinon il suffit de changer de porte.
   */
  const choisirPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, quality: 0.8,
      });
      if (r.canceled || !r.assets?.[0]?.uri) return;

      setEnvoiPhoto(true);
      const donnees = new FormData();
      donnees.append('image', { uri: r.assets[0].uri, type: 'image/jpeg', name: 'photo.jpg' } as any);
      const rep = await fetch(`${API_BASE}/api/upload-post-image`, {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: donnees,
      });
      if (rep.status === 403) {
        showAlert(trUI('Photo refusée'), trUI('Cette image ne peut pas être publiée sur Plyz.'));
        return;
      }
      if (!rep.ok) throw new Error('upload');
      const d = await rep.json();
      if (d?.url) setPhoto(d.url);
    } catch {
      showAlert(trUI('Photo refusée'), trUI('L’image n’a pas pu être envoyée. Réessaie.'));
    } finally {
      setEnvoiPhoto(false);
    }
  };

  const publier = async () => {
    const t = titre.trim();
    const c = contenu.trim();
    if (t.length < 3 || envoi) return;

    // Même règle que les commentaires, dite AVANT l'envoi : un sujet qui
    // disparaît sans un mot passe pour une panne.
    const trouve = detecterCoordonnees(`${t} ${c}`);
    if (trouve) {
      showAlert(
        trUI('Sujet non publié'),
        trouve === 'lien'
          ? trUI('Les liens ne sont pas autorisés dans la Fan zone : c’est par là que passent les fausses pages et les arnaques aux fans.')
          : trUI('Les numéros de téléphone ne sont pas autorisés dans la Fan zone, ni le tien ni celui de quelqu’un d’autre.'),
      );
      return;
    }

    setEnvoi(true);
    try {
      const { error } = await supabase.from('fanzone_sujets').insert({
        celebrity_id: celebrityId,
        auteur_id: user?.id,
        type,
        titre: t,
        contenu: c || null,
        media_url: photo,
      });
      if (error) throw error;
      setCreation(false);
      setTitre('');
      setContenu('');
      setPhoto(null);
      await charger();
    } catch {
      showAlert(trUI('Sujet non publié'), trUI('Impossible de publier ce sujet. Réessaie.'));
    } finally {
      setEnvoi(false);
    }
  };

  const visibles = filtre === 'tout' ? sujets : sujets.filter((s) => s.type === filtre);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.retour} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titre} numberOfLines={1}>
          {params.nom || trUI('Espace fans')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filtres}>
        {ONGLETS.map((o) => (
          <TouchableOpacity
            key={o.cle}
            style={[styles.filtre, filtre === o.cle && styles.filtreActif]}
            onPress={() => setFiltre(o.cle)}
            activeOpacity={0.85}
          >
            <o.Icone size={13} color={filtre === o.cle ? '#052e1f' : '#9ca3af'} />
            <Text style={[styles.filtreTxt, filtre === o.cle && styles.filtreTxtActif]}>
              {trUI(o.titre)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {chargement ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          onRefresh={charger}
          refreshing={false}
          ListEmptyComponent={
            <Text style={styles.vide}>
              {refus
                ? trUI('Suis cette personnalité pour entrer dans son espace.')
                : trUI('Rien ici pour l’instant. Ouvre le premier sujet.')}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.sujet}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: '/fan-sujet',
                params: { id: item.id, titre: item.titre, celebrityId },
              } as any)}
            >
              <View style={styles.sujetHaut}>
                {item.auteur_avatar ? (
                  <Image source={{ uri: item.auteur_avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarVide]}>
                    <Text style={styles.avatarTxt}>{(item.auteur_nom || '?')[0].toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.auteurLigne}>
                    <Text style={styles.auteur} numberOfLines={1}>{item.auteur_nom}</Text>
                    {item.par_la_star && (
                      <View style={styles.badgeStar}>
                        <Star size={10} color="#052e1f" fill="#052e1f" />
                        <Text style={styles.badgeStarTxt}>★</Text>
                      </View>
                    )}
                    {!item.par_la_star && verifies.has(item.auteur_id) && (
                      // Le seul badge que Plyz peut délivrer et qu'aucun réseau
                      // social ne peut copier : la prestation est passée par
                      // l'app, elle a été payée, elle a été menée à son terme.
                      <View style={styles.badgeVerif}>
                        <BadgeCheck size={11} color="#10b981" />
                        <Text style={styles.badgeVerifTxt}>{trUI('A rencontré la star')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sujetTitre} numberOfLines={2}>{item.titre}</Text>
                </View>
                {item.epingle && <Pin size={15} color="#f59e0b" />}
                {item.ferme && <Lock size={15} color="#6b7280" />}
              </View>
              {!!item.contenu && (
                <Text style={styles.sujetExtrait} numberOfLines={2}>{item.contenu}</Text>
              )}
              {!!item.media_url && (
                <Image source={{ uri: item.media_url }} style={styles.sujetPhoto} resizeMode="cover" />
              )}
              <Text style={styles.sujetPied}>
                {item.nb_messages} {item.nb_messages > 1 ? trUI('réponses') : trUI('réponse')}
                {item.ferme ? ` · ${trUI('Fermé')}` : ''}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {!refus && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
          onPress={() => requireAuth(() => setCreation(true), {
            reason: trUI('Connecte-toi pour participer'),
            requireBillingIdentity: false,
          })}
          activeOpacity={0.85}
        >
          <Plus size={20} color="#052e1f" />
          <Text style={styles.fabTxt}>{trUI('Ouvrir un sujet')}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={creation} transparent animationType="slide" onRequestClose={() => setCreation(false)}>
        <KeyboardAvoidingView style={styles.modalFond} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.feuille, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.feuilleEntete}>
              <Text style={styles.feuilleTitre}>{trUI('Ouvrir un sujet')}</Text>
              <TouchableOpacity onPress={() => setCreation(false)} hitSlop={10}>
                <X size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.typesRow}>
                {ONGLETS.filter((o) => o.cle !== 'tout').map((o) => (
                  <TouchableOpacity
                    key={o.cle}
                    style={[styles.typeChip, type === o.cle && styles.typeChipActif]}
                    onPress={() => setType(o.cle as TypeSujet)}
                    activeOpacity={0.85}
                  >
                    <o.Icone size={13} color={type === o.cle ? '#052e1f' : '#9ca3af'} />
                    <Text style={[styles.filtreTxt, type === o.cle && styles.filtreTxtActif]}>
                      {trUI(o.titre)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.champ}
                placeholder={trUI('De quoi veux-tu parler ?')}
                placeholderTextColor="#6b7280"
                value={titre}
                onChangeText={setTitre}
                maxLength={120}
              />
              <TextInput
                style={[styles.champ, styles.champLong]}
                placeholder={trUI('Ton message')}
                placeholderTextColor="#6b7280"
                value={contenu}
                onChangeText={setContenu}
                multiline
                maxLength={2000}
              />

              {photo ? (
                <View style={styles.apercuPhoto}>
                  <Image source={{ uri: photo }} style={styles.apercuImage} />
                  <TouchableOpacity style={styles.retirerPhoto} onPress={() => setPhoto(null)} hitSlop={8}>
                    <X size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.btnPhoto}
                  onPress={choisirPhoto}
                  disabled={envoiPhoto}
                  activeOpacity={0.85}
                >
                  {envoiPhoto
                    ? <ActivityIndicator size="small" color="#10b981" />
                    : <ImageIcon size={16} color="#10b981" />}
                  <Text style={styles.btnPhotoTxt}>{trUI('Ajouter une photo')}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.btnPublier, (titre.trim().length < 3 || envoi) && styles.btnDesactive]}
                onPress={publier}
                disabled={titre.trim().length < 3 || envoi}
                activeOpacity={0.85}
              >
                {envoi
                  ? <ActivityIndicator size="small" color="#052e1f" />
                  : <Text style={styles.btnPublierTxt}>{trUI('Publier')}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  filtres: { flexDirection: 'row', gap: 7, paddingHorizontal: 16, marginBottom: 4 },
  filtre: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 11, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  filtreActif: { backgroundColor: '#10b981' },
  filtreTxt: { color: '#9ca3af', fontSize: 12.5, fontWeight: '700' },
  filtreTxtActif: { color: '#052e1f' },

  sujet: {
    padding: 13, marginBottom: 10, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  sujetHaut: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarVide: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  auteurLigne: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  auteur: { color: '#9ca3af', fontSize: 12.5, fontWeight: '600' },
  badgeStar: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#f59e0b', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  badgeStarTxt: { color: '#052e1f', fontSize: 10, fontWeight: '900' },
  badgeVerif: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(16,185,129,0.14)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  badgeVerifTxt: { color: '#10b981', fontSize: 10, fontWeight: '800' },
  sujetTitre: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 3 },
  sujetExtrait: { color: '#cbd5e1', fontSize: 13.5, lineHeight: 19, marginTop: 8 },
  sujetPhoto: { width: '100%', height: 170, borderRadius: 10, marginTop: 10 },
  sujetPied: { color: '#6b7280', fontSize: 12, marginTop: 8 },

  vide: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40, lineHeight: 20 },

  fab: {
    position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#10b981', paddingHorizontal: 16, paddingVertical: 13, borderRadius: 26,
  },
  fabTxt: { color: '#052e1f', fontSize: 14.5, fontWeight: '800' },

  modalFond: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  feuille: {
    backgroundColor: '#111827', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 18, paddingTop: 16, maxHeight: '85%',
  },
  feuilleEntete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  feuilleTitre: { color: '#fff', fontSize: 17, fontWeight: '800' },
  typesRow: { flexDirection: 'row', gap: 7, marginBottom: 14 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  typeChipActif: { backgroundColor: '#10b981' },
  champ: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12, color: '#fff', fontSize: 15,
    marginBottom: 12,
  },
  champLong: { minHeight: 110, textAlignVertical: 'top' },
  btnPhoto: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  btnPhotoTxt: { color: '#10b981', fontSize: 14, fontWeight: '700' },
  apercuPhoto: { marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  apercuImage: { width: '100%', height: 170 },
  retirerPhoto: {
    position: 'absolute', top: 8, right: 8,
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  btnPublier: {
    backgroundColor: '#10b981', borderRadius: 13, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  btnDesactive: { opacity: 0.45 },
  btnPublierTxt: { color: '#052e1f', fontSize: 15.5, fontWeight: '800' },
});
