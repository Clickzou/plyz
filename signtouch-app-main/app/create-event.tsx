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
import { ArrowLeft, Sparkles, QrCode, Copy, Share2, Check, Plus, X, Clock, Users } from 'lucide-react-native';
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
import { 
  createEventSession, 
  addEventSigner, 
  EventSession,
  EventSigner 
} from '@/utils/eventSessionStorage';

interface PathData {
  id: string;
  d: string;
  color: string;
  strokeWidth: number;
}

interface SignerEntry {
  name: string;
  paths: PathData[];
}

const DURATION_OPTIONS = [
  { label: '10 min', value: 10 },
  { label: '30 min', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '4h', value: 240 },
  { label: '12h', value: 720 },
  { label: '24h', value: 1440 },
];

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();

  const [step, setStep] = useState<'config' | 'signers' | 'success'>('config');
  const [eventName, setEventName] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [isCreating, setIsCreating] = useState(false);
  const [createdSession, setCreatedSession] = useState<EventSession | null>(null);
  const [createdSigners, setCreatedSigners] = useState<EventSigner[]>([]);
  const [copied, setCopied] = useState(false);

  const [signers, setSigners] = useState<SignerEntry[]>([{ name: '', paths: [] }]);
  const [activeSignerIndex, setActiveSignerIndex] = useState(0);
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
      setSigners(prev => {
        const updated = [...prev];
        updated[activeSignerIndex] = {
          ...updated[activeSignerIndex],
          paths: [...updated[activeSignerIndex].paths, newPath],
        };
        return updated;
      });
      currentPathRef.current = '';
      setCurrentPath('');
    }
  }, [activeSignerIndex]);

  const clearSignature = () => {
    setSigners(prev => {
      const updated = [...prev];
      updated[activeSignerIndex] = { ...updated[activeSignerIndex], paths: [] };
      return updated;
    });
    setCurrentPath('');
    currentPathRef.current = '';
  };

  const addSigner = () => {
    setSigners(prev => [...prev, { name: '', paths: [] }]);
    setActiveSignerIndex(signers.length);
  };

  const removeSigner = (index: number) => {
    if (signers.length <= 1) return;
    setSigners(prev => prev.filter((_, i) => i !== index));
    if (activeSignerIndex >= index && activeSignerIndex > 0) {
      setActiveSignerIndex(activeSignerIndex - 1);
    }
  };

  const updateSignerName = (index: number, name: string) => {
    setSigners(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name };
      return updated;
    });
  };

  const getSignatureSvgUri = (paths: PathData[]): string => {
    if (paths.length === 0) return '';
    const pathsString = paths.map(p => 
      `<path d="${p.d}" stroke="${p.color}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    ).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><g>${pathsString}</g></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  const handleNext = () => {
    if (!eventName.trim()) {
      Alert.alert(t('error') || 'Error', t('eventNameRequired') || 'Please enter an event name');
      return;
    }
    setStep('signers');
  };

  const handleCreateEvent = async () => {
    const validSigners = signers.filter(s => s.name.trim() && s.paths.length > 0);
    if (validSigners.length === 0) {
      Alert.alert(t('error') || 'Error', t('atLeastOneSigner') || 'Add at least one signature');
      return;
    }

    setIsCreating(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const creatorId = user?.id || undefined;
      const session = await createEventSession(eventName.trim(), selectedDuration, creatorId);
      
      const addedSigners: EventSigner[] = [];
      for (const signer of validSigners) {
        const signatureUri = getSignatureSvgUri(signer.paths);
        const addedSigner = await addEventSigner(session.id, signer.name.trim(), signatureUri);
        addedSigners.push(addedSigner);
      }

      setCreatedSession(session);
      setCreatedSigners(addedSigners);
      setStep('success');
      
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error creating session:', error);
      Alert.alert(t('error') || 'Error', t('eventCreationFailed') || 'Failed to create event');
    } finally {
      setIsCreating(false);
    }
  };

  const copyCode = async () => {
    if (createdSession) {
      await Clipboard.setStringAsync(createdSession.join_code);
      setCopied(true);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareEvent = async () => {
    if (createdSession) {
      try {
        await Share.share({
          message: `${t('joinMyEvent') || 'Join my event'} "${createdSession.title}"!\n\n${t('eventCode') || 'Code'}: ${createdSession.join_code}\n\n${t('openSignTouch') || 'Open SignTouch and enter this code!'}`,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    }
  };

  const goToPublish = () => {
    if (createdSession) {
      router.push({
        pathname: '/event-publish',
        params: { 
          sessionId: createdSession.id,
          sessionTitle: createdSession.title,
          joinCode: createdSession.join_code,
        }
      });
    }
  };

  const formatDuration = (minutes: number): string => {
    const endsAt = new Date(Date.now() + minutes * 60 * 1000);
    return endsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const qrValue = createdSession ? `signtouch://event/${createdSession.join_code}` : '';
  const activeSigner = signers[activeSignerIndex];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => step === 'signers' ? setStep('config') : router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === 'config' && (t('createEvent') || 'Create Event')}
            {step === 'signers' && (t('addSignatures') || 'Add Signatures')}
            {step === 'success' && (t('eventCreated') || 'Event Created!')}
          </Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView 
          style={styles.content}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 16) + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          {step === 'config' && (
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

              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Clock size={18} color="#10B981" />
                  <Text style={styles.sectionTitle}>{t('eventDuration') || 'Duration'}</Text>
                </View>
                <View style={styles.durationGrid}>
                  {DURATION_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.durationButton,
                        selectedDuration === option.value && styles.durationButtonActive
                      ]}
                      onPress={() => setSelectedDuration(option.value)}
                    >
                      <Text style={[
                        styles.durationButtonText,
                        selectedDuration === option.value && styles.durationButtonTextActive
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.durationHint}>
                  {t('endsAt') || 'Ends at'}: {formatDuration(selectedDuration)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.nextButton}
                onPress={handleNext}
                activeOpacity={0.8}
              >
                <Text style={styles.nextButtonText}>{t('next') || 'Next'}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'signers' && (
            <>
              <View style={styles.signerTabs}>
                {signers.map((signer, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.signerTab, activeSignerIndex === index && styles.signerTabActive]}
                    onPress={() => setActiveSignerIndex(index)}
                  >
                    <Text style={[styles.signerTabText, activeSignerIndex === index && styles.signerTabTextActive]}>
                      {signer.name || `#${index + 1}`}
                    </Text>
                    {signers.length > 1 && (
                      <TouchableOpacity onPress={() => removeSigner(index)} style={styles.removeSignerBtn}>
                        <X size={14} color={activeSignerIndex === index ? '#fff' : '#999'} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.addSignerBtn} onPress={addSigner}>
                  <Plus size={20} color="#10B981" />
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('celebrityName') || 'Celebrity Name'}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('enterName') || 'Enter name...'}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={activeSigner.name}
                  onChangeText={(text) => updateSignerName(activeSignerIndex, text)}
                  maxLength={40}
                />
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>{t('signature') || 'Signature'}</Text>
                  {activeSigner.paths.length > 0 && (
                    <TouchableOpacity onPress={clearSignature} style={styles.clearBtn}>
                      <Text style={styles.clearBtnText}>{t('clear') || 'Clear'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.signatureContainer}>
                  <PanGestureHandler
                    onGestureEvent={handlePanGesture}
                    onEnded={handlePanEnd}
                  >
                    <View style={styles.signatureCanvas}>
                      <Svg width="100%" height="100%" viewBox="0 0 300 150">
                        <G>
                          {activeSigner.paths.map((path) => (
                            <Path
                              key={path.id}
                              d={path.d}
                              stroke={path.color}
                              strokeWidth={path.strokeWidth}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ))}
                          {currentPath && (
                            <Path
                              d={currentPath}
                              stroke={signatureColor}
                              strokeWidth={strokeWidth}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                        </G>
                      </Svg>
                      {activeSigner.paths.length === 0 && !currentPath && (
                        <View style={styles.signaturePlaceholder}>
                          <Text style={styles.signaturePlaceholderText}>
                            {t('drawSignatureHere') || 'Draw signature here'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </PanGestureHandler>
                </View>
              </View>

              <View style={styles.signersSummary}>
                <Users size={16} color="#10B981" />
                <Text style={styles.signersSummaryText}>
                  {signers.filter(s => s.name.trim() && s.paths.length > 0).length} {t('signaturesReady') || 'signatures ready'}
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
          )}

          {step === 'success' && createdSession && (
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Check size={40} color="#10B981" />
              </View>
              <Text style={styles.successTitle}>{t('eventCreated') || 'Event Created!'}</Text>
              <Text style={styles.eventNameText}>{createdSession.title}</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Users size={18} color="#10B981" />
                  <Text style={styles.statText}>{createdSigners.length} {t('celebrities') || 'celebrities'}</Text>
                </View>
                <View style={styles.statItem}>
                  <Clock size={18} color="#10B981" />
                  <Text style={styles.statText}>
                    {t('until') || 'Until'} {new Date(createdSession.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>

              <View style={styles.qrContainer}>
                <QRCode
                  value={qrValue}
                  size={180}
                  backgroundColor="#ffffff"
                  color="#1a1a2e"
                />
              </View>

              <View style={styles.codeContainer}>
                <Text style={styles.codeLabel}>{t('eventCode') || 'Event Code'}</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.codeText}>{createdSession.join_code}</Text>
                  <TouchableOpacity onPress={copyCode} style={styles.copyButton}>
                    {copied ? <Check size={20} color="#10B981" /> : <Copy size={20} color="#ffffff" />}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.actionsColumn}>
                <TouchableOpacity style={styles.publishButton} onPress={goToPublish}>
                  <Sparkles size={20} color="#ffffff" />
                  <Text style={styles.publishButtonText}>{t('publishPhotos') || 'Publish Photos'}</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.shareButton} onPress={shareEvent}>
                  <Share2 size={20} color="#ffffff" />
                  <Text style={styles.shareButtonText}>{t('shareQRCode') || 'Share QR Code'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#ffffff' },
  headerRight: { width: 44 },
  content: { flex: 1 },
  contentContainer: { padding: 20 },
  section: { marginBottom: 24 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  durationButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  durationButtonActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  durationButtonText: { color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  durationButtonTextActive: { color: '#ffffff' },
  durationHint: { marginTop: 12, color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  nextButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 20,
  },
  nextButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  signerTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  signerTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  signerTabActive: { backgroundColor: '#10B981' },
  signerTabText: { color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  signerTabTextActive: { color: '#ffffff' },
  removeSignerBtn: { marginLeft: 4 },
  addSignerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16,185,129,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 8 },
  clearBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '500' },
  signatureContainer: { backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden' },
  signatureCanvas: { height: 150, position: 'relative' },
  signaturePlaceholder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  signaturePlaceholderText: { fontSize: 14, color: 'rgba(0,0,0,0.3)' },
  signersSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20, justifyContent: 'center' },
  signersSummaryText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  createButtonDisabled: { opacity: 0.7 },
  createButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  successContainer: { alignItems: 'center', paddingTop: 10 },
  successIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(16,185,129,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
  eventNameText: { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  qrContainer: { padding: 16, backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 20 },
  codeContainer: { alignItems: 'center', marginBottom: 20 },
  codeLabel: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeText: { fontSize: 28, fontWeight: '700', color: '#ffffff', letterSpacing: 4 },
  copyButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsColumn: { gap: 12, width: '100%' },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
  },
  publishButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
  },
  shareButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
