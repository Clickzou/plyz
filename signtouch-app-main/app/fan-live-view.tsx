import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pen } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  QueueEntry,
  getQueueEntry,
  subscribeToQueueEntry,
  subscribeToSignatureStrokes,
} from '@/utils/liveSessionStorage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH - 40;

export default function FanLiveViewScreen() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [currentStroke, setCurrentStroke] = useState<string>('');

  useEffect(() => {
    if (!entryId) return;

    const loadEntry = async () => {
      const e = await getQueueEntry(entryId);
      setEntry(e);
    };
    loadEntry();

    const entryChannel = subscribeToQueueEntry(entryId, (updated) => {
      setEntry(updated);

      if (updated.signature_svg) {
        const pathStrings = updated.signature_svg.split('|||');
        setPaths(pathStrings);
      }

      if (updated.status === 'completed') {
        router.replace({
          pathname: '/live-signature-result',
          params: { entryId: updated.id },
        });
      }
    });

    const strokeChannel = subscribeToSignatureStrokes(entryId, (strokeData) => {
      setCurrentStroke(strokeData);
    });

    return () => {
      entryChannel.unsubscribe();
      strokeChannel.unsubscribe();
    };
  }, [entryId]);

  if (!entry) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#6366f1', '#4f46e5']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={styles.title}>{t('liveSessionWatchLive')}</Text>
      </View>

      <View style={styles.content}>
        {entry.photo_url && (
          <View style={styles.photoContainer}>
            <Image
              source={{ uri: entry.photo_url }}
              style={styles.photo}
              resizeMode="contain"
            />
          </View>
        )}

        <View style={styles.canvasSection}>
          <View style={styles.signingHeader}>
            <Pen size={20} color="#fff" />
            <Text style={styles.signingText}>{t('liveSessionSigningInProgress')}</Text>
          </View>

          <View style={styles.canvas}>
            <Svg width={CANVAS_SIZE} height={CANVAS_SIZE * 0.6}>
              {paths.map((p, i) => (
                <Path
                  key={i}
                  d={p}
                  stroke="#000"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {currentStroke && (
                <Path
                  d={currentStroke}
                  stroke="#000"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </Svg>
          </View>
        </View>

        <Text style={styles.hint}>{t('liveSessionWatchHint')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  photoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  photo: {
    width: CANVAS_SIZE,
    height: 180,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  canvasSection: {
    alignItems: 'center',
  },
  signingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  signingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE * 0.6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 24,
  },
});
