import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
  TextInput,
  Dimensions,
  PanResponder,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Image as ImageIcon, Check, Users, Send, Move, ZoomIn, ZoomOut, RotateCcw, Palette, QrCode, X, Copy, Share2, Plus, UserPlus, Calendar, Clock, Video, MapPin, Euro } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import ViewShot from 'react-native-view-shot';
import { SvgUri, SvgXml } from 'react-native-svg';

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
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useLanguage } from '@/contexts/LanguageContext';
import BottomNav from '@/components/BottomNav';
const QRCodeSvg = require('react-native-qrcode-svg').default;
import {
  EventSigner,
  SignatureMetadata,
  getEventSigners,
  publishEventAsset,
  getActiveViewerCount,
  fetchEventAssets,
} from '@/utils/eventSessionStorage';

export default function EventPublishScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

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
      return date.toLocaleString('fr-FR', { 
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
  const [viewerCount, setViewerCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [publishedAssets, setPublishedAssets] = useState<any[]>([]);
  const [realNetCents, setRealNetCents] = useState<number | null>(null);
  const [paidFanCount, setPaidFanCount] = useState(0);
  
  const [signaturePosition, setSignaturePosition] = useState({ x: 0, y: 0 });
  const [signatureScale, setSignatureScale] = useState(1);
  const [signatureRotation, setSignatureRotation] = useState(0);
  const [signatureColor, setSignatureColor] = useState('#FFFFFF');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [coloredSvgXml, setColoredSvgXml] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  const selectedSigner = signers.find((s) => s.id === selectedSignerId);
  
  // Fetch and colorize SVG for mobile
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!selectedSigner?.signature_url) {
      setColoredSvgXml(null);
      return;
    }
    
    const fetchAndColorSvg = async () => {
      try {
        const response = await fetch(selectedSigner.signature_url);
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
  }, [selectedSigner?.signature_url, signatureColor]);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const viewShotRef = useRef<ViewShot>(null);
  const previewContainerRef = useRef<View>(null);
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
        fetch(`${STRIPE_SERVER_URL}/api/event-session-earnings?event_session_id=${sessionId}`)
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
          const r = await fetch(`${STRIPE_SERVER_URL}/api/event-session-earnings?event_session_id=${sessionId}`);
          const data = await r.json();
          if (data.net_cents !== undefined) setRealNetCents(data.net_cents);
          if (data.paid_fan_count !== undefined) setPaidFanCount(data.paid_fan_count);
        } catch {}
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [sessionId, priceCents]);

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
    try {
      await navigator.share?.({
        title: sessionTitle,
        text: `Rejoignez mon événement SignTouch avec le code: ${joinCode}`,
      }) || showAlert(t('share'), `Code: ${joinCode}`);
    } catch (e) {
      showAlert(t('share'), `Code: ${joinCode}`);
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
      const message = (t('cameraNotAvailable') || 'Camera not available') + '\n\n' + 
        (t('useMobileOrGallery') || 'Camera is not available on web. Please use the gallery or try on a mobile device.');
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

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('myEvents') || 'My Events'}</Text>
          <Text style={styles.headerSubtitle}>{sessionTitle}</Text>
        </View>
        <View style={styles.viewerBadge}>
          <Users size={14} color="#10B981" />
          <Text style={styles.viewerCount}>{viewerCount}</Text>
        </View>
      </View>

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
                        ) : (
                          <SvgUri 
                            uri={selectedSigner.signature_url}
                            width={200}
                            height={100}
                          />
                        )}
                      </View>
                    )
                  )}
                </View>
              </ViewShot>
              
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
                      <RotateCcw size={20} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
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
                {(t as any)('sendDedication') || 'Send Dedication'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          {t('publishedPhotos') || 'Published Photos'} ({publishedAssets.length})
        </Text>
        {publishedAssets.length > 0 ? (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.publishedCarousel}
            style={{ marginBottom: 20 }}
          >
            {publishedAssets.map((asset) => (
              <View key={asset.id} style={[styles.publishedCarouselItem, { backgroundColor: '#374151' }]}>
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
            ))}
          </ScrollView>
        ) : (
          <Text style={{ color: '#9ca3af', fontSize: 14, marginBottom: 20, fontStyle: 'italic' }}>
            {t('noPhotosPublished') || 'No photos published yet'}
          </Text>
        )}
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
                value={`signtouch://join/${joinCode}`}
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
  viewShotContainer: { 
    overflow: 'hidden',
    borderRadius: 16,
  },
  previewContainer: { 
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
  },
  previewImage: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16 },
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
  publishedCarouselItem: {
    width: 100,
    height: 130,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
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
