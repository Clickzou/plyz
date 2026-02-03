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
  GestureResponderEvent,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Sparkles, QrCode, Copy, Share2, Check, Plus, X, Clock, Users, MapPin, Calendar, Music, Trophy, Palette, Star, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path, G } from 'react-native-svg';
import { GestureHandlerRootView, PanGestureHandler, TapGestureHandler, State } from 'react-native-gesture-handler';
const QRCode = require('react-native-qrcode-svg').default;
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import AccountModal from '@/components/AccountModal';
import { EventType } from '@/utils/memoriesStorage';

const EVENT_TYPES: { type: EventType; icon: any; color: string; labelKey: string }[] = [
  { type: 'concert', icon: Music, color: '#8b5cf6', labelKey: 'eventConcert' },
  { type: 'match', icon: Trophy, color: '#22c55e', labelKey: 'eventMatch' },
  { type: 'expo', icon: Palette, color: '#f59e0b', labelKey: 'eventExpo' },
  { type: 'salon', icon: Users, color: '#3b82f6', labelKey: 'eventSalon' },
  { type: 'dedicace', icon: Star, color: '#ec4899', labelKey: 'eventDedicace' },
  { type: 'rencontre', icon: User, color: '#14b8a6', labelKey: 'eventRencontre' },
  { type: 'amis', icon: Users, color: '#f472b6', labelKey: 'eventAmis' },
  { type: 'autre', icon: Calendar, color: '#6b7280', labelKey: 'eventAutre' },
];
import { useAuth } from '@/contexts/AuthContext';
import { 
  createEventSession, 
  addEventSigner, 
  startScheduledEvent,
  getMyScheduledEvents,
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
  { label: '5h', value: 300 },
  { label: '6h', value: 360 },
  { label: '7h', value: 420 },
  { label: '8h', value: 480 },
  { label: '9h', value: 540 },
  { label: '10h', value: 600 },
  { label: '11h', value: 660 },
  { label: '12h', value: 720 },
  { label: '24h', value: 1440 },
];

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, setPostAuthRedirect } = useAuth();
  const { status } = useSubscription();
  const [showAccountModal, setShowAccountModal] = useState(false);

  const [step, setStep] = useState<'config' | 'signers' | 'success'>('config');
  const [eventName, setEventName] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [eventLocation, setEventLocation] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [eventTime, setEventTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [eventType, setEventType] = useState<EventType>('rencontre');
  const [isLive, setIsLive] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdSession, setCreatedSession] = useState<EventSession | null>(null);
  const [createdSigners, setCreatedSigners] = useState<EventSigner[]>([]);
  const [copied, setCopied] = useState(false);

  const [signers, setSigners] = useState<SignerEntry[]>([{ name: '', paths: [] }]);
  const [activeSignerIndex, setActiveSignerIndex] = useState(0);
  const [currentPath, setCurrentPath] = useState<string>('');
  const currentPathRef = useRef<string>('');
  const signatureColor = '#FFFFFF';
  const strokeWidth = 3;

  const canvasRef = useRef<View>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const canvasLayoutRef = useRef<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 300, height: 200 });

  const getPointerPosition = useCallback((event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const scaleX = 300 / canvasLayoutRef.current.width;
    const scaleY = 200 / canvasLayoutRef.current.height;
    return {
      x: Math.max(0, Math.min(300, locationX * scaleX)),
      y: Math.max(0, Math.min(200, locationY * scaleY)),
    };
  }, []);

  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasMoved = useRef(false);

  const getPointerPositionFromNative = useCallback((nativeEvent: any) => {
    const { locationX, locationY, offsetX, offsetY } = nativeEvent;
    const x = locationX ?? offsetX ?? 0;
    const y = locationY ?? offsetY ?? 0;
    const scaleX = 300 / canvasLayoutRef.current.width;
    const scaleY = 200 / canvasLayoutRef.current.height;
    return {
      x: Math.max(0, Math.min(300, x * scaleX)),
      y: Math.max(0, Math.min(200, y * scaleY)),
    };
  }, []);

  // Handler pour les taps (react-native-gesture-handler)
  const onTapGestureEvent = useCallback((event: any) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      const { x, y } = event.nativeEvent;
      const scaleX = 300 / canvasLayoutRef.current.width;
      const scaleY = 200 / canvasLayoutRef.current.height;
      const scaledX = Math.max(0, Math.min(300, x * scaleX));
      const scaledY = Math.max(0, Math.min(200, y * scaleY));
      
      // Créer un petit point visible pour le tap
      const pathData = `M${scaledX.toFixed(1)},${scaledY.toFixed(1)} L${(scaledX + 2).toFixed(1)},${(scaledY + 2).toFixed(1)} L${scaledX.toFixed(1)},${(scaledY + 2).toFixed(1)}`;
      
      const newPath: PathData = {
        id: Date.now().toString(),
        d: pathData,
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
    }
  }, [activeSignerIndex]);

  // Handler pour le pan/dessin (react-native-gesture-handler)
  const onPanGestureEvent = useCallback((event: any) => {
    const { x, y } = event.nativeEvent;
    const scaleX = 300 / canvasLayoutRef.current.width;
    const scaleY = 200 / canvasLayoutRef.current.height;
    const scaledX = Math.max(0, Math.min(300, x * scaleX));
    const scaledY = Math.max(0, Math.min(200, y * scaleY));
    
    if (event.nativeEvent.state === State.BEGAN) {
      setScrollEnabled(false);
      currentPathRef.current = `M${scaledX.toFixed(1)},${scaledY.toFixed(1)}`;
      setCurrentPath(currentPathRef.current);
      isDrawingRef.current = true;
      setIsDrawing(true);
    } else if (event.nativeEvent.state === State.ACTIVE) {
      if (isDrawingRef.current) {
        currentPathRef.current += ` L${scaledX.toFixed(1)},${scaledY.toFixed(1)}`;
        setCurrentPath(currentPathRef.current);
      }
    } else if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED) {
      if (currentPathRef.current && isDrawingRef.current) {
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
      isDrawingRef.current = false;
      setIsDrawing(false);
      setScrollEnabled(true);
    }
  }, [activeSignerIndex]);

  // Ancien handler pour web (souris)
  const handleTouchStart = useCallback((event: any) => {
    setScrollEnabled(false);
    const nativeEvent = event.nativeEvent || event;
    const { x, y } = getPointerPositionFromNative(nativeEvent);
    startPointRef.current = { x, y };
    hasMoved.current = false;
    currentPathRef.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
    setCurrentPath(currentPathRef.current);
    isDrawingRef.current = true;
    setIsDrawing(true);
  }, [getPointerPositionFromNative]);

  const handleTouchMove = useCallback((event: any) => {
    if (!isDrawingRef.current) return;
    const nativeEvent = event.nativeEvent || event;
    const { x, y } = getPointerPositionFromNative(nativeEvent);
    hasMoved.current = true;
    currentPathRef.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    setCurrentPath(currentPathRef.current);
  }, [getPointerPositionFromNative]);

  const handleTouchEnd = useCallback(() => {
    if (currentPathRef.current && isDrawingRef.current) {
      let pathData = currentPathRef.current;
      
      if (!hasMoved.current && startPointRef.current) {
        const { x, y } = startPointRef.current;
        pathData += ` L${(x + 2).toFixed(1)},${(y + 2).toFixed(1)} L${x.toFixed(1)},${(y + 2).toFixed(1)}`;
      }
      
      const newPath: PathData = {
        id: Date.now().toString(),
        d: pathData,
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
    isDrawingRef.current = false;
    setIsDrawing(false);
    setScrollEnabled(true);
    startPointRef.current = null;
    hasMoved.current = false;
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
    const currentSigner = signers[activeSignerIndex];
    if (!currentSigner.name.trim()) {
      Alert.alert(
        t('warning') || 'Warning',
        t('enterNameFirst') || 'Please enter a celebrity name before adding a new one'
      );
      return;
    }
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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><g>${pathsString}</g></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  const handleNext = () => {
    if (!eventName.trim()) {
      Alert.alert(t('error') || 'Error', t('eventNameRequired') || 'Please enter an event name');
      return;
    }
    setStep('signers');
  };

  const getScheduledStartDate = (): Date | undefined => {
    if (!eventTime) return undefined;
    const [hours, minutes] = eventTime.split(':').map(Number);
    const startDate = new Date(eventDate);
    startDate.setHours(hours, minutes, 0, 0);
    return startDate;
  };

  const handleCreateEvent = async () => {
    // Vérifier si l'utilisateur est connecté et abonné
    if (!user) {
      setShowAccountModal(true);
      return;
    }
    
    if (status !== 'paid') {
      await setPostAuthRedirect('/create-event');
      router.push('/subscription');
      return;
    }
    
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
      const scheduledStart = getScheduledStartDate();
      const session = await createEventSession(eventName.trim(), selectedDuration, creatorId, scheduledStart);
      
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

  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const days: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const handleSelectDate = (day: number) => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const newDate = new Date(year, month, day);
    setEventDate(newDate.toISOString().split('T')[0]);
    setShowDatePicker(false);
  };

  const changeMonth = (direction: number) => {
    const newMonth = new Date(calendarMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    setCalendarMonth(newMonth);
  };

  const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  const WEB_BASE_URL = 'https://signtouch.app';
  const qrValue = createdSession 
    ? `${WEB_BASE_URL}/join?code=${createdSession.join_code}` 
    : '';
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
          scrollEnabled={scrollEnabled}
        >
          {step === 'config' && (
            <>
              <Text style={styles.introText}>
                {t('eventIntro') || 'Programmez votre événement QR à l\'avance ou lancez-le immédiatement en cochant le bouton Live.'}
              </Text>

              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>{t('eventName') || 'Event Name'}</Text>
                  <Text style={styles.requiredHint}>{t('requiredField') || '(required)'}</Text>
                </View>
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
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <MapPin size={18} color="#ec4899" />
                  <Text style={styles.sectionTitle}>{t('eventLocation') || 'Location'}</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder={t('eventLocationPlaceholder') || 'Ex: Stade de France'}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={eventLocation}
                  onChangeText={setEventLocation}
                  maxLength={100}
                />
              </View>

              <TouchableOpacity
                style={[styles.liveToggle, isLive && styles.liveToggleActive]}
                onPress={() => setIsLive(!isLive)}
                activeOpacity={0.7}
              >
                <View style={styles.liveToggleLeft}>
                  <View style={[styles.liveIndicator, isLive && styles.liveIndicatorActive]}>
                    <Text style={styles.liveIndicatorText}>LIVE</Text>
                  </View>
                  <Text style={[styles.liveToggleText, isLive && styles.liveToggleTextActive]}>
                    {t('eventLive') || 'Événement Live'}
                  </Text>
                </View>
                <View style={[styles.toggleSwitch, isLive && styles.toggleSwitchActive]}>
                  <View style={[styles.toggleKnob, isLive && styles.toggleKnobActive]} />
                </View>
              </TouchableOpacity>

              {!isLive && (
                <>
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Calendar size={18} color="#22c55e" />
                      <Text style={styles.sectionTitle}>{t('eventDate') || 'Date'}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.datePickerButton}
                      onPress={() => setShowDatePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.datePickerText}>{formatDisplayDate(eventDate)}</Text>
                      <Calendar size={20} color="#10B981" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Clock size={18} color="#10B981" />
                      <Text style={styles.sectionTitle}>{t('eventTime') || 'Heure'}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.timePickerButton}
                      onPress={() => setShowTimePicker(true)}
                    >
                      <Text style={[styles.timePickerButtonText, !eventTime && styles.timePickerButtonPlaceholder]}>
                        {eventTime || 'HH:MM'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('eventType') || 'Event Type'}</Text>
                <View style={styles.eventTypesGrid}>
                  {EVENT_TYPES.map((et) => {
                    const IconComponent = et.icon;
                    const isSelected = eventType === et.type;
                    return (
                      <TouchableOpacity
                        key={et.type}
                        style={[
                          styles.eventTypeChip,
                          isSelected && { backgroundColor: et.color, borderColor: et.color },
                        ]}
                        onPress={() => setEventType(et.type)}
                      >
                        <IconComponent size={14} color={isSelected ? '#fff' : et.color} />
                        <Text style={[styles.eventTypeLabel, isSelected && { color: '#fff' }]}>
                          {(t as any)(et.labelKey) || et.type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.eventSummaryBox, isLive && styles.eventSummaryBoxLive]}>
                {isLive ? (
                  <Text style={styles.eventSummaryText}>
                    {t('liveSummary') || 'Votre événement démarre immédiatement et dure'}{' '}
                    <Text style={styles.eventSummaryHighlight}>
                      {selectedDuration >= 60 ? `${selectedDuration / 60}h` : `${selectedDuration} min`}
                    </Text>
                  </Text>
                ) : (
                  <Text style={styles.eventSummaryText}>
                    {t('eventSummary') || 'Votre événement commence le'}{' '}
                    <Text style={styles.eventSummaryHighlight}>
                      {new Date(eventDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </Text>
                    {eventTime ? (
                      <>
                        {' '}{t('at') || 'à'}{' '}
                        <Text style={styles.eventSummaryHighlight}>{eventTime}</Text>
                      </>
                    ) : null}
                    {' '}{t('andEnds') || 'et se termine le'}{' '}
                    <Text style={styles.eventSummaryHighlight}>
                      {(() => {
                        const startDate = new Date(eventDate);
                        if (eventTime) {
                          const [h, m] = eventTime.split(':').map(Number);
                          startDate.setHours(h, m, 0, 0);
                        }
                        const endDate = new Date(startDate.getTime() + selectedDuration * 60 * 1000);
                        return endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
                      })()}
                    </Text>
                    {' '}{t('at') || 'à'}{' '}
                    <Text style={styles.eventSummaryHighlight}>
                      {(() => {
                        const startDate = new Date(eventDate);
                        if (eventTime) {
                          const [h, m] = eventTime.split(':').map(Number);
                          startDate.setHours(h, m, 0, 0);
                        } else {
                          startDate.setHours(new Date().getHours(), new Date().getMinutes(), 0, 0);
                        }
                        const endDate = new Date(startDate.getTime() + selectedDuration * 60 * 1000);
                        return endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                      })()}
                    </Text>
                  </Text>
                )}
              </View>

              {(() => {
                const canProceed = eventName.trim() && eventLocation.trim() && (isLive || eventTime);
                return (
                  <TouchableOpacity
                    style={[styles.nextButton, !canProceed && styles.nextButtonDisabled]}
                    onPress={canProceed ? handleNext : undefined}
                    activeOpacity={canProceed ? 0.8 : 1}
                  >
                    <Text style={[styles.nextButtonText, !canProceed && styles.nextButtonTextDisabled]}>
                      {t('next') || 'Next'}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
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
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>{t('celebrityName') || 'Celebrity Name'}</Text>
                  <Text style={styles.requiredHint}>{t('requiredField') || '(required)'}</Text>
                </View>
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
                <TapGestureHandler onHandlerStateChange={onTapGestureEvent}>
                  <PanGestureHandler 
                    onHandlerStateChange={onPanGestureEvent}
                    onGestureEvent={onPanGestureEvent}
                    minDist={0}
                  >
                    <View
                      style={styles.signatureContainer}
                      ref={canvasRef}
                      onLayout={(e) => {
                        canvasLayoutRef.current = {
                          x: e.nativeEvent.layout.x,
                          y: e.nativeEvent.layout.y,
                          width: e.nativeEvent.layout.width,
                          height: e.nativeEvent.layout.height,
                        };
                      }}
                      // @ts-ignore - mouse events for web
                      onMouseDown={handleTouchStart}
                      onMouseMove={(e: any) => isDrawingRef.current && handleTouchMove(e)}
                      onMouseUp={handleTouchEnd}
                      onMouseLeave={handleTouchEnd}
                    >
                      <Svg width="100%" height="100%" viewBox="0 0 300 200" style={styles.signatureSvg}>
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
                </TapGestureHandler>
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
              <View style={[styles.successIcon, createdSession.status === 'scheduled' && styles.scheduledIcon]}>
                {createdSession.status === 'scheduled' ? (
                  <Clock size={40} color="#f59e0b" />
                ) : (
                  <Check size={40} color="#10B981" />
                )}
              </View>
              <Text style={styles.successTitle}>
                {createdSession.status === 'scheduled' 
                  ? ((t as any)('eventScheduled') || 'Event Scheduled!')
                  : (t('eventCreated') || 'Event Created!')}
              </Text>
              <Text style={styles.eventNameText}>{createdSession.title}</Text>

              {createdSession.status === 'scheduled' && (
                <>
                  <View style={styles.scheduledBanner}>
                    <Clock size={16} color="#f59e0b" />
                    <Text style={styles.scheduledBannerText}>
                      {(t as any)('startsAt') || 'Starts at'}: {new Date(createdSession.starts_at).toLocaleDateString()} {new Date(createdSession.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.scheduledIntroText}>
                    {t('scheduledEventIntro')}
                  </Text>
                </>
              )}

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Users size={18} color="#10B981" />
                  <Text style={styles.statText}>{t('celebrity') || 'Celebrity'} : {createdSigners.length}</Text>
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
                  <Text style={styles.publishButtonText}>
                    {createdSession.status === 'scheduled' 
                      ? (t('schedulePhotos') || 'Schedule your Photos')
                      : (t('publishPhotos') || 'Publish Photos')}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.shareButton} onPress={shareEvent}>
                  <Share2 size={20} color="#ffffff" />
                  <Text style={styles.shareButtonText}>{t('shareQRCode') || 'Share QR Code'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        <Modal
          visible={showDatePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <Pressable 
            style={styles.modalOverlay} 
            onPress={() => setShowDatePicker(false)}
          >
            <Pressable style={styles.calendarModal} onPress={(e) => e.stopPropagation()}>
              <View style={styles.calendarHeader}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calendarNavBtn}>
                  <Text style={styles.calendarNavText}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={styles.calendarMonthText}>
                  {calendarMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calendarNavBtn}>
                  <Text style={styles.calendarNavText}>{'>'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.weekdaysRow}>
                {WEEKDAYS.map((day) => (
                  <Text key={day} style={styles.weekdayText}>{day}</Text>
                ))}
              </View>

              <View style={styles.daysGrid}>
                {getCalendarDays().map((day, index) => {
                  const isSelected = day && eventDate === 
                    `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const today = new Date();
                  const isToday = day && 
                    today.getDate() === day && 
                    today.getMonth() === calendarMonth.getMonth() && 
                    today.getFullYear() === calendarMonth.getFullYear();
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        isToday && !isSelected && styles.dayCellToday,
                      ]}
                      onPress={() => day && handleSelectDate(day)}
                      disabled={!day}
                    >
                      <Text style={[
                        styles.dayText,
                        isSelected && styles.dayTextSelected,
                        isToday && !isSelected && styles.dayTextToday,
                      ]}>
                        {day || ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity 
                style={styles.calendarCloseBtn}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.calendarCloseBtnText}>Fermer</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={showTimePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <Pressable 
            style={styles.modalOverlay} 
            onPress={() => setShowTimePicker(false)}
          >
            <Pressable style={styles.timePickerModal} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.timePickerTitle}>{t('eventTime') || 'Heure'}</Text>
              
              <View style={styles.timePickerColumns}>
                <View style={styles.timePickerColumn}>
                  <Text style={styles.timePickerLabel}>Heures</Text>
                  <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false}>
                    {Array.from({ length: 24 }, (_, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[styles.timePickerItem, selectedHour === i && styles.timePickerItemSelected]}
                        onPress={() => setSelectedHour(i)}
                      >
                        <Text style={[styles.timePickerItemText, selectedHour === i && styles.timePickerItemTextSelected]}>
                          {String(i).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                
                <Text style={styles.timePickerSeparator}>:</Text>
                
                <View style={styles.timePickerColumn}>
                  <Text style={styles.timePickerLabel}>Minutes</Text>
                  <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false}>
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.timePickerItem, selectedMinute === m && styles.timePickerItemSelected]}
                        onPress={() => setSelectedMinute(m)}
                      >
                        <Text style={[styles.timePickerItemText, selectedMinute === m && styles.timePickerItemTextSelected]}>
                          {String(m).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.timePickerConfirmBtn}
                onPress={() => {
                  setEventTime(`${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`);
                  setShowTimePicker(false);
                }}
              >
                <Text style={styles.timePickerConfirmText}>Valider</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <AccountModal
          visible={showAccountModal}
          onClose={() => setShowAccountModal(false)}
          onSkip={() => setShowAccountModal(false)}
          returnPath="/create-event"
        />
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
  section: { marginBottom: 28 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  requiredHint: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' },
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
  eventTypesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  eventTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  eventTypeLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  nextButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 20,
  },
  nextButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  nextButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    opacity: 0.5,
  },
  nextButtonTextDisabled: {
    color: 'rgba(255,255,255,0.5)',
  },
  eventSummaryBox: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  eventSummaryText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 24,
    textAlign: 'center',
  },
  eventSummaryHighlight: {
    color: '#10B981',
    fontWeight: '600',
  },
  eventSummaryBoxLive: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  introText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  liveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  liveToggleActive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  liveToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liveIndicator: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveIndicatorActive: {
    backgroundColor: '#ef4444',
  },
  liveIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1,
  },
  liveToggleText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  liveToggleTextActive: {
    color: '#ef4444',
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    padding: 2,
  },
  toggleSwitchActive: {
    backgroundColor: '#ef4444',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
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
  signatureContainer: { backgroundColor: '#000000', borderRadius: 16, overflow: 'hidden', height: 250, marginTop: 8 },
  signatureSvg: { flex: 1 },
  signaturePlaceholder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' },
  signaturePlaceholderText: { fontSize: 16, color: 'rgba(255,255,255,0.4)' },
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
  scheduleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
  },
  scheduleToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scheduleToggleText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  scheduleToggleTextActive: {
    color: '#10B981',
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    padding: 2,
  },
  toggleSwitchActive: {
    backgroundColor: '#10B981',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  timeInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'center',
  },
  timeHint: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timePickerInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  scheduledIcon: {
    backgroundColor: 'rgba(245,158,11,0.2)',
  },
  scheduledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  scheduledBannerText: {
    fontSize: 14,
    color: '#f59e0b',
    fontWeight: '500',
  },
  scheduledIntroText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 16,
    marginHorizontal: 10,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  datePickerText: {
    fontSize: 16,
    color: '#ffffff',
    textTransform: 'capitalize',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  calendarNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarNavText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  calendarMonthText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#10B981',
    borderRadius: 20,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 20,
  },
  dayText: {
    fontSize: 16,
    color: '#ffffff',
  },
  dayTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  dayTextToday: {
    color: '#10B981',
    fontWeight: '600',
  },
  calendarCloseBtn: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  calendarCloseBtnText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  timePickerButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  timePickerButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
  },
  timePickerButtonPlaceholder: {
    color: 'rgba(255,255,255,0.4)',
  },
  timePickerModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  timePickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  timePickerColumns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickerColumn: {
    alignItems: 'center',
    width: 80,
  },
  timePickerLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
  },
  timePickerScroll: {
    height: 200,
  },
  timePickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginVertical: 2,
  },
  timePickerItemSelected: {
    backgroundColor: '#10B981',
  },
  timePickerItemText: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    textAlign: 'center',
  },
  timePickerItemTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  timePickerSeparator: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: '700',
    marginHorizontal: 10,
  },
  timePickerConfirmBtn: {
    marginTop: 20,
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  timePickerConfirmText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
  },
});
