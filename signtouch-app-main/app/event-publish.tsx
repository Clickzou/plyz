import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getDateLocale } from '@/utils/dateLocale';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Image as ImageIcon, Check, Users, Send, ZoomIn, ZoomOut, RotateCcw, RotateCw, Palette, QrCode, X, Copy, Share2, Plus, Calendar, Clock, Video, MapPin, Euro, PenTool, StopCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useAudioPlayer } from 'expo-audio';
import ViewShot from 'react-native-view-shot';
import { SvgUri, SvgXml } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { saveMemory } from '@/utils/storageService';
import { authedFetch } from '@/utils/authedFetch';
import BottomNav from '@/components/BottomNav';
import {
  EventSigner,
  SignatureMetadata,
  getEventSigners,
  publishEventAsset,
  getActiveViewerCount,
  fetchEventAssets,
  endEventSession,
  getSignedDedicationCount,
} from '@/utils/eventSessionStorage';
import QRCodeSvg from 'react-native-qrcode-svg';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

const SIGNATURE_COLORS = [
  '#FFFFFF',
  '#000000',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#EF4444',
  '#6B7280',
  '#FFD700',
];

const getColorFilter = (hexColor: string): string => {
  const colorFilters: Record<string, string> = {
    '#FFFFFF': 'brightness(0) invert(1)',
    '#000000': 'brightness(0)',
    '#10B981': 'brightness(0) invert(48%) sepia(79%) saturate(450%) hue-rotate(118deg)',
    '#3B82F6': 'brightness(0) invert(45%) sepia(98%) saturate(1500%) hue-rotate(199deg)',
    '#8B5CF6': 'brightness(0) invert(40%) sepia(90%) saturate(1500%) hue-rotate(245deg)',
    '#EC4899': 'brightness(0) invert(45%) sepia(95%) saturate(2000%) hue-rotate(310deg)',
    '#F59E0B': 'brightness(0) invert(65%) sepia(90%) saturate(1500%) hue-rotate(15deg)',
    '#EF4444': 'brightness(0) invert(35%) sepia(95%) saturate(2000%) hue-rotate(340deg)',
    '#6B7280': 'brightness(0) invert(50%) sepia(10%) saturate(300%) hue-rotate(180deg)',
    '#FFD700': 'brightness(0) invert(80%) sepia(90%) saturate(1000%) hue-rotate(10deg)',
  };
  return colorFilters[hexColor] || 'brightness(0) invert(1)';
};

