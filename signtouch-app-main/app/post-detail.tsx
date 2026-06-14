import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Calendar, MapPin, CreditCard } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';

export default function PostDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const params = useLocalSearchParams();

  const post: any = useMemo(() => {
    try {
      return params.post ? JSON.parse(params.post as string) : null;
    } catch {
      return null;
    }
  }, [params.post]);

  const celebrityName = (params.celebrityName as string) || '';
  const celebrityAvatar = (params.celebrityAvatar as string) || '';

  const formatPrice = (cents: number, currency?: string) => {
    const amount = (cents / 100).toFixed(2);
    const cur = currency || 'eur';
    const symbols: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
    return `${amount}${symbols[cur] || cur}`;
  };

  const formatEventDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatEventTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatPostDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (!post) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>{t('error') || 'Publication introuvable'}</Text>
        <TouchableOpacity style={styles.backInline} onPress={() => router.back()}>
          <Text style={styles.backInlineText}>{t('back' as any) || 'Retour'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isEvent = post.kind === 'event';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 72, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Auteur */}
        <View style={styles.authorRow}>
          {celebrityAvatar ? (
            <Image source={{ uri: celebrityAvatar }} style={styles.authorAvatar} />
          ) : (
            <View style={[styles.authorAvatar, styles.authorAvatarPlaceholder]} />
          )}
          <View style={{ flex: 1 }}>
            {!!celebrityName && <Text style={styles.authorName}>{celebrityName}</Text>}
            <Text style={styles.postDate}>{formatPostDate(post.created_at)}</Text>
          </View>
        </View>

        {isEvent && (
          <View style={styles.eventBadge}>
            <Calendar size={12} color="#6366f1" />
            <Text style={styles.eventBadgeText}>{t('eventLabel' as any) || 'Événement'}</Text>
          </View>
        )}

        {!!post.title && <Text style={styles.title}>{post.title}</Text>}

        {!!post.media_url && (
          <Image source={{ uri: post.media_url }} style={styles.image} resizeMode="cover" />
        )}

        {!!post.body && <Text style={styles.body}>{post.body}</Text>}

        {isEvent && (
          <View style={styles.eventDetails}>
            {!!post.event_date && (
              <View style={styles.eventDetailRow}>
                <Calendar size={16} color="#9ca3af" />
                <Text style={styles.eventDetailText}>
                  {formatEventDate(post.event_date)} — {formatEventTime(post.event_date)}
                </Text>
              </View>
            )}
            {!!post.location && (
              <View style={styles.eventDetailRow}>
                <MapPin size={16} color="#9ca3af" />
                <Text style={styles.eventDetailText}>{post.location}</Text>
              </View>
            )}
            {post.price_cents > 0 && (
              <View style={styles.eventDetailRow}>
                <CreditCard size={16} color="#10b981" />
                <Text style={[styles.eventDetailText, { color: '#10b981', fontWeight: '700' }]}>
                  {formatPrice(post.price_cents)}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bouton retour */}
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 16 }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <ArrowLeft size={22} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  backButton: {
    position: 'absolute', left: 16, zIndex: 10, padding: 8, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  authorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, marginBottom: 16,
  },
  authorAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)' },
  authorAvatarPlaceholder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  authorName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  postDate: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  eventBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(99,102,241,0.12)', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    marginHorizontal: 16, marginBottom: 10,
  },
  eventBadgeText: { color: '#6366f1', fontSize: 12, fontWeight: '600' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', paddingHorizontal: 16, marginBottom: 14, lineHeight: 30 },
  image: { width: '100%', height: 320, marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.04)' },
  body: { color: '#d1d5db', fontSize: 16, lineHeight: 24, paddingHorizontal: 16 },
  eventDetails: {
    marginTop: 18, marginHorizontal: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', gap: 10,
  },
  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventDetailText: { color: '#9ca3af', fontSize: 14 },
  emptyText: { color: '#9ca3af', fontSize: 15, marginBottom: 16 },
  backInline: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  backInlineText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
