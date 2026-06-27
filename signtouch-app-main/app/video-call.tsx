import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { ArrowLeft, PhoneOff, Clock, Video, Users, TrendingUp, RotateCcw, AlertTriangle, Ban } from 'lucide-react-native';
import { useLanguage } from '../contexts/LanguageContext';
import RatingModal from '@/components/RatingModal';
import { submitRating, getOrCreateDeviceId } from '@/utils/ratingsStorage';
import { sendDedicationNotification, callNextFan, getFullQueue, completeFan } from '@/utils/sessionQueueStorage';
import { markPaymentCaptured, subscribeToSession } from '@/utils/liveSessionStorage';
import { recordTransaction } from '@/utils/transactionStorage';
import { blockFan as blockFanInDb } from '@/utils/blockedFansStorage';
import { supabase } from '@/utils/supabase';
import { showAlert } from '@/utils/alertHelper';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// SDK Daily NATIF (mobile uniquement). On le charge en require dynamique pour
// ne JAMAIS l'importer côté web (où c'est l'iframe Daily qui est utilisée).
let DailyNative: any = null;
let DailyMediaView: any = null;
let DailyLoadError: string | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const daily = require('@daily-co/react-native-daily-js');
    DailyNative = daily.default;
    DailyMediaView = daily.DailyMediaView;
    if (!DailyNative) DailyLoadError = 'module charge mais default vide';
  } catch (e: any) {
    DailyLoadError = e?.message || String(e);
    console.warn('[VideoCall] Daily native SDK not available:', e);
  }
}

// Permissions natives caméra + micro (mobile uniquement).
let ExpoCamera: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ExpoCamera = require('expo-camera');
  } catch {}
}

let ScreenOrientation: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ScreenOrientation = require('expo-screen-orientation');
  } catch {}
}

// Représentation minimale d'un participant natif (sous-ensemble de DailyParticipant).
interface NativeParticipant {
  session_id: string;
  user_id: string;
  user_name: string;
  local: boolean;
  tracks: {
    video?: { state?: string; persistentTrack?: any; track?: any };
    audio?: { state?: string; persistentTrack?: any; track?: any };
  };
}

