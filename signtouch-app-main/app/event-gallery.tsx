import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  RefreshControl,
  ActivityIndicator,
  AppState,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Download, Users, Clock, Image as ImageIcon, Pen, Info } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  EventSession,
  EventSigner,
  EventAsset,
  fetchEventAssets,
  updateViewerHeartbeat,
  leaveEventSession,
  getOrCreateDeviceId,
  getActiveViewerCount,
  clearActiveFanEvent,
} from '@/utils/eventSessionStorage';
import { saveMemory } from '@/utils/storageService';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

let Notifications: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
} catch {}

type TabType = 'all' | 'official' | 'signed';

const POLLING_INTERVAL = 20000;
const HEARTBEAT_INTERVAL = 60000;

const playNewPhotoChime = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);
      const notes = [
        { freq: 587.33, start: 0, dur: 0.15, type: 'triangle' as OscillatorType },
        { freq: 783.99, start: 0.12, dur: 0.15, type: 'triangle' as OscillatorType },
        { freq: 1046.5, start: 0.24, dur: 0.3, type: 'sine' as OscillatorType },
        { freq: 1318.5, start: 0.4, dur: 0.4, type: 'sine' as OscillatorType },
      ];
      notes.forEach(({ freq, start, dur, type }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.35, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      });
    } catch {}
  }
  if (Platform.OS !== 'web') {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }
};

const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF69B4', '#00CED1', '#FF8C00'];
const CONFETTI_COUNT = 50;

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  size: number;
  rotation: number;
  shape: 'rect' | 'circle';
}

const ConfettiPieceView = ({ piece, active, index }: { piece: ConfettiPiece; active: boolean; index: number }) => {
  const translateY = useSharedValue(-20);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);
  const translateX = useSharedValue(0);

  const params = React.useMemo(() => ({
    delay: (index * 40) + ((index * 17) % 200),
    fallDistance: 400 + (index % 7) * 60,
    drift: ((index % 10) - 5) * 30,
    spinAmount: 360 + (index % 5) * 180,
  }), [index]);

  useEffect(() => {
    if (active) {
      const { delay, fallDistance, drift, spinAmount } = params;
      opacity.value = withDelay(delay, withSequence(
        withTiming(1, { duration: 100 }),
        withDelay(1800, withTiming(0, { duration: 600 }))
      ));
      translateY.value = withDelay(delay, withTiming(fallDistance, {
        duration: 2400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }));
      translateX.value = withDelay(delay, withTiming(drift, {
        duration: 2400,
        easing: Easing.out(Easing.ease),
      }));
      rotate.value = withDelay(delay, withTiming(spinAmount, {
        duration: 2500,
        easing: Easing.linear,
      }));
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: `${piece.x}%` as any,
    top: -20,
    width: piece.size,
    height: piece.shape === 'rect' ? piece.size * 0.6 : piece.size,
    borderRadius: piece.shape === 'circle' ? piece.size / 2 : 2,
    backgroundColor: piece.color,
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return <Animated.View style={style} />;
};

const ConfettiExplosion = ({ active }: { active: boolean }) => {
  const pieces = React.useMemo<ConfettiPiece[]>(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      x: (i * 2) % 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + (i % 5) * 2,
      rotation: (i * 37) % 360,
      shape: i % 2 === 0 ? 'rect' as const : 'circle' as const,
    }));
  }, []);

  if (!active) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 999 }}>
      {pieces.map((piece, i) => (
        <ConfettiPieceView key={piece.id} piece={piece} active={active} index={i} />
      ))}
    </View>
  );
};

