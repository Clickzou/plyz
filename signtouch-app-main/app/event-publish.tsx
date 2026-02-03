import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Platform,
  ActivityIndicator,
  TextInput,
  Dimensions,
  PanResponder,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Image as ImageIcon, Check, Users, Send, Move, ZoomIn, ZoomOut, RotateCcw, Palette, QrCode, X, Copy, Share2, Plus, UserPlus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import ViewShot from 'react-native-view-shot';
import { SvgUri } from 'react-native-svg';

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
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useLanguage } from '@/contexts/LanguageContext';
const QRCodeSvg = require('react-native-qrcode-svg').default;
import {
  EventSigner,
  getEventSigners,
  publishEventAsset,
  getActiveViewerCount,
} from '@/utils/eventSessionStorage';

export default function EventPublishScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const sessionId = params.sessionId as string;
  const sessionTitle = params.sessionTitle as string;
  const joinCode = params.joinCode as string;

  const [signers, setSigners] = useState<EventSigner[]>([]);
  const [selectedSignerId, setSelectedSignerId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  
  const [signaturePosition, setSignaturePosition] = useState({ x: 0, y: 0 });
  const [signatureScale, setSignatureScale] = useState(1);
  const [signatureRotation, setSignatureRotation] = useState(0);
  const [signatureColor, setSignatureColor] = useState('#FFFFFF');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const viewShotRef = useRef<ViewShot>(null);
  const previewContainerRef = useRef<View>(null);
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });
  const lastPanOffset = useRef({ x: 0, y: 0 });
  
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        lastPanOffset.current = { x: 0, y: 0 };
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderMove: (_, gestureState) => {
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
    })
  ).current;

  const loadSigners = useCallback(async () => {
    const loadedSigners = await getEventSigners(sessionId);
    setSigners(loadedSigners);
    if (loadedSigners.length > 0 && !selectedSignerId) {
      setSelectedSignerId(loadedSigners[0].id);
    }
  }, [sessionId, selectedSignerId]);

  useFocusEffect(
    useCallback(() => {
      loadSigners();
      getActiveViewerCount(sessionId).then(setViewerCount);
    }, [sessionId, loadSigners])
  );

  useEffect(() => {
    const interval = setInterval(async () => {
      const count = await getActiveViewerCount(sessionId);
      setViewerCount(count);
    }, 30000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const resetSignatureTransform = () => {
    setSignaturePosition({ x: 0, y: 0 });
    setSignatureScale(1);
    setSignatureRotation(0);
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
      }) || Alert.alert('Partager', `Code: ${joinCode}`);
    } catch (e) {
      Alert.alert('Partager', `Code: ${joinCode}`);
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
          
          const sigWidth = 150 * signatureScale;
          const sigHeight = (sigImg.height / sigImg.width) * sigWidth;
          const sigX = (canvas.width / 2) + signaturePosition.x - (sigWidth / 2);
          const sigY = (canvas.height / 2) + signaturePosition.y - (sigHeight / 2);
          
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
      allowsEditing: true,
      aspect: [3, 4],
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      const message = (t('cameraNotAvailable') || 'Camera not available') + '\n\n' + 
        (t('useMobileOrGallery') || 'Camera is not available on web. Please use the gallery or try on a mobile device.');
      if (typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert(t('cameraNotAvailable') || 'Camera not available', t('useMobileOrGallery') || 'Camera is not available on web.');
      }
      return;
    }
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('error') || 'Error', t('cameraPermissionNeeded') || 'Camera permission needed');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [3, 4],
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handlePublish = async (type: 'photo' | 'photo_signed') => {
    if (!selectedImage) {
      Alert.alert(t('error') || 'Error', t('selectImageFirst') || 'Select an image first');
      return;
    }

    setIsPublishing(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const imageToPublish = type === 'photo_signed' ? await captureComposite() : selectedImage;
      
      await publishEventAsset(
        sessionId,
        imageToPublish,
        type,
        type === 'photo_signed' ? selectedSignerId || undefined : undefined
      );

      setPublishedCount((prev) => prev + 1);
      setSelectedImage(null);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert(t('done') || 'Done', t('photoPublished') || 'Photo published!');
    } catch (error) {
      console.error('Publish error:', error);
      Alert.alert(t('error') || 'Error', t('publishFailed') || 'Failed to publish');
    } finally {
      setIsPublishing(false);
    }
  };

  const selectedSigner = signers.find((s) => s.id === selectedSignerId);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('publish') || 'Publish'}</Text>
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
              <Text style={styles.statValue}>{joinCode}</Text>
              <QrCode size={14} color="#10B981" />
            </View>
            <Text style={styles.statLabel}>{t('showQrCode') || 'Voir QR'}</Text>
          </TouchableOpacity>
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
                      <Image 
                        source={{ uri: selectedSigner.signature_url }} 
                        style={[styles.signatureImage, { tintColor: signatureColor }]} 
                        resizeMode="contain" 
                      />
                    </View>
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
                    <TouchableOpacity style={styles.editBtn} onPress={resetSignatureTransform}>
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
      </ScrollView>

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
