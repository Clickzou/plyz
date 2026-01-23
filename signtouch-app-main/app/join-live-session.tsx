import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Camera,
  Send,
  Users,
  Clock,
  Check,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  LiveSession,
  QueueEntry,
  getSessionByCode,
  joinSessionQueue,
  getQueueEntryByFanId,
  uploadFanPhoto,
  subscribeToSession,
  subscribeToQueueEntry,
} from '@/utils/liveSessionStorage';

export default function JoinLiveSessionScreen() {
  const router = useRouter();
  const { code: paramCode } = useLocalSearchParams<{ code?: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [code, setCode] = useState(paramCode || '');
  const [session, setSession] = useState<LiveSession | null>(null);
  const [step, setStep] = useState<'code' | 'upload' | 'queue' | 'signing'>('code');
  const [fanName, setFanName] = useState('');
  const [message, setMessage] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [queuePosition, setQueuePosition] = useState(0);

  const fanId = useMemo(() => `fan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, []);
  const sessionChannelRef = useRef<RealtimeChannel | null>(null);
  const queueChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    return () => {
      if (sessionChannelRef.current) {
        sessionChannelRef.current.unsubscribe();
      }
      if (queueChannelRef.current) {
        queueChannelRef.current.unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (paramCode) {
      handleJoinWithCode(paramCode);
    }
  }, [paramCode]);

  const handleJoinWithCode = async (inputCode: string) => {
    if (inputCode.length !== 6) {
      Alert.alert(t('error'), t('liveSessionInvalidCode'));
      return;
    }

    setIsLoading(true);
    try {
      const s = await getSessionByCode(inputCode.toUpperCase());
      if (!s) {
        Alert.alert(t('error'), t('liveSessionNotFound'));
        setIsLoading(false);
        return;
      }

      if (s.status === 'ended') {
        Alert.alert(t('error'), t('liveSessionHasEnded'));
        setIsLoading(false);
        return;
      }

      if (s.slots_used >= s.max_slots) {
        Alert.alert(t('error'), t('liveSessionFull'));
        setIsLoading(false);
        return;
      }

      setSession(s);
      setStep('upload');

      sessionChannelRef.current = subscribeToSession(s.id, (updated) => {
        setSession(updated);
        if (updated.status === 'ended') {
          Alert.alert(t('info'), t('liveSessionHasEnded'));
        }
      });
    } catch (error) {
      console.error('Error joining session:', error);
      Alert.alert(t('error'), t('liveSessionJoinError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('error'), t('cameraPermissionDenied'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleJoinQueue = async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      let photoUrl: string | null = null;
      if (photoUri) {
        photoUrl = await uploadFanPhoto(session.id, fanId, photoUri);
      }

      const entry = await joinSessionQueue(
        session.id,
        fanId,
        fanName.trim() || '',
        photoUrl,
        message.trim() || ''
      );

      if (!entry) {
        Alert.alert(t('error'), t('liveSessionJoinError'));
        setIsLoading(false);
        return;
      }

      setQueueEntry(entry);
      setQueuePosition(entry.position);
      setStep('queue');

      queueChannelRef.current = subscribeToQueueEntry(entry.id, (updated) => {
        setQueueEntry(updated);
        if (updated.status === 'current' || updated.status === 'signing') {
          setStep('signing');
        } else if (updated.status === 'completed') {
          router.replace({
            pathname: '/live-signature-result',
            params: { entryId: updated.id },
          });
        }
      });
    } catch (error) {
      console.error('Error joining queue:', error);
      Alert.alert(t('error'), t('liveSessionJoinError'));
    } finally {
      setIsLoading(false);
    }
  };

  const renderCodeStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Users size={60} color="#fff" />
      </View>

      <Text style={styles.title}>{t('liveSessionJoinTitle')}</Text>
      <Text style={styles.subtitle}>{t('liveSessionJoinSubtitle')}</Text>

      <TextInput
        style={styles.codeInput}
        placeholder="ABC123"
        placeholderTextColor="rgba(255,255,255,0.5)"
        value={code}
        onChangeText={(text) => setCode(text.toUpperCase())}
        maxLength={6}
        autoCapitalize="characters"
      />

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
        onPress={() => handleJoinWithCode(code)}
        disabled={isLoading || code.length !== 6}
      >
        {isLoading ? (
          <ActivityIndicator color="#6366f1" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('liveSessionJoin')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderUploadStep = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.stepContainer}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{session?.celebrity_name}</Text>
        <Text style={styles.subtitle}>{t('liveSessionUploadHint')}</Text>

        <View style={styles.photoSection}>
          {photoUri ? (
            <TouchableOpacity onPress={handlePickPhoto}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              <Text style={styles.changePhotoText}>{t('liveSessionChangePhoto')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                <Camera size={32} color="#6366f1" />
                <Text style={styles.photoButtonText}>{t('liveSessionTakePhoto')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoButton} onPress={handlePickPhoto}>
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={styles.galleryIcon}
                />
                <Text style={styles.photoButtonText}>{t('liveSessionChoosePhoto')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TextInput
          style={styles.nameInput}
          placeholder={t('liveSessionYourNameOptional')}
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={fanName}
          onChangeText={setFanName}
          maxLength={50}
        />

        <TextInput
          style={[styles.nameInput, styles.messageInput]}
          placeholder={t('liveSessionMessageOptional')}
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={message}
          onChangeText={setMessage}
          maxLength={100}
          multiline
        />

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
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
    </KeyboardAvoidingView>
  );

  const renderQueueStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.queueIconContainer}>
        <Clock size={60} color="#fff" />
      </View>

      <Text style={styles.title}>{t('liveSessionInQueue')}</Text>
      <Text style={styles.queuePosition}>#{queueEntry?.position || queuePosition}</Text>
      <Text style={styles.subtitle}>{t('liveSessionWaitingHint')}</Text>

      <View style={styles.waitingAnimation}>
        <ActivityIndicator size="large" color="#fff" />
      </View>

      <Text style={styles.waitingNote}>{t('liveSessionDontLeave')}</Text>
    </View>
  );

  const renderSigningStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.signingIconContainer}>
        <Check size={60} color="#4ade80" />
      </View>

      <Text style={styles.title}>{t('liveSessionYourTurn')}</Text>
      <Text style={styles.subtitle}>{t('liveSessionSigningNow')}</Text>

      <View style={styles.waitingAnimation}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>

      <Text style={styles.waitingNote}>{t('liveSessionWatchSignature')}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#6366f1', '#4f46e5']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('liveSessionJoinSession')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === 'code' && renderCodeStep()}
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingVertical: 18,
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366f1',
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
});
