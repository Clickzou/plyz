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
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Download, Users, Clock, Image as ImageIcon, Pen, Copy, Info } from 'lucide-react-native';
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
} from '@/utils/eventSessionStorage';
import { saveMemory } from '@/utils/storageService';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

type TabType = 'all' | 'official' | 'signed';

const POLLING_INTERVAL = 20000;
const HEARTBEAT_INTERVAL = 60000;

export default function EventGalleryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [assets, setAssets] = useState<EventAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');

  const viewerIdRef = useRef<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchedAtRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

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
          setAssets(newAssets);
        } else {
          setAssets(prev => {
            const existingIds = new Set(prev.map(a => a.id));
            const uniqueNew = newAssets.filter(a => !existingIds.has(a.id));
            return [...uniqueNew, ...prev];
          });
        }
        lastFetchedAtRef.current = newAssets[0]?.created_at || lastFetchedAtRef.current;
      }
    } catch (error) {
      console.error('Error loading assets:', error);
    }
  }, [session.id, activeTab]);

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

  const handleDownload = async (asset: EventAsset) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      let imageUri = asset.asset_url;
      
      // On mobile, download the image first to a local file
      if (Platform.OS !== 'web') {
        const localUri = FileSystem.documentDirectory + `signtouch-${Date.now()}.png`;
        const downloadResult = await FileSystem.downloadAsync(asset.asset_url, localUri);
        imageUri = downloadResult.uri;
      }
      
      // Save to SignTouch gallery
      await saveMemory(imageUri, user?.id || null, {
        isEdited: true,
      });
      Alert.alert(
        t('done') || 'Done', 
        (t as any)('savedToGallery') || 'Photo saved to your SignTouch gallery!'
      );
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert(t('error') || 'Error', t('downloadFailed') || 'Download failed');
    }
  };

  const handleClone = (asset: EventAsset) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push({
      pathname: '/',
      params: {
        cloneSignatureUrl: asset.signer?.signature_url || '',
        cloneSignerName: asset.signer?.display_name || '',
        eventLocation: params.eventLocation || '',
        eventDate: params.eventDate || '',
        eventType: params.eventType || '',
      }
    });
  };

  const renderAsset = ({ item }: { item: EventAsset }) => (
    <TouchableOpacity style={styles.assetCard} onPress={() => handleDownload(item)} activeOpacity={0.9}>
      <Image source={{ uri: item.asset_url }} style={styles.assetImage} resizeMode="cover" />
      <View style={styles.assetOverlay}>
        {item.signer && (
          <View style={styles.signerBadge}>
            <Text style={styles.signerBadgeText}>{item.signer.display_name}</Text>
          </View>
        )}
        <View style={styles.actionButtons}>
          {(item.asset_type === 'photo_signed' || item.asset_type === 'signed_photo') && item.signer && (
            <TouchableOpacity style={styles.cloneBtn} onPress={() => handleClone(item)}>
              <Copy size={16} color="#fff" />
            </TouchableOpacity>
          )}
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
      
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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
});
