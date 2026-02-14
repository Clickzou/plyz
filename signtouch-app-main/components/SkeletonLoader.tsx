import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonPulse({ width = '100%', height = 20, borderRadius = 8, style }: SkeletonProps) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: '#1e293b',
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
}

export function FeedSkeletonCard() {
  return (
    <View style={skStyles.feedCard}>
      <View style={skStyles.feedHeader}>
        <SkeletonPulse width={40} height={40} borderRadius={20} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonPulse width={120} height={14} />
          <SkeletonPulse width={80} height={10} />
        </View>
      </View>
      <SkeletonPulse width="90%" height={18} style={{ marginTop: 12 }} />
      <SkeletonPulse width="100%" height={14} style={{ marginTop: 8 }} />
      <SkeletonPulse width="70%" height={14} style={{ marginTop: 4 }} />
    </View>
  );
}

export function FeedSkeleton() {
  return (
    <View style={skStyles.feedContainer}>
      {[0, 1, 2, 3].map((i) => (
        <FeedSkeletonCard key={i} />
      ))}
    </View>
  );
}

export function CelebrityCardSkeleton() {
  return (
    <View style={skStyles.celebrityCard}>
      <SkeletonPulse width="100%" height={160} borderRadius={0} />
      <View style={{ padding: 12, gap: 8 }}>
        <SkeletonPulse width="70%" height={16} />
        <SkeletonPulse width="100%" height={12} />
        <SkeletonPulse width={100} height={14} style={{ marginTop: 4 }} />
        <SkeletonPulse width={80} height={12} />
      </View>
    </View>
  );
}

export function DiscoverSkeleton() {
  return (
    <View style={skStyles.discoverGrid}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <CelebrityCardSkeleton key={i} />
      ))}
    </View>
  );
}

export function CelebrityDetailSkeleton() {
  return (
    <View style={skStyles.detailContainer}>
      <SkeletonPulse width="100%" height={250} borderRadius={0} />
      <View style={{ padding: 20, gap: 12 }}>
        <SkeletonPulse width="60%" height={24} />
        <SkeletonPulse width={100} height={14} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <SkeletonPulse width={80} height={28} borderRadius={14} />
          <SkeletonPulse width={80} height={28} borderRadius={14} />
        </View>
        <SkeletonPulse width="100%" height={14} style={{ marginTop: 16 }} />
        <SkeletonPulse width="100%" height={14} />
        <SkeletonPulse width="80%" height={14} />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
          <SkeletonPulse width="48%" height={48} borderRadius={12} />
          <SkeletonPulse width="48%" height={48} borderRadius={12} />
        </View>
      </View>
    </View>
  );
}

export function MySpaceSkeleton() {
  return (
    <View style={skStyles.mySpaceContainer}>
      <View style={skStyles.mySpaceTabs}>
        <SkeletonPulse width="48%" height={40} borderRadius={20} />
        <SkeletonPulse width="48%" height={40} borderRadius={20} />
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={skStyles.mySpaceItem}>
          <SkeletonPulse width={50} height={50} borderRadius={10} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonPulse width="70%" height={16} />
            <SkeletonPulse width="40%" height={12} />
            <SkeletonPulse width={80} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const skStyles = StyleSheet.create({
  feedContainer: { padding: 16, gap: 12 },
  feedCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  feedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  discoverGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  celebrityCard: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  detailContainer: { flex: 1, backgroundColor: '#0a1628' },
  mySpaceContainer: { padding: 16, gap: 16 },
  mySpaceTabs: { flexDirection: 'row', gap: 12 },
  mySpaceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
});

export default SkeletonPulse;
