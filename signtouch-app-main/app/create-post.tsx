import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Image, Platform, ScrollView, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ImagePlus, X, Send, Camera, FileText, Calendar, Play, Video } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '@/utils/alertHelper';
import { authedFetch } from '@/utils/authedFetch';
import { useAutoTranslate } from '@/utils/translation';
import { estUneVideo } from '@/utils/media';
import RappelEvenement from '@/components/RappelEvenement';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';
const LOCAL_POSTS_KEY = '@plyz_local_posts';

async function compressImage(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
}

async function moderateImageOnServer(uri: string, token?: string): Promise<{ safe: boolean; error?: string }> {
  try {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('image', blob, 'photo.jpg');
    } else {
      formData.append('image', {
        uri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as any);
    }

    // Auth requise côté serveur : on envoie le Bearer (sans fixer Content-Type,
    // laissé à fetch pour la frontière multipart).
    const res = await fetch(`${API_BASE}/api/moderate-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (res.status === 403) {
      return { safe: false, error: 'content_rejected' };
    }
    if (!res.ok) {
      return { safe: true };
    }
    const data = await res.json();
    return { safe: data.safe !== false };
  } catch (err) {
    console.warn('[Moderation] Check failed, allowing:', err);
    return { safe: true };
  }
}

async function uploadImageToServer(uri: string, token?: string, estVideo = false): Promise<{ url: string | null; rejected?: boolean; quotaAtteint?: boolean }> {
  try {
    const formData = new FormData();
    // Une video garde son extension et son type : sans cela le serveur la
    // rangerait en .jpg, et le lecteur refuserait de l'ouvrir.
    const ext = estVideo ? (uri.split('?')[0].split('.').pop() || 'mp4').toLowerCase() : 'jpg';
    const nom = estVideo ? 'video.' + ext : 'photo.jpg';
    const type = estVideo ? 'video/' + (ext === 'mov' ? 'quicktime' : ext) : 'image/jpeg';

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('image', blob, nom);
    } else {
      formData.append('image', { uri, type, name: nom } as any);
    }

    const res = await fetch(`${API_BASE}/api/upload-post-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (res.status === 403) {
      return { url: null, rejected: true };
    }
    // Quota de videos atteint : ce n'est pas une panne, c'est une decision. Le
    // dire comme un echec laisserait la personnalite croire a un bug et
    // reessayer en boucle.
    if (res.status === 429) {
      return { url: null, quotaAtteint: true };
    }
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return { url: data.url || null };
  } catch (err) {
    console.warn('[Upload] Failed:', err);
    return { url: null };
  }
}

type PostKind = 'post' | 'event';

export default function CreatePostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, session } = useAuth();
  const params = useLocalSearchParams<{
    prefillTitle?: string;
    prefillBody?: string;
    prefillKind?: string;
    prefillDate?: string;
  }>();
  const [kind, setKind] = useState<PostKind>((params.prefillKind as PostKind) || 'post');
  const [title, setTitle] = useState(params.prefillTitle || '');
  const [body, setBody] = useState(params.prefillBody || '');
  const [eventDate, setEventDate] = useState(params.prefillDate || '');
  const [imageUri, setImageUri] = useState<string | null>(null);
  // Le media choisi est-il une video ? Change l'apercu et l'envoi au serveur.
  const [estVideo, setEstVideo] = useState(false);
  const trUI = useAutoTranslate([
    'Vidéo trop longue',
    'Ta vidéo dure {{d}} secondes. Le maximum est de 30 secondes — choisis-en une plus courte, ou raccourcis-la dans ta galerie.',
    'Photo ou vidéo (30 s max)',
    'Photo',
    'Vidéo',
    'La vidéo verticale s’affiche en plus grand.',
    'Video prete a publier (30 s max)',
    'Plyz n’est pas un réseau social comme les autres',
    "Vos fans viennent ici pour etre PROCHES de vous, au quotidien. Vos vacances, ils les voient deja ailleurs : ce qu'ils ne voient nulle part, c'est votre metier.",
    "Entre deux prises sur un tournage · l'entrainement avant le match · le vestiaire · les balances et les backstages avant de monter sur scene · l'atelier, le studio, la preparation",
  ]);
  const [publishing, setPublishing] = useState(false);
  // Rappel affiche apres publication quand rien n'est a vendre.
  const [rappel, setRappel] = useState<{ visible: boolean; vues?: number; quota?: boolean }>({ visible: false });
  const [moderating, setModerating] = useState(false);

  // Les paramètres de navigation ne sont pas toujours disponibles au PREMIER
  // rendu : les valeurs passées à useState ci-dessus restent alors figées sur
  // leurs défauts. C'est ainsi qu'une annonce d'événement se retrouvait publiée
  // en simple « post » sans date — donc sans horaire affiché aux fans, et
  // invisible dans l'onglet Événements. On réapplique dès que les paramètres
  // arrivent, sans jamais écraser ce que la célébrité a déjà saisi.
  useEffect(() => {
    if (params.prefillKind === 'event') setKind('event');
    if (params.prefillDate && !eventDate) setEventDate(String(params.prefillDate));
    if (params.prefillTitle && !title) setTitle(String(params.prefillTitle));
    if (params.prefillBody && !body) setBody(String(params.prefillBody));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.prefillKind, params.prefillDate, params.prefillTitle, params.prefillBody]);

  // Traitement commun à tous les chemins d'arrivée d'une image : galerie,
  // appareil photo, ou résultat récupéré après qu'Android a redémarré l'app.
  // Durée maximale d'une vidéo publiée. Trente secondes, et pas une de plus :
  // au-delà, le poids explose (donc la facture de diffusion), le fil devient
  // lent à parcourir, et une annonce qui dure ne se regarde pas jusqu'au bout.
  const DUREE_VIDEO_MAX_S = 30;

  const processPickedVideo = async (uri: string, dureeMs?: number) => {
    // Les deux orientations sont acceptées, comme sur Instagram et Facebook :
    // le portrait n'est impose que dans les formats plein ecran (Reels,
    // TikTok). Refuser l'horizontale interdirait le plan le plus naturel — une
    // star qui filme son public depuis la scène. La fine bande au milieu du fil
    // se règle par un cadre à hauteur fixe sur fond noir, pas par une
    // interdiction.
    if (dureeMs && dureeMs / 1000 > DUREE_VIDEO_MAX_S + 0.7) {
      // 0,7 s de tolérance : les galeries arrondissent, et refuser une vidéo de
      // 30,2 s pour une limite de 30 serait incompréhensible.
      showAlert(
        t('videoTooLongTitle' as any) || trUI('Vidéo trop longue'),
        (t('videoTooLongMsg' as any) || trUI('Ta vidéo dure {{d}} secondes. Le maximum est de 30 secondes — choisis-en une plus courte, ou raccourcis-la dans ta galerie.'))
          .replace('{{d}}', String(Math.round(dureeMs / 1000))),
      );
      return;
    }
    // La modération d'image ne sait pas lire une vidéo : elle est publiée sans
    // ce contrôle, et repose sur le signalement. À renforcer quand la
    // modération vidéo sera en place.
    setImageUri(uri);
    setEstVideo(true);
  };

  const processPickedImage = async (uri: string) => {
    setEstVideo(false);
    const compressed = await compressImage(uri);

    setModerating(true);
    const modResult = await moderateImageOnServer(compressed, session?.access_token);
    setModerating(false);

    if (!modResult.safe) {
      showAlert(
        t('contentRejected' as any) || 'Content Rejected',
        t('contentRejectedMessage' as any) || 'This image contains inappropriate content and cannot be published. Please choose a different photo.'
      );
      return;
    }

    setImageUri(compressed);
  };

  // Android peut détruire l'application pendant que l'appareil photo est ouvert,
  // par manque de mémoire : au retour, l'écran se recharge et la photo est perdue
  // sans le moindre message. expo-image-picker conserve ce résultat en attente.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const pending: any = await (ImagePicker as any).getPendingResultAsync?.();
        const first = Array.isArray(pending) ? pending[0] : pending;
        if (!first || first.canceled) return;
        const asset = first.assets?.[0] || first;
        const uri = asset?.uri;
        if (!uri) return;
        // Une video reprise apres un redemarrage d'Android passait dans le
        // traitement des IMAGES : compression impossible, media perdu sans un
        // mot. On regarde le type avant de choisir le traitement.
        if (asset?.type === 'video' || estUneVideo(uri)) {
          await processPickedVideo(uri, asset?.duration);
        } else {
          await processPickedImage(uri);
        }
      } catch { /* aucun résultat en attente : cas normal */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trois sources, trois boutons. Un seul bouton « appareil photo » ouvrait la
  // camera en mode PHOTO, sans aucun moyen de basculer en video : selon le
  // telephone, l'onglet video n'apparait pas. Filmer etait donc impossible
  // depuis l'app, alors que la fonction existait.
  const pickImage = async (source: 'galerie' | 'photo' | 'video' = 'galerie') => {
    try {
      let result;
      if (source === 'photo' || source === 'video') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        result = await ImagePicker.launchCameraAsync({
          // La camera s'ouvre DIRECTEMENT dans le bon mode.
          mediaTypes: source === 'video' ? ['videos'] : ['images'],
          allowsEditing: true,
          quality: 0.8,
          // Coupe l'enregistrement a 30 s : on ne laisse pas filmer trois
          // minutes pour refuser ensuite.
          videoMaxDuration: DUREE_VIDEO_MAX_S,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        result = await ImagePicker.launchImageLibraryAsync({
          // Depuis la galerie, les deux types restent proposes.
          mediaTypes: ['images', 'videos'],
          allowsEditing: true,
          quality: 0.8,
          videoMaxDuration: DUREE_VIDEO_MAX_S,
        });
      }
      if (result.canceled) return;

      const asset: any = result.assets?.[0];
      if (asset?.uri && (asset.type === 'video' || estUneVideo(asset.uri))) {
        await processPickedVideo(asset.uri, asset.duration);
        return;
      }

      const uri = asset?.uri;
      if (!uri) {
        // L'appareil photo n'a rien rendu alors que l'utilisateur n'a pas annulé.
        // Sans ce message, la photo disparaissait sans un mot et on croyait que
        // le bouton ne marchait pas.
        showAlert(
          t('error') || 'Erreur',
          t('photoNotReceived' as any)
            || "La photo n'a pas pu être récupérée. Réessaie, ou choisis-la depuis ta galerie.",
        );
        return;
      }

      await processPickedImage(uri);
    } catch (err) {
      setModerating(false);
      console.error('Image pick error:', err);
      // Le silence était le vrai défaut : compression ou modération en échec,
      // l'utilisateur ne voyait rien et pensait que la photo était prise.
      showAlert(
        t('error') || 'Erreur',
        t('photoNotReceived' as any)
          || "La photo n'a pas pu être ajoutée. Réessaie, ou choisis-la depuis ta galerie.",
      );
    }
  };

  const handlePublish = async () => {
    if (!body.trim() && !imageUri) return;
    setPublishing(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      let mediaUrl: string | null = null;

      if (imageUri) {
        const uploadResult = await uploadImageToServer(imageUri, session?.access_token, estVideo);
        if (uploadResult.rejected) {
          showAlert(
            t('contentRejected' as any) || 'Content Rejected',
            t('contentRejectedMessage' as any) || 'This image contains inappropriate content and cannot be published. Please choose a different photo.'
          );
          setPublishing(false);
          return;
        }
        // Quota de vidéos atteint : on ouvre le rappel, qui porte le bouton
        // « Créer un événement ». Un refus sans chemin pour le lever ne serait
        // qu'un mur — et la personnalité conclurait à une panne.
        if (uploadResult.quotaAtteint) {
          setRappel({ visible: true, quota: true });
          setPublishing(false);
          return;
        }
        mediaUrl = uploadResult.url;
        if (!mediaUrl) {
          mediaUrl = imageUri;
        }
      }

      const eventDateValue = kind === 'event' && eventDate.trim() ? eventDate.trim() : null;
      const newPost = {
        id: `local-${Date.now()}`,
        kind,
        title: title.trim() || null,
        body: body.trim() || null,
        media_url: mediaUrl,
        event_date: eventDateValue,
        created_at: new Date().toISOString(),
        celebrity: {
          user_id: user?.id || 'local-celebrity',
          stage_name: 'You',
          avatar_url: null,
          official_verified: false,
          stripe_verified: false,
        },
      };

      let serverPublished = false;
      try {
        const res = await authedFetch(`${API_BASE}/api/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            celebrity_id: user?.id || 'local-celebrity',
            kind,
            title: newPost.title,
            body: newPost.body,
            media_url: mediaUrl,
            event_date: eventDateValue,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.post) { newPost.id = data.post.id; }
          serverPublished = true;
        }
      } catch {}

      // Cache local UNIQUEMENT si le serveur n'a pas pris le relais. Cette copie
      // est remplie de valeurs de repli (« You », aucun avatar) et le fil la place
      // AVANT celle du serveur : conservée après une publication réussie, elle
      // masquait la vraie publication. La célébrité voyait donc son propre post
      // sans son pseudo ni sa photo — et le croyait cassé — alors que ses fans
      // le voyaient correctement.
      // Propre try/catch : un cache corrompu ne doit pas faire croire à un échec
      // de publication (→ le créateur republierait = doublon).
      if (!serverPublished) {
        try {
          const stored = await AsyncStorage.getItem(LOCAL_POSTS_KEY);
          let localPosts: any[] = [];
          try { localPosts = stored ? JSON.parse(stored) : []; } catch { localPosts = []; }
          localPosts.unshift(newPost);
          await AsyncStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(localPosts));
        } catch (cacheErr) {
          console.warn('[create-post] cache local échoué (non bloquant):', cacheErr);
        }
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Si le serveur n'a PAS publié (compte non vérifié / réseau), on le DIT :
      // sinon le créateur croit que son post est visible par ses fans alors qu'il
      // n'est enregistré qu'en local.
      if (!serverPublished) {
        showAlert(
          t('postNotOnFeedTitle' as any) || 'Post non publié sur le fil',
          t('postNotOnFeedMsg' as any) || "Ton post est enregistré sur cet appareil mais n'a pas pu être publié pour tes fans (compte pas encore vérifié ou problème réseau)."
        );
      }
      // Publier ne sert a rien si aucun fan ne peut rien reserver. On regarde
      // donc l'etat reel du compte AVANT de quitter l'ecran, et on le dit —
      // avec le bouton pour y remedier, pas un simple avertissement.
      try {
        const r = await authedFetch(`${API_BASE}/api/ma-portee`);
        const p = await r.json();
        if (r.ok && Number(p?.evenements_a_venir || 0) === 0) {
          setRappel({ visible: true, vues: Number(p?.vues_30j || 0) });
          setPublishing(false);
          return;
        }
      } catch { /* le rappel n'est jamais bloquant */ }

      router.back();
    } catch (err) {
      console.error('Publish error:', err);
      showAlert(
        t('error' as any) || 'Error',
        t('publishError' as any) || 'Failed to publish. Please try again.'
      );
    } finally {
      setPublishing(false);
    }
  };

  const canPublish = (body.trim().length > 0 || imageUri !== null) && !publishing;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('newPost' as any)}</Text>
        <TouchableOpacity
          style={[styles.publishBtn, !canPublish && styles.publishBtnDisabled]}
          onPress={handlePublish}
          disabled={!canPublish}
          activeOpacity={0.7}
        >
          {publishing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Send size={16} color={canPublish ? '#fff' : '#6b7280'} />
              <Text style={[styles.publishBtnText, !canPublish && styles.publishBtnTextDisabled]}>
                {t('publish' as any)}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Deux onglets, deux intentions distinctes. Le second ne compose plus une
          annonce à la main : il ouvre la création d'événement, dont l'annonce est
          désormais publiée automatiquement. Laisser rédiger une « annonce » sans
          événement derrière produisait un post qui promettait une séance
          inexistante — et le fan n'avait aucun moyen de s'en apercevoir. */}
      <View style={styles.kindRow}>
        <TouchableOpacity
          style={[styles.kindBtn, kind === 'post' && styles.kindBtnActive]}
          onPress={() => setKind('post')}
          activeOpacity={0.8}
        >
          <FileText size={16} color={kind === 'post' ? '#fff' : '#6b7280'} />
          <Text style={[styles.kindText, kind === 'post' && styles.kindTextActive]}>
            {t('createPostTabPost' as any) || 'Créer un post'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.kindBtn}
          onPress={() => router.replace('/create-event' as any)}
          activeOpacity={0.8}
        >
          <Calendar size={16} color="#6b7280" />
          <Text style={styles.kindText}>
            {t('createPostTabEvent' as any) || 'Créer un événement'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={styles.titleInput}
            placeholder={t('postTitlePlaceholder' as any)}
            placeholderTextColor="#6b7280"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          <TextInput
            style={styles.bodyInput}
            placeholder={t('postBodyPlaceholder' as any)}
            placeholderTextColor="#6b7280"
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />

          {moderating ? (
            <View style={styles.moderatingWrap}>
              <ActivityIndicator size="large" color="#f59e0b" />
              <Text style={styles.moderatingText}>
                {t('moderatingImage' as any) || 'Checking image content...'}
              </Text>
            </View>
          ) : imageUri ? (
            <View style={styles.imagePreviewWrap}>
              {/* Une video n'a pas de miniature ici : on montre un cadre qui
                  dit clairement ce qui va etre publie, plutot qu'un rectangle
                  noir dont on ne sait pas s'il a fonctionne. */}
              {estVideo ? (
                <View style={[styles.imagePreview, styles.videoPreview]}>
                  <Play size={34} color="#10b981" fill="#10b981" />
                  <Text style={styles.videoPreviewText}>{trUI('Video prete a publier (30 s max)')}</Text>
                </View>
              ) : (
                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              )}
              <TouchableOpacity
                style={styles.removeImageBtn}
                onPress={() => { setImageUri(null); setEstVideo(false); }}
                activeOpacity={0.7}
              >
                <X size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Ce qui distingue Plyz des autres reseaux : les coulisses. Une
              personnalite poste par reflexe ce qu'elle poste ailleurs — des
              vacances, un selfie. Ses fans le voient deja partout. Ce qu'ils
              ne voient nulle part, c'est son METIER. On le dit au moment ou la
              video vient d'etre choisie, quand il est encore temps d'en
              prendre une autre. */}
          {estVideo && (
            <View style={styles.coulissesBox}>
              <Text style={styles.coulissesTitre}>
                {trUI('Plyz n’est pas un réseau social comme les autres')}
              </Text>
              <Text style={styles.coulissesTexte}>
                {trUI("Vos fans viennent ici pour etre PROCHES de vous, au quotidien. Vos vacances, ils les voient deja ailleurs : ce qu'ils ne voient nulle part, c'est votre metier.")}
              </Text>
              <Text style={styles.coulissesExemples}>
                {trUI("Entre deux prises sur un tournage · l'entrainement avant le match · le vestiaire · les balances et les backstages avant de monter sur scene · l'atelier, le studio, la preparation")}
              </Text>
            </View>
          )}

          {/* Dire d'emblee ce qui est accepte : une personnalite qui ignore
              qu'elle peut publier une video ne la publiera jamais. */}
          {!imageUri && (
            <Text style={styles.mediaAide}>{trUI('Photo ou video (30 s max)')}</Text>
          )}

          <View style={styles.mediaRow}>
            <TouchableOpacity
              style={[styles.mediaBtn, moderating && { opacity: 0.4 }]}
              onPress={() => pickImage('galerie')}
              activeOpacity={0.7}
              disabled={moderating}
            >
              <ImagePlus size={22} color="#10b981" />
              <Text style={styles.mediaBtnText}>{t('addPhoto' as any)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mediaBtn, moderating && { opacity: 0.4 }]}
              onPress={() => pickImage('photo')}
              activeOpacity={0.7}
              disabled={moderating}
            >
              <Camera size={22} color="#3b82f6" />
              <Text style={styles.mediaBtnText}>{trUI('Photo')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mediaBtn, moderating && { opacity: 0.4 }]}
              onPress={() => pickImage('video')}
              activeOpacity={0.7}
              disabled={moderating}
            >
              <Video size={22} color="#a855f7" />
              <Text style={styles.mediaBtnText}>{trUI('Vidéo')}</Text>
            </TouchableOpacity>
          </View>

          {kind === 'event' && (
            <View style={styles.eventDateSection}>
              <Text style={styles.eventDateLabel}>
                {t('createPostEventDate' as any) || 'Date de l\'événement'}
              </Text>
              <TextInput
                style={styles.eventDateInput}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="2026-03-15T18:00"
                placeholderTextColor="#4b5563"
              />
              <Text style={styles.eventDateHint}>
                {t('createPostEventDateHint' as any) || 'Format : AAAA-MM-JJTHH:MM'}
              </Text>
            </View>
          )}

          <Text style={styles.hint}>{t('postImageHint' as any)}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Le rappel ferme, on quitte l'ecran comme apres une publication
          ordinaire : on ne piege personne dans une fenetre. */}
      <RappelEvenement
        visible={rappel.visible}
        vues30j={rappel.vues}
        quotaAtteint={rappel.quota}
        onClose={() => {
          const quota = rappel.quota;
          setRappel({ visible: false });
          // Quota atteint : la publication n'a PAS eu lieu, on reste sur
          // l'ecran pour que la video choisie ne soit pas perdue. Sinon on
          // quitte comme apres une publication ordinaire.
          if (!quota) router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  publishBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  publishBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  publishBtnTextDisabled: {
    color: '#6b7280',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  titleInput: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  bodyInput: {
    color: '#d1d5db',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    paddingVertical: 8,
  },
  moderatingWrap: {
    marginTop: 16,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  moderatingText: {
    color: '#f59e0b',
    fontSize: 14,
    marginTop: 12,
    fontWeight: '500',
  },
  imagePreviewWrap: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  coulissesBox: {
    backgroundColor: 'rgba(99,102,241,0.10)', borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.30)', borderRadius: 14,
    padding: 14, marginBottom: 12, gap: 6,
  },
  coulissesTitre: { color: '#c7d2fe', fontSize: 14, fontWeight: '800' },
  coulissesTexte: { color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 18 },
  coulissesExemples: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, lineHeight: 18 },
  mediaAide: {
    color: 'rgba(255,255,255,0.5)', fontSize: 12.5, marginBottom: 8, textAlign: 'center',
  },
  videoPreview: {
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  videoPreviewText: { color: '#a7f3d0', fontSize: 13.5, fontWeight: '700' },
  imagePreview: {
    width: '100%',
    height: 250,
    borderRadius: 16,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaRow: {
    flexDirection: 'row',
    // Trois boutons desormais : sans resserrement, « Galerie » se tronque.
    gap: 8,
    marginTop: 20,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mediaBtnText: {
    color: '#d1d5db',
    fontSize: 14,
    fontWeight: '500',
  },
  hint: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  kindRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  kindBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  kindBtnActive: {
    backgroundColor: '#10b981',
  },
  kindBtnActiveEvent: {
    backgroundColor: '#f59e0b',
  },
  kindText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  kindTextActive: {
    color: '#fff',
  },
  kindTextActiveEvent: {
    color: '#000',
  },
  eventDateSection: {
    marginTop: 20,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  eventDateLabel: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  eventDateInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  eventDateHint: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 6,
  },
});