// Formate une durée en minutes (éventuellement décimale, ex 0.5) en horloge "m:ss"
// (ex 0.5 -> "0:30", 1.5 -> "1:30"). Évite l'affichage cassé "0.5:00".
const formatClock = (minutes: number): string => {
  const safe = isNaN(minutes) ? 0 : minutes;
  const m = Math.floor(safe);
  const s = Math.round((safe - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function VideoCallScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  // L'écran reste allumé pendant tout l'appel vidéo (pas de mise en veille en pleine conversation).
  useKeepAwake();
  const dailyCallFrameRef = useRef<any>(null);
  const params = useLocalSearchParams<{
    roomUrl: string;
    token: string;
    isHost: string;
    sessionId: string;
    userName: string;
    durationPerFan: string;
    fansRemaining: string;
    queueEntryId: string;
    otherUserId: string;
    otherUserName: string;
    priceCents: string;
    celebrityId: string;
    checkoutSessionId: string;
  }>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 'pending' tant qu'on demande la cam/micro natifs, 'granted' une fois OK, 'denied' si refusé.
  // Sur web le navigateur gère lui-même les permissions, donc on démarre en 'granted'.
  const [mediaPermission, setMediaPermission] = useState<'pending' | 'granted' | 'denied'>(
    Platform.OS === 'web' ? 'granted' : 'pending'
  );
  const [fanTimeRemaining, setFanTimeRemaining] = useState<string>('--:--');
  const [, setTimeProgress] = useState(0);
  const [timeWarning, setTimeWarning] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hasLeftCall, setHasLeftCall] = useState(false);
  const [paymentCaptured, setPaymentCaptured] = useState(false);
  const callStartTime = useRef<number>(0);
  const autoEndTriggered = useRef(false);
  const callEndReason = useRef<'timer' | 'fan_left' | 'celebrity_left' | 'fan_hangup' | 'celebrity_hangup' | 'unknown'>('unknown');
  const [otherParticipantJoined, setOtherParticipantJoined] = useState(false);
  // Ref synchronisé : l'état peut être périmé dans un handler async (capture/annulation
  // du paiement). Ce ref reflète toujours la dernière valeur de otherParticipantJoined.
  const otherParticipantJoinedRef = useRef(false);
  // Évite de capturer ET d'annuler, ou d'annuler deux fois, le même paiement.
  const paymentResolvedRef = useRef(false);
  // Garde-fou anti-double notation : handleCallEnded peut être appelé 2x quasi simultanément
  // (listeners Daily participant-left + left-meeting dans le même tick). hasLeftCall est un
  // useState (valeur périmée dans la 2e invocation) -> ce ref SYNCHRONE garantit qu'on ne
  // traite la fin qu'UNE fois, donc une seule ouverture du modal de notation.
  const callEndedRef = useRef(false);
  // Garde-fou DÉDIÉ anti-double-notation, distinct de callEndedRef. callEndedRef est RÉARMÉ
  // (remis à false) par handleCallNextFan pour le fan suivant ; or un événement Daily RÉSIDUEL
  // (left-meeting/participant-left émis par l'objet d'appel détruit) peut re-déclencher
  // handleCallEnded APRÈS ce réarmement et rouvrir une 2e fois l'overlay/RatingModal pour le
  // MÊME appel déjà terminé. Ce ref, lui, n'est remis à false QUE lorsqu'un NOUVEAU fan a
  // réellement rejoint la visio -> garantit UNE SEULE notation par appel.
  const ratingHandledForCallRef = useRef(false);
  // CÔTÉ HÔTE — id de l'entrée de file du fan ACTUELLEMENT en appel. CRUCIAL pour la capture
  // serveur fiable : on doit résoudre le paiement du fan QUI VIENT DE TERMINER, pas du suivant.
  // Initialisé au 1er fan (params.queueEntryId), mis à jour à chaque passage au fan suivant
  // dans handleCallNextFan APRÈS avoir déclenché la capture du fan précédent.
  const currentHostFanEntryIdRef = useRef<string | null>(params.queueEntryId || null);
  // Garde-fou anti-double-résolution côté serveur : ids de fans déjà envoyés à /api/end-fan-call.
  const endFanCallResolvedIdsRef = useRef<Set<string>>(new Set());
  // Compteur LOCAL (côté hôte) des fans réellement rencontrés (appel ayant réellement eu lieu)
  // sur toute la session. Plus fiable que le serveur pour le résumé de fin : le flag
  // payment_captured est écrit par le FAN en différé (course entre les 2 téléphones) -> il vaut
  // souvent 0 à l'instant où l'hôte affiche le résumé. Ce compteur, lui, est immédiat.
  const fansServedRef = useRef(0);
  const [waitingForNextFan, setWaitingForNextFan] = useState(false);
  // Bouton « Bloquer ce fan » de l'overlay hostEndedEarly : passe à true une fois cliqué.
  const [fanBlockedDone, setFanBlockedDone] = useState(false);
  const [currentFanName, setCurrentFanName] = useState(params.otherUserName || 'Fan');
  const [fansRemainingCount, setFansRemainingCount] = useState(parseInt(params.fansRemaining || '0', 10));

  // --- Moteur vidéo natif (mobile) ---
  const [participants, setParticipants] = useState<Record<string, NativeParticipant>>({});
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  // --- End-of-session summary (replaces the basic system alert) ---
  const sessionStartTimeRef = useRef<number>(Date.now());
  const [showEndSummary, setShowEndSummary] = useState(false);
  const [summaryDurationMin, setSummaryDurationMin] = useState(0);
  const [summaryFansMet, setSummaryFansMet] = useState(0);
  const [summaryEarningsCents, setSummaryEarningsCents] = useState(0);

  const openEndSummary = useCallback(async () => {
    // Durée de session (depuis l'ouverture de l'appel vidéo de la célébrité)
    const elapsedMin = Math.max(0, Math.round((Date.now() - sessionStartTimeRef.current) / 60000));
    setSummaryDurationMin(elapsedMin);

    // 1) AFFICHAGE IMMÉDIAT basé sur le compteur LOCAL fiable (fans réellement rencontrés sur la
    //    session). Revenus provisoires = fans rencontrés x (prix - 15% de commission). Très proche
    //    du réel : pas de dépendance au flag payment_captured que le fan écrit en différé.
    const pricePerFan = parseInt(params.priceCents || '0', 10);
    const netPerFanCents = Math.round(pricePerFan * 0.85); // 85% pour la célébrité (15% Clickzou)
    const localFans = fansServedRef.current;
    setSummaryFansMet(localFans);
    setSummaryEarningsCents(localFans * netPerFanCents);
    setShowEndSummary(true);

    // 2) RÉCONCILIATION avec le serveur (/api/session-earnings = source officielle, mais alimentée
    //    par la capture côté fan, qui arrive avec quelques secondes de décalage). On réessaie
    //    plusieurs fois et on remplace par la valeur serveur dès qu'elle rattrape/dépasse le local.
    if (params.sessionId && STRIPE_SERVER_URL) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const response = await fetch(`${STRIPE_SERVER_URL}/api/session-earnings?session_id=${params.sessionId}`);
          const data = await response.json();
          const srvFans = typeof data.captured_count === 'number' ? data.captured_count : 0;
          const srvCents = typeof data.total_captured_cents === 'number' ? data.total_captured_cents : 0;
          if (srvFans >= localFans) {
            setSummaryFansMet(srvFans);
            setSummaryEarningsCents(srvCents);
            break;
          }
        } catch (e) {
          console.warn('[VideoCall] session-earnings: nouvelle tentative', attempt + 1, 'échouée (réseau ?)');
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }, [params.sessionId, params.priceCents]);

  const closeEndSummary = useCallback(() => {
    setShowEndSummary(false);
    router.replace({
      pathname: '/live-session-dashboard',
      params: { sessionId: params.sessionId },
    });
  }, [params.sessionId, router]);

  const formatSummaryDuration = (min: number): string => {
    if (min >= 60) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${min} min`;
  };

  useEffect(() => {
    if (ScreenOrientation) {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      ).catch(() => {});
      return () => {
        ScreenOrientation.unlockAsync().catch(() => {});
      };
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Garde otherParticipantJoinedRef synchronisé avec l'état (lu dans des handlers async).
  useEffect(() => {
    otherParticipantJoinedRef.current = otherParticipantJoined;
  }, [otherParticipantJoined]);

  // FIX 2 : message affiché au fan quand la célébrité termine la session pendant l'attente.
  const [sessionEndedByCelebrity, setSessionEndedByCelebrity] = useState(false);
  // Message affiché à la CÉLÉBRITÉ quand ELLE écourte l'appel (raccroche avant la fin) :
  // dans ce cas elle n'est PAS créditée (le fan est remboursé). Voir handleCallEnded.
  const [hostEndedEarly, setHostEndedEarly] = useState(false);
  // Message affiché à la CÉLÉBRITÉ quand c'est le FAN qui raccroche avant la fin alors que
  // l'appel a bien eu lieu : elle est QUAND MÊME créditée (ce n'est pas de sa faute). Le
  // bouton OK enchaîne le flux normal (notation puis fan suivant / dashboard).
  const [fanEndedEarly, setFanEndedEarly] = useState(false);
  // Vrai quand la pré-autorisation a été LIBÉRÉE (appel non eu) -> message rassurant au fan.
  const [paymentWasReleased, setPaymentWasReleased] = useState(false);
  const sessionEndedHandledRef = useRef(false);

  // Le fan (et la célébrité) écoute le statut de la session. Si elle passe 'ended'
  // alors que l'appel n'a pas eu lieu, on libère la pré-autorisation et on sort proprement.
  useEffect(() => {
    if (!params.sessionId) return;
    // Côté célébrité (host), c'est elle qui pilote la fin -> pas de message ni d'annulation ici.
    if (params.isHost === 'true') return;

    const channel = subscribeToSession(params.sessionId, (updated) => {
      if (updated.status !== 'ended' || sessionEndedHandledRef.current) return;
      sessionEndedHandledRef.current = true;

      // La CÉLÉBRITÉ a terminé la session -> le fan est REMBOURSÉ (règle métier), que
      // l'appel ait eu lieu ou non. On libère la pré-autorisation. Garde-fou
      // `!paymentResolvedRef.current` : si le paiement a DÉJÀ été capturé (appel complet
      // débité avant l'arrêt), on ne libère pas et on n'affiche pas « non débité » à tort.
      const priceCents = parseInt(params.priceCents || '0', 10);
      if (priceCents > 0 && params.checkoutSessionId && !paymentResolvedRef.current) {
        cancelPaymentAuthorization();
        setPaymentWasReleased(true);
      }

      setSessionEndedByCelebrity(true);

      // Coupe l'appel en cours s'il y en a un, puis sort vers l'accueil après un court délai.
      const call = dailyCallFrameRef.current;
      if (call) {
        try {
          call.leave?.().catch?.(() => {});
          call.destroy?.().catch?.(() => {});
        } catch {}
        dailyCallFrameRef.current = null;
      }
      setShowRatingModal(false);

      // L'overlay « session terminée / carte non débitée » RESTE affiché ; le fan sort
      // uniquement via le bouton Retour.
    });

    return () => {
      try {
        channel?.unsubscribe?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sessionId, params.isHost]);

  // Demande la permission native caméra + micro AVANT de rejoindre l'appel Daily.
  // Indispensable sur Android : sans la popup système RECORD_AUDIO, le SDK natif
  // échoue à ouvrir le micro (NotReadableError) et la caméra reste morte.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;

    (async () => {
      try {
        let camGranted = false;
        let micGranted = false;

        // 1) Sur Android, on demande EXPLICITEMENT caméra ET micro au niveau OS via
        //    PermissionsAndroid.requestMultiple (vraie popup système RECORD_AUDIO).
        if (Platform.OS === 'android') {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { PermissionsAndroid } = require('react-native');
            if (PermissionsAndroid?.requestMultiple) {
              const res = await PermissionsAndroid.requestMultiple([
                'android.permission.CAMERA',
                'android.permission.RECORD_AUDIO',
              ]);
              camGranted = res['android.permission.CAMERA'] === 'granted';
              micGranted = res['android.permission.RECORD_AUDIO'] === 'granted';
            }
          } catch (e) {
            console.warn('[VideoCall] PermissionsAndroid request failed:', e);
          }
        }

        // 2) En complément (et seul chemin sur iOS), expo-camera : caméra + micro.
        if (ExpoCamera?.requestCameraPermissionsAsync) {
          if (!camGranted) {
            const cam = await ExpoCamera.requestCameraPermissionsAsync();
            camGranted = !!cam?.granted;
          }
          if (!micGranted && ExpoCamera.requestMicrophonePermissionsAsync) {
            const mic = await ExpoCamera.requestMicrophonePermissionsAsync();
            micGranted = !!mic?.granted;
          }
        } else if (Platform.OS !== 'android') {
          camGranted = true;
          micGranted = true;
        }

        if (!cancelled) {
          setMediaPermission(camGranted && micGranted ? 'granted' : 'denied');
        }
      } catch (e) {
        console.error('[VideoCall] Error requesting camera/mic permission:', e);
        if (!cancelled) setMediaPermission('denied');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // parseFloat (pas parseInt) : la durée peut être décimale (0.5 = 30 s). parseInt('0.5')
    // donnerait 0 et casserait le minuteur.
    const durationMinutes = parseFloat(params.durationPerFan || '5');
    if (!durationMinutes || !otherParticipantJoined) return;
    // L'appel est déjà terminé (raccrochage, départ d'un participant, timer atteint) :
    // on ne (re)lance PAS le minuteur -> il ne tourne plus en fond après la fin de l'appel.
    if (hasLeftCall || callEndedRef.current) return;

    if (callStartTime.current === 0) {
      callStartTime.current = Date.now();
    }

    const durationMs = durationMinutes * 60 * 1000;

    const interval = setInterval(() => {
      // Garde-fou synchrone : si l'appel s'est terminé entre deux tics, on coupe le minuteur
      // immédiatement (callEndedRef est posé AVANT le re-render qui flippe hasLeftCall).
      if (callEndedRef.current) {
        clearInterval(interval);
        return;
      }

      const endTime = callStartTime.current + durationMs;
      const now = Date.now();
      const diff = Math.max(0, endTime - now);

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setFanTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      setTimeProgress(diff / durationMs);
      setTimeWarning(diff < 60000 && diff > 0);

      if (diff <= 0 && !autoEndTriggered.current) {
        autoEndTriggered.current = true;
        callEndReason.current = 'timer';
        handleCallEnded();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [params.durationPerFan, otherParticipantJoined, hasLeftCall]);

  const isHost = params.isHost === 'true';
  const userName = params.userName || (isHost ? 'Host' : 'Guest');

  // ----------------------------------------------------------------------------
  // MOTEUR VIDÉO NATIF (mobile) : createCallObject + events + join.
  // S'appuie sur l'ancien app/video-call.tsx (réf : _ref_native_videocall.bak.tsx).
  // ----------------------------------------------------------------------------

  // Met à jour la liste des participants depuis l'objet d'appel natif, et déclenche
  // otherParticipantJoined dès qu'un participant DISTANT (non-local) est présent.
  const refreshParticipants = useCallback(() => {
    const call = dailyCallFrameRef.current;
    if (!call) return;
    try {
      const next = call.participants() as Record<string, NativeParticipant>;
      setParticipants({ ...next });
      const hasRemote = Object.values(next).some((p) => !p.local);
      if (hasRemote) {
        setOtherParticipantJoined(true);
      }
    } catch {}
  }, []);

  const initNativeCall = useCallback(async () => {
    if (!DailyNative) {
      console.error('[VideoCall] SDK natif non charge:', DailyLoadError);
      setError(t('videoCallError'));
      setIsLoading(false);
      return;
    }
    if (!params.roomUrl) {
      console.error('[VideoCall] room_url manquante');
      setError(t('videoCallError'));
      setIsLoading(false);
      return;
    }
    try {
      // Réutilise l'objet d'appel s'il existe déjà (cas "fan suivant").
      let call = dailyCallFrameRef.current;
      if (!call) {
        call = DailyNative.createCallObject({
          audioSource: true,
          videoSource: true,
        });
        dailyCallFrameRef.current = call;

        call.on('joined-meeting', () => {
          setIsLoading(false);
          refreshParticipants();
        });
        call.on('participant-joined', refreshParticipants);
        call.on('participant-updated', refreshParticipants);
        call.on('participant-left', () => {
          refreshParticipants();
          const c = dailyCallFrameRef.current;
          if (!c) return;
          try {
            const ps = c.participants() as Record<string, NativeParticipant>;
            const remoteCount = Object.values(ps).filter((p) => !p.local).length;
            // IMPORTANT : on lit le REF synchrone (otherParticipantJoinedRef), pas la
            // variable de closure `otherParticipantJoined` qui est FIGÉE à false (le
            // listener est enregistré une seule fois, au join, avant l'arrivée du fan).
            // Sans ça, côté hôte, le départ du fan n'était jamais détecté ici -> le reason
            // restait 'unknown', l'appel ne se terminait pas, et la célébrité finissait par
            // raccrocher manuellement -> 'celebrity_hangup' -> overlay hostEndedEarly à tort.
            if (remoteCount === 0 && otherParticipantJoinedRef.current) {
              // Un participant DISTANT était présent et vient de partir : c'est le FAN qui a
              // raccroché (host) / la CÉLÉBRITÉ qui a raccroché (fan). On pose le reason AVANT
              // handleCallEnded, et on ÉCRASE un éventuel 'unknown'/'fan_hangup' antérieur :
              // le départ effectif du participant fait foi.
              const departReason = isHost ? 'fan_left' : 'celebrity_left';
              if (callEndReason.current === 'unknown' || callEndReason.current === departReason) {
                callEndReason.current = departReason;
              }
              handleCallEnded();
            }
          } catch {}
        });
        call.on('left-meeting', () => {
          handleCallEndedRef.current();
        });
        call.on('error', (ev: any) => {
          console.error('[VideoCall] Daily native error:', ev);
          setError(ev?.errorMsg || t('videoCallError'));
          setIsLoading(false);
        });
      }

      await call.join({
        url: params.roomUrl,
        token: params.token || undefined,
        userName,
      });
      refreshParticipants();
    } catch (err: any) {
      console.error('[VideoCall] Failed to init native call:', err);
      setError(t('videoCallError'));
      setIsLoading(false);
    }
  }, [params.roomUrl, params.token, userName, refreshParticipants, isHost, otherParticipantJoined, t]);

  // Lance l'appel natif une fois la permission accordée (mobile uniquement).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (mediaPermission !== 'granted') return;
    if (dailyCallFrameRef.current) return; // déjà initialisé
    initNativeCall();
  }, [mediaPermission, initNativeCall]);

  // Nettoyage à la destruction de l'écran.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    return () => {
      const call = dailyCallFrameRef.current;
      if (call) {
        try {
          call.leave().catch(() => {});
          call.destroy().catch(() => {});
        } catch {}
        dailyCallFrameRef.current = null;
      }
    };
  }, []);

  const switchCamera = useCallback(() => {
    const call = dailyCallFrameRef.current;
    if (call?.cycleCamera) {
      call.cycleCamera().catch(() => {});
      setIsFrontCamera((prev) => !prev);
    }
  }, []);

  // Handlers mémoïsés (référence stable). handleCallEnded est défini plus bas mais
  // référencé via un ref pour garder une identité stable.
  const handleCallEndedRef = useRef<() => void>(() => {});

  const handleCallEnded = () => {
    // Garde-fou synchrone : si la fin a déjà été traitée (un autre listener Daily a tiré dans le
    // même tick), on sort immédiatement -> évite que le modal de notation s'ouvre deux fois.
    if (callEndedRef.current) return;
    // 2e garde-fou DÉDIÉ : empêche un événement Daily RÉSIDUEL (left-meeting/participant-left de
    // l'objet d'appel détruit) de re-terminer le MÊME appel APRÈS que handleCallNextFan a réarmé
    // callEndedRef pour le fan suivant. Tant qu'un NOUVEAU fan n'a pas rejoint, on ne ré-ouvre
    // ni l'overlay fanEndedEarly ni le RatingModal -> une seule notation par appel.
    if (ratingHandledForCallRef.current) return;
    callEndedRef.current = true;
    if (!hasLeftCall) {
      setHasLeftCall(true);

      if (dailyCallFrameRef.current) {
        try {
          dailyCallFrameRef.current.leave().catch(() => {});
          dailyCallFrameRef.current.destroy().catch(() => {});
        } catch {}
        dailyCallFrameRef.current = null;
      }

      // Côté FAN, si c'est la CÉLÉBRITÉ qui a mis fin à l'appel (raccroché ou arrêt de
      // la session) : on affiche un message clair, on LIBÈRE le paiement (remboursement
      // intégral) et on sort SANS demander de notation (l'appel a été écourté par elle,
      // pas une fin normale).
      const reason = callEndReason.current;
      if (
        !isHost &&
        (reason === 'celebrity_left' || reason === 'celebrity_hangup') &&
        !sessionEndedHandledRef.current
      ) {
        sessionEndedHandledRef.current = true;
        const priceCents = parseInt(params.priceCents || '0', 10);
        if (priceCents > 0 && params.checkoutSessionId && !paymentResolvedRef.current) {
          cancelPaymentAuthorization();
          setPaymentWasReleased(true);
        }
        setSessionEndedByCelebrity(true);
        // L'overlay RESTE affiché ; le fan sort uniquement via le bouton Retour.
        return;
      }

      // Côté CÉLÉBRITÉ (host) : si c'est ELLE qui a raccroché AVANT la fin de la session
      // (raccrochage manuel, et NON le timer qui atteint la durée), elle ne sera PAS
      // créditée (le fan est remboursé). On l'en informe clairement puis on sort SANS
      // demander de notation. Garde-fou : on n'entre ici que pour 'celebrity_hangup'
      // (le cas 'timer' = durée atteinte = paiement normal n'est PAS concerné).
      if (isHost && reason === 'celebrity_hangup') {
        ratingHandledForCallRef.current = true;
        // Célébrité raccroche -> LIBÉRATION (callHappened=false), fan non débité.
        endFanCallOnServer(currentHostFanEntryIdRef.current, false);
        setHostEndedEarly(true);
        // L'overlay RESTE affiché ; la célébrité sort uniquement via le bouton Retour.
        return;
      }

      // Côté hôte : si l'appel a RÉELLEMENT eu lieu (le fan a rejoint la visio), on compte ce
      // fan comme rencontré pour le résumé de fin de session. Compteur local immédiat et fiable,
      // indépendant du flag payment_captured que le fan écrit en différé.
      if (isHost && otherParticipantJoinedRef.current) {
        fansServedRef.current += 1;
      }

      // Côté HÔTE — déclencheur de paiement FIABLE et indépendant du fan. callHappened suit la
      // MÊME logique que shouldChargeFan : l'appel a eu lieu ET la fin est normale (timer) ou
      // c'est le fan qui a raccroché/quitté. On résout LE fan courant (currentHostFanEntryIdRef),
      // celui qui vient de terminer — surtout pas le suivant.
      if (isHost) {
        const callHappened =
          otherParticipantJoinedRef.current &&
          (reason === 'timer' || reason === 'fan_hangup' || reason === 'fan_left');
        endFanCallOnServer(currentHostFanEntryIdRef.current, callHappened);
      }

      // Côté CÉLÉBRITÉ (host) : si c'est le FAN qui a raccroché AVANT la fin alors que l'appel
      // a bien eu lieu, on affiche un overlay rassurant ("le fan a raccroché, tu es quand même
      // créditée") AU LIEU d'ouvrir directement la notation. Le bouton OK de cet overlay
      // enchaîne ensuite le flux normal (RatingModal -> fan suivant / dashboard).
      if (
        isHost &&
        otherParticipantJoinedRef.current &&
        (reason === 'fan_left' || reason === 'fan_hangup')
      ) {
        // Notation gérée pour CET appel : aucun événement Daily résiduel ne pourra ré-ouvrir
        // l'overlay/RatingModal tant qu'un nouveau fan n'a pas rejoint (reset dans l'effet join).
        ratingHandledForCallRef.current = true;
        setFanEndedEarly(true);
        return;
      }

      ratingHandledForCallRef.current = true;
      setShowRatingModal(true);
    }
  };

  // Garde le ref à jour pour que les handlers Daily appellent toujours la version
  // courante de handleCallEnded.
  handleCallEndedRef.current = handleCallEnded;

  const leaveCall = () => {
    if (callEndReason.current === 'unknown') {
      // Un vrai clic « Raccrocher » ne vaut 'celebrity_hangup'/'fan_hangup' QUE si l'autre
      // est ENCORE là. Si le participant distant est DÉJÀ parti (le fan a raccroché en
      // premier, mais 'participant-left' n'a pas encore posé le reason -> race), alors ce
      // n'est PAS la célébrité qui écourte : c'est le fan qui est parti. On pose 'fan_left'
      // (côté hôte) / 'celebrity_left' (côté fan) pour NE PAS afficher hostEndedEarly à tort
      // et créditer/débiter normalement.
      let remoteStillPresent = false;
      try {
        const c = dailyCallFrameRef.current;
        if (c?.participants) {
          const ps = c.participants() as Record<string, NativeParticipant>;
          remoteStillPresent = Object.values(ps).some((p) => p && !p.local);
        }
      } catch {}

      if (otherParticipantJoinedRef.current && !remoteStillPresent) {
        // L'appel a eu lieu et l'autre est déjà parti -> c'est lui qui a raccroché.
        callEndReason.current = isHost ? 'fan_left' : 'celebrity_left';
      } else {
        // L'autre est encore là (ou l'appel n'a jamais eu lieu) -> vrai raccrochage manuel.
        callEndReason.current = isHost ? 'celebrity_hangup' : 'fan_hangup';
      }
    }
    handleCallEnded();
  };

  const handleSubmitRating = async (rating: number, comment: string, blockFan?: boolean) => {
    // Si la célébrité a coché « Bloquer ce fan » : on bloque (fire-and-forget, n'impacte
    // ni la notation ni le paiement / flux d'appel).
    if (blockFan && isHost) {
      blockCurrentFan().catch((e) => console.error('[VideoCall] blockFan on rating error:', e));
    }
    try {
      const myDeviceId = await getOrCreateDeviceId();
      const otherUserId = params.otherUserId || (isHost ? 'fan_unknown' : params.sessionId || 'celebrity_unknown');

      await submitRating(
        params.sessionId || '',
        params.queueEntryId || null,
        myDeviceId,
        isHost ? 'celebrity' : 'fan',
        otherUserId,
        isHost ? 'fan' : 'celebrity',
        rating,
        comment
      );
    } catch (error) {
      console.error('Error submitting rating:', error);
    }
  };

  // Annule (libère) la pré-autorisation Stripe : appelé quand l'appel n'a PAS eu lieu
  // (aucun participant distant) ou que la célébrité a terminé tôt. Ne débite JAMAIS le fan.
  const cancelPaymentAuthorization = async () => {
    if (!params.checkoutSessionId || paymentResolvedRef.current) return;
    paymentResolvedRef.current = true;
    try {
      console.log('[VideoCall] Cancelling payment authorization for:', params.checkoutSessionId);
      await fetch(`${STRIPE_SERVER_URL}/api/cancel-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_session_id: params.checkoutSessionId }),
      });
    } catch (e) {
      console.error('[VideoCall] Error cancelling payment:', e);
      paymentResolvedRef.current = false;
    }
  };

  const capturePaymentAfterCall = async () => {
    if (!params.checkoutSessionId || paymentCaptured || paymentResolvedRef.current) return;

    paymentResolvedRef.current = true;
    setPaymentCaptured(true);

    try {
      console.log('[VideoCall] Capturing payment for checkout session:', params.checkoutSessionId);
      const response = await fetch(`${STRIPE_SERVER_URL}/api/capture-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_session_id: params.checkoutSessionId }),
      });
      const data = await response.json();

      if (data.captured) {
        const amountEuros = data.amount ? (data.amount / 100).toFixed(2) : (parseInt(params.priceCents || '0', 10) / 100).toFixed(2);
        console.log('[VideoCall] Payment captured successfully:', amountEuros, '€');
      } else {
        console.error('[VideoCall] Payment capture failed:', data);
        setPaymentCaptured(false);
        paymentResolvedRef.current = false;
      }
    } catch (error) {
      console.error('[VideoCall] Error capturing payment:', error);
      setPaymentCaptured(false);
      paymentResolvedRef.current = false;
    }
  };

  // CÔTÉ HÔTE — Déclencheur FIABLE et INDÉPENDANT DU FAN. Demande au serveur de capturer
  // (callHappened=true) ou de libérer (callHappened=false) le paiement du fan dont l'appel
  // vient de se terminer. Fire-and-forget : ne bloque jamais l'UI. Idempotent côté serveur
  // (protégé contre la double capture), et anti-double localement via endFanCallResolvedIdsRef.
  const endFanCallOnServer = (queueEntryId: string | null, callHappened: boolean) => {
    // CLÔTURE DE LA FILE — indépendante du paiement. À la fin de CHAQUE appel côté hôte
    // (y compris le DERNIER fan, ou quand on raccroche sans appeler de « fan suivant »), on
    // passe l'entrée de file à 'completed' pour qu'elle ne reste pas 'called' indéfiniment
    // (sinon : fan affiché « Appelé », compteur > 0, bannière « un fan vous attend »).
    // Fire-and-forget + idempotent (completeFan ignore une entrée déjà 'completed').
    if (queueEntryId) {
      try {
        completeFan(queueEntryId).catch((e) =>
          console.error('[VideoCall] completeFan error:', e)
        );
      } catch (e) {
        console.error('[VideoCall] completeFan threw:', e);
      }
    }

    const priceCents = parseInt(params.priceCents || '0', 10);
    if (priceCents <= 0 || !queueEntryId || !STRIPE_SERVER_URL) return;
    if (endFanCallResolvedIdsRef.current.has(queueEntryId)) return;
    endFanCallResolvedIdsRef.current.add(queueEntryId);
    try {
      fetch(`${STRIPE_SERVER_URL}/api/end-fan-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueEntryId,
          callHappened,
          sessionId: params.sessionId,
        }),
      }).catch((e) => console.error('[VideoCall] end-fan-call error:', e));
    } catch (e) {
      console.error('[VideoCall] end-fan-call threw:', e);
    }
  };

  // CÔTÉ HÔTE — Bloque le fan ACTUELLEMENT en appel (harcèlement / injures).
  // Résout celebrity_id = auth.uid() de la célébrité connectée, et le fan_id (format
  // `fan_user_...`) depuis l'entrée session_queue courante (currentHostFanEntryIdRef).
  // Fire-and-forget : ne bloque jamais l'UI ni le flux d'appel / paiement.
  const blockCurrentFan = async (): Promise<boolean> => {
    if (!isHost) return false;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const celebrityId = authData?.user?.id;
      if (!celebrityId) return false;

      // Récupère le VRAI fan_id (et son nom) depuis l'entrée de file en cours.
      let fanId: string | null = null;
      let fanName: string | null = currentFanName || null;
      const entryId = currentHostFanEntryIdRef.current || params.queueEntryId || null;
      if (entryId) {
        const { data: entry } = await supabase
          .from('session_queue')
          .select('fan_id, fan_name')
          .eq('id', entryId)
          .maybeSingle();
        if (entry) {
          fanId = (entry as { fan_id?: string }).fan_id || null;
          fanName = (entry as { fan_name?: string }).fan_name || fanName;
        }
      }
      // Repli : id de l'autre participant transmis en param (peut déjà être au format fan_user_).
      if (!fanId) {
        fanId = params.otherUserId || null;
      }
      if (!fanId) return false;

      return await blockFanInDb(celebrityId, fanId, fanName);
    } catch (e) {
      console.error('[VideoCall] blockCurrentFan error:', e);
      return false;
    }
  };

  const handleCallNextFan = async () => {
    if (!params.sessionId) {
      router.back();
      return;
    }

    setWaitingForNextFan(true);
    setOtherParticipantJoined(false);
    callStartTime.current = 0;
    autoEndTriggered.current = false;
    callEndReason.current = 'unknown';
    callEndedRef.current = false;
    setHasLeftCall(false);
    setFanTimeRemaining(formatClock(parseFloat(params.durationPerFan || '5')));
    setTimeProgress(1);
    setTimeWarning(false);

    try {
      const nextFan = await callNextFan(params.sessionId);
      if (nextFan) {
        // Le fan précédent a déjà été résolu côté serveur dans handleCallEnded (appelé AVANT
        // handleCallNextFan). On bascule maintenant le ref sur le NOUVEAU fan en appel, pour que
        // la prochaine fin d'appel capture/libère le bon (et pas le précédent ni le suivant).
        currentHostFanEntryIdRef.current = nextFan.id;
        setCurrentFanName(nextFan.fan_name || 'Fan');
        setFansRemainingCount(prev => Math.max(0, prev - 1));
      } else {
        setWaitingForNextFan(false);
        if (dailyCallFrameRef.current) {
          try {
            dailyCallFrameRef.current.leave().catch(() => {});
            dailyCallFrameRef.current.destroy().catch(() => {});
          } catch {}
          dailyCallFrameRef.current = null;
        }
        setHasLeftCall(true);
        openEndSummary();
      }
    } catch (error) {
      console.error('[VideoCall] Error calling next fan:', error);
      setWaitingForNextFan(false);
      if (dailyCallFrameRef.current) {
        try {
          dailyCallFrameRef.current.leave().catch(() => {});
          dailyCallFrameRef.current.destroy().catch(() => {});
        } catch {}
        dailyCallFrameRef.current = null;
      }
      setHasLeftCall(true);
      router.replace({
        pathname: '/live-session-dashboard',
        params: { sessionId: params.sessionId },
      });
    }
  };

  useEffect(() => {
    if (waitingForNextFan && otherParticipantJoined) {
      setWaitingForNextFan(false);
      // Un NOUVEAU fan a réellement rejoint la visio : on ré-arme le garde-fou de notation
      // pour ce nouvel appel (il sera de nouveau noté une seule fois à sa fin). On ne le
      // ré-arme JAMAIS de façon synchrone dans handleCallNextFan, sinon un événement Daily
      // résiduel de l'appel précédent rouvrirait une 2e notation.
      ratingHandledForCallRef.current = false;
    }
  }, [waitingForNextFan, otherParticipantJoined]);

  useEffect(() => {
    if (!waitingForNextFan) return;
    const timeout = setTimeout(() => {
      if (waitingForNextFan) {
        setWaitingForNextFan(false);
        if (dailyCallFrameRef.current) {
          try {
            dailyCallFrameRef.current.leave().catch(() => {});
            dailyCallFrameRef.current.destroy().catch(() => {});
          } catch {}
          dailyCallFrameRef.current = null;
        }
        setHasLeftCall(true);
        openEndSummary();
      }
    }, 120000);
    return () => clearTimeout(timeout);
  }, [waitingForNextFan]);

  // FIX — Célébrité (host) qui a lancé l'appel avec une file VIDE : aucun fan n'a été mis en
  // 'called', donc personne ne bascule dans la visio. Tant qu'AUCUN participant distant n'a
  // rejoint, on poll la file (toutes les 3 s) ; dès qu'un fan 'waiting' apparaît ET qu'AUCUN
  // n'est déjà 'called'/'in_call', on l'appelle via callNextFan (-> statut 'called'), ce qui
  // déclenche sa bascule visio côté fan. Le polling s'arrête dès qu'un participant a rejoint.
  //
  // Garde-fous anti-double-appel / anti-régression :
  //  - on ne tourne QUE si host, AUCUN participant distant, pas en "fan suivant", appel pas terminé ;
  //  - on n'appelle callNextFan QUE s'il n'y a PAS déjà un fan 'called'/'in_call' (sinon callNextFan
  //    marquerait ce fan 'completed' et le sauterait — c'est le flux nominal "fan déjà présent") ;
  //  - un ref synchrone (hostQueuePollBusyRef) évite deux appels concurrents de callNextFan.
  const hostQueuePollBusyRef = useRef(false);
  useEffect(() => {
    if (!isHost) return;
    if (!params.sessionId) return;
    if (otherParticipantJoined) return;
    if (waitingForNextFan || hasLeftCall || isLoading) return;

    let cancelled = false;

    const pollAndCallWaitingFan = async () => {
      // Garde-fous synchrones : ne rien faire si un participant a rejoint entre-temps,
      // ou si un appel à callNextFan est déjà en cours.
      if (cancelled || otherParticipantJoinedRef.current || hostQueuePollBusyRef.current) return;
      hostQueuePollBusyRef.current = true;
      try {
        const fullQueue = await getFullQueue(params.sessionId);
        // Si un fan est DÉJÀ appelé/en appel, on ne touche à rien : c'est le flux nominal
        // (le fan a été appelé au démarrage et est en train de rejoindre la visio).
        const alreadyActive = fullQueue.some(
          (e) => e.status === 'called' || e.status === 'in_call'
        );
        if (alreadyActive) return;

        const hasWaiting = fullQueue.some((e) => e.status === 'waiting');
        if (!hasWaiting) return;

        // Re-vérifie juste avant l'appel (le participant a pu rejoindre entre-temps).
        if (cancelled || otherParticipantJoinedRef.current) return;

        const nextFan = await callNextFan(params.sessionId);
        if (nextFan && !cancelled) {
          // Garde le ref du fan courant à jour : ce fan (appelé par le polling d'une file
          // initialement vide) est désormais celui dont l'appel devra être résolu côté serveur.
          currentHostFanEntryIdRef.current = nextFan.id;
          setCurrentFanName(nextFan.fan_name || 'Fan');
        }
      } catch (e) {
        console.warn('[VideoCall] host queue poll failed:', e);
      } finally {
        hostQueuePollBusyRef.current = false;
      }
    };

    // Premier passage immédiat puis toutes les 3 s.
    pollAndCallWaitingFan();
    const interval = setInterval(pollAndCallWaitingFan, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isHost, params.sessionId, otherParticipantJoined, waitingForNextFan, hasLeftCall, isLoading]);

  const handleRatingModalClose = async () => {
    setShowRatingModal(false);
    if (!isHost && params.sessionId) {
      const priceCents = parseInt(params.priceCents || '0', 10);
      const reason = callEndReason.current;
      // L'appel n'a réellement EU LIEU que si un participant distant a rejoint.
      // Sans ça, le fan ne doit JAMAIS être débité (timer qui expire pendant l'attente,
      // raccroché avant connexion, etc.).
      const callReallyHappened = otherParticipantJoinedRef.current;
      const shouldChargeFan =
        callReallyHappened &&
        (reason === 'timer' || reason === 'fan_hangup' || reason === 'fan_left');

      console.log(
        '[VideoCall] Call end reason:', reason,
        '| Call really happened:', callReallyHappened,
        '| Charge fan:', shouldChargeFan
      );

      if (priceCents > 0 && shouldChargeFan) {
        if (params.checkoutSessionId) {
          await capturePaymentAfterCall();
        }

        if (params.queueEntryId) {
          markPaymentCaptured(params.queueEntryId, true).catch((err) =>
            console.error('[VideoCall] Error marking payment_captured:', err)
          );
        }

        const fanDeviceId = await getOrCreateDeviceId();
        const storePlatform = Platform.OS === 'ios' ? 'apple' : 'google';
        recordTransaction({
          sessionId: params.sessionId,
          fanId: fanDeviceId,
          fanName: params.userName || undefined,
          celebrityId: params.celebrityId || params.otherUserId || '',
          celebrityName: params.otherUserName || 'Celebrity',
          grossAmountCents: priceCents,
          currency: 'EUR',
          platform: storePlatform,
        }).catch((err) => console.error('Error recording transaction:', err));
      } else if (priceCents > 0 && !shouldChargeFan && params.checkoutSessionId) {
        // Pas de débit (appel jamais eu lieu OU célébrité a terminé tôt) -> on LIBÈRE
        // la pré-autorisation. cancelPaymentAuthorization est protégé contre la double
        // annulation et ne s'exécute jamais si une capture a déjà eu lieu.
        await cancelPaymentAuthorization();
      }

      console.log('[VideoCall] Fan call ended, navigating to dedication-result for session:', params.sessionId);

      // Notification "dédicace prête" envoyée de DEUX façons, pour fiabiliser :
      //  1) depuis le serveur (fiable même si l'app se ferme juste après),
      //  2) depuis le téléphone (fallback immédiat si le serveur est injoignable).
      if (STRIPE_SERVER_URL) {
        fetch(`${STRIPE_SERVER_URL}/api/notify-dedication`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: params.sessionId,
            queueEntryId: params.queueEntryId || null,
            celebrityName: params.otherUserName || 'Celebrity',
            message: t('dedicationNotificationBody'),
          }),
        }).catch((e) => console.error('[VideoCall] Server dedication notify error:', e));
      }

      sendDedicationNotification(
        params.sessionId,
        params.queueEntryId || null,
        params.otherUserName || 'Celebrity',
        t('dedicationNotificationBody')
      ).catch((e) => console.error('[VideoCall] Dedication notification error:', e));

      router.replace({
        pathname: '/dedication-result',
        params: {
          sessionId: params.sessionId,
          fanName: params.userName || '',
          celebrityName: params.otherUserName || '',
          queueEntryId: params.queueEntryId || '',
        },
      });
    } else if (isHost) {
      await handleCallNextFan();
    } else {
      router.back();
    }
  };

  // ----------------------------------------------------------------------------
  // RENDU
  // ----------------------------------------------------------------------------

  // Sépare le participant local (soi) du participant distant (l'autre) pour le
  // layout type WhatsApp : l'autre en plein écran, soi en petit PiP arrondi.
  const allParticipants = Object.values(participants);
  const localParticipant = allParticipants.find((p) => p.local) || null;
  const remoteParticipant = allParticipants.find((p) => !p.local) || null;

  const getVideoTrack = (p: NativeParticipant | null) => {
    if (!p) return null;
    const v = p.tracks?.video;
    if (!v) return null;
    if (v.state === 'playable') {
      return v.persistentTrack || v.track || null;
    }
    return null;
  };

  const renderNativeTile = (
    p: NativeParticipant | null,
    opts: { full: boolean }
  ) => {
    const track = getVideoTrack(p);
    if (track && DailyMediaView) {
      return (
        <DailyMediaView
          videoTrack={track}
          audioTrack={p && !p.local ? p.tracks?.audio?.persistentTrack || p.tracks?.audio?.track || null : null}
          mirror={!!(p && p.local && isFrontCamera)}
          zOrder={opts.full ? 0 : 1}
          objectFit="cover"
          style={styles.mediaView}
        />
      );
    }
    // Placeholder (vidéo pas encore prête) : initiale du nom.
    return (
      <View style={styles.videoPlaceholder}>
        <Text style={[styles.videoPlaceholderText, !opts.full && styles.videoPlaceholderTextSmall]}>
          {(p?.user_name || (p?.local ? userName : currentFanName))?.charAt(0)?.toUpperCase() || '?'}
        </Text>
      </View>
    );
  };

  const renderVideoContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Video size={40} color="#ef4444" />
          </View>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.errorSubtext}>{t('videoCallConnectionFailed')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (Platform.OS === 'web') {
      return (
        <View style={styles.videoArea}>
          <div
            ref={(el: any) => {
              if (el && !el._dailyInitialized) {
                el._dailyInitialized = true;
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/@daily-co/daily-js';
                script.onload = () => {
                  try {
                    const callFrame = (window as any).DailyIframe.createFrame(el, {
                      showLeaveButton: false,
                      showFullscreenButton: false,
                      showLocalVideo: true,
                      showParticipantsBar: false,
                      activeSpeakerMode: true,
                      startVideoOff: false,
                      startAudioOff: false,
                      customTrayButtons: {},
                      iframeStyle: {
                        width: '100vw',
                        height: '100vh',
                        border: '0',
                        borderRadius: '0',
                        position: 'fixed',
                        top: '0',
                        left: '0',
                        zIndex: '1',
                      },
                    });
                    const joinUrl = params.roomUrl || '';
                    const joinOptions: any = { url: joinUrl, userName };
                    if (params.token) {
                      joinOptions.token = params.token;
                    }
                    callFrame.setTheme({
                      colors: {
                        accent: '#8b5cf6',
                        accentText: '#FFFFFF',
                        background: '#000000',
                        backgroundAccent: '#1a1a2e',
                        baseText: '#FFFFFF',
                        border: '#2e2e4a',
                        mainAreaBg: '#000000',
                        mainAreaBgAccent: '#1a1a2e',
                        mainAreaText: '#FFFFFF',
                        supportiveText: '#aaaaaa',
                      },
                    });
                    callFrame.join({ ...joinOptions, startVideoOff: false, startAudioOff: false }).then(() => {
                      setIsLoading(false);
                    }).catch(() => {
                      setError(t('videoCallError'));
                      setIsLoading(false);
                    });
                    callFrame.on('left-meeting', () => {
                      handleCallEnded();
                    });
                    callFrame.on('participant-joined', () => {
                      setOtherParticipantJoined(true);
                      try { callFrame.setActiveSpeakerMode(true); } catch {}
                    });
                    callFrame.on('active-speaker-mode-change', (evt: any) => {
                      if (!evt.enabled) {
                        try { callFrame.setActiveSpeakerMode(true); } catch {}
                      }
                    });
                    callFrame.on('participant-left', () => {
                      const participants = callFrame.participants();
                      const remoteCount = Object.keys(participants).filter((k: string) => k !== 'local').length;
                      if (remoteCount === 0) {
                        if (callEndReason.current === 'unknown') {
                          callEndReason.current = isHost ? 'fan_left' : 'celebrity_left';
                        }
                        handleCallEnded();
                      }
                    });
                    dailyCallFrameRef.current = callFrame;
                    (el as any)._dailyCallFrame = callFrame;
                  } catch {
                    setError(t('videoCallError'));
                    setIsLoading(false);
                  }
                };
                script.onerror = () => {
                  setError(t('videoCallError'));
                  setIsLoading(false);
                };
                document.head.appendChild(script);
              }
            }}
            style={{
              position: 'relative' as any,
              width: '100%',
              height: '100%',
              backgroundColor: '#000',
              overflow: 'hidden',
            }}
          />
        </View>
      );
    }

    // Caméra/micro refusés : message clair, on ne rejoint pas l'appel.
    if (mediaPermission === 'denied') {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Video size={40} color="#ef4444" />
          </View>
          <Text style={styles.errorTitle}>
            {t('videoCallPermissionTitle') || 'Caméra et micro requis'}
          </Text>
          <Text style={styles.errorSubtext}>
            {t('videoCallPermissionMessage') ||
              'Autorise la caméra et le micro pour passer un appel vidéo. Active-les dans les réglages de ton téléphone.'}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // En attente de la réponse de permission native : on patiente.
    if (mediaPermission === 'pending') {
      return <View style={styles.videoArea} />;
    }

    // --- MOTEUR NATIF : layout type WhatsApp ---
    // L'AUTRE participant en plein écran, SOI en petit cadre arrondi (PiP).
    return (
      <View style={styles.videoArea}>
        {/* Plein écran : l'autre participant (ou soi si seul). */}
        <View style={styles.fullScreenVideo}>
          {renderNativeTile(remoteParticipant || (remoteParticipant ? null : localParticipant), {
            full: true,
          })}
        </View>

        {/* PiP arrondi : soi-même, uniquement quand l'autre est en grand. */}
        {remoteParticipant && localParticipant && (
          <View style={styles.pipContainer}>
            {renderNativeTile(localParticipant, { full: false })}
          </View>
        )}

        {/* Bouton bascule caméra (mobile natif). */}
        <TouchableOpacity style={styles.switchCameraButton} onPress={switchCamera}>
          <RotateCcw size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  if (!params.roomUrl) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Video size={40} color="#ef4444" />
          </View>
          <Text style={styles.errorTitle}>{t('videoCallError')}</Text>
          <Text style={styles.errorSubtext}>{t('videoCallConnectionFailed')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.controlBar}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>

        {params.durationPerFan ? (
          <View style={[styles.timerContainer, timeWarning && styles.timerWarning, !otherParticipantJoined && { opacity: 0.5 }]}>
            <Clock size={14} color="#fff" />
            <Text style={styles.timerText}>
              {otherParticipantJoined ? fanTimeRemaining : formatClock(parseFloat(params.durationPerFan || '5'))}
            </Text>
          </View>
        ) : (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}

        {isHost && fansRemainingCount > 0 ? (
          <View style={styles.fansRemainingBadge}>
            <Users size={12} color="#a78bfa" />
            <Text style={styles.fansRemainingText}>
              {fansRemainingCount}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.endCallButton} onPress={leaveCall}>
          <PhoneOff size={16} color="#fff" />
          <Text style={styles.endCallText}>{t('endCall')}</Text>
        </TouchableOpacity>
      </View>

      {!hasLeftCall && renderVideoContent()}
      {hasLeftCall && <View style={{ flex: 1, backgroundColor: '#000' }} />}

      {isHost && !otherParticipantJoined && !isLoading && !waitingForNextFan && !hasLeftCall && (
        <View style={styles.fanConnectingBanner}>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={styles.fanConnectingText}>
            {t('fanConnecting') || 'Please wait. Waiting for a fan to connect'}
          </Text>
        </View>
      )}

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingTitle}>{t('connectingToCall')}</Text>
            <Text style={styles.loadingSubtext}>{t('videoCallPreparing')}</Text>
          </View>
        </View>
      )}

      {waitingForNextFan && (
        <View style={styles.waitingOverlay}>
          <View style={styles.waitingCard}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.waitingTitle}>{t('waitingNextFan')}</Text>
            <Text style={styles.waitingSubtext}>
              {fansRemainingCount > 0
                ? t('waitingNextFanHint').replace('{count}', String(fansRemainingCount))
                : t('waitingNextFanConnect')}
            </Text>
            <TouchableOpacity
              style={styles.waitingEndButton}
              onPress={() => {
                setWaitingForNextFan(false);
                router.back();
              }}
            >
              <Text style={styles.waitingEndButtonText}>{t('endSession')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showEndSummary && (
        <View style={styles.summaryOverlay}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryEmoji}>🎉</Text>
            <Text style={styles.summaryTitle}>
              {(t('noMoreFansTitle') || 'Session terminée') + ' !'}
            </Text>
            <Text style={styles.summarySubtitle}>
              {t('noMoreFansMessage') || 'Belle session !'}
            </Text>

            <View style={styles.summaryStats}>
              <View style={styles.summaryStatRow}>
                <View style={styles.summaryStatIcon}>
                  <Clock size={20} color="#a78bfa" />
                </View>
                <View style={styles.summaryStatTexts}>
                  <Text style={styles.summaryStatLabel}>{t('summaryDuration') || 'Durée'}</Text>
                  <Text style={styles.summaryStatValue}>{formatSummaryDuration(summaryDurationMin)}</Text>
                </View>
              </View>

              <View style={styles.summaryStatRow}>
                <View style={styles.summaryStatIcon}>
                  <Users size={20} color="#a78bfa" />
                </View>
                <View style={styles.summaryStatTexts}>
                  <Text style={styles.summaryStatLabel}>{t('summaryFansMet') || 'Fans rencontrés'}</Text>
                  <Text style={styles.summaryStatValue}>{summaryFansMet}</Text>
                </View>
              </View>

              <View style={styles.summaryStatRow}>
                <View style={styles.summaryStatIcon}>
                  <TrendingUp size={20} color="#a78bfa" />
                </View>
                <View style={styles.summaryStatTexts}>
                  <Text style={styles.summaryStatLabel}>{t('summaryRevenue') || 'Revenus générés'}</Text>
                  <Text style={styles.summaryStatValue}>
                    {(summaryEarningsCents / 100).toFixed(2).replace('.', ',')} €
                  </Text>
                </View>
              </View>
            </View>

            <Text style={{ color: '#a78bfa', fontSize: 13, textAlign: 'center', marginTop: 18, marginBottom: 2, lineHeight: 18, paddingHorizontal: 8 }}>
              {t('revenueInMyEventsHint' as any) || '💡 Retrouve le détail de tes revenus dans « Mes événements »'}
            </Text>

            <TouchableOpacity style={styles.summaryButton} onPress={closeEndSummary} activeOpacity={0.85}>
              <Text style={styles.summaryButtonText}>{t('summaryFinish') || 'Terminer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {sessionEndedByCelebrity && (
        <View style={styles.loadingOverlay}>
          <View style={styles.endedCard}>
            <PhoneOff size={48} color="#ef4444" />
            <Text style={styles.endedTitle}>
              {t('liveSessionEndedByCelebrity' as any) ||
                'Appel interrompu par la célébrité'}
            </Text>
            {paymentWasReleased && (
              <Text style={styles.endedSubtext}>
                {t('paymentReleasedNotCharged' as any) ||
                  'Vous ne serez pas débité du montant prévu.'}
              </Text>
            )}
            <TouchableOpacity style={styles.endedBackButton} onPress={() => router.replace('/activity' as any)} activeOpacity={0.85}>
              <Text style={styles.endedBackButtonText}>{t('goBack') || 'Retour'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {hostEndedEarly && (
        <View style={styles.loadingOverlay}>
          <View style={styles.endedCard}>
            <AlertTriangle size={48} color="#fbbf24" />
            <Text style={styles.endedTitle}>
              {t('hostEndedEarlyTitle' as any) || 'Appel terminé avant la fin'}
            </Text>
            <Text style={[styles.endedSubtext, { color: '#fbbf24' }]}>
              {t('hostEndedEarlyNotPaid' as any) ||
                'Tu ne seras pas crédité(e) pour cette session.'}
            </Text>
            <TouchableOpacity
              style={[styles.blockFanButton, fanBlockedDone && styles.blockFanButtonDone]}
              disabled={fanBlockedDone}
              onPress={async () => {
                const ok = await blockCurrentFan();
                if (ok) {
                  setFanBlockedDone(true);
                  showAlert(
                    t('accessDenied' as any) || 'Accès refusé',
                    t('fanBlockedConfirm' as any) ||
                      'Fan bloqué. Il ne pourra plus vous rejoindre.'
                  );
                }
              }}
              activeOpacity={0.85}
            >
              <Ban size={18} color="#fff" />
              <Text style={styles.blockFanButtonText}>
                {fanBlockedDone
                  ? t('fanBlockedConfirm' as any) || 'Fan bloqué.'
                  : `🚫 ${t('blockFanButton' as any) || 'Bloquer ce fan'}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.endedBackButton}
              onPress={() => router.replace({ pathname: '/live-session-dashboard', params: { sessionId: params.sessionId } } as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.endedBackButtonText}>{t('backToMySession' as any) || 'Retour à ma session'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {fanEndedEarly && (
        <View style={styles.loadingOverlay}>
          <View style={styles.endedCard}>
            <PhoneOff size={48} color="#6366f1" />
            <Text style={styles.endedTitle}>
              {t('fanEndedEarlyTitle' as any) || 'Le fan a raccroché'}
            </Text>
            <Text style={styles.endedSubtext}>
              {t('fanEndedEarlyMessage' as any) ||
                'Le fan a raccroché avant la fin de la session. Vous serez quand même crédité(e) — ce n\'est pas de votre faute.'}
            </Text>
            <TouchableOpacity
              style={styles.endedBackButton}
              onPress={() => {
                // Ferme l'overlay puis enchaîne le flux normal : notation du fan, qui via
                // handleRatingModalClose -> handleCallNextFan passe au fan suivant ou au dashboard.
                setFanEndedEarly(false);
                setShowRatingModal(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.endedBackButtonText}>{t('ok' as any) || 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <RatingModal
        visible={showRatingModal}
        onClose={handleRatingModalClose}
        onSubmit={handleSubmitRating}
        userName={currentFanName || (isHost ? 'Fan' : params.userName || 'Celebrity')}
        isCelebrity={isHost}
        showBlockOption={isHost}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  summaryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 50,
  },
  summaryCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1e1b4b',
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  summaryEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
  },
  summarySubtitle: {
    fontSize: 15,
    color: '#c7d2fe',
    textAlign: 'center',
    marginBottom: 24,
  },
  summaryStats: {
    width: '100%',
    gap: 12,
    marginBottom: 28,
  },
  summaryStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  summaryStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(99,102,241,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryStatTexts: {
    flex: 1,
  },
  summaryStatLabel: {
    fontSize: 13,
    color: '#a5b4fc',
    marginBottom: 2,
  },
  summaryStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  summaryButton: {
    width: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  summaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'web' ? 48 : 44,
    zIndex: 10,
    position: 'relative' as any,
    paddingBottom: 10,
    backgroundColor: '#1a1a2e',
  },
  headerBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fanBackButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 11,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fansRemainingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
  },
  fansRemainingText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  timerWarning: {
    backgroundColor: '#dc2626',
  },
  timerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timerTextFan: {
    fontSize: 13,
  },
  endCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 5,
  },
  endCallText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  videoArea: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  fullScreenVideo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  mediaView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  pipContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 110,
    height: 160,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1f2937',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#374151',
  },
  videoPlaceholderText: {
    fontSize: 64,
    fontWeight: '700',
    color: '#9ca3af',
  },
  videoPlaceholderTextSmall: {
    fontSize: 32,
  },
  switchCameraButton: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  fanConnectingBanner: {
    position: 'absolute',
    top: 150,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
    zIndex: 50,
  },
  fanConnectingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 15, 40, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  loadingCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 40,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  loadingTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  endedCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 32,
    maxWidth: 360,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
  },
  endedTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  endedSubtext: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  blockFanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
  },
  blockFanButtonDone: {
    backgroundColor: 'rgba(220,38,38,0.35)',
  },
  blockFanButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  endedBackButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 24,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  endedBackButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  backButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  waitingCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    width: '85%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  waitingTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  waitingSubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  waitingEndButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  waitingEndButtonText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
