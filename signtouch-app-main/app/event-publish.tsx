import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Image as ImageIcon, Check, Users, Send, Pen } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/contexts/LanguageContext';
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

  useEffect(() => {
    const loadData = async () => {
      const loadedSigners = await getEventSigners(sessionId);
      setSigners(loadedSigners);
      if (loadedSigners.length > 0) {
        setSelectedSignerId(loadedSigners[0].id);
      }
      const count = await getActiveViewerCount(sessionId);
      setViewerCount(count);
    };
    loadData();

    const interval = setInterval(async () => {
      const count = await getActiveViewerCount(sessionId);
      setViewerCount(count);
    }, 30000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const pickImage = async () => {
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
      await publishEventAsset(
        sessionId,
        selectedImage,
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

  const publishSignatureOnly = async () => {
    if (!selectedSignerId) {
      Alert.alert(t('error') || 'Error', t('selectSignerFirst') || 'Select a signer first');
      return;
    }

    const signer = signers.find((s) => s.id === selectedSignerId);
    if (!signer?.signature_url) {
      Alert.alert(t('error') || 'Error', t('noSignatureAvailable') || 'No signature available');
      return;
    }

    setIsPublishing(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      await publishEventAsset(sessionId, signer.signature_url, 'signature', selectedSignerId);
      setPublishedCount((prev) => prev + 1);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert(t('done') || 'Done', t('signaturePublished') || 'Signature published!');
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
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{joinCode}</Text>
            <Text style={styles.statLabel}>{t('code') || 'Code'}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('selectSigner') || 'Select Signer'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.signersScroll}>
          <View style={styles.signersRow}>
            {signers.map((signer) => (
              <TouchableOpacity
                key={signer.id}
                style={[styles.signerCard, selectedSignerId === signer.id && styles.signerCardActive]}
                onPress={() => setSelectedSignerId(signer.id)}
              >
                {signer.signature_url && (
                  <Image source={{ uri: signer.signature_url }} style={styles.signerSignature} resizeMode="contain" />
                )}
                <Text style={[styles.signerName, selectedSignerId === signer.id && styles.signerNameActive]}>
                  {signer.display_name}
                </Text>
                {selectedSignerId === signer.id && (
                  <View style={styles.checkBadge}>
                    <Check size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={styles.sectionTitle}>{t('selectPhoto') || 'Select Photo'}</Text>
        <View style={styles.photoSection}>
          {selectedImage ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: selectedImage }} style={styles.previewImage} resizeMode="cover" />
              <TouchableOpacity style={styles.changePhotoBtn} onPress={pickImage}>
                <ImageIcon size={16} color="#fff" />
                <Text style={styles.changePhotoBtnText}>{t('change') || 'Change'}</Text>
              </TouchableOpacity>
            </View>
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

        <Text style={styles.sectionTitle}>{t('publishOptions') || 'Publish Options'}</Text>
        <Text style={styles.introText}>
          {t('publishIntro') || 'Choose how to share content with your fans. They can view and download from their gallery in real-time.'}
        </Text>
        <View style={styles.publishOptions}>
          <TouchableOpacity
            style={[styles.publishBtn, styles.publishBtnSigned, (!selectedImage || !selectedSignerId || isPublishing) && styles.publishBtnDisabled]}
            onPress={() => handlePublish('photo_signed')}
            disabled={!selectedImage || !selectedSignerId || isPublishing}
          >
            {isPublishing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Pen size={20} color="#fff" />
                <Text style={styles.publishBtnText}>
                  {t('photoWithSignature') || 'Photo + Signature'}
                  {selectedSigner && ` (${selectedSigner.display_name})`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.publishBtn, styles.publishBtnSignature, (!selectedSignerId || isPublishing) && styles.publishBtnDisabled]}
            onPress={publishSignatureOnly}
            disabled={!selectedSignerId || isPublishing}
          >
            {isPublishing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Send size={20} color="#fff" />
                <Text style={styles.publishBtnText}>
                  {t('signatureOnly') || 'Signature Only'}
                  {selectedSigner && ` (${selectedSigner.display_name})`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  introText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 16, lineHeight: 20 },
  signersScroll: { marginBottom: 20 },
  signersRow: { flexDirection: 'row', gap: 12 },
  signerCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  signerCardActive: { borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.2)' },
  signerSignature: { width: 80, height: 40, marginBottom: 8 },
  signerName: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  signerNameActive: { color: '#10B981' },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
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
  previewContainer: { position: 'relative' },
  previewImage: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16 },
  changePhotoBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
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
});
