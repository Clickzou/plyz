import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { useRouter, useFocusEffect } from 'expo-router';
import { Download, Trash2, Camera, X, Pencil, Share2, BookOpen, Filter, Star, User, MapPin, Calendar, Music, Trophy, Palette, Users, CheckCircle2, Circle, Film, Play } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import { Memory, MemoryMetadata, EventType } from '@/utils/memoriesStorage';
import { Story, getStories, deleteStory } from '@/utils/storiesStorage';
import MetadataModal from '@/components/MetadataModal';
import * as StorageService from '@/utils/storageService';
import { useSubscription, SUBSCRIPTION_ENABLED } from '@/contexts/SubscriptionContext';
import { useTranslation } from '@/contexts/LanguageContext';

type GalleryTab = 'photos' | 'stories';
import { useAuth } from '@/contexts/AuthContext';
import AdModal from '@/components/AdModal';
import SocialShareModal from '@/components/SocialShareModal';
import TrialModal from '@/components/TrialModal';
import AccountModal from '@/components/AccountModal';
import { getTrialStatus, hasFirstPhotoBeenSaved } from '@/utils/trialStorage';

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
  amis: '#0ea5e9',
  autre: '#6b7280',
};

export default function GalleryScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeTab, setActiveTab] = useState<GalleryTab>('photos');
  const [loading, setLoading] = useState(true);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [pendingSave, setPendingSave] = useState<'single' | 'multiple' | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<EventType | 'all'>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMemories, setSelectedMemories] = useState<Set<string>>(new Set());
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(7);
  const [hasCheckedFirstPhoto, setHasCheckedFirstPhoto] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, isPremium } = useSubscription();
  const { t } = useTranslation();
  const { user, setPostAuthRedirect } = useAuth();

  const filteredMemories = selectedFilter === 'all' 
    ? memories 
    : memories.filter(m => m.metadata?.eventType === selectedFilter);

  const formatDate = (dateString?: string, timestamp?: number) => {
    const date = dateString ? new Date(dateString) : timestamp ? new Date(timestamp) : null;
    if (!date) return '';
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const groupMemoriesByMonth = (mems: Memory[]) => {
    const groups: Record<string, Memory[]> = {};
    mems.forEach(memory => {
      const date = memory.metadata?.eventDate ? new Date(memory.metadata.eventDate) : new Date(memory.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(memory);
    });
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, mems]) => ({
        key,
        label: mems[0].metadata?.eventDate 
          ? new Date(mems[0].metadata.eventDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
          : new Date(mems[0].timestamp).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        memories: mems
      }));
  };

  const eventTypes: (EventType | 'all')[] = ['all', 'concert', 'match', 'expo', 'salon', 'dedicace', 'rencontre', 'autre'];

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

  const loadMemories = async () => {
    try {
      setLoading(true);
      // Sur web, toujours utiliser localStorage (pas de cloud storage)
      if (Platform.OS === 'web') {
        const localMemories = JSON.parse(localStorage.getItem('memories') || '[]');
        setMemories(localMemories);
      } else {
        const loadedMemories = await StorageService.getAllMemories(user?.id || null);
        setMemories(loadedMemories);
      }
    } catch (error) {
      console.error('Error loading memories:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStoriesData = async () => {
    try {
      const loadedStories = await getStories();
      setStories(loadedStories);
    } catch (error) {
      console.error('Error loading stories:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadMemories();
      loadStoriesData();

      const checkAndShowModals = async () => {
        const firstPhotoSaved = await hasFirstPhotoBeenSaved();
        console.log('[Trial] First photo saved:', firstPhotoSaved, 'Already checked:', hasCheckedFirstPhoto);
        
        if (!firstPhotoSaved) return;
        if (hasCheckedFirstPhoto) return;
        
        setHasCheckedFirstPhoto(true);
        
        if (status === 'paid') {
          console.log('[Trial] User is paid, skipping modal');
          return;
        }
        
        const trialStatus = await getTrialStatus(user?.id || null);
        console.log('[Trial] Trial status:', trialStatus);
        setTrialDaysRemaining(trialStatus.daysRemaining);
      };

      checkAndShowModals();
    }, [user, status, hasCheckedFirstPhoto])
  );

  const openMemory = (memory: Memory) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (selectionMode) {
      toggleMemorySelection(memory.id);
    } else {
      router.push({
        pathname: '/result',
        params: { memoryId: memory.id },
      });
    }
  };

  const toggleSelectionMode = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectionMode(!selectionMode);
    setSelectedMemories(new Set());
  };

  const toggleMemorySelection = (memoryId: string) => {
    const newSelected = new Set(selectedMemories);
    if (newSelected.has(memoryId)) {
      newSelected.delete(memoryId);
    } else {
      newSelected.add(memoryId);
    }
    setSelectedMemories(newSelected);
  };

  const closeMemory = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedMemory(null);
  };

  const saveMemory = async () => {
    if (!selectedMemory) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    await performSaveMemory();
  };

  const performSaveMemory = async () => {
    if (!selectedMemory) return;

    try {
      if (Platform.OS === 'web') {
        const response = await fetch(selectedMemory.uri);
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = selectedMemory.uri;
        link.download = `souvenir_${Date.now()}.png`;
        link.click();
        console.log('✅ Téléchargement lancé');
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status !== 'granted') {
          showAlert(t('permissionRequired'), t('galleryPermissionMessage'));
          return;
        }

        console.log('💾 Enregistrement dans la galerie...');
        await MediaLibrary.createAssetAsync(selectedMemory.uri);
        console.log('✅ Enregistré dans la galerie');

        showAlert(
          t('saved'),
          t('downloadedMessage')
        );
      }
    } catch (error) {
      console.error('❌ Erreur:', error);
      showAlert(t('error'), t('saveError') + ': ' + (error as Error).message);
    }
  };

  const confirmDelete = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    showConfirm(
      t('confirmDelete'),
      t('confirmDeleteMessage'),
      [
        {
          text: t('cancel'),
          style: 'cancel',
        },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: handleDelete,
        },
      ]
    );
  };

  const handleDelete = async () => {
    if (!selectedMemory) return;

    try {
      setIsDeleting(true);
      console.log('🗑️ Suppression de:', selectedMemory.id);

      if (Platform.OS === 'web') {
        const memories = JSON.parse(localStorage.getItem('memories') || '[]');
        const filtered = memories.filter((m: Memory) => m.id !== selectedMemory.id);
        localStorage.setItem('memories', JSON.stringify(filtered));
      } else {
        await StorageService.deleteMemory(selectedMemory.id, user?.id || null);
      }
      console.log('✅ Souvenir supprimé');

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setSelectedMemory(null);
      await loadMemories();
      console.log('✅ Liste rechargée');
    } catch (error) {
      console.error('❌ Erreur lors de la suppression:', error);
      showAlert(t('error'), t('saveError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteStory = async () => {
    if (!selectedStory) return;

    try {
      setIsDeleting(true);
      await deleteStory(selectedStory.id);
      
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setSelectedStory(null);
      await loadStoriesData();
    } catch (error) {
      console.error('Error deleting story:', error);
      showAlert(t('error'), t('saveError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDeleteStory = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    showConfirm(
      t('confirmDelete'),
      t('confirmDeleteMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: handleDeleteStory },
      ]
    );
  };

  const goToCamera = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/camera');
  };

  const editMemory = async () => {
    if (!selectedMemory) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    if (!isPremium) {
      await setPostAuthRedirect('/gallery');
      router.push('/paywall');
      return;
    }
    
    performEditMemory();
  };

  const performEditMemory = () => {
    if (!selectedMemory) return;
    setSelectedMemory(null);
    router.push({
      pathname: '/result',
      params: { memoryId: selectedMemory.id },
    });
  };

  const handleAdWatched = () => {
    setShowAdModal(false);
    if (pendingSave === 'single') {
      performSaveMemory();
    }
    setPendingSave(null);
  };

  const openShareModal = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowShareModal(true);
  };

  const handleMetadataSave = async (metadata: MemoryMetadata) => {
    try {
      if (selectionMode && selectedMemories.size > 0) {
        for (const memoryId of selectedMemories) {
          const memory = memories.find(m => m.id === memoryId);
          if (memory) {
            const mergedMetadata: MemoryMetadata = {
              personMet: metadata.personMet || memory.metadata?.personMet || '',
              eventLocation: metadata.eventLocation || memory.metadata?.eventLocation || '',
              eventDate: metadata.eventDate || memory.metadata?.eventDate || new Date().toISOString().split('T')[0],
              eventType: metadata.eventType || memory.metadata?.eventType || 'autre',
            };
            await StorageService.updateMemory(memory, user?.id || null, { metadata: mergedMetadata });
          }
        }
        setSelectionMode(false);
        setSelectedMemories(new Set());
      } else if (selectedMemory) {
        await StorageService.updateMemory(selectedMemory, user?.id || null, { metadata });
      }
      setShowMetadataModal(false);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await loadMemories();
    } catch (error) {
      console.error('Error saving metadata:', error);
    }
  };

  const handleMetadataSkip = () => {
    setShowMetadataModal(false);
  };

  const openBulkMetadataModal = () => {
    if (selectedMemories.size === 0) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowMetadataModal(true);
  };

  const confirmDeleteSelected = () => {
    if (selectedMemories.size === 0) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const message = t('confirmDeleteMultiple', { count: selectedMemories.size }) || 
      `Voulez-vous vraiment supprimer ${selectedMemories.size} souvenir(s) ?`;

    showConfirm(
      t('confirmDelete'),
      message,
      [
        {
          text: t('cancel'),
          style: 'cancel',
        },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: handleDeleteSelected,
        },
      ]
    );
  };

  const handleDeleteSelected = async () => {
    try {
      setIsDeleting(true);

      if (Platform.OS === 'web') {
        const memories = JSON.parse(localStorage.getItem('memories') || '[]');
        const filtered = memories.filter((m: Memory) => !selectedMemories.has(m.id));
        localStorage.setItem('memories', JSON.stringify(filtered));
      } else {
        for (const memoryId of selectedMemories) {
          await StorageService.deleteMemory(memoryId, user?.id || null);
        }
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setSelectionMode(false);
      setSelectedMemories(new Set());
      await loadMemories();
      console.log(`✅ ${selectedMemories.size} souvenirs supprimés`);
    } catch (error) {
      console.error('❌ Erreur lors de la suppression:', error);
      showAlert(t('error'), t('saveError'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.title}>{t('myMemories')}</Text>
        
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'photos' && styles.tabActive]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('photos');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'photos' && styles.tabTextActive]}>
              {t('galleryPhotos') || 'Photos'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stories' && styles.tabActive]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('stories');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'stories' && styles.tabTextActive]}>
              {t('galleryStories') || 'Stories'}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'photos' && memories.length > 0 && !selectionMode && (
          <Text style={styles.instructionText}>
            {t('galleryInstruction')}
          </Text>
        )}
        {activeTab === 'stories' && (
          <Text style={styles.instructionText}>
            {t('storiesInstruction')}
          </Text>
        )}
        {activeTab === 'photos' && memories.length > 0 && (
          <View style={styles.headerRow}>
            {selectionMode && selectedMemories.size > 0 && (
              <Text style={styles.subtitle}>
                {`${selectedMemories.size} ${selectedMemories.size > 1 ? t('selectedPlural') || 'sélectionnés' : t('selected') || 'sélectionné'}`}
              </Text>
            )}
            <TouchableOpacity
              style={styles.selectButton}
              onPress={toggleSelectionMode}
              activeOpacity={0.8}
            >
              <Text style={styles.selectButtonText}>
                {selectionMode ? t('cancel') : t('select')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {activeTab === 'photos' && memories.length > 0 && (
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
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      )}

      {activeTab === 'stories' && (
        stories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Film size={64} color="#4b5563" />
            <Text style={styles.emptyText}>{t('noStories') || 'No stories yet'}</Text>
            <Text style={styles.emptySubtext}>{t('noStoriesHint') || 'Create a story from your photo result'}</Text>
          </View>
        ) : (
          <ScrollView style={styles.storiesGrid} showsVerticalScrollIndicator={false}>
            <View style={styles.storiesGridContent}>
              {stories.map((story) => (
                <TouchableOpacity
                  key={story.id}
                  style={styles.storyCard}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedStory(story);
                  }}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: story.uri }}
                    style={styles.storyImage}
                    resizeMode="cover"
                  />
                  <View style={styles.storyOverlay}>
                    <Text style={styles.storyDate}>
                      {new Date(story.timestamp).toLocaleDateString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )
      )}

      {activeTab === 'photos' && loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : activeTab === 'photos' && memories.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('noMemories')}</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={goToCamera}
            activeOpacity={0.8}
          >
            <Camera size={20} color="#ffffff" strokeWidth={2} />
            <Text style={styles.createButtonText}>{t('takePicture')}</Text>
          </TouchableOpacity>
        </View>
      ) : activeTab === 'photos' && filteredMemories.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Star size={64} color="#4b5563" />
          <Text style={styles.emptyText}>{t('noMemoriesForFilter') || 'Aucun souvenir pour ce filtre'}</Text>
        </View>
      ) : activeTab === 'photos' && (
        <ScrollView style={styles.notebookContent} showsVerticalScrollIndicator={false}>
          {groupedMemories.map((group) => (
            <View key={group.key} style={styles.monthGroup}>
              <Text style={styles.monthTitle}>{group.label}</Text>
              {group.memories.map((memory) => {
                const eventType = memory.metadata?.eventType || 'autre';
                const IconComponent = EVENT_TYPE_ICONS[eventType];
                const color = EVENT_TYPE_COLORS[eventType];
                const hasMetadata = memory.metadata?.personMet || memory.metadata?.eventLocation;
                const isSelected = selectedMemories.has(memory.id);
                return (
                  <TouchableOpacity
                    key={memory.id}
                    style={[styles.memoryCard, isSelected && styles.memoryCardSelected]}
                    onPress={() => openMemory(memory)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardImageContainer}>
                      <Image
                        source={{ uri: memory.baseUri || memory.uri }}
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                      {selectionMode && (
                        <View style={styles.selectionIndicator}>
                          {isSelected ? (
                            <CheckCircle2 size={24} color="#10b981" fill="#10b981" strokeWidth={2} />
                          ) : (
                            <Circle size={24} color="#ffffff" strokeWidth={2} />
                          )}
                        </View>
                      )}
                    </View>
                    <View style={styles.cardContent}>
                      {memory.metadata?.personMet ? (
                        <View style={styles.cardRow}>
                          <User size={16} color="#ffffff" />
                          <Text style={styles.cardText} numberOfLines={1}>{memory.metadata.personMet}</Text>
                        </View>
                      ) : (
                        <View style={styles.cardRow}>
                          <User size={16} color="#6b7280" />
                          <Text style={styles.cardTextMuted} numberOfLines={1}>{t('noPersonMet') || 'Non renseigné'}</Text>
                        </View>
                      )}
                      {memory.metadata?.eventLocation ? (
                        <View style={styles.cardRow}>
                          <MapPin size={16} color="#9ca3af" />
                          <Text style={styles.cardTextSecondary} numberOfLines={1}>{memory.metadata.eventLocation}</Text>
                        </View>
                      ) : (
                        <View style={styles.cardRow}>
                          <MapPin size={16} color="#6b7280" />
                          <Text style={styles.cardTextMuted} numberOfLines={1}>{t('noLocation') || 'Lieu non renseigné'}</Text>
                        </View>
                      )}
                      <View style={styles.cardRow}>
                        <Calendar size={16} color="#9ca3af" />
                        <Text style={styles.cardTextSecondary}>
                          {formatDate(memory.metadata?.eventDate, memory.timestamp)}
                        </Text>
                      </View>
                      {hasMetadata && (
                        <View style={[styles.eventBadge, { backgroundColor: color }]}>
                          <IconComponent size={12} color="#ffffff" />
                          <Text style={styles.eventBadgeText}>{getEventTypeLabel(eventType)}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <View style={{ height: BOTTOM_NAV_HEIGHT + 40 }} />
        </ScrollView>
      )}

      <Modal
        visible={selectedMemory !== null}
        transparent={false}
        animationType="fade"
        onRequestClose={closeMemory}
      >
        <View style={styles.modalContainer}>
          {selectedMemory && (
            <Image
              source={{
                uri: selectedMemory.updatedAt && !selectedMemory.uri.startsWith('data:')
                  ? `${selectedMemory.uri}?t=${selectedMemory.updatedAt}`
                  : selectedMemory.uri
              }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}

          <TouchableOpacity
            style={[styles.closeModalButton, { top: insets.top + 20 }]}
            onPress={closeMemory}
            activeOpacity={0.8}
          >
            <X size={24} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>

          <View style={[styles.modalFloatingControls, { paddingBottom: insets.bottom + 20 }]}>
            <TouchableOpacity
              style={[styles.modalFloatingButton, styles.modalGreenButton]}
              onPress={editMemory}
              activeOpacity={0.8}
            >
              <Pencil size={28} color="#ffffff" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalFloatingButton, styles.modalBlueButton]}
              onPress={openShareModal}
              activeOpacity={0.8}
            >
              <Share2 size={28} color="#ffffff" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalFloatingButton, styles.modalBlackButton]}
              onPress={saveMemory}
              activeOpacity={0.8}
            >
              <Download size={28} color="#ffffff" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalFloatingButton, styles.modalRedButton]}
              onPress={confirmDelete}
              disabled={isDeleting}
              activeOpacity={0.8}
            >
              {isDeleting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Trash2 size={28} color="#ffffff" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedStory !== null}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setSelectedStory(null)}
      >
        <View style={styles.modalContainer}>
          {selectedStory && (
            <Image
              source={{ uri: selectedStory.uri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}

          <TouchableOpacity
            style={[styles.closeModalButton, { top: insets.top + 20 }]}
            onPress={() => setSelectedStory(null)}
            activeOpacity={0.8}
          >
            <X size={24} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>

          <View style={[styles.modalFloatingControls, { paddingBottom: insets.bottom + 20 }]}>
            <TouchableOpacity
              style={[styles.modalFloatingButton, styles.modalGreenButton]}
              onPress={() => {
                if (selectedStory) {
                  setSelectedStory(null);
                  router.push({
                    pathname: '/story',
                    params: {
                      imageUri: selectedStory.uri,
                      memoryId: selectedStory.sourceMemoryId || '',
                      storyId: selectedStory.id,
                      mode: 'preview',
                    }
                  });
                }
              }}
              activeOpacity={0.8}
            >
              <Play size={28} color="#ffffff" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalFloatingButton, styles.modalBlueButton]}
              onPress={() => {
                if (selectedStory) {
                  setSelectedStory(null);
                  router.push({
                    pathname: '/story',
                    params: {
                      imageUri: selectedStory.uri,
                      memoryId: selectedStory.sourceMemoryId || '',
                      storyId: selectedStory.id,
                      mode: 'edit',
                    }
                  });
                }
              }}
              activeOpacity={0.8}
            >
              <Pencil size={28} color="#ffffff" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalFloatingButton, styles.modalBlueButton]}
              onPress={() => {
                if (selectedStory) {
                  setShowShareModal(true);
                }
              }}
              activeOpacity={0.8}
            >
              <Share2 size={28} color="#ffffff" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalFloatingButton, styles.modalRedButton]}
              onPress={confirmDeleteStory}
              disabled={isDeleting}
              activeOpacity={0.8}
            >
              {isDeleting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Trash2 size={28} color="#ffffff" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SocialShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        imageUri={selectedStory?.uri || selectedMemory?.uri || ''}
      />

      <AdModal
        visible={showAdModal}
        onClose={() => {
          setShowAdModal(false);
          setPendingSave(null);
        }}
        onAdWatched={handleAdWatched}
      />

      <MetadataModal
        visible={showMetadataModal}
        onClose={() => setShowMetadataModal(false)}
        onSave={handleMetadataSave}
        onSkip={handleMetadataSkip}
        initialMetadata={selectionMode ? undefined : selectedMemory?.metadata}
      />

      {SUBSCRIPTION_ENABLED && (
        <TrialModal
          visible={showTrialModal}
          daysRemaining={trialDaysRemaining}
          isExpired={false}
          onSubscribe={() => {
            setShowTrialModal(false);
            router.push('/paywall');
          }}
          onLater={() => setShowTrialModal(false)}
        />
      )}

      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        onSkip={() => {
          setShowAccountModal(false);
          performEditMemory();
        }}
        returnPath="/gallery"
      />

      {selectionMode && selectedMemories.size > 0 && (
        <View style={[styles.bulkActions, { bottom: BOTTOM_NAV_HEIGHT + Math.max(insets.bottom, 15) }]}>
          <TouchableOpacity
            style={[styles.bulkActionButton, styles.bulkInfoButton]}
            onPress={openBulkMetadataModal}
            activeOpacity={0.8}
          >
            <BookOpen size={24} color="#ffffff" strokeWidth={2} />
            <Text style={styles.bulkActionText}>{t('addInfo') || 'Ajouter infos'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bulkActionButton, styles.bulkDeleteButton]}
            onPress={confirmDeleteSelected}
            disabled={isDeleting}
            activeOpacity={0.8}
          >
            {isDeleting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Trash2 size={24} color="#ffffff" strokeWidth={2} />
                <Text style={styles.bulkActionText}>{t('delete')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 20,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#888',
    textAlign: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    gap: 10,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  closeModalButton: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalFloatingControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  modalFloatingButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalGreenButton: {
    backgroundColor: '#10b981',
  },
  modalBlueButton: {
    backgroundColor: '#6366f1',
  },
  modalBlackButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalRedButton: {
    backgroundColor: '#ef4444',
  },
  filterContainer: {
    flexGrow: 0,
    paddingVertical: 10,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#1f2937',
    gap: 6,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterTextSelected: {
    color: '#ffffff',
  },
  notebookContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  monthGroup: {
    marginBottom: 24,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  memoryCard: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: 100,
    height: 120,
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    gap: 6,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  cardTextSecondary: {
    color: '#9ca3af',
    fontSize: 14,
    flex: 1,
  },
  cardTextMuted: {
    color: '#6b7280',
    fontSize: 14,
    fontStyle: 'italic',
    flex: 1,
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 4,
    marginTop: 4,
  },
  eventBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
    marginTop: 15,
  },
  selectButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#10b981',
  },
  selectButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  memoryCardSelected: {
    borderWidth: 2,
    borderColor: '#10b981',
  },
  cardImageContainer: {
    position: 'relative',
    width: 100,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    padding: 2,
  },
  bulkActions: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 15,
    paddingVertical: 10,
  },
  bulkActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 8,
  },
  bulkDeleteButton: {
    backgroundColor: '#ef4444',
  },
  bulkInfoButton: {
    backgroundColor: '#8b5cf6',
  },
  bulkActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
    marginTop: 16,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#10b981',
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  storiesGrid: {
    flex: 1,
    paddingHorizontal: 16,
  },
  storiesGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: BOTTOM_NAV_HEIGHT + 20,
  },
  storyCard: {
    width: '48%',
    aspectRatio: 9/16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#1a1a1a',
  },
  storyImage: {
    width: '100%',
    height: '100%',
  },
  storyOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  storyDate: {
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: -10,
  },
});
