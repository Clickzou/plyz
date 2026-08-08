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
  BadgeCheck, X, Star, HelpCircle, Trophy, Camera, Play, Sparkles,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/utils/supabase';
import { showAlert } from '@/utils/alertHelper';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useAutoTranslate } from '@/utils/translation';
import { detecterCoordonnees } from '@/utils/filtreCoordonnees';
import { texteAccepte } from '@/utils/modererTexte';
import { estUneVideo } from '@/utils/media';
import VisionneuseMedia, { type MediaVisionnable } from '@/components/VisionneuseMedia';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

type TypeSujet = 'discussion' | 'question' | 'bon_plan' | 'photo';

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
  nb_soutiens: number;
  soutenu: boolean;
  dernier_le: string;
  auteur_nom: string;
  auteur_avatar: string | null;
  par_la_star: boolean;
}

const ONGLETS: { cle: TypeSujet | 'tout'; titre: string; Icone: any }[] = [
  { cle: 'tout', titre: 'Tout', Icone: Star },
  // Les questions arrivent en deuxième, juste après « Tout » : ce sont elles
  // qu'on met dans le dossier envoyé à une personnalité, et une rubrique
  // reléguée en fin de rangée ne se remplit jamais.
  { cle: 'question', titre: 'Questions', Icone: HelpCircle },
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
  const [premiereHeure, setPremiereHeure] = useState<Set<string>>(new Set());
  const [filtre, setFiltre] = useState<TypeSujet | 'tout'>('tout');
  const [chargement, setChargement] = useState(true);
  const [refus, setRefus] = useState(false);
  const [pleinEcran, setPleinEcran] = useState<MediaVisionnable | null>(null);

  const [creation, setCreation] = useState(false);
  const [type, setType] = useState<TypeSujet>('discussion');
  const [titre, setTitre] = useState('');
  const [contenu, setContenu] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const trUI = useAutoTranslate([
    'Tout', 'Discussions', 'Bons plans', 'Photos', 'Questions',
    'Ouvrir un sujet',
    // Questions, vidéo, badges et raccourcis — lot 4.
    'Poser une question',
    'Ta question',
    'Que veux-tu lui demander ?',
    'Moi aussi',
    'Ajouter une photo ou une vidéo',
    'La vidéo n’a pas pu être envoyée. Réessaie.',
    'Vidéo refusée',
    'Cette vidéo ne peut pas être publiée sur Plyz.',
    'Vidéo trop lourde : 40 Mo maximum. Filme plus court.',
    'Première heure',
    'Ses plus grands fans',
    'Le mur des rencontres',
    'Les questions les plus soutenues arrivent en haut : c’est ce qu’on lui transmettra.',
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
    'Ce sujet ne respecte pas les règles de la Fan zone : pas d’insultes, de menaces ni de propos haineux. La critique, elle, est la bienvenue.',
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

    // Ceux qui l'ont réclamée avant qu'elle n'arrive. Chargé en une fois pour
    // toute la liste : une requête par ligne aurait fait cent allers-retours
    // sur un espace actif.
    const { data: ph } = await supabase.rpc('fans_premiere_heure', { p_celebrity: celebrityId });
    setPremiereHeure(new Set((ph || []).map((r: any) => r.fan_id)));

    setChargement(false);
  }, [celebrityId]);

  /**
   * « Moi aussi je veux savoir. »
   *
   * Sans ce geste, quarante fans posent quarante fois la même question et la
   * personnalité voit un mur illisible. Avec lui, une question monte — et
   * c'est celle-là qu'on lui transmet.
   */
  const soutenir = useCallback(async (sujet: Sujet) => {
    if (!user) return;
    const soutenu = !sujet.soutenu;
    setSujets((actuel) => actuel.map((s) => (s.id === sujet.id
      ? { ...s, soutenu, nb_soutiens: Math.max(0, (s.nb_soutiens || 0) + (soutenu ? 1 : -1)) }
      : s)));
    try {
      if (soutenu) {
        await supabase.from('fanzone_soutiens').insert({ sujet_id: sujet.id, fan_id: user.id });
      } else {
        await supabase.from('fanzone_soutiens').delete()
          .eq('sujet_id', sujet.id).eq('fan_id', user.id);
      }
    } catch {
      setSujets((actuel) => actuel.map((s) => (s.id === sujet.id
        ? { ...s, soutenu: sujet.soutenu, nb_soutiens: sujet.nb_soutiens }
        : s)));
    }
  }, [user]);

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
      // La vidéo est acceptée ici comme ailleurs : une rencontre, une ambiance
      // de concert, un souvenir de tournage ne tiennent pas dans une photo.
      // Le recadrage n'est proposé que pour les images — l'imposer à une vidéo
      // ouvre un éditeur qui n'a rien à y faire.
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'], quality: 0.8, videoMaxDuration: 60,
      });
      if (r.canceled || !r.assets?.[0]?.uri) return;

      const choisi = r.assets[0];
      const estVideo = choisi.type === 'video' || estUneVideo(choisi.uri);

      setEnvoiPhoto(true);
      const donnees = new FormData();
      if (estVideo) {
        const ext = (choisi.uri.split('?')[0].split('.').pop() || 'mp4').toLowerCase();
        donnees.append('image', {
          uri: choisi.uri,
          type: `video/${ext === 'mov' ? 'quicktime' : ext}`,
          name: `video.${ext}`,
        } as any);
        // Le quota mensuel de vidéos vise les personnalités qui publient sans
        // rien proposer. Un fan n'a pas d'événement à créer : le lui appliquer
        // n'aurait aucun sens.
        donnees.append('contexte', 'fanzone');
      } else {
        donnees.append('image', { uri: choisi.uri, type: 'image/jpeg', name: 'photo.jpg' } as any);
      }

      const rep = await fetch(`${API_BASE}/api/upload-post-image`, {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: donnees,
      });
      if (rep.status === 403) {
        showAlert(
          estVideo ? trUI('Vidéo refusée') : trUI('Photo refusée'),
          estVideo
            ? trUI('Cette vidéo ne peut pas être publiée sur Plyz.')
            : trUI('Cette image ne peut pas être publiée sur Plyz.'),
        );
        return;
      }
      if (rep.status === 413) {
        showAlert(trUI('Vidéo refusée'), trUI('Vidéo trop lourde : 40 Mo maximum. Filme plus court.'));
        return;
      }
      if (!rep.ok) throw new Error('upload');
      const d = await rep.json();
      if (d?.url) {
        setPhoto(d.url);
        // Une vidéo sous « Discussion » ne se retrouverait jamais : le
        // classement suit ce qu'on envoie.
        if (estVideo && type === 'discussion') setType('photo');
      }
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
      // Insultes, racisme, menaces : contrôlés par le même juge que les bios.
      // La critique passe — un espace de fans où l'on ne pourrait dire que du
      // bien n'intéresserait personne.
      if (!(await texteAccepte(`${t}\n${c}`))) {
        showAlert(
          trUI('Sujet non publié'),
          trUI('Ce sujet ne respecte pas les règles de la Fan zone : pas d’insultes, de menaces ni de propos haineux. La critique, elle, est la bienvenue.'),
        );
        return;
      }

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

  const visibles = filtre === 'tout'
    ? sujets
    : filtre === 'question'
      // Les questions se lisent dans l'ordre où on les transmettra à la
      // personnalité : la plus soutenue en premier. Ailleurs, c'est la
      // fraîcheur qui prime.
      ? sujets.filter((s) => s.type === 'question')
        .sort((a, b) => (b.nb_soutiens || 0) - (a.nb_soutiens || 0))
      : sujets.filter((s) => s.type === filtre);

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

      {/* Les deux vitrines de l'espace : qui sont ses plus grands fans, et
          ceux qui l'ont vraiment rencontrée. Elles étaient en base depuis le
          début — les dédicaces réalisées, les prestations menées à terme — et
          n'apparaissaient nulle part. */}
      <View style={styles.raccourcis}>
        <TouchableOpacity
          style={styles.raccourci}
          activeOpacity={0.85}
          onPress={() => router.push({
            pathname: '/top-fans',
            params: { celebrityId, nom: params.nom || '' },
          } as any)}
        >
          <Trophy size={14} color="#f59e0b" />
          <Text style={styles.raccourciTxt} numberOfLines={1}>{trUI('Ses plus grands fans')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.raccourci}
          activeOpacity={0.85}
          onPress={() => router.push({
            pathname: '/mur-rencontres',
            params: { celebrityId, nom: params.nom || '' },
          } as any)}
        >
          <Camera size={14} color="#10b981" />
          <Text style={styles.raccourciTxt} numberOfLines={1}>{trUI('Le mur des rencontres')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtres}
      >
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
      </ScrollView>

      {filtre === 'question' && (
        <Text style={styles.aideQuestions}>
          {trUI('Les questions les plus soutenues arrivent en haut : c’est ce qu’on lui transmettra.')}
        </Text>
      )}

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
                    {!item.par_la_star && premiereHeure.has(item.auteur_id) && (
                      // Il l'a réclamée quand elle n'était pas là. Sans cette
                      // distinction, la réclamation ne vaudrait rien — et plus
                      // personne ne réclamerait.
                      <View style={styles.badgePremiere}>
                        <Sparkles size={10} color="#f59e0b" />
                        <Text style={styles.badgePremiereTxt}>{trUI('Première heure')}</Text>
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
                estUneVideo(item.media_url) ? (
                  // La vignette d'abord, la lecture au geste : une liste où
                  // dix vidéos démarrent seules vide une batterie en dix
                  // minutes et consomme les données de tout le monde.
                  <TouchableOpacity
                    style={styles.sujetPhoto}
                    activeOpacity={0.9}
                    onPress={() => setPleinEcran({
                      uri: item.media_url as string, estVideo: true, titre: item.titre,
                    })}
                  >
                    <Image
                      source={{ uri: (item.media_url as string).split('?')[0].replace(/\.[^./]+$/, '-poster.jpg') }}
                      style={StyleSheet.absoluteFill as any}
                      resizeMode="cover"
                    />
                    <View style={styles.lecture}>
                      <Play size={22} color="#052e1f" fill="#052e1f" />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setPleinEcran({ uri: item.media_url as string, titre: item.titre })}
                  >
                    <Image source={{ uri: item.media_url }} style={styles.sujetPhoto} resizeMode="cover" />
                  </TouchableOpacity>
                )
              )}
              <View style={styles.sujetBas}>
                <Text style={styles.sujetPied}>
                  {item.nb_messages} {item.nb_messages > 1 ? trUI('réponses') : trUI('réponse')}
                  {item.ferme ? ` · ${trUI('Fermé')}` : ''}
                </Text>

                {/* Le soutien n'a de sens que sur une question : c'est lui qui
                    la fait monter dans le dossier qu'on transmettra. */}
                {item.type === 'question' && (
                  <TouchableOpacity
                    style={[styles.soutien, item.soutenu && styles.soutienActif]}
                    onPress={() => soutenir(item)}
                    activeOpacity={0.85}
                    hitSlop={6}
                  >
                    <Plus size={12} color={item.soutenu ? '#052e1f' : '#f59e0b'} />
                    <Text style={[styles.soutienTxt, item.soutenu && styles.soutienTxtActif]}>
                      {trUI('Moi aussi')} {item.nb_soutiens > 0 ? item.nb_soutiens : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {!refus && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
          onPress={() => requireAuth(() => {
            // Le bouton ouvre ce que le fan regarde : depuis l'onglet
            // Questions, il propose une question, pas une discussion.
            if (filtre !== 'tout') setType(filtre);
            setCreation(true);
          }, {
            reason: trUI('Connecte-toi pour participer'),
            requireBillingIdentity: false,
          })}
          activeOpacity={0.85}
        >
          <Plus size={20} color="#052e1f" />
          <Text style={styles.fabTxt}>
            {filtre === 'question' ? trUI('Poser une question') : trUI('Ouvrir un sujet')}
          </Text>
        </TouchableOpacity>
      )}

      <Modal visible={creation} transparent animationType="slide" onRequestClose={() => setCreation(false)}>
        <KeyboardAvoidingView style={styles.modalFond} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.feuille, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.feuilleEntete}>
              <Text style={styles.feuilleTitre}>
                {type === 'question' ? trUI('Poser une question') : trUI('Ouvrir un sujet')}
              </Text>
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
                placeholder={type === 'question'
                  ? trUI('Que veux-tu lui demander ?')
                  : trUI('De quoi veux-tu parler ?')}
                placeholderTextColor="#6b7280"
                value={titre}
                onChangeText={setTitre}
                maxLength={120}
              />
              <TextInput
                style={[styles.champ, styles.champLong]}
                placeholder={type === 'question' ? trUI('Ta question') : trUI('Ton message')}
                placeholderTextColor="#6b7280"
                value={contenu}
                onChangeText={setContenu}
                multiline
                maxLength={2000}
              />

              {photo ? (
                <View style={styles.apercuPhoto}>
                  {estUneVideo(photo) ? (
                    <View style={[styles.apercuImage, styles.apercuVideo]}>
                      <Play size={26} color="#10b981" fill="#10b981" />
                    </View>
                  ) : (
                    <Image source={{ uri: photo }} style={styles.apercuImage} />
                  )}
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
                  <Text style={styles.btnPhotoTxt}>{trUI('Ajouter une photo ou une vidéo')}</Text>
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

      {/* Photo ou vidéo en grand. Une rencontre, c'est une image qu'on veut
          REGARDER — la laisser en vignette dans une carte, c'est la perdre. */}
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

  filtres: { flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingBottom: 4 },

  raccourcis: { flexDirection: 'row', gap: 9, paddingHorizontal: 16, marginBottom: 10 },
  raccourci: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 11, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  raccourciTxt: { color: '#e5e7eb', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  aideQuestions: {
    color: '#6b7280', fontSize: 11.5, lineHeight: 16,
    marginHorizontal: 16, marginTop: 2, marginBottom: 4,
  },
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
  badgePremiere: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  badgePremiereTxt: { color: '#f59e0b', fontSize: 10, fontWeight: '800' },

  sujetBas: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  lecture: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  soutien: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.12)', marginLeft: 'auto',
  },
  soutienActif: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  soutienTxt: { color: '#f59e0b', fontSize: 11.5, fontWeight: '800' },
  soutienTxtActif: { color: '#052e1f' },
  apercuVideo: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  sujetTitre: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 3 },
  sujetExtrait: { color: '#cbd5e1', fontSize: 13.5, lineHeight: 19, marginTop: 8 },
  sujetPhoto: { width: '100%', height: 170, borderRadius: 10, marginTop: 10 },
  // La marge est portée par `sujetBas`, qui l'aligne avec le bouton de soutien.
  sujetPied: { color: '#6b7280', fontSize: 12 },

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
