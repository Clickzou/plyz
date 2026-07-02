import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getDateLocale } from '@/utils/dateLocale';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Camera,
  Send,
  Clock,
  Check,
  QrCode,
  Users,
  Tag,
  Calendar,
  Video,
} from 'lucide-react-native';
import BarCodeScannerWrapper, { requestCameraPermissionAsync, isBarCodeScannerAvailable } from '@/components/BarCodeScannerWrapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  LiveSession,
  QueueEntry,
  getSessionByCode,
  getSessionById,
  joinSessionQueue,
  uploadFanPhoto,
  subscribeToSession,
  subscribeToQueueEntry,
} from '@/utils/liveSessionStorage';
import { supabase } from '@/utils/supabase';
import { isFanBlocked } from '@/utils/blockedFansStorage';
import { createMeetingToken } from '@/utils/dailyService';
import { saveActiveFanEvent, getOrCreateDeviceId } from '@/utils/eventSessionStorage';
import { getExpoPushToken } from '@/utils/notifications';
import { authedFetch } from '@/utils/authedFetch';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

export default function JoinLiveSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    // Params de RETOUR après paiement (purchase-session -> payment-success -> ici)
    paymentAuthorized?: string;
    checkoutSessionId?: string;
    sessionId?: string;
    resumePhotoUrl?: string;
    resumeMessage?: string;
    resumeFanName?: string;
  }>();
  const paramCode = params.code;
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();

  const [code, setCode] = useState(paramCode || '');
  const [session, setSession] = useState<LiveSession | null>(null);
  const [step, setStep] = useState<'code' | 'scheduled' | 'upload' | 'queue' | 'signing'>('code');
  const [isReserving, setIsReserving] = useState(false);
  const [reservationDone, setReservationDone] = useState(false);
  const [reservationCount, setReservationCount] = useState<number | null>(null);
  const [fanName, setFanName] = useState('');
  const [message, setMessage] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [queueRank, setQueueRank] = useState(0);
  const [waitMinutes, setWaitMinutes] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [, setHasPermission] = useState<boolean | null>(null);

  // fanId STABLE : pour un utilisateur connecté on dérive l'id de son compte, sinon
  // on retombe sur un id aléatoire. Stabiliser évite une 2e entrée dans la file quand
  // la page se recharge (web) au retour du paiement.
  const fanId = useMemo(
    () =>
      user?.id
        ? `fan_user_${user.id}`
        : `fan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    [user?.id]
  );
  const sessionChannelRef = useRef<RealtimeChannel | null>(null);
  const queueChannelRef = useRef<RealtimeChannel | null>(null);
  // Subscription/polling sur TOUTE la file (pas seulement mon entrée) pour le rang dynamique
  const queueRankChannelRef = useRef<RealtimeChannel | null>(null);
  const queueRankPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Garde anti-double déclenchement du passage à la visio
  const hasJoinedVideoRef = useRef(false);
  // Référence à jour de l'entrée du fan (utilisée par le recalcul du rang)
  const queueEntryRef = useRef<QueueEntry | null>(null);
  // Référence à jour de la session (pour récupérer room_url / durée sans dépendances stale)
  const sessionRef = useRef<LiveSession | null>(null);
  // checkoutSessionId du paiement Stripe pré-autorisé (session payante) -> transmis à
  // /video-call pour la capture finale du paiement à la fin de l'appel.
  const checkoutSessionIdRef = useRef<string | null>(null);
  // Évite de relancer la reprise post-paiement plusieurs fois.
  const resumeHandledRef = useRef(false);

  useEffect(() => {
    return () => {
      if (sessionChannelRef.current) {
        sessionChannelRef.current.unsubscribe();
      }
      if (queueChannelRef.current) {
        queueChannelRef.current.unsubscribe();
      }
      if (queueRankChannelRef.current) {
        queueRankChannelRef.current.unsubscribe();
      }
      if (queueRankPollRef.current) {
        clearInterval(queueRankPollRef.current);
      }
    };
  }, []);

  // Garde les refs à jour pour les callbacks asynchrones (évite les valeurs périmées)
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    queueEntryRef.current = queueEntry;
  }, [queueEntry]);

  useEffect(() => {
    if (paramCode) {
      handleJoinWithCode(paramCode);
    }
  }, [paramCode]);

  // RETOUR APRÈS PAIEMENT (flux vidéo payant) : payment-success nous renvoie ici avec
  // paymentAuthorized='true' + checkoutSessionId + sessionId (+ photo/message déjà uploadés).
  // On recharge la session, on mémorise le checkoutSessionId, et on rejoint la file
  // directement (pas de nouveau paiement).
  useEffect(() => {
    if (resumeHandledRef.current) return;
    if (params.paymentAuthorized !== 'true' || !params.checkoutSessionId || !params.sessionId) {
      return;
    }
    resumeHandledRef.current = true;
    checkoutSessionIdRef.current = params.checkoutSessionId;

    (async () => {
      setIsLoading(true);
      try {
        const s = await getSessionById(params.sessionId as string);
        if (!s) {
          showAlert(t('error'), t('liveSessionNotFound'));
          setIsLoading(false);
          return;
        }
        setSession(s);
        sessionRef.current = s;

        sessionChannelRef.current = subscribeToSession(s.id, (updated) => {
          setSession(updated);
          sessionRef.current = updated;
          if (updated.status === 'ended') {
            handleSessionEndedForFan();
          }
        });

        const resumeFanName =
          (params.resumeFanName || '').trim() ||
          fanName.trim() ||
          (t('liveSessionAnonymousFan' as any) || 'Un fan');

        await joinQueueWithData(
          params.resumePhotoUrl || null,
          params.resumeMessage || '',
          resumeFanName
        );
      } catch (error) {
        console.error('[Join] Error resuming after payment:', error);
        showAlert(t('error'), t('liveSessionJoinError'));
        setIsLoading(false);
      }
    })();
  }, [params.paymentAuthorized, params.checkoutSessionId, params.sessionId]);

  // Récupère le pseudo public du fan connecté (profiles.display_name) pour
  // l'envoyer dans la file -> la célébrité voit un vrai nom, pas un champ vide.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        const displayName = (data?.display_name || '').trim();
        if (!cancelled && displayName) {
          setFanName(displayName);
        }
      } catch (e) {
        console.error('[Join] Error loading fan display_name:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleJoinWithCode = async (inputCode: string) => {
    if (inputCode.length !== 6) {
      showAlert(t('error'), t('liveSessionInvalidCode'));
      return;
    }

    setIsLoading(true);
    try {
      const s = await getSessionByCode(inputCode.toUpperCase());
      if (!s) {
        showAlert(t('error'), t('liveSessionNotFound'));
        setIsLoading(false);
        return;
      }

      if (s.status === 'ended') {
        showAlert(t('error'), t('liveSessionHasEnded'));
        setIsLoading(false);
        return;
      }

      // PLAFOND TOTAL CUMULÉ : on compte le nombre de fans DISTINCTS déjà entrés
      // dans cette session depuis le début (waiting + current + completed + tous
      // statuts confondus). Une fois max_slots personnes entrées, plus personne ne
      // peut rejoindre — même si des places se sont "libérées" (slots_used dynamique).
      // EXCEPTION : le fan déjà présent (il revient/recharge) garde sa place.
      try {
        const { data: allEntries } = await supabase
          .from('session_queue')
          .select('fan_id')
          .eq('session_id', s.id);
        const distinctFanIds = new Set(
          (allEntries || []).map((e: { fan_id: string }) => e.fan_id)
        );
        const alreadyInQueue = !!(user?.id && distinctFanIds.has(user.id));
        if (distinctFanIds.size >= s.max_slots && !alreadyInQueue) {
          showAlert(t('error'), t('liveSessionFull'));
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.error('[Join] Error counting cumulative slots:', e);
      }

      // BLOCAGE : si la célébrité a bloqué ce fan (harcèlement/injures), il ne peut
      // pas rejoindre. On vérifie AVANT d'afficher l'écran d'inscription/file.
      // N'altère PAS le contrôle de plafond ci-dessus (vérification indépendante).
      if (s.celebrity_id) {
        const blocked = await isFanBlocked(s.celebrity_id, fanId);
        if (blocked) {
          showAlert(
            t('accessDenied' as any) || 'Accès refusé',
            t('blockedByHost' as any) ||
              'Vous ne pouvez pas rejoindre cette session.'
          );
          setIsLoading(false);
          return;
        }
      }

      setSession(s);

      const isScheduled =
        s.status === 'scheduled' ||
        (!!s.scheduled_at && new Date(s.scheduled_at) > new Date());

      if (isScheduled) {
        setStep('scheduled');
      } else {
        setStep('upload');
      }

      sessionChannelRef.current = subscribeToSession(s.id, (updated) => {
        setSession(updated);
        sessionRef.current = updated;
        if (updated.status === 'ended') {
          handleSessionEndedForFan();
        }
      });
    } catch (error) {
      console.error('Error joining session:', error);
      showAlert(t('error'), t('liveSessionJoinError'));
    } finally {
      setIsLoading(false);
    }
  };

  const requestCameraPermission = async () => {
    if (Platform.OS === 'web' || !isBarCodeScannerAvailable()) {
      showAlert(
        'Info', 
        'Le scan QR n\'est pas disponible sur le navigateur web. Entrez le code manuellement ci-dessus.'
      );
      return;
    }

    const granted = await requestCameraPermissionAsync();
    setHasPermission(granted);
    if (granted) {
      setShowScanner(true);
    } else {
      showAlert(t('permissionDenied') || 'Permission Denied', t('cameraPermissionNeeded') || 'Camera permission is needed to scan QR codes.');
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setShowScanner(false);
    let scannedCode = data;
    if (data.includes('code=')) {
      const match = data.match(/code=([A-Z0-9]+)/i);
      if (match) {
        scannedCode = match[1].toUpperCase();
      }
    } else if (data.length === 6 && /^[A-Z0-9]+$/i.test(data)) {
      scannedCode = data.toUpperCase();
    }
    
    if (scannedCode && scannedCode.length >= 4 && scannedCode.length <= 6) {
      setCode(scannedCode);
      handleJoinWithCode(scannedCode);
    } else {
      showAlert(t('error') || 'Error', t('invalidQRCode') || 'Invalid QR code');
    }
  };

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('error'), t('cameraPermissionDenied'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  // === PARTIE A : recalcul du RANG DYNAMIQUE du fan dans la file ===
  // rang = nombre de fans encore actifs DEVANT moi (position inférieure) + 1.
  // « actif » = pas encore passé : waiting / current / signing / called / in_call.
  const recalcQueueRank = async () => {
    const myEntry = queueEntryRef.current;
    const currentSession = sessionRef.current;
    if (!myEntry || !currentSession) return;

    try {
      const { count, error } = await supabase
        .from('session_queue')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', currentSession.id)
        .in('status', ['waiting', 'current', 'signing', 'called', 'in_call'])
        .lt('position', myEntry.position);

      if (error) {
        console.error('[Queue] Error recalculating rank:', error);
        return;
      }

      const ahead = count || 0;
      const rank = ahead + 1;
      setQueueRank(rank);

      const perFan = currentSession.duration_per_fan_minutes || 0;
      setWaitMinutes(Math.max(0, (rank - 1) * perFan));
    } catch (e) {
      console.error('[Queue] recalcQueueRank exception:', e);
    }
  };

  // === PARTIE B : connexion du fan à la VISIO Daily quand c'est son tour ===
  const joinVideoCall = async () => {
    if (hasJoinedVideoRef.current) return;

    const myEntry = queueEntryRef.current;
    const baseSession = sessionRef.current;
    if (!baseSession) {
      return;
    }

    // Garde : ne pas basculer en visio si la session est déjà terminée.
    if (baseSession.status === 'ended') {
      return;
    }

    hasJoinedVideoRef.current = true;

    try {
      // 1) Récupère le room_url. Re-fetch + poll si la célébrité n'a pas encore créé la room.
      let roomUrl = baseSession.room_url || null;
      let attempts = 0;
      const maxAttempts = 10; // ~20s max
      while (!roomUrl && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const refreshed = await getSessionById(baseSession.id);
        if (refreshed) {
          sessionRef.current = refreshed;
          setSession(refreshed);
          roomUrl = refreshed.room_url || null;
        }
        attempts += 1;
      }

      if (!roomUrl) {
        console.error('[Fan Video] room_url still empty after polling');
        hasJoinedVideoRef.current = false;
        showAlert(t('error'), t('videoCallError' as any) || 'Connexion à la visio impossible.');
        return;
      }

      // 2) Génère le jeton Daily du FAN (mêmes params que le dashboard, mais isOwner:false).
      // Le roomName est dérivé de la convention `session-<id>` (cf. createSessionVideoRoom).
      const roomName = `session-${baseSession.id}`;
      const fanDisplayName = myEntry?.fan_name?.trim() || fanName.trim() || 'Fan';
      const token = await createMeetingToken({
        roomName,
        userName: fanDisplayName,
        userId: myEntry?.fan_id || fanId,
        isOwner: false,
        expiryMinutes: 120,
      });

      // 3) Navigue vers /video-call avec les MÊMES params que le dashboard (côté fan).
      router.replace({
        pathname: '/video-call',
        params: {
          roomUrl,
          token: token || '',
          isHost: 'false',
          sessionId: baseSession.id,
          userName: fanDisplayName,
          durationPerFan: String(baseSession.duration_per_fan_minutes || 5),
          queueEntryId: myEntry?.id || '',
          otherUserName: baseSession.celebrity_name || 'Celebrity',
          otherUserId: baseSession.celebrity_id || '',
          celebrityId: baseSession.celebrity_id || '',
          priceCents: String(baseSession.price_cents || 0),
          // Paiement pré-autorisé (session payante) -> capture en fin d'appel.
          checkoutSessionId: checkoutSessionIdRef.current || '',
        },
      });
    } catch (error) {
      console.error('[Fan Video] Error joining video call:', error);
      hasJoinedVideoRef.current = false;
      showAlert(t('error'), t('videoCallError' as any) || 'Connexion à la visio impossible.');
    }
  };

  // Sortie propre du fan quand la session est terminée par la célébrité.
  const sessionEndedHandledRef = useRef(false);
  const handleSessionEndedForFan = () => {
    if (sessionEndedHandledRef.current) return;
    sessionEndedHandledRef.current = true;
    showAlert(t('info'), t('liveSessionEndedByCelebrity' as any) || t('liveSessionHasEnded'));
  };

  // Réagit au changement de statut de l'entrée du fan : si appelé -> rejoint la visio.
  const handleFanStatusChange = (updated: QueueEntry) => {
    const status = updated.status as string;
    // Si la session est terminée, ne PAS basculer en visio.
    if (sessionRef.current?.status === 'ended') {
      handleSessionEndedForFan();
      return;
    }
    // 'current'/'in_call'/'called' = c'est mon tour pour une session VIDÉO -> rejoindre la visio.
    if (status === 'current' || status === 'in_call' || status === 'called') {
      setStep('signing');
      joinVideoCall();
    } else if (status === 'signing') {
      // Conservé pour le flux dédicace pur (signature dessinée par la célébrité).
      setStep('signing');
    } else if (status === 'completed') {
      router.replace({
        pathname: '/live-signature-result',
        params: { entryId: updated.id },
      });
    }
  };

  // Filet de sécurité : si le temps réel (subscribeToQueueEntry) ne reçoit pas le
  // changement de statut (réseau instable / publication realtime), on relit MON
  // entrée par polling et on déclenche la bascule visio nous-mêmes.
  const pollMyStatus = async () => {
    const myEntry = queueEntryRef.current;
    if (!myEntry || hasJoinedVideoRef.current) return;
    try {
      const { data, error } = await supabase
        .from('session_queue')
        .select('*')
        .eq('id', myEntry.id)
        .single();
      if (!error && data) {
        const updated = data as QueueEntry;
        if (updated.status !== queueEntryRef.current?.status) {
          setQueueEntry(updated);
          queueEntryRef.current = updated;
          handleFanStatusChange(updated);
        }
      }
    } catch (e) {
      console.error('[Queue] pollMyStatus exception:', e);
    }
  };

  const handleJoinQueue = async () => {
    if (!session) return;

    // SESSION PAYANTE : on déclenche d'abord le paiement (pré-autorisation Stripe).
    // On uploade la photo AVANT de partir vers Stripe pour ne pas la perdre,
    // puis on passe l'URL + le message en params pour les retrouver au retour.
    if ((session.price_cents || 0) > 0 && !checkoutSessionIdRef.current) {
      setIsLoading(true);
      try {
        // ANTI RE-PAIEMENT : si ce fan a DÉJÀ un paiement actif (pré-autorisé non capturé)
        // pour cette session vidéo, on NE repaie PAS — on reprend la file directement.
        // Le fan est identifié par son compte (JWT via authedFetch), device_id en complément.
        if (STRIPE_SERVER_URL) {
          try {
            const deviceId = await getOrCreateDeviceId();
            const res = await authedFetch(
              `${STRIPE_SERVER_URL}/api/check-active-payment?type=video&session_id=${encodeURIComponent(session.id)}&device_id=${encodeURIComponent(deviceId)}`
            );
            if (res.ok) {
              const data = await res.json();
              if (data?.hasActivePayment && data.checkoutSessionId) {
                // Reprise sans nouveau paiement : on mémorise le checkout existant puis on
                // rejoint la file (même chemin qu'au retour de paiement).
                checkoutSessionIdRef.current = data.checkoutSessionId;
                let photoUrl: string | null = null;
                if (photoUri) {
                  try { photoUrl = await uploadFanPhoto(session.id, fanId, photoUri); }
                  catch { photoUrl = null; }
                }
                await joinQueueWithData(
                  photoUrl,
                  message.trim() || '',
                  fanName.trim() || (t('liveSessionAnonymousFan' as any) || 'Un fan')
                );
                return;
              }
            }
          } catch (checkErr) {
            // Vérif non bloquante : en cas d'échec, on retombe sur le paiement normal.
            console.warn('[Join] check-active-payment failed (non bloquant):', checkErr);
          }
        }

        let photoUrl: string | null = null;
        if (photoUri) {
          photoUrl = await uploadFanPhoto(session.id, fanId, photoUri);
        }
        const resolvedFanName =
          fanName.trim() || (t('liveSessionAnonymousFan' as any) || 'Un fan');

        router.push({
          pathname: '/purchase-session',
          params: {
            celebrityId: session.celebrity_id || '',
            celebrityName: session.celebrity_name || '',
            sessionId: session.id,
            priceCents: String(session.price_cents),
            durationMinutes: String(session.duration_per_fan_minutes || 5),
            celebrityStripeAccountId: session.celebrity_stripe_account_id || '',
            fanName: resolvedFanName,
            flow: 'video',
            resumePhotoUrl: photoUrl || '',
            resumeMessage: message.trim() || '',
          },
        });
      } catch (error) {
        console.error('Error preparing paid session checkout:', error);
        showAlert(t('error'), t('liveSessionJoinError'));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // SESSION GRATUITE (ou déjà payée) : on rejoint la file directement.
    await joinQueueWithData(
      photoUri ? await (async () => {
        try { return await uploadFanPhoto(session.id, fanId, photoUri); }
        catch { return null; }
      })() : null,
      message.trim() || '',
      fanName.trim() || (t('liveSessionAnonymousFan' as any) || 'Un fan')
    );
  };

  // Rejoint la file avec des données déjà prêtes (photo déjà uploadée le cas échéant).
  // Utilisé par le flux gratuit ET par la reprise après paiement.
  const joinQueueWithData = async (
    photoUrl: string | null,
    queueMessage: string,
    queueFanName: string
  ) => {
    // sessionRef est à jour SYNCHRONEMENT : la reprise après paiement la remplit
    // (sessionRef.current = s) AVANT d'appeler cette fonction, alors que le state
    // `session` n'est pas encore propagé -> sans ça, on lit null et on bloque.
    const sess = sessionRef.current || session;
    if (!sess) return;

    // Filet de sécurité BLOCAGE : couvre aussi le retour après paiement (qui ne passe
    // pas par handleJoinWithCode). Refuse l'entrée d'un fan bloqué par la célébrité.
    if (sess.celebrity_id) {
      const blocked = await isFanBlocked(sess.celebrity_id, fanId);
      if (blocked) {
        showAlert(
          t('accessDenied' as any) || 'Accès refusé',
          t('blockedByHost' as any) ||
            'Vous ne pouvez pas rejoindre cette session.'
        );
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    try {
      const entry = await joinSessionQueue(
        sess.id,
        fanId,
        queueFanName,
        photoUrl,
        queueMessage,
        checkoutSessionIdRef.current
      );

      if (!entry) {
        showAlert(t('error'), t('liveSessionJoinError'));
        setIsLoading(false);
        return;
      }

      setQueueEntry(entry);
      queueEntryRef.current = entry;
      setQueuePosition(entry.position);
      setStep('queue');

      // MÉMORISE LE JOIN (cache local) pour retrouver cette session vidéo dans
      // « événements en cours » même après fermeture/refresh de l'app. Best-effort.
      try {
        let endsAt = sess.ends_at;
        if (!endsAt) {
          const base = sess.scheduled_at ? new Date(sess.scheduled_at) : new Date();
          endsAt = new Date(
            base.getTime() + (sess.duration_minutes || 30) * 60 * 1000
          ).toISOString();
        }
        await saveActiveFanEvent({
          sessionId: sess.id,
          sessionTitle: sess.celebrity_name,
          joinCode: sess.code,
          endsAt,
          signers: '[]',
          savedAt: Date.now(),
          starts_at: sess.scheduled_at || undefined,
          event_type: 'live_video',
        });
      } catch (saveErr) {
        console.warn('[Join] saveActiveFanEvent (join) failed (non bloquant):', saveErr);
      }

      // Rang initial (avant le premier événement temps réel).
      await recalcQueueRank();

      // Abonnement sur MON entrée : déclenche le passage à la visio quand c'est mon tour.
      queueChannelRef.current = subscribeToQueueEntry(entry.id, (updated) => {
        setQueueEntry(updated);
        queueEntryRef.current = updated;
        handleFanStatusChange(updated);
      });

      // PARTIE A — temps réel sur TOUTE la file de cette session : recalcule le rang
      // à chaque changement (un fan devant passe 'completed' -> mon rang descend).
      queueRankChannelRef.current = supabase
        .channel(`queue_rank_${sess.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'session_queue',
            filter: `session_id=eq.${sess.id}`,
          },
          () => {
            recalcQueueRank();
          }
        )
        .subscribe();

      // Filet de sécurité : polling toutes les 5s (si le temps réel est indisponible).
      // On recalcule le rang ET on relit mon statut (bascule visio si c'est mon tour).
      queueRankPollRef.current = setInterval(() => {
        recalcQueueRank();
        pollMyStatus();
      }, 5000);
    } catch (error) {
      console.error('Error joining queue:', error);
      showAlert(t('error'), t('liveSessionJoinError'));
    } finally {
      setIsLoading(false);
    }
  };

  const formatScheduledDate = (iso?: string | null): string => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(getDateLocale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const formatPrice = (cents?: number | null, currency?: string | null): string => {
    if (!cents || cents <= 0) return t('free') || 'Gratuit';
    const value = (cents / 100).toFixed(2).replace('.', ',');
    const symbol = (currency || 'eur').toLowerCase() === 'usd' ? '$' : '€';
    return `${value} ${symbol}`;
  };

  const formatPerFanDuration = (minutes?: number | null): string => {
    if (!minutes || minutes <= 0) return '';
    if (minutes < 1) {
      const seconds = Math.round(minutes * 60);
      return `${seconds} sec`;
    }
    return `${Math.round(minutes)} min`;
  };

  // Charge le nombre de fans ayant déjà réservé ce live programmé.
  useEffect(() => {
    if (step !== 'scheduled' || !session?.id) return;
    (async () => {
      try {
        const r = await fetch(`${STRIPE_SERVER_URL}/api/event-reservation-count?event_id=${session.id}`);
        const j = await r.json();
        if (typeof j?.count === 'number') setReservationCount(j.count);
      } catch { /* non bloquant */ }
    })();
  }, [step, session?.id]);

  const persistLiveReservation = async () => {
    if (!session) return;
    try {
      const viewerId = await getOrCreateDeviceId();
      const pushToken = await getExpoPushToken();
      const r = await fetch(`${STRIPE_SERVER_URL}/api/reserve-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: session.id, fan_id: viewerId, fan_name: fanName || null, push_token: pushToken }),
      });
      const rj = await r.json().catch(() => null);
      if (rj && typeof rj.count === 'number') setReservationCount(rj.count);
    } catch (e) {
      console.warn('[live reserve-event] enregistrement serveur échoué (non bloquant):', e);
    }
  };

  const handleReserve = async () => {
    if (!session) return;
    setIsReserving(true);
    try {
      let endsAt = session.ends_at;
      if (!endsAt) {
        const base = session.scheduled_at ? new Date(session.scheduled_at) : new Date();
        endsAt = new Date(base.getTime() + (session.duration_minutes || 30) * 60 * 1000).toISOString();
      }

      await saveActiveFanEvent({
        sessionId: session.id,
        sessionTitle: session.celebrity_name,
        joinCode: session.code,
        endsAt,
        signers: '[]',
        savedAt: Date.now(),
        starts_at: session.scheduled_at || undefined,
        event_type: 'live_video',
      });

      // Persiste côté serveur (compteur « X ont réservé » + rappels push, même app fermée).
      await persistLiveReservation();

      setReservationDone(true);
      showAlert(t('success') || 'OK', t('eventReservedMessage'));
    } catch (error) {
      console.error('Error reserving event:', error);
      showAlert(t('error'), t('reservationFailed'));
    } finally {
      setIsReserving(false);
    }
  };

  // Réserve un live PAYANT en payant maintenant (place garantie). Réutilise le flux
  // de paiement existant (purchase-session → pré-autorisation) : au retour, l'entrée
  // de file pré-payée est créée, et le jour J le fan la reprend SANS re-payer
  // (check-active-payment). Débit seulement à la fin de l'appel (capture).
  const handleReserveAndPayLive = async () => {
    if (!session) return;
    setIsReserving(true);
    try {
      // Anti double-paiement : si ce fan a déjà une place pré-payée, on n'en repropose pas.
      if (STRIPE_SERVER_URL) {
        try {
          const deviceId = await getOrCreateDeviceId();
          const res = await authedFetch(`${STRIPE_SERVER_URL}/api/check-active-payment?type=video&session_id=${encodeURIComponent(session.id)}&device_id=${encodeURIComponent(deviceId)}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.hasActivePayment) {
              setReservationDone(true);
              showAlert(t('success') || 'OK', t('eventReservedMessage'));
              setIsReserving(false);
              return;
            }
          }
        } catch { /* non bloquant */ }
      }
      // Compte la réservation (payante) pour le « X ont réservé » + rappels.
      await persistLiveReservation();
      const resolvedFanName = fanName.trim() || (t('liveSessionAnonymousFan' as any) || 'Un fan');
      router.push({
        pathname: '/purchase-session',
        params: {
          celebrityId: session.celebrity_id || '',
          celebrityName: session.celebrity_name || '',
          sessionId: session.id,
          priceCents: String(session.price_cents),
          durationMinutes: String(session.duration_per_fan_minutes || 5),
          celebrityStripeAccountId: session.celebrity_stripe_account_id || '',
          fanName: resolvedFanName,
          flow: 'video',
          resumePhotoUrl: '',
          resumeMessage: '',
        },
      });
    } catch (error) {
      console.error('Error reserving+paying live:', error);
      showAlert(t('error'), t('reservationFailed'));
    } finally {
      setIsReserving(false);
    }
  };

  const renderScheduledStep = () => {
    const spotsLeft =
      session && session.max_slots > 0
        ? Math.max(0, session.max_slots - (session.slots_used || 0))
        : 0;
    const perFanDuration = formatPerFanDuration(session?.duration_per_fan_minutes);

    return (
      <ScrollView
        style={styles.stepContainer}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover photo / fallback */}
        {session?.cover_photo_url ? (
          <Image
            source={{ uri: session.cover_photo_url }}
            style={styles.coverPhoto}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.coverFallback}>
            <Video size={64} color="#fff" />
          </View>
        )}

        {/* Celebrity name + badge */}
        <Text style={[styles.title, { marginTop: 20 }]}>{session?.celebrity_name}</Text>

        <View style={styles.liveBadge}>
          <Video size={14} color="#fff" />
          <Text style={styles.liveBadgeText}>
            {t('eventTypeLiveVideo' as any) || 'Live vidéo'}
          </Text>
        </View>

        {/* Info cards */}
        <View style={styles.infoCardsContainer}>
          <View style={styles.infoCard}>
            <View style={styles.infoIconCircle}>
              <Calendar size={20} color="#818cf8" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>{t('sessionDateTime') || 'Date et heure'}</Text>
              <Text style={styles.infoValue}>{formatScheduledDate(session?.scheduled_at)}</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoIconCircle}>
              <Tag size={20} color="#818cf8" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>{t('pricePerFan') || 'Tarif par fan'}</Text>
              <Text style={styles.infoValue}>
                {formatPrice(session?.price_cents, session?.currency)}
              </Text>
            </View>
          </View>

          {!!perFanDuration && (
            <View style={styles.infoCard}>
              <View style={styles.infoIconCircle}>
                <Clock size={20} color="#818cf8" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>
                  {t('liveSessionDurationPerFan') || 'Durée par fan'}
                </Text>
                <Text style={styles.infoValue}>{perFanDuration}</Text>
              </View>
            </View>
          )}

          {!!session?.max_slots && (
            <View style={styles.infoCard}>
              <View style={styles.infoIconCircle}>
                <Users size={20} color="#818cf8" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>{t('slots') || 'Places'}</Text>
                <Text style={styles.infoValue}>
                  {spotsLeft} / {session.max_slots}
                  {'  '}
                  <Text style={styles.infoValueMuted}>
                    {t('spotsRemaining') || 'places restantes'}
                  </Text>
                </Text>
              </View>
            </View>
          )}
        </View>

        {reservationCount != null && reservationCount > 0 && (
          <Text style={{ color: '#818cf8', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 16 }}>
            {`👥 ${reservationCount} ${reservationCount > 1 ? (t('fansReserved' as any) || 'fans ont déjà réservé') : (t('fanReserved' as any) || 'fan a déjà réservé')}`}
          </Text>
        )}
        {reservationDone ? (
          <View style={{ alignItems: 'center' }}>
            <View style={[styles.signingIconContainer, { marginTop: 12 }]}>
              <Check size={60} color="#4ade80" />
            </View>
            <Text style={styles.subtitle}>{t('eventReservedMessage')}</Text>
            <TouchableOpacity style={[styles.primaryButton, { alignSelf: 'stretch', marginTop: 24 }]} onPress={() => router.back()}>
              <Text style={styles.primaryButtonText}>{t('back') || 'Retour'}</Text>
            </TouchableOpacity>
          </View>
        ) : (() => {
          const price = session?.price_cents || 0;
          const startsMs = session?.scheduled_at ? new Date(session.scheduled_at).getTime() : 0;
          const within7d = !!startsMs && (startsMs - Date.now()) <= 7 * 24 * 3600 * 1000;
          if (price > 0 && within7d) {
            return (
              <>
                <TouchableOpacity
                  style={[styles.primaryButton, { marginTop: 24 }, isReserving && styles.buttonDisabled]}
                  onPress={handleReserveAndPayLive}
                  disabled={isReserving}
                >
                  {isReserving ? (
                    <ActivityIndicator color="#6366f1" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {`${t('reserveMyPlace' as any) || 'Réserver ma place'} — ${(price / 100).toFixed(2).replace('.', ',')}€`}
                    </Text>
                  )}
                </TouchableOpacity>
                <Text style={[styles.infoValueMuted, { textAlign: 'center', marginTop: 10 }]}>
                  {t('reserveHeldNotCharged' as any) || 'Ta place est garantie — tu n\'es débité qu\'au moment de l\'appel.'}
                </Text>
              </>
            );
          }
          return (
            <>
              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 24 }, isReserving && styles.buttonDisabled]}
                onPress={handleReserve}
                disabled={isReserving}
              >
                {isReserving ? (
                  <ActivityIndicator color="#6366f1" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {price > 0 ? (t('waitlistJoin' as any) || "S'inscrire sur la liste d'attente") : t('reserveEvent')}
                  </Text>
                )}
              </TouchableOpacity>
              {price > 0 && (
                <Text style={[styles.infoValueMuted, { textAlign: 'center', marginTop: 10 }]}>
                  {t('waitlistInfo' as any) || "Le paiement ouvrira 7 jours avant l'événement — premier inscrit, premier servi."}
                </Text>
              )}
            </>
          );
        })()}
      </ScrollView>
    );
  };

  const renderCodeStep = () => (
    <ScrollView style={styles.stepContainer} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <View style={styles.howItWorksSection}>
        <Text style={styles.howItWorksTitle}>{t('howItWorksTitle') || 'How does it work?'}</Text>
        <View style={styles.howItWorksSteps}>
          <View style={styles.howItWorksStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <Text style={styles.stepText}>{t('howItWorksStep1') || 'Enter the code shared by the celebrity'}</Text>
          </View>
          <View style={styles.howItWorksStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <Text style={styles.stepText}>{t('howItWorksStep2') || 'Join the queue and wait for your turn'}</Text>
          </View>
          <View style={styles.howItWorksStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <Text style={styles.stepText}>{t('howItWorksStep3') || 'Video call with the celebrity when called'}</Text>
          </View>
          <View style={styles.howItWorksStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
            <Text style={styles.stepText}>{t('howItWorksStep4') || 'Rate each other after the call'}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.inputLabel}>{t('liveSessionJoinSubtitle')}</Text>

      <TextInput
        style={styles.codeInput}
        placeholder="ABC123"
        placeholderTextColor="rgba(255,255,255,0.4)"
        value={code}
        onChangeText={(text) => setCode(text.toUpperCase())}
        maxLength={6}
        autoCapitalize="characters"
      />

      <TouchableOpacity
        style={[styles.searchButton, isLoading && styles.buttonDisabled]}
        onPress={() => handleJoinWithCode(code)}
        disabled={isLoading || code.length !== 6}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.searchButtonText}>{t('search') || 'Rechercher'}</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.orDivider}>
        <View style={styles.dividerLine} />
        <Text style={styles.orText}>{t('or') || 'ou'}</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity style={styles.scanButton} onPress={requestCameraPermission}>
        <QrCode size={28} color="#818cf8" />
        <Text style={styles.scanButtonText}>{t('scan') || 'Scanner'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderUploadStep = () => {
    const celebrityName = session?.celebrity_name || (language === 'fr' ? 'la célébrité' : 'the celebrity');
    const spotsLeft =
      session && session.max_slots > 0
        ? Math.max(0, session.max_slots - (session.slots_used || 0))
        : 0;
    const perFanDuration = formatPerFanDuration(session?.duration_per_fan_minutes);
    const waiting = session?.slots_used || 0;

    const waitingLabel =
      waiting > 0
        ? language === 'fr'
          ? `${waiting} personne${waiting > 1 ? 's' : ''} en attente`
          : `${waiting} ${waiting > 1 ? 'people' : 'person'} waiting`
        : language === 'fr'
          ? 'Sois le premier !'
          : 'Be the first!';

    const excitingText =
      language === 'fr'
        ? `Prépare-toi pour un moment unique en tête-à-tête, rien que toi et ${celebrityName} !`
        : `Get ready for a unique one-on-one moment, just you and ${celebrityName}!`;

    return (
      <ScrollView
        style={styles.stepContainer}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover photo / fallback */}
        {session?.cover_photo_url ? (
          <Image
            source={{ uri: session.cover_photo_url }}
            style={styles.coverPhoto}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.coverFallback}>
            <Video size={64} color="#fff" />
          </View>
        )}

        {/* Celebrity name */}
        <Text style={[styles.title, { marginTop: 20 }]}>{session?.celebrity_name}</Text>

        {/* Live badge (red) */}
        <View
          style={[
            styles.liveBadge,
            { backgroundColor: 'rgba(239, 68, 68, 0.18)' },
          ]}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#ef4444',
            }}
          />
          <Text style={[styles.liveBadgeText, { color: '#ef4444' }]}>
            {language === 'fr' ? '🔴 EN DIRECT' : '🔴 LIVE NOW'}
          </Text>
        </View>

        {/* Exciting text */}
        <Text style={[styles.subtitle, { marginBottom: 20 }]}>{excitingText}</Text>

        {/* Info cards */}
        <View style={styles.infoCardsContainer}>
          <View style={styles.infoCard}>
            <View style={styles.infoIconCircle}>
              <Tag size={20} color="#818cf8" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>{t('pricePerFan') || 'Tarif par fan'}</Text>
              <Text style={styles.infoValue}>
                {formatPrice(session?.price_cents, session?.currency)}
              </Text>
            </View>
          </View>

          {!!perFanDuration && (
            <View style={styles.infoCard}>
              <View style={styles.infoIconCircle}>
                <Clock size={20} color="#818cf8" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>
                  {t('liveSessionDurationPerFan') || 'Durée par fan'}
                </Text>
                <Text style={styles.infoValue}>{perFanDuration}</Text>
              </View>
            </View>
          )}

          {!!session?.max_slots && (
            <View style={styles.infoCard}>
              <View style={styles.infoIconCircle}>
                <Users size={20} color="#818cf8" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>{t('slots') || 'Places'}</Text>
                <Text style={styles.infoValue}>
                  {spotsLeft} / {session.max_slots}
                  {'  '}
                  <Text style={styles.infoValueMuted}>
                    {t('spotsRemaining') || 'places restantes'}
                  </Text>
                </Text>
              </View>
            </View>
          )}

          {/* Fans in queue (instead of date) */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconCircle}>
              <Clock size={20} color="#818cf8" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>
                {language === 'fr' ? "File d'attente" : 'Queue'}
              </Text>
              <Text style={styles.infoValue}>{waitingLabel}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 24 }, isLoading && styles.buttonDisabled]}
          onPress={handleJoinQueue}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#6366f1" />
          ) : (
            <>
              <Send size={20} color="#6366f1" />
              <Text style={styles.primaryButtonText}>{t('liveSessionJoinQueue')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderQueueStep = () => {
    const displayRank = queueRank > 0 ? queueRank : (queueEntry?.position || queuePosition);
    const isAlmostTurn = displayRank <= 1;
    let waitLabel: string;
    if (isAlmostTurn) {
      waitLabel =
        (t('liveSessionAlmostYourTurn' as any) || '') ||
        (language === 'fr' ? "C'est bientôt ton tour !" : "It's almost your turn!");
    } else {
      const estimate = `~ ${waitMinutes} min`;
      waitLabel = `${t('estimatedWait')} : ${estimate}`;
    }

    return (
      <View style={styles.stepContainer}>
        <View style={styles.queueIconContainer}>
          <Clock size={60} color="#fff" />
        </View>

        <Text style={styles.title}>{t('liveSessionInQueue')}</Text>
        <Text style={styles.queuePosition}>#{displayRank}</Text>
        <Text style={styles.subtitle}>{waitLabel}</Text>

        <View style={styles.waitingAnimation}>
          <ActivityIndicator size="large" color="#fff" />
        </View>

        <Text style={styles.waitingNote}>{t('liveSessionDontLeave')}</Text>
      </View>
    );
  };

  const renderSigningStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.signingIconContainer}>
        <Check size={60} color="#4ade80" />
      </View>

      <Text style={styles.title}>{t('liveSessionYourTurn')}</Text>
      <Text style={styles.subtitle}>{t('connectingToCall')}</Text>

      <View style={styles.waitingAnimation}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>

      <Text style={styles.waitingNote}>{t('liveSessionDontLeave')}</Text>
    </View>
  );

  if (showScanner) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#6366f1', '#4f46e5']} style={StyleSheet.absoluteFill} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setShowScanner(false)}>
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('scanQRCode') || 'Scanner QR Code'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.scannerContainer}>
          <BarCodeScannerWrapper
            onBarCodeScanned={handleBarCodeScanned}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={styles.scannerHint}>{t('scanQRHint') || 'Pointez vers le QR code'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0f172a', '#1e293b']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('liveSessionJoinSession') || 'Session Live Vidéo'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === 'code' && renderCodeStep()}
      {step === 'scheduled' && renderScheduledStep()}
      {step === 'upload' && renderUploadStep()}
      {step === 'queue' && renderQueueStep()}
      {step === 'signing' && renderSigningStep()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  stepContainer: {
    flex: 1,
    padding: 20,
  },
  howItWorksSection: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  howItWorksTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#818cf8',
    textAlign: 'center',
    marginBottom: 16,
  },
  howItWorksSteps: {
    gap: 12,
  },
  howItWorksStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366f1',
    borderRadius: 30,
    paddingVertical: 16,
    marginTop: 8,
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingVertical: 16,
    marginTop: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366f1',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 32,
  },
  codeInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  photoSection: {
    marginBottom: 24,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
    textAlign: 'center',
  },
  galleryIcon: {
    width: 32,
    height: 32,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  changePhotoText: {
    textAlign: 'center',
    color: '#fff',
    marginTop: 8,
    fontSize: 14,
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
  },
  messageInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  queueIconContainer: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 24,
  },
  coverPhoto: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginTop: 8,
  },
  coverFallback: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  infoCardsContainer: {
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
  },
  infoIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 2,
  },
  infoValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoValueMuted: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '400',
  },
  queuePosition: {
    fontSize: 72,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  waitingAnimation: {
    marginTop: 40,
    alignItems: 'center',
  },
  waitingNote: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 24,
  },
  signingIconContainer: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 24,
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  orText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginHorizontal: 16,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: '#818cf8',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    gap: 10,
  },
  scanButtonText: {
    color: '#818cf8',
    fontSize: 16,
    fontWeight: '600',
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  scannerHint: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 12,
    marginHorizontal: 40,
    borderRadius: 8,
  },
});
