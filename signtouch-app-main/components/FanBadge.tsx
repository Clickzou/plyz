import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFollow, FAN_TIER_CONFIG } from '@/contexts/FollowContext';

interface FanBadgeProps {
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

export default function FanBadge({ size = 'medium', showLabel = true }: FanBadgeProps) {
  const { fanTier, followCount } = useFollow();
  const config = FAN_TIER_CONFIG[fanTier];

  const iconSize = size === 'small' ? 16 : size === 'large' ? 28 : 22;
  const fontSize = size === 'small' ? 10 : size === 'large' ? 16 : 13;
  const labelSize = size === 'small' ? 9 : size === 'large' ? 13 : 11;
  const padding = size === 'small' ? 6 : size === 'large' ? 14 : 10;

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor, paddingHorizontal: padding, paddingVertical: padding * 0.6 }]}>
      <Text style={{ fontSize: iconSize }}>{config.icon}</Text>
      <View>
        <Text style={[styles.tierName, { color: config.color, fontSize }]}>{config.label}</Text>
        {showLabel && (
          <Text style={[styles.stats, { fontSize: labelSize }]}>
            {followCount} followed
          </Text>
        )}
      </View>
    </View>
  );
}

export function FanBadgeCard() {
  const { fanTier, interactions, followCount } = useFollow();
  const config = FAN_TIER_CONFIG[fanTier];
  const tiers = Object.entries(FAN_TIER_CONFIG);
  const currentIndex = tiers.findIndex(([key]) => key === fanTier);
  const nextTier = currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : null;

  const total = interactions.totalFollows + interactions.totalBookings * 3 + interactions.totalAutographs * 2 + interactions.totalLiveSessions * 5;
  const nextMin = nextTier ? nextTier[1].minPoints : total;
  const progress = nextTier ? Math.min(1, total / nextMin) : 1;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={{ fontSize: 32 }}>{config.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: config.color }]}>{config.label} Fan</Text>
          <Text style={styles.cardSubtitle}>
            {followCount} following · {interactions.totalBookings} bookings · {interactions.totalAutographs} autographs
          </Text>
        </View>
      </View>

      {nextTier && (
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>
            {total}/{nextMin} points to {nextTier[1].label}
          </Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: nextTier[1].color }]} />
          </View>
        </View>
      )}

      <View style={styles.tierRow}>
        {tiers.map(([key, tier], i) => (
          <View key={key} style={[styles.tierItem, i <= currentIndex && styles.tierItemActive]}>
            <Text style={{ fontSize: 16, opacity: i <= currentIndex ? 1 : 0.3 }}>{tier.icon}</Text>
            <Text style={[styles.tierLabel, { color: i <= currentIndex ? tier.color : '#4b5563' }]}>{tier.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  tierName: { fontWeight: '700' },
  stats: { color: '#9ca3af', marginTop: 1 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardSubtitle: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  progressSection: { gap: 6 },
  progressLabel: { color: '#9ca3af', fontSize: 11 },
  progressBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tierItem: { alignItems: 'center', gap: 4, opacity: 0.4 },
  tierItemActive: { opacity: 1 },
  tierLabel: { fontSize: 9, fontWeight: '600' },
});
