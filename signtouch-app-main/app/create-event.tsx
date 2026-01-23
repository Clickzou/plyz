import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Sparkles, QrCode, Copy, Share2, Check, Pencil } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path, G } from 'react-native-svg';
import { 
  GestureHandlerRootView,
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
const QRCode = require('react-native-qrcode-svg').default;
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { createLiveEvent, LiveEvent } from '@/utils/liveEventStorage';

interface PathData {
  id: string;
  d: string;
  color: string;
  strokeWidth: number;
}

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();

  const [eventName, setEventName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<LiveEvent | null>(null);
  const [copied, setCopied] = useState(false);

  const [paths, setPaths] = useState<PathData[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const currentPathRef = useRef<string>('');
  const signatureColor = '#000000';
  const strokeWidth = 3;

  const handlePanGesture = useCallback((event: PanGestureHandlerGestureEvent) => {
    const { x, y } = event.nativeEvent;
    
    if (event.nativeEvent.state === 2) {
      currentPathRef.current = `M${x},${y}`;
      setCurrentPath(currentPathRef.current);
    } else if (event.nativeEvent.state === 4) {
      currentPathRef.current += ` L${x},${y}`;
      setCurrentPath(currentPathRef.current);
    }
  }, []);

  const handlePanEnd = useCallback(() => {
    if (currentPathRef.current) {
      const newPath: PathData = {
        id: Date.now().toString(),
        d: currentPathRef.current,
        color: signatureColor,
        strokeWidth,
      };
      setPaths(prev => [...prev, newPath]);
      currentPathRef.current = '';
      setCurrentPath('');
    }
  }, [signatureColor, strokeWidth]);

  const clearSignature = () => {
    setPaths([]);
    setCurrentPath('');
    currentPathRef.current = '';
  };

  const getSignatureSvgString = (): string => {
    const pathsString = paths.map(p => 
      `<path d="${p.d}" stroke="${p.color}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    ).join('');
    
    return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150">
      <g>${pathsString}</g>
    </svg>`;
  };

  const handleCreateEvent = async () => {
    if (!eventName.trim()) {
      Alert.alert(t('error') || 'Error', t('eventNameRequired') || 'Please enter an event name');
      return;
    }

    if (!user) {
      Alert.alert(t('error') || 'Error', t('loginRequired') || 'Please log in to create an event');
      router.push('/account');
      return;
    }

    setIsCreating(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const event = await createLiveEvent(
        user.id,
        eventName.trim(),
        '',
        undefined,
        24
      );

      setCreatedEvent(event);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert(t('error') || 'Error', t('eventCreationFailed') || 'Failed to create event');
    } finally {
      setIsCreating(false);
    }
  };

  const copyCode = async () => {
    if (createdEvent) {
      await Clipboard.setStringAsync(createdEvent.code);
      setCopied(true);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareEvent = async () => {
    if (createdEvent) {
      try {
        await Share.share({
          message: `${t('joinMyEvent') || 'Join my event'} "${createdEvent.name}"!\n\n${t('eventCode') || 'Code'}: ${createdEvent.code}\n\n${t('openSignTouch') || 'Open SignTouch and enter this code to get my signature!'}`,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    }
  };

  const qrValue = createdEvent ? `signtouch://event/${createdEvent.code}` : '';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('createEvent') || 'Create Event'}</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {!createdEvent ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('eventName') || 'Event Name'}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('eventNamePlaceholder') || 'Concert, Match, Meeting...'}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={eventName}
                  onChangeText={setEventName}
                  maxLength={50}
                />
              </View>

              <View style={styles.qrHintContainer}>
                <QrCode size={60} color="rgba(255,255,255,0.3)" />
                <Text style={styles.qrHintText}>
                  {t('qrCodeHint') || 'A unique QR code will be generated for your event'}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.createButton, isCreating && styles.createButtonDisabled]}
                onPress={handleCreateEvent}
                disabled={isCreating}
                activeOpacity={0.8}
              >
                {isCreating ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Sparkles size={20} color="#ffffff" />
                    <Text style={styles.createButtonText}>{t('generateQRCode') || 'Generate QR Code'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Check size={40} color="#10B981" />
              </View>
              <Text style={styles.successTitle}>{t('eventCreated') || 'Event Created!'}</Text>
              <Text style={styles.eventNameText}>{createdEvent.name}</Text>

              <View style={styles.qrContainer}>
                <QRCode
                  value={qrValue}
                  size={200}
                  backgroundColor="#ffffff"
                  color="#1a1a2e"
                />
              </View>

              <View style={styles.codeContainer}>
                <Text style={styles.codeLabel}>{t('eventCode') || 'Event Code'}</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.codeText}>{createdEvent.code}</Text>
                  <TouchableOpacity onPress={copyCode} style={styles.copyButton}>
                    {copied ? (
                      <Check size={20} color="#10B981" />
                    ) : (
                      <Copy size={20} color="#ffffff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.shareButton} onPress={shareEvent}>
                  <Share2 size={20} color="#ffffff" />
                  <Text style={styles.shareButtonText}>{t('share') || 'Share'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.expiresText}>
                {t('eventExpires24h') || 'This event expires in 24 hours'}
              </Text>
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    </GestureHandlerRootView>
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
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerRight: {
    width: 44,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  signatureContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  signatureCanvas: {
    height: 150,
    position: 'relative',
  },
  signaturePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signaturePlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.3)',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
  },
  clearButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  qrHintContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    marginBottom: 20,
  },
  qrHintText: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 18,
    gap: 10,
    marginTop: 20,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  eventNameText: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 30,
  },
  qrContainer: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    marginBottom: 24,
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  codeLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  codeText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 4,
  },
  copyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  expiresText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
});