export default function EventPublishScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  // Garde l'écran ALLUMÉ tant que la célébrité dédicace : sinon l'écran se met en veille,
  // l'app se suspend, et elle ne voit plus en direct les fans qui rejoignent (ni le son in-app).
  // Aligné sur le flux vidéo (video-call / live-session-dashboard).
  useKeepAwake();

  const sessionId = params.sessionId as string;
  const sessionTitle = params.sessionTitle as string;
  const joinCode = params.joinCode as string;
  const eventType = params.eventType as string || 'qr';
  const startsAt = params.startsAt as string;
  const endsAt = params.endsAt as string;
  const location = params.location as string;
  const priceCents = parseInt(params.priceCents as string || '0', 10);
  
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString(getDateLocale(), { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return dateStr;
    }
  };

  const [signers, setSigners] = useState<EventSigner[]>([]);
  const [selectedSignerId, setSelectedSignerId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [ending, setEnding] = useState(false);
  // Toast informatif (rappel de vérifier la célébrité) affiché ~4s après le choix d'une photo.
  const [signerReminderVisible, setSignerReminderVisible] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  // Son joué quand un fan rejoint la séance (même asset que le flux vidéo live-session-dashboard).
  const fanJoinedPlayer = useAudioPlayer(require('@/assets/sounds/fan-joined.wav'));
  // Garde anti-déclenchement : vrai au TOUT PREMIER chargement du compteur de fans présents.
  // Sert à NE PAS jouer le son au montage de l'écran ni à chaque poll, UNIQUEMENT quand le
  // nombre de fans présents AUGMENTE réellement (un nouveau fan rejoint). Reproduit le pattern
  // isInitialQueueLoad de live-session-dashboard.
  const isInitialViewerLoad = useRef(true);
  const prevViewerCountRef = useRef(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [publishedAssets, setPublishedAssets] = useState<any[]>([]);
  const [realNetCents, setRealNetCents] = useState<number | null>(null);
  const [, setPaidFanCount] = useState(0);
  
  const [signaturePosition, setSignaturePosition] = useState({ x: 0, y: 0 });
  const [signatureScale, setSignatureScale] = useState(1);
  const [signatureRotation, setSignatureRotation] = useState(0);
  const [signatureColor, setSignatureColor] = useState('#FFFFFF');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [coloredSvgXml, setColoredSvgXml] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sortByName, setSortByName] = useState(false);
  
  const selectedSigner = signers.find((s) => s.id === selectedSignerId);

  // Préférence "ne plus afficher" (persistée).
  useEffect(() => {
    AsyncStorage.getItem('@plyz_signer_reminder_dismissed')
      .then((v) => { if (v === 'true') setReminderDismissed(true); })
      .catch(() => {});
  }, []);

  // Dès qu'une photo est choisie, on affiche un toast informatif ~4s (rappel de
  // vérifier la bonne célébrité), sauf si l'utilisateur a coché "ne plus afficher".
  useEffect(() => {
    if (!selectedImage || reminderDismissed) return;
    setSignerReminderVisible(true);
    const timer = setTimeout(() => setSignerReminderVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [selectedImage, reminderDismissed]);

  const dismissReminderForever = () => {
    setReminderDismissed(true);
    setSignerReminderVisible(false);
    AsyncStorage.setItem('@plyz_signer_reminder_dismissed', 'true').catch(() => {});
  };

  // Une signature est un SVG (cote web) ou un PNG (capture mobile via ViewShot).
  // On ne traite en SVG que les vraies signatures SVG, sinon on affiche le PNG.
  const signatureIsSvg = !!selectedSigner?.signature_url &&
    (selectedSigner.signature_url.includes('.svg') ||
     selectedSigner.signature_url.startsWith('data:image/svg'));

  // Fetch and colorize SVG for mobile
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!selectedSigner?.signature_url || !signatureIsSvg) {
      // PNG (ou pas de signature) : pas de SVG a parser, on colorise via <Image tintColor>.
      setColoredSvgXml(null);
      return;
    }

    const fetchAndColorSvg = async () => {
      const signatureUrl = selectedSigner?.signature_url;
      if (!signatureUrl) return;
      try {
        const response = await fetch(signatureUrl);
        let svgText = await response.text();
        
        // Simple approach: replace stroke colors but keep fill="none"
        // Replace stroke attribute values (but not "none")
        svgText = svgText.replace(/stroke="#[0-9a-fA-F]{3,6}"/g, `stroke="${signatureColor}"`);
        svgText = svgText.replace(/stroke="rgb[^"]*"/g, `stroke="${signatureColor}"`);
        svgText = svgText.replace(/stroke="black"/g, `stroke="${signatureColor}"`);
        svgText = svgText.replace(/stroke="white"/g, `stroke="${signatureColor}"`);
        
        setColoredSvgXml(svgText);
      } catch (error) {
        console.error('Error fetching SVG:', error);
        setColoredSvgXml(null);
      }
    };
    
    fetchAndColorSvg();
  }, [selectedSigner?.signature_url, signatureColor, signatureIsSvg]);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const viewShotRef = useRef<ViewShot>(null);
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });
  const lastPanOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const positionAtDragStart = useRef({ x: 0, y: 0 });
  
  const handleWebDragStart = useCallback((e: React.MouseEvent) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    positionAtDragStart.current = { ...signaturePosition };
  }, [signaturePosition]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const deltaX = e.clientX - dragStart.current.x;
      const deltaY = e.clientY - dragStart.current.y;
      
      const maxOffsetX = 200;
      const maxOffsetUp = 350;
      const maxOffsetDown = 350;
      const newX = Math.max(-maxOffsetX, Math.min(maxOffsetX, positionAtDragStart.current.x + deltaX));
      const newY = Math.max(-maxOffsetUp, Math.min(maxOffsetDown, positionAtDragStart.current.y + deltaY));
      setSignaturePosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
  
  const lastDistance = useRef<number | null>(null);
  const lastAngle = useRef<number | null>(null);
  const baseScale = useRef(signatureScale);
  const baseRotation = useRef(signatureRotation);
  const currentScaleRef = useRef(signatureScale);
  
  // Keep ref in sync with state
  useEffect(() => {
    currentScaleRef.current = signatureScale;
  }, [signatureScale]);

  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return null;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getAngle = (touches: any[]) => {
    if (touches.length < 2) return null;
    const dx = touches[1].pageX - touches[0].pageX;
    const dy = touches[1].pageY - touches[0].pageY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        lastPanOffset.current = { x: 0, y: 0 };
        lastDistance.current = null;
        lastAngle.current = null;
        baseScale.current = signatureScale;
        baseRotation.current = signatureRotation;
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        
        // Two-finger gestures: pinch to scale, rotate
        if (touches && touches.length === 2) {
          const currentDistance = getDistance(touches);
          const currentAngle = getAngle(touches);
          
          if (currentDistance !== null && currentAngle !== null) {
            if (lastDistance.current !== null && lastAngle.current !== null) {
              // Scale
              const scaleDelta = currentDistance / lastDistance.current;
              const newScale = Math.max(0.3, Math.min(3, currentScaleRef.current * scaleDelta));
              setSignatureScale(newScale);
              
              // Rotation
              let angleDelta = currentAngle - lastAngle.current;
              if (angleDelta > 180) angleDelta -= 360;
              if (angleDelta < -180) angleDelta += 360;
              setSignatureRotation(prev => prev + angleDelta);
            }
            lastDistance.current = currentDistance;
            lastAngle.current = currentAngle;
          }
          return;
        }
        
        // Single finger: move
        const deltaX = gestureState.dx - lastPanOffset.current.x;
        const deltaY = gestureState.dy - lastPanOffset.current.y;
        lastPanOffset.current = { x: gestureState.dx, y: gestureState.dy };
        
        setSignaturePosition(prev => {
          const maxOffsetX = 200;
          const maxOffsetUp = 350;
          const maxOffsetDown = 350;
          const newX = Math.max(-maxOffsetX, Math.min(maxOffsetX, prev.x + deltaX));
          const newY = Math.max(-maxOffsetUp, Math.min(maxOffsetDown, prev.y + deltaY));
          return { x: newX, y: newY };
        });
      },
      onPanResponderRelease: () => {
        lastDistance.current = null;
        lastAngle.current = null;
      },
    })
  ).current;

  const loadSigners = useCallback(async () => {
    if (!sessionId) return;
    const loadedSigners = await getEventSigners(sessionId);
    setSigners(loadedSigners);
    if (loadedSigners.length > 0 && !selectedSignerId) {
      setSelectedSignerId(loadedSigners[0].id);
    }
  }, [sessionId, selectedSignerId]);

  useFocusEffect(
    useCallback(() => {
      if (!sessionId) return;
      loadSigners();
      getActiveViewerCount(sessionId).then(setViewerCount);
      fetchEventAssets(sessionId, { limit: 100 }).then((assets) => {
        setPublishedCount(assets.length);
        setPublishedAssets(assets);
      });
      if (priceCents > 0 && STRIPE_SERVER_URL) {
        authedFetch(`${STRIPE_SERVER_URL}/api/event-session-earnings?event_session_id=${sessionId}`)
          .then(r => r.json())
          .then(data => {
            if (data.net_cents !== undefined) setRealNetCents(data.net_cents);
            if (data.paid_fan_count !== undefined) setPaidFanCount(data.paid_fan_count);
          })
          .catch(() => {});
      }
    }, [sessionId, loadSigners, priceCents])
  );

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(async () => {
      const count = await getActiveViewerCount(sessionId);
      setViewerCount(count);
      if (priceCents > 0 && STRIPE_SERVER_URL) {
        try {
          const r = await authedFetch(`${STRIPE_SERVER_URL}/api/event-session-earnings?event_session_id=${sessionId}`);
          const data = await r.json();
          if (data.net_cents !== undefined) setRealNetCents(data.net_cents);
          if (data.paid_fan_count !== undefined) setPaidFanCount(data.paid_fan_count);
        } catch {}
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [sessionId, priceCents]);

  // Son + vibration quand un NOUVEAU fan rejoint la séance (le compteur de fans présents augmente).
  // Aligné sur live-session-dashboard (flux vidéo) : garde anti-montage pour ne jamais jouer au
  // premier chargement de l'écran ni à chaque poll, uniquement sur une vraie augmentation.
  useEffect(() => {
    if (isInitialViewerLoad.current) {
      isInitialViewerLoad.current = false;
      prevViewerCountRef.current = viewerCount;
      return;
    }
    if (viewerCount > prevViewerCountRef.current) {
      try {
        fanJoinedPlayer.seekTo(0);
        fanJoinedPlayer.play();
      } catch {}
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }
    prevViewerCountRef.current = viewerCount;
  }, [viewerCount, fanJoinedPlayer]);

  const resetSignatureTransform = () => {
    setSignaturePosition({ x: 0, y: 0 });
    setSignatureScale(1);
    setSignatureRotation(0);
    setSignatureColor('#FFFFFF');
  };
  
  const resetAll = () => {
    resetSignatureTransform();
    setSelectedImage(null);
  };

  const adjustScale = (delta: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSignatureScale(prev => Math.max(0.3, Math.min(3, prev + delta)));
  };

  const adjustRotation = (delta: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSignatureRotation(prev => prev + delta);
  };

  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(joinCode);
      setCopied(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleShareCode = async () => {
    const link = `https://plyz.io/evenement/${joinCode}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: sessionTitle,
          text: `Rejoignez mon événement Plyz avec le code ${joinCode}`,
          url: link,
        });
      } else {
        showAlert(t('share'), link);
      }
    } catch {
      showAlert(t('share'), link);
    }
  };

  const captureComposite = async (): Promise<string> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx || !selectedImage) throw new Error('Canvas not available');
        
        const img = new (window as any).Image() as HTMLImageElement;
        img.crossOrigin = 'anonymous';
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = selectedImage;
        });
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        if (selectedSigner?.signature_url) {
          const sigImg = new (window as any).Image() as HTMLImageElement;
          sigImg.crossOrigin = 'anonymous';
          
          await new Promise<void>((resolve, reject) => {
            sigImg.onload = () => resolve();
            sigImg.onerror = () => reject(new Error('Signature load failed'));
            sigImg.src = selectedSigner.signature_url!;
          });
          
          const previewW = containerLayout.width || 300;
          const previewH = containerLayout.height || 400;
          const scaleX = canvas.width / previewW;
          const scaleY = canvas.height / previewH;
          
          const baseSigWidth = 200;
          const baseSigHeight = 100;
          const sigWidth = baseSigWidth * signatureScale * scaleX;
          const sigHeight = baseSigHeight * signatureScale * scaleY;
          const sigX = (canvas.width / 2) + (signaturePosition.x * scaleX) - (sigWidth / 2);
          const sigY = (canvas.height / 2) + (signaturePosition.y * scaleY) - (sigHeight / 2);
          
          ctx.save();
          ctx.translate(sigX + sigWidth / 2, sigY + sigHeight / 2);
          ctx.rotate((signatureRotation * Math.PI) / 180);
          ctx.drawImage(sigImg, -sigWidth / 2, -sigHeight / 2, sigWidth, sigHeight);
          ctx.restore();
        }
        
        return canvas.toDataURL('image/jpeg', 0.9);
      } catch (e) {
        console.error('Web capture failed:', e);
        return selectedImage || '';
      }
    }
    
    if (viewShotRef.current) {
      try {
        const uri = await (viewShotRef.current as any).capture();
        if (uri) return uri;
      } catch (e) {
        console.error('Capture failed:', e);
      }
    }
    return selectedImage || '';
  };

  const pickImage = async () => {
    resetSignatureTransform();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      showAlert(t('cameraNotAvailable') || 'Camera not available', t('useMobileOrGallery') || 'Camera is not available on web.');
      return;
    }
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('error') || 'Error', t('cameraPermissionNeeded') || 'Camera permission needed');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handlePublish = async (type: 'photo' | 'photo_signed') => {
    if (!selectedImage) {
      showAlert(t('error') || 'Error', t('selectImageFirst') || 'Select an image first');
      return;
    }

    setIsPublishing(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const imageToPublish = type === 'photo_signed' ? await captureComposite() : selectedImage;
      
      const publishOptions = type === 'photo_signed' && selectedSigner?.signature_url ? {
        originalPhotoUri: selectedImage!,
        signatureMetadata: {
          position_x: signaturePosition.x,
          position_y: signaturePosition.y,
          scale: signatureScale,
          rotation: signatureRotation,
          color: signatureColor,
          signature_url: selectedSigner.signature_url,
          container_width: containerLayout.width || 300,
          container_height: containerLayout.height || 400,
        } as SignatureMetadata,
      } : undefined;
      
      await publishEventAsset(
        sessionId,
        imageToPublish,
        type,
        type === 'photo_signed' ? selectedSignerId || undefined : undefined,
        publishOptions
      );

      // Capture des paiements pré-autorisés des fans dès la 1ère photo dédicacée publiée.
      // Fire-and-forget : ne bloque NI l'UI NI la publication. Le serveur est idempotent
      // (une seule capture même si plusieurs photos signées sont publiées).
      if (type === 'photo_signed' && priceCents > 0 && STRIPE_SERVER_URL) {
        (async () => {
          try {
            await authedFetch(`${STRIPE_SERVER_URL}/api/capture-event-payments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ eventSessionId: sessionId }),
            });
          } catch (captureErr) {
            console.error('[EventPublish] Capture paiements échouée (non bloquant):', captureErr);
          }
        })();
      }

      // Sauvegarde automatique de la dedicace dans "Ma Galerie" de l'app
      // (la celebrite retrouve ainsi chaque photo publiee dans sa galerie).
      try {
        await saveMemory(imageToPublish, user?.id || null, { isEdited: true });
      } catch (saveErr) {
        console.error('Erreur sauvegarde dans Ma Galerie:', saveErr);
      }

      setPublishedCount((prev) => prev + 1);
      setSelectedImage(null);
      resetSignatureTransform();
      
      // Refresh published assets
      const updatedAssets = await fetchEventAssets(sessionId, { limit: 100 });
      setPublishedAssets(updatedAssets);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Publish error:', error);
      showAlert(t('error') || 'Error', t('publishFailed') || 'Failed to publish');
    } finally {
      setIsPublishing(false);
    }
  };

  // Termine la session de dedicace : libere les paiements + passe l'evenement en
  // status 'ended' (declenche remboursement + notif push cote fan si rien publie).
  const handleEndSession = async () => {
    const doEnd = async () => {
      setEnding(true);
      try {
        await endEventSession(sessionId);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        // Redirige vers la liste « Mes événements » onglet « Passés » (au lieu de revenir
        // à l'écran « Événement créé » d'où la séance pouvait être relancée par erreur).
        router.replace({
          pathname: '/celebrity-menu',
          params: { view: 'past', kind: 'event' },
        } as any);
      } catch (error) {
        console.error('End session error:', error);
        showAlert(t('error') || 'Error', t('publishFailed') || 'Une erreur est survenue');
      } finally {
        setEnding(false);
      }
    };

    const signedCount = await getSignedDedicationCount(sessionId);
    const noDedicationRefund =
      priceCents > 0 && eventType !== 'live_video' && signedCount === 0;

    showConfirm(
      t('endSession') || 'Terminer la session',
      noDedicationRefund
        ? (t('endEventNoDedicationConfirm') as string)
        : (t('endSessionConfirm') as string),
      [
        { text: t('cancel') || 'Annuler', style: 'cancel' },
        {
          text: t('endSession') || 'Terminer',
          style: 'destructive',
          onPress: doEnd,
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/fan-choice' as any))}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{sessionTitle}</Text>
          <View style={[styles.typeBadge, eventType === 'live_video' ? styles.typeBadgeVideo : styles.typeBadgeDedicace]}>
            {eventType === 'live_video' ? (
              <Video size={11} color="#fff" />
            ) : (
              <PenTool size={11} color="#fff" />
            )}
            <Text style={styles.typeBadgeText}>
              {eventType === 'live_video'
                ? (t('eventTypeLiveVideo' as any) || 'Live vidéo')
                : (t('eventTypeDedicace' as any) || 'Dédicace')}
            </Text>
          </View>
          <Text style={styles.headerCodeLabel}>{t('eventCode') || 'Code'}: <Text style={styles.headerCodeValue}>{joinCode}</Text></Text>
        </View>
        <View style={styles.viewerBadge}>
          <Users size={14} color="#10B981" />
          <Text style={styles.viewerCount}>{viewerCount}</Text>
        </View>
      </View>

      {signerReminderVisible && selectedSigner && (
        <View style={[styles.signerToast, { top: insets.top + 64 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.signerToastText}>
              ⚠️ Attention, sélectionnez le bon profil (signataire) avant d'envoyer la dédicace.
            </Text>
            <TouchableOpacity
              onPress={dismissReminderForever}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.signerToastDismiss}>Ne plus afficher</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => setSignerReminderVisible(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 16) + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{publishedCount}</Text>
            <Text style={styles.statLabel}>{t('published') || 'Published'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{viewerCount}</Text>
            <Text style={styles.statLabel}>{t('viewers') || 'Viewers'}</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statItem} onPress={() => setShowQrModal(true)}>
            <View style={styles.codeContainer}>
              <Text style={styles.codeValue}>{joinCode}</Text>
              <QrCode size={12} color="#10B981" />
            </View>
            <Text style={styles.statLabel}>{t('showQrCode') || 'Voir QR'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.earningsCard}>
          <Euro size={16} color={priceCents > 0 ? '#10B981' : '#6B7280'} />
          <Text style={[styles.earningsText, priceCents <= 0 && { color: '#6B7280' }]}>
            {priceCents > 0
              ? `${t('estimatedRevenue') || 'Revenus estimés (net)'}: ${realNetCents !== null ? (realNetCents / 100).toFixed(2).replace('.', ',') : '0,00'}€`
              : (t('freeSession') || 'Session gratuite')}
          </Text>
          {priceCents > 0 && (
            <Text style={styles.earningsDetail}>
              ({(priceCents / 100).toFixed(2).replace('.', ',')}€ / {t('perFan') || 'fan'})
            </Text>
          )}
        </View>

        <View style={styles.eventInfoCard}>
          <View style={styles.eventInfoRow}>
            {eventType === 'live_video' ? (
              <Video size={16} color="#10B981" />
            ) : (
              <QrCode size={16} color="#10B981" />
            )}
            <Text style={styles.eventInfoText}>
              {eventType === 'live_video' ? (t('liveVideo') || 'Vidéo en direct') : (t('qrEvent') || 'Événement QR')}
            </Text>
          </View>
          {location && (
            <View style={styles.eventInfoRow}>
              <MapPin size={16} color="#9ca3af" />
              <Text style={styles.eventInfoText}>{location}</Text>
            </View>
          )}
          {startsAt && (
            <View style={styles.eventInfoRow}>
              <Calendar size={16} color="#9ca3af" />
              <Text style={styles.eventInfoText}>{t('startsAt') || 'Début'}: {formatDateTime(startsAt)}</Text>
            </View>
          )}
          {endsAt && (
            <View style={styles.eventInfoRow}>
              <Clock size={16} color="#9ca3af" />
              <Text style={styles.eventInfoText}>{t('endsAt') || 'Fin'}: {formatDateTime(endsAt)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('selectSigner') || 'Select Signer'}</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.signersScroll}
          contentContainerStyle={styles.signersScrollContent}
        >
          {signers.map((signer, index) => (
            <TouchableOpacity
              key={signer.id}
              style={styles.signerBadgeWrapper}
              onPress={() => setSelectedSignerId(signer.id)}
            >
              <View style={[
                styles.signerBadge, 
                selectedSignerId === signer.id && styles.signerBadgeActive
              ]}>
                <Text style={styles.signerBadgeNumber}>#{index + 1}</Text>
                {selectedSignerId === signer.id && (
                  <View style={styles.signerBadgeCheck}>
                    <Check size={10} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={[
                styles.signerBadgeName, 
                selectedSignerId === signer.id && styles.signerBadgeNameActive
              ]} numberOfLines={1}>
                {signer.display_name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.signerBadgeWrapper}
            onPress={() => router.push(`/add-signer?sessionId=${sessionId}`)}
          >
            <View style={styles.addSignerBadge}>
              <Plus size={20} color="#10B981" />
            </View>
          </TouchableOpacity>
        </ScrollView>

        <Text style={styles.sectionTitle}>{t('selectPhoto') || 'Select Photo'}</Text>
        <View style={styles.photoSection}>
          {selectedImage ? (
            <>
              {/* Cadre arrondi pour l'apercu a l'ecran uniquement (hors capture). */}
              <View style={styles.previewFrame}>
              <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 1 }}
                style={styles.viewShotContainer}
              >
                <View
                  style={styles.previewContainer}
                  onLayout={(e) => setContainerLayout({
                    width: e.nativeEvent.layout.width,
                    height: e.nativeEvent.layout.height
                  })}
                >
                  <Image source={{ uri: selectedImage }} style={styles.previewImage} resizeMode="cover" />
                  {selectedSigner?.signature_url && (
                    Platform.OS === 'web' ? (
                      <div
                        onMouseDown={handleWebDragStart as any}
                        style={{
                          position: 'absolute',
                          width: 200,
                          height: 100,
                          cursor: 'grab',
                          transform: `translate(${signaturePosition.x}px, ${signaturePosition.y}px) scale(${signatureScale}) rotate(${signatureRotation}deg)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          userSelect: 'none' as const,
                        }}
                      >
                        <img 
                          src={selectedSigner.signature_url}
                          draggable={false}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain' as const,
                            filter: getColorFilter(signatureColor),
                            pointerEvents: 'none' as const,
                          }}
                        />
                      </div>
                    ) : (
                      <View
                        {...panResponder.panHandlers}
                        style={[
                          styles.signatureOverlay,
                          {
                            transform: [
                              { translateX: signaturePosition.x },
                              { translateY: signaturePosition.y },
                              { scale: signatureScale },
                              { rotate: `${signatureRotation}deg` },
                            ],
                          },
                        ]}
                      >
                        {coloredSvgXml ? (
                          <SvgXml
                            xml={coloredSvgXml}
                            width={200}
                            height={100}
                          />
                        ) : signatureIsSvg ? (
                          <SvgUri
                            uri={selectedSigner.signature_url}
                            width={200}
                            height={100}
                          />
                        ) : (
                          <Image
                            source={{ uri: selectedSigner.signature_url }}
                            style={{ width: 200, height: 100 }}
                            resizeMode="contain"
                            tintColor={signatureColor}
                          />
                        )}
                      </View>
                    )
                  )}
                </View>
              </ViewShot>
              </View>

              {selectedSigner?.signature_url && (
                <View style={styles.editControls}>
                  <View style={styles.editRow}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => adjustScale(-0.1)}>
                      <ZoomOut size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.editBtn} onPress={() => adjustScale(0.1)}>
                      <ZoomIn size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.editBtn} onPress={() => adjustRotation(-15)}>
                      <RotateCcw size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.editBtn} onPress={() => adjustRotation(15)}>
                      <RotateCw size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.editBtn, showColorPicker && styles.editBtnActive]} 
                      onPress={() => setShowColorPicker(!showColorPicker)}
                    >
                      <Palette size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.editBtn} onPress={resetAll}>
                      <Text style={styles.resetText}>Reset</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {showColorPicker && (
                    <View style={styles.colorPickerRow}>
                      {SIGNATURE_COLORS.map((color) => (
                        <TouchableOpacity
                          key={color}
                          style={[
                            styles.colorDot,
                            { backgroundColor: color },
                            signatureColor === color && styles.colorDotActive,
                          ]}
                          onPress={() => {
                            setSignatureColor(color);
                            if (Platform.OS !== 'web') {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }
                          }}
                        />
                      ))}
                    </View>
                  )}
                  
                  <Text style={styles.editHint}>
                    {(t as any)('dragToMove') || 'Drag the signature to move it'}
                  </Text>
                </View>
              )}
              
              <TouchableOpacity style={styles.changePhotoBtn} onPress={pickImage}>
                <ImageIcon size={16} color="#fff" />
                <Text style={styles.changePhotoBtnText}>{t('change') || 'Change'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                <Camera size={32} color="#10B981" />
                <Text style={styles.photoButtonText}>{t('takePhoto') || 'Take Photo'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                <ImageIcon size={32} color="#6366f1" />
                <Text style={styles.photoButtonText}>{t('fromGallery') || 'From Gallery'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.publishBtn, styles.publishBtnSigned, (!selectedImage || !selectedSignerId || isPublishing) && styles.publishBtnDisabled]}
          onPress={() => handlePublish('photo_signed')}
          disabled={!selectedImage || !selectedSignerId || isPublishing}
        >
          {isPublishing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Send size={20} color="#fff" />
              <Text style={styles.publishBtnText}>
                {((t as any)('sendDedication') || 'Envoyer la dédicace')}{selectedSigner ? ` · ${selectedSigner.display_name}` : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.publishedHeaderRow}>
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>
            {t('publishedPhotos') || 'Published Photos'} ({publishedAssets.length})
          </Text>
          {publishedAssets.length > 1 && (
            <TouchableOpacity
              style={[styles.sortBtn, sortByName && styles.sortBtnActive]}
              onPress={() => setSortByName((prev) => !prev)}
            >
              <Text style={[styles.sortBtnText, sortByName && styles.sortBtnTextActive]}>
                {sortByName ? (t('sortRecent') || 'Récentes') : (t('sortByName') || 'Par nom')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {publishedAssets.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.publishedCarousel}
            style={{ marginBottom: 20 }}
          >
            {(sortByName
              ? [...publishedAssets].sort((a, b) => {
                  const nameA = (signers.find((s) => s.id === a.signer_id)?.display_name || '').toLowerCase();
                  const nameB = (signers.find((s) => s.id === b.signer_id)?.display_name || '').toLowerCase();
                  return nameA.localeCompare(nameB);
                })
              : publishedAssets
            ).map((asset) => {
              const signerName = signers.find((s) => s.id === asset.signer_id)?.display_name || '';
              const truncatedName =
                signerName.length > 15 ? `${signerName.slice(0, 15)}...` : signerName;
              return (
                <View key={asset.id} style={styles.publishedCarouselCell}>
                  <View style={[styles.publishedCarouselItem, { backgroundColor: '#374151' }]}>
                    {asset.asset_url ? (
                      <Image
                        source={{ uri: asset.asset_url }}
                        style={styles.publishedImage}
                        resizeMode="cover"
                        onError={(e) => console.log('Image load error:', asset.asset_url, e.nativeEvent.error)}
                      />
                    ) : (
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ImageIcon size={24} color="#9ca3af" />
                      </View>
                    )}
                    {asset.asset_type === 'photo_signed' && (
                      <View style={styles.signedBadge}>
                        <Check size={10} color="#fff" />
                      </View>
                    )}
                  </View>
                  {truncatedName ? (
                    <Text style={styles.publishedSignerName} numberOfLines={1}>
                      {truncatedName}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={{ color: '#9ca3af', fontSize: 14, marginBottom: 20, fontStyle: 'italic' }}>
            {t('noPhotosPublished') || 'No photos published yet'}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.endSessionBtn, ending && styles.publishBtnDisabled]}
          onPress={handleEndSession}
          disabled={ending}
        >
          {ending ? (
            <ActivityIndicator color="#EF4444" />
          ) : (
            <>
              <StopCircle size={20} color="#EF4444" />
              <Text style={styles.endSessionBtnText}>{t('endSession') || 'Terminer la session'}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Success Modal */}
      {showSuccessModal && (
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Check size={48} color="#fff" />
            </View>
            <Text style={styles.successTitle}>{t('done') || 'Terminé'}</Text>
            <Text style={styles.successMessage}>
              {t('photoPublishedContinue') || 'Photo publiée ! Vous pouvez en ajouter une autre.'}
            </Text>
            <TouchableOpacity 
              style={styles.successButton}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={styles.successButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrModalContent}>
            <TouchableOpacity style={styles.qrModalClose} onPress={() => setShowQrModal(false)}>
              <X size={24} color="#fff" />
            </TouchableOpacity>
            
            <Text style={styles.qrModalTitle}>{t('shareEvent') || 'Partager l\'événement'}</Text>
            <Text style={styles.qrModalSubtitle}>{sessionTitle}</Text>
            
            <View style={styles.qrCodeContainer}>
              <QRCodeSvg
                value={`plyz://join/${joinCode}`}
                size={200}
                backgroundColor="#ffffff"
                color="#1a1a2e"
              />
            </View>
            
            <Text style={styles.joinCodeDisplay}>{joinCode}</Text>
            
            <View style={styles.qrModalActions}>
              <TouchableOpacity style={styles.qrModalBtn} onPress={handleCopyCode}>
                {copied ? <Check size={20} color="#10B981" /> : <Copy size={20} color="#fff" />}
                <Text style={styles.qrModalBtnText}>{copied ? (t('copied') || 'Copié!') : (t('copy') || 'Copier')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.qrModalBtn} onPress={handleShareCode}>
                <Share2 size={20} color="#fff" />
                <Text style={styles.qrModalBtnText}>{t('share') || 'Partager'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  headerCodeLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  headerCodeValue: { fontSize: 14, color: '#10B981', fontWeight: '700', letterSpacing: 1 },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 4,
  },
  typeBadgeVideo: { backgroundColor: 'rgba(139, 92, 246, 0.9)' },
  typeBadgeDedicace: { backgroundColor: 'rgba(24, 134, 97, 0.95)' },
  typeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  viewerCount: { fontSize: 14, color: '#10B981', fontWeight: '600' },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  earningsCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  earningsText: {
    color: '#10B981',
    fontSize: 15,
    fontWeight: '600' as const,
    flex: 1,
  },
  earningsDetail: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  eventInfoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  eventInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  eventInfoText: {
    color: '#d1d5db',
    fontSize: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  signersScroll: { 
    marginBottom: 20,
  },
  signersScrollContent: { 
    flexDirection: 'row', 
    gap: 16,
    paddingRight: 16,
  },
  signerBadgeWrapper: {
    alignItems: 'center',
    width: 56,
  },
  signerBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  signerBadgeActive: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  signerBadgeNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  signerBadgeCheck: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signerBadgeName: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  signerBadgeNameActive: {
    color: '#10B981',
    fontWeight: '600',
  },
  addSignerBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16,185,129,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#10B981',
    borderStyle: 'dashed',
  },
  addSignerText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  photoSection: { marginBottom: 20 },
  photoButtons: { flexDirection: 'row', gap: 12 },
  photoButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  photoButtonText: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  // Cadre arrondi pour l'apercu a l'ecran (n'est PAS inclus dans la capture).
  previewFrame: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  // Le contenu capture par ViewShot reste un rectangle plein (pas d'arrondi),
  // sinon les coins transparents apparaissent en noir sur la photo partagee.
  viewShotContainer: {},
  previewContainer: {
    position: 'relative',
  },
  previewImage: { width: '100%', aspectRatio: 3 / 4 },
  signatureOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signatureImage: {
    width: '80%',
    height: '100%',
  },
  editControls: {
    marginTop: 16,
    gap: 12,
  },
  editRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  editBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtnActive: {
    backgroundColor: '#8b5cf6',
  },
  resetText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  colorPickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 8,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  editHint: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 12,
    alignSelf: 'center',
  },
  changePhotoBtnText: { fontSize: 13, color: '#fff', fontWeight: '500' },
  publishOptions: { gap: 12 },
  signerToast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  signerToastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  signerToastDismiss: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
    marginTop: 6,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  publishBtnPhoto: { backgroundColor: '#6366f1' },
  publishBtnSigned: { backgroundColor: '#10B981' },
  publishBtnSignature: { backgroundColor: '#f59e0b' },
  publishBtnDisabled: { opacity: 0.5 },
  publishBtnText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  endSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    marginTop: 8,
    marginBottom: 8,
  },
  endSessionBtnText: { fontSize: 16, color: '#EF4444', fontWeight: '700' },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  codeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  publishedCarousel: {
    paddingHorizontal: 4,
    gap: 12,
    paddingVertical: 8,
  },
  publishedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 12,
  },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sortBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderColor: '#10B981',
  },
  sortBtnText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  sortBtnTextActive: {
    color: '#10B981',
  },
  publishedCarouselCell: {
    width: 100,
    alignItems: 'center',
  },
  publishedCarouselItem: {
    width: 100,
    height: 130,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  publishedSignerName: {
    width: 100,
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    fontWeight: '500',
  },
  publishedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  publishedItem: {
    width: '31%',
    aspectRatio: 3/4,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  publishedImage: {
    width: '100%',
    height: '100%',
  },
  signedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  successModalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    maxWidth: 320,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  successButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 30,
  },
  successButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  qrModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  qrModalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '90%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  qrModalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    marginTop: 16,
  },
  qrModalSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
  },
  qrCodeContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  joinCodeDisplay: {
    fontSize: 28,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 4,
    marginBottom: 20,
  },
  qrModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  qrModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  qrModalBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
