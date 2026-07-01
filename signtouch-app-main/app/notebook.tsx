import { useState, useCallback } from 'react';
import { getDateLocale } from '@/utils/dateLocale';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Calendar, MapPin, User, Music, Trophy, Palette, Users, Star, Filter } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Memory, EventType } from '@/utils/memoriesStorage';
import * as StorageService from '@/utils/storageService';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/LanguageContext';

const EVENT_TYPE_ICONS: Record<EventType, any> = {
  concert: Music,
  match: Trophy,
  expo: Palette,
  salon: Users,
  dedicace: Star,
  rencontre: User,
  amis: Users,
  autre: Calendar,
};

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  concert: '#8b5cf6',
  match: '#22c55e',
  expo: '#f59e0b',
  salon: '#3b82f6',
  dedicace: '#ec4899',
  rencontre: '#14b8a6',
  amis: '#f472b6',
  autre: '#6b7280',
};

export default function NotebookScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<EventType | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useTranslation();

  useFocusEffect(
    useCallback(() => {
      loadMemories();
    }, [user])
  );

  const loadMemories = async () => {
    try {
      setLoading(true);
      const loadedMemories = await StorageService.getAllMemories(user?.id || null);
      const memoriesWithMetadata = loadedMemories.filter((m: Memory) => m.metadata && (m.metadata.personMet || m.metadata.eventLocation));
      memoriesWithMetadata.sort((a: Memory, b: Memory) => {
        const dateA = a.metadata?.eventDate ? new Date(a.metadata.eventDate).getTime() : a.timestamp;
        const dateB = b.metadata?.eventDate ? new Date(b.metadata.eventDate).getTime() : b.timestamp;
        return dateB - dateA;
      });
      setMemories(memoriesWithMetadata);
    } catch (error) {
      console.error('Error loading memories:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMemories = selectedFilter === 'all' 
    ? memories 
    : memories.filter(m => m.metadata?.eventType === selectedFilter);

  const formatDate = (dateString?: string, timestamp?: number) => {
    const date = dateString ? new Date(dateString) : timestamp ? new Date(timestamp) : null;
    if (!date) return '';
    return date.toLocaleDateString(getDateLocale(), { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const groupMemoriesByMonth = (memories: Memory[]) => {
    const groups: Record<string, Memory[]> = {};
    memories.forEach(memory => {
      const date = memory.metadata?.eventDate ? new Date(memory.metadata.eventDate) : new Date(memory.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(memory);
    });
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, memories]) => ({
        key,
        label: memories[0].metadata?.eventDate 
          ? new Date(memories[0].metadata.eventDate).toLocaleDateString(getDateLocale(), { month: 'long', year: 'numeric' })
          : new Date(memories[0].timestamp).toLocaleDateString(getDateLocale(), { month: 'long', year: 'numeric' }),
        memories
      }));
  };

  const handleMemoryPress = (memory: Memory) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: '/result',
      params: {
        imageUri: memory.uri,
        memoryId: memory.id,
      },
    });
  };

  const handleBack = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const eventTypes: (EventType | 'all')[] = ['all', 'concert', 'match', 'expo', 'salon', 'dedicace', 'rencontre', 'amis', 'autre'];

  const getEventTypeLabel = (type: EventType | 'all') => {
    const labels: Record<EventType | 'all', string> = {
      all: t('notebookAll') || 'Tous',
      concert: t('eventConcert') || 'Concert',
      match: t('eventMatch') || 'Match',
      expo: t('eventExpo') || 'Expo',
      salon: t('eventSalon') || 'Salon',
      dedicace: t('eventDedicace') || 'Dédicace',
      rencontre: t('eventRencontre') || 'Rencontre',
      amis: t('eventAmis') || 'Amis',
      autre: t('eventAutre') || 'Autre',
    };
    return labels[type];
  };

  const groupedMemories = groupMemoriesByMonth(filteredMemories);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('notebookTitle') || 'Mon Carnet'}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {eventTypes.map((type) => {
          const isSelected = selectedFilter === type;
          const IconComponent = type === 'all' ? Filter : EVENT_TYPE_ICONS[type];
          const color = type === 'all' ? '#6b7280' : EVENT_TYPE_COLORS[type];
          return (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterButton,
                isSelected && { backgroundColor: color },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setSelectedFilter(type);
              }}
            >
              <IconComponent size={16} color={isSelected ? '#ffffff' : color} />
              <Text style={[
                styles.filterText,
                isSelected && styles.filterTextSelected,
                !isSelected && { color }
              ]}>
                {getEventTypeLabel(type)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('loading') || 'Chargement...'}</Text>
          </View>
        ) : filteredMemories.length === 0 ? (
          <View style={styles.emptyState}>
            <Star size={64} color="#4b5563" />
            <Text style={styles.emptyTitle}>{t('notebookEmpty') || 'Aucune rencontre'}</Text>
            <Text style={styles.emptyText}>
              {t('notebookEmptyDescription') || 'Vos dédicaces avec informations apparaîtront ici'}
            </Text>
          </View>
        ) : (
          groupedMemories.map((group) => (
            <View key={group.key} style={styles.monthGroup}>
              <Text style={styles.monthTitle}>{group.label}</Text>
              {group.memories.map((memory) => {
                const eventType = memory.metadata?.eventType || 'autre';
                const IconComponent = EVENT_TYPE_ICONS[eventType];
                const color = EVENT_TYPE_COLORS[eventType];
                return (
                  <TouchableOpacity
                    key={memory.id}
                    style={styles.memoryCard}
                    onPress={() => handleMemoryPress(memory)}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: memory.uri }} style={styles.memoryImage} />
                    <View style={styles.memoryInfo}>
                      {memory.metadata?.personMet && (
                        <View style={styles.infoRow}>
                          <User size={16} color="#ffffff" />
                          <Text style={styles.personName} numberOfLines={1}>
                            {memory.metadata.personMet}
                          </Text>
                        </View>
                      )}
                      {memory.metadata?.eventLocation && (
                        <View style={styles.infoRow}>
                          <MapPin size={14} color="#9ca3af" />
                          <Text style={styles.infoText} numberOfLines={1}>
                            {memory.metadata.eventLocation}
                          </Text>
                        </View>
                      )}
                      <View style={styles.infoRow}>
                        <Calendar size={14} color="#9ca3af" />
                        <Text style={styles.infoText}>
                          {formatDate(memory.metadata?.eventDate, memory.timestamp)}
                        </Text>
                      </View>
                      <View style={[styles.eventBadge, { backgroundColor: color }]}>
                        <IconComponent size={12} color="#ffffff" />
                        <Text style={styles.eventBadgeText}>
                          {getEventTypeLabel(eventType)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  placeholder: {
    width: 44,
  },
  filterContainer: {
    maxHeight: 50,
    marginBottom: 16,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 8,
    gap: 6,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
  },
  filterTextSelected: {
    color: '#ffffff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  monthGroup: {
    marginBottom: 24,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9ca3af',
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  memoryCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  memoryImage: {
    width: 100,
    height: 120,
    backgroundColor: '#1f2937',
  },
  memoryInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  personName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  infoText: {
    fontSize: 13,
    color: '#9ca3af',
    flex: 1,
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginTop: 4,
  },
  eventBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
});
