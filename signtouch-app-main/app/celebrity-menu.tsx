import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, QrCode, Video, Star, Clock, Play, Calendar } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMyScheduledEvents, EventSession } from '@/utils/eventSessionStorage';

export default function CelebrityMenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [myEvents, setMyEvents] = useState<EventSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMyEvents();
  }, []);

  const loadMyEvents = async () => {
    try {
      const events = await getMyScheduledEvents();
      const activeOrScheduled = events.filter(e => 
        e.status === 'active' || e.status === 'scheduled'
      );
      setMyEvents(activeOrScheduled);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContinueEvent = (event: EventSession) => {
    router.push(`/event-publish?sessionId=${event.id}`);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['#10B981', '#059669']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('celebrity')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconContainer}>
          <Star size={48} color="#fff" fill="#fff" />
        </View>

        <Text style={styles.title}>{t('celebrityMenuTitle')}</Text>
        <Text style={styles.subtitle}>{t('celebrityMenuSubtitle')}</Text>

        {myEvents.length > 0 && (
          <View style={styles.activeEventsSection}>
            <Text style={styles.sectionTitle}>{t('myActiveEvents') || 'Mes événements'}</Text>
            {myEvents.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={styles.activeEventCard}
                onPress={() => handleContinueEvent(event)}
              >
                <View style={styles.activeEventLeft}>
                  <View style={[
                    styles.eventStatusBadge,
                    event.status === 'active' ? styles.badgeActive : styles.badgeScheduled
                  ]}>
                    {event.status === 'active' ? (
                      <Play size={12} color="#fff" fill="#fff" />
                    ) : (
                      <Calendar size={12} color="#fff" />
                    )}
                    <Text style={styles.eventStatusText}>
                      {event.status === 'active' ? 'EN COURS' : 'PLANIFIÉ'}
                    </Text>
                  </View>
                  <Text style={styles.activeEventTitle}>{event.title}</Text>
                  <View style={styles.activeEventTime}>
                    <Clock size={12} color="rgba(255,255,255,0.6)" />
                    <Text style={styles.activeEventTimeText}>
                      {event.status === 'scheduled' 
                        ? `${new Date(event.starts_at).toLocaleDateString()} ${new Date(event.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : `Jusqu'à ${new Date(event.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      }
                    </Text>
                  </View>
                </View>
                <View style={styles.continueButton}>
                  <Text style={styles.continueButtonText}>{t('continue') || 'Continuer'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => router.push('/create-event')}
          >
            <View style={styles.optionIcon}>
              <QrCode size={32} color="#10B981" />
            </View>
            <Text style={styles.optionTitle}>{t('celebrityEventSimple')}</Text>
            <Text style={styles.optionDescription}>{t('celebrityEventSimpleDesc')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => router.push('/create-live-session')}
          >
            <View style={[styles.optionIcon, styles.liveIcon]}>
              <Video size={32} color="#ef4444" />
            </View>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
            <Text style={styles.optionTitle}>{t('celebrityLiveSession')}</Text>
            <Text style={styles.optionDescription}>{t('celebrityLiveSessionDesc')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  optionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveIcon: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  liveBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 6,
  },
  optionDescription: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  activeEventsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  activeEventCard: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  activeEventLeft: {
    flex: 1,
  },
  eventStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    marginBottom: 6,
  },
  badgeActive: {
    backgroundColor: '#ef4444',
  },
  badgeScheduled: {
    backgroundColor: '#f59e0b',
  },
  eventStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  activeEventTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  activeEventTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeEventTimeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  continueButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  continueButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
});