export default function EventGalleryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();

  const [activeTab] = useState<TabType>('all');
  const [assets, setAssets] = useState<EventAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [newPhotoSignerName, setNewPhotoSignerName] = useState('');

  const viewerIdRef = useRef<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchedAtRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const knownAssetIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationPermissionRef = useRef<string | null>(null);

  const isValidSession = params.sessionId && params.endsAt;
  
  const session: EventSession = {
    id: (params.sessionId as string) || '',
    title: (params.sessionTitle as string) || 'Live Event',
    join_code: (params.joinCode as string) || '',
    ends_at: (params.endsAt as string) || new Date().toISOString(),
    starts_at: '',
    status: 'live',
    viewer_soft_limit: 5000,
    created_by: null,
    created_at: '',
  };

  const signers: EventSigner[] = params.signers ? JSON.parse(params.signers as string) : [];

  const triggerNewPhotoAlert = useCallback(async (signerName: string) => {
    playNewPhotoChime();

    setNewPhotoSignerName(signerName || ((t as any)('newDedicatedPhoto') || 'Nouvelle photo'));
    setShowConfetti(true);
    if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
    confettiTimerRef.current = setTimeout(() => {
      setShowConfetti(false);
      setNewPhotoSignerName('');
    }, 3500);

    if (Notifications && Platform.OS !== 'web') {
      try {
        if (!notificationPermissionRef.current) {
          const { status } = await Notifications.requestPermissionsAsync();
          notificationPermissionRef.current = status;
        }
        if (notificationPermissionRef.current === 'granted') {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: (t as any)('newDedicatedPhoto') || 'Nouvelle photo dédicacée !',
              body: signerName
                ? `${signerName} ${(t as any)('hasPublishedPhoto') || 'a publié une nouvelle photo dédicacée pour vous'}`
                : ((t as any)('newPhotoAvailable') || 'Une nouvelle photo dédicacée est disponible !'),
              sound: true,
            },
            trigger: null,
          });
        }
      } catch (e) {
        console.warn('Notification error:', e);
      }
    }
  }, [t]);

  const loadAssets = useCallback(async (isRefresh = false) => {
    try {
      const typeFilter = activeTab === 'official' ? 'photo' : activeTab === 'signed' ? 'photo_signed' : 'all';
      const newAssets = await fetchEventAssets(session.id, {
        afterCreatedAt: isRefresh ? undefined : lastFetchedAtRef.current || undefined,
        type: typeFilter,
        limit: 30,
      });

      if (newAssets.length > 0) {
        if (isRefresh) {
          const newIds = newAssets.map(a => a.id);
          newIds.forEach(id => knownAssetIdsRef.current.add(id));
          setAssets(newAssets);
        } else {
          const trulyNew = newAssets.filter(a => !knownAssetIdsRef.current.has(a.id));

          if (trulyNew.length > 0 && initialLoadDoneRef.current) {
            trulyNew.forEach(a => knownAssetIdsRef.current.add(a.id));
            const latestNew = trulyNew[0];
            const signerName = latestNew.signer?.display_name || '';
            triggerNewPhotoAlert(signerName);
          }

          setAssets(prev => {
            const existingIds = new Set(prev.map(a => a.id));
            const uniqueNew = newAssets.filter(a => !existingIds.has(a.id));
            uniqueNew.forEach(a => knownAssetIdsRef.current.add(a.id));
            return [...uniqueNew, ...prev];
          });
        }
        lastFetchedAtRef.current = newAssets[0]?.created_at || lastFetchedAtRef.current;
      }
    } catch (error) {
      console.error('Error loading assets:', error);
    }
  }, [session.id, activeTab, triggerNewPhotoAlert]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    lastFetchedAtRef.current = null;
    await loadAssets(true);
    setIsRefreshing(false);
  }, [loadAssets]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => {
      loadAssets(false);
      getActiveViewerCount(session.id).then(setViewerCount);
    }, POLLING_INTERVAL);
  }, [loadAssets, session.id]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(async () => {
    if (!viewerIdRef.current) {
      viewerIdRef.current = await getOrCreateDeviceId();
    }
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      updateViewerHeartbeat(session.id, viewerIdRef.current);
    }, HEARTBEAT_INTERVAL);
  }, [session.id]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const updateTimeRemaining = useCallback(() => {
    const endsAt = new Date(session.ends_at);
    const now = new Date();
    const diff = endsAt.getTime() - now.getTime();

    if (diff <= 0) {
      setTimeRemaining(t('eventEnded') || 'Event ended');
      clearActiveFanEvent();
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      setTimeRemaining(`${hours}h ${minutes}m`);
    } else {
      setTimeRemaining(`${minutes}m`);
    }
  }, [session.ends_at, t]);

  useEffect(() => {
    if (!isValidSession) {
      setIsLoading(false);
      return;
    }
    
    const init = async () => {
      setIsLoading(true);
      viewerIdRef.current = await getOrCreateDeviceId();
      await loadAssets(true);
      initialLoadDoneRef.current = true;
      const count = await getActiveViewerCount(session.id);
      setViewerCount(count);
      setIsLoading(false);
      startPolling();
      startHeartbeat();
    };
    init();

    const timeInterval = setInterval(updateTimeRemaining, 60000);
    updateTimeRemaining();

    return () => {
      stopPolling();
      stopHeartbeat();
      clearInterval(timeInterval);
      if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
      if (viewerIdRef.current && session.id) {
        leaveEventSession(session.id, viewerIdRef.current);
      }
    };
  }, [isValidSession]);

  useEffect(() => {
    handleRefresh();
  }, [activeTab]);

  useFocusEffect(
    useCallback(() => {
      startPolling();
      startHeartbeat();
      return () => {
        stopPolling();
        stopHeartbeat();
      };
    }, [startPolling, stopPolling, startHeartbeat, stopHeartbeat])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        startPolling();
        startHeartbeat();
        handleRefresh();
      } else if (nextAppState.match(/inactive|background/)) {
        stopPolling();
        stopHeartbeat();
      }
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, [startPolling, stopPolling, startHeartbeat, stopHeartbeat, handleRefresh]);

  const handleOpenEditor = (asset: EventAsset) => {
    const originalUrl = asset.original_photo_url || (asset.signature_metadata as any)?.original_photo_url;
    if (asset.signature_metadata && originalUrl) {
      const meta = asset.signature_metadata;
      router.push({
        pathname: '/event-photo-editor',
        params: {
          photoUrl: originalUrl,
          signatureUrl: meta.signature_url,
          positionX: String(meta.position_x),
          positionY: String(meta.position_y),
          scale: String(meta.scale),
          rotation: String(meta.rotation),
          color: meta.color,
          containerWidth: String(meta.container_width),
          containerHeight: String(meta.container_height),
          signerName: asset.signer?.display_name || '',
        },
      });
    } else {
      handleDownload(asset);
    }
  };

  const handleDownload = async (asset: EventAsset) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      let imageUri = asset.asset_url;
      
      if (Platform.OS !== 'web') {
        const localUri = FileSystem.documentDirectory + `plyz-${Date.now()}.png`;
        const downloadResult = await FileSystem.downloadAsync(asset.asset_url, localUri);
        imageUri = downloadResult.uri;
      }
      
      await saveMemory(imageUri, user?.id || null, {
        isEdited: true,
      });
      showAlert(
        t('done') || 'Done', 
        (t as any)('savedToGallery') || 'Photo saved to your Plyz gallery!'
      );
    } catch (error) {
      console.error('Download error:', error);
      showAlert(t('error') || 'Error', t('downloadFailed') || 'Download failed');
    }
  };

  const renderAsset = ({ item }: { item: EventAsset }) => (
    <TouchableOpacity style={styles.assetCard} onPress={() => handleOpenEditor(item)} activeOpacity={0.9}>
      <Image source={{ uri: item.asset_url }} style={styles.assetImage} resizeMode="cover" />
      <View style={styles.assetOverlay}>
        {item.signer && (
          <View style={styles.signerBadge}>
            <Text style={styles.signerBadgeText}>{item.signer.display_name}</Text>
          </View>
        )}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownload(item)}>
            <Download size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      {(item.asset_type === 'photo_signed' || item.asset_type === 'signed_photo') && (
        <View style={styles.signedBadge}>
          <Pen size={12} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );

  
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />
      <ConfettiExplosion active={showConfetti} />

      {showConfetti && newPhotoSignerName ? (
        <View style={styles.newPhotoBanner}>
          <Text style={styles.newPhotoBannerText}>
            {newPhotoSignerName} {(t as any)('hasPublishedPhoto') || 'a publié une nouvelle photo dédicacée !'}
          </Text>
        </View>
      ) : null}
      
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/fan-choice' as any))}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{session.title}</Text>
          <View style={styles.headerStats}>
            <View style={styles.statBadge}>
              <Users size={12} color="#10B981" />
              <Text style={styles.statText}>{viewerCount}</Text>
            </View>
            <View style={styles.statBadge}>
              <Clock size={12} color="#f59e0b" />
              <Text style={styles.statText}>{timeRemaining}</Text>
            </View>
          </View>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.signersRow}>
        {signers.slice(0, 5).map((signer) => (
          <View key={signer.id} style={styles.signerChip}>
            <Text style={styles.signerChipText}>{signer.display_name}</Text>
          </View>
        ))}
        {signers.length > 5 && (
          <View style={styles.signerChip}>
            <Text style={styles.signerChipText}>+{signers.length - 5}</Text>
          </View>
        )}
      </View>

      
      <View style={styles.infoBanner}>
        <Info size={16} color="#10B981" />
        <Text style={styles.infoBannerText}>
          {(t as any)('fanGalleryHint') || 'Tap to download. Use the copy icon to create your own photo with this signature!'}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ImageIcon size={60} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyText}>{t('noAssetsYet') || 'No photos yet'}</Text>
          <Text style={styles.emptyHint}>{t('pullToRefresh') || 'Pull down to refresh'}</Text>
        </View>
      ) : (
        <FlatList
          data={assets}
          renderItem={renderAsset}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={[styles.listContent, { paddingBottom: BOTTOM_NAV_HEIGHT + 20 }]}
          columnWrapperStyle={styles.row}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#10B981"
              colors={['#10B981']}
            />
          }
          onEndReached={() => {
            if (assets.length > 0) {
              const oldestCreatedAt = assets[assets.length - 1].created_at;
              fetchEventAssets(session.id, {
                beforeCreatedAt: oldestCreatedAt,
                type: activeTab === 'official' ? 'photo' : activeTab === 'signed' ? 'photo_signed' : 'all',
                limit: 30,
              }).then((olderAssets) => {
                if (olderAssets.length > 0) {
                  setAssets((prev) => [...prev, ...olderAssets]);
                }
              });
            }
          }}
          onEndReachedThreshold={0.5}
        />
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
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  headerStats: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  signersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  signerChip: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  signerChipText: { fontSize: 13, color: '#10B981', fontWeight: '500' },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabActive: { backgroundColor: '#10B981' },
  tabText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 18, color: 'rgba(255,255,255,0.6)', marginTop: 16, textAlign: 'center' },
  emptyHint: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 },
  listContent: { padding: 8 },
  row: { justifyContent: 'space-between', paddingHorizontal: 8 },
  assetCard: {
    width: '48%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  assetImage: { width: '100%', height: '100%' },
  assetOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  signerBadge: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  signerBadgeText: { fontSize: 11, color: '#fff', fontWeight: '500' },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cloneBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16,185,129,0.1)',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
  },
  signedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newPhotoBanner: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    borderRadius: 16,
    padding: 16,
    zIndex: 1000,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  newPhotoBannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
