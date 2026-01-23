import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Download, Trash2, Camera, CheckCircle2, Circle, X, Pencil, Share2, BookOpen, Grid3X3, List, Filter, Star, User, MapPin, Calendar, Music, Trophy, Palette, Users } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import { Memory, MemoryMetadata, EventType } from '@/utils/memoriesStorage';
import MetadataModal from '@/components/MetadataModal';
import * as StorageService from '@/utils/storageService';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AdModal from '@/components/AdModal';
import SocialShareModal from '@/components/SocialShareModal';
import { maybeShowSubscriptionOffer } from '@/utils/subscriptionOffer';

const EVENT_TYPE_ICONS: Record<EventType, any> = {
  concert: Music,
  match: Trophy,
  expo: Palette,
  salon: Users,
  dedicace: Star,
  rencontre: User,
  autre: Calendar,
};

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  concert: '#8b5cf6',
  match: '#22c55e',
  expo: '#f59e0b',
  salon: '#3b82f6',
  dedicace: '#ec4899',
  rencontre: '#14b8a6',
  autre: '#6b7280',
};

// Component to render memory thumbnail
interface MemoryThumbnailProps {
  memory: Memory;
  onPress: () => void;
  isSelected: boolean;
  selectionMode: boolean;
}

function MemoryThumbnail({ memory, onPress, isSelected, selectionMode }: MemoryThumbnailProps) {
  // Use baseUri for thumbnail to show original photo without signatures
  const thumbnailUri = memory.baseUri || memory.uri;
  const imageUri = memory.updatedAt && !thumbnailUri.startsWith('data:')
    ? `${thumbnailUri}?t=${memory.updatedAt}`
    : thumbnailUri;

  return (
    <TouchableOpacity
      style={styles.memoryContainer}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.thumbnailWrapper}>
        <Image
          source={{ uri: imageUri }}
          style={styles.memoryImage}
          resizeMode="cover"
          key={imageUri}
        />
      </View>
      {selectionMode && (
        <View style={styles.selectionOverlay}>
          {isSelected ? (
            <CheckCircle2 size={32} color="#10b981" fill="#10b981" strokeWidth={2} />
          ) : (
            <Circle size={32} color="#ffffff" strokeWidth={2} />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

type ViewMode = 'grid' | 'notebook';

export default function GalleryScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMemories, setSelectedMemories] = useState<Set<string>>(new Set());
  const [showAdModal, setShowAdModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [pendingSave, setPendingSave] = useState<'single' | 'multiple' | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedFilter, setSelectedFilter] = useState<EventType | 'all'>('all');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useSubscription();
  const { t } = useTranslation();
  const { user } = useAuth();

  const memoriesWithMetadata = memories.filter((m: Memory) => m.metadata && (m.metadata.personMet || m.metadata.eventLocation));
  
  const filteredNotebookMemories = selectedFilter === 'all' 
    ? memoriesWithMetadata 
    : memoriesWithMetadata.filter(m => m.metadata?.eventType === selectedFilter);

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
      autre: t('eventAutre') || 'Autre',
    };
    return labels[type];
  };

  const groupedMemories = groupMemoriesByMonth(filteredNotebookMemories);

  const loadMemories = async () => {
    try {
      setLoading(true);
      const loadedMemories = await StorageService.getAllMemories(user?.id || null);
      setMemories(loadedMemories);
    } catch (error) {
      console.error('Error loading memories:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadMemories();

      // Afficher le modal d'abonnement 1 seconde après l'arrivée sur la galerie
      const timer = setTimeout(() => {
        maybeShowSubscriptionOffer();
      }, 1000);

      return () => clearTimeout(timer);
    }, [])
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
          Alert.alert(t('permissionRequired'), t('galleryPermissionMessage'));
          return;
        }

        console.log('💾 Enregistrement dans la galerie...');
        await MediaLibrary.createAssetAsync(selectedMemory.uri);
        console.log('✅ Enregistré dans la galerie');

        Alert.alert(
          t('saved'),
          t('downloadedMessage')
        );
      }
    } catch (error) {
      console.error('❌ Erreur:', error);
      Alert.alert(t('error'), t('saveError') + ': ' + (error as Error).message);
    }
  };

  const confirmDelete = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (Platform.OS === 'web') {
      if (window.confirm(t('confirmDeleteMessage'))) {
        handleDelete();
      }
    } else {
      Alert.alert(
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
    }
  };

  const handleDelete = async () => {
    if (!selectedMemory) return;

    try {
      setIsDeleting(true);
      console.log('🗑️ Suppression de:', selectedMemory.id);

      await StorageService.deleteMemory(selectedMemory.id, user?.id || null);
      console.log('✅ Souvenir supprimé');

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setSelectedMemory(null);
      await loadMemories();
      console.log('✅ Liste rechargée');
    } catch (error) {
      console.error('❌ Erreur lors de la suppression:', error);
      Alert.alert(t('error'), t('saveError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const goToCamera = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/camera');
  };

  const editMemory = () => {
    if (!selectedMemory) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedMemory(null);
    router.push({
      pathname: '/result',
      params: { memoryId: selectedMemory.id },
    });
  };

  const saveSelectedMemories = async () => {
    if (selectedMemories.size === 0) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    await performSaveSelectedMemories();
  };

  const performSaveSelectedMemories = async () => {
    try {
      if (Platform.OS === 'web') {
        for (const memoryId of selectedMemories) {
          const memory = memories.find(m => m.id === memoryId);
          if (memory) {
            const response = await fetch(memory.uri);
            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = memory.uri;
            link.download = `souvenir_${memoryId}.png`;
            link.click();
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        console.log(`✅ ${selectedMemories.size} souvenirs téléchargés`);
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status !== 'granted') {
          Alert.alert(t('permissionRequired'), t('galleryPermissionMessage'));
          return;
        }

        for (const memoryId of selectedMemories) {
          const memory = memories.find(m => m.id === memoryId);
          if (memory) {
            await MediaLibrary.createAssetAsync(memory.uri);
          }
        }

        Alert.alert(
          t('saved'),
          t('memoriesSaved', { count: selectedMemories.size })
        );
      }

      setSelectionMode(false);
      setSelectedMemories(new Set());
    } catch (error) {
      console.error('❌ Erreur:', error);
      Alert.alert(t('error'), t('saveError') + ': ' + (error as Error).message);
    }
  };

  const handleAdWatched = () => {
    setShowAdModal(false);
    if (pendingSave === 'single') {
      performSaveMemory();
    } else if (pendingSave === 'multiple') {
      performSaveSelectedMemories();
    }
    setPendingSave(null);
  };

  const confirmDeleteSelected = () => {
    if (selectedMemories.size === 0) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const message = t('confirmDeleteMultiple', { count: selectedMemories.size });

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        handleDeleteSelected();
      }
    } else {
      Alert.alert(
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
    }
  };

  const handleDeleteSelected = async () => {
    try {
      setIsDeleting(true);

      for (const memoryId of selectedMemories) {
        await StorageService.deleteMemory(memoryId, user?.id || null);
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
      Alert.alert(t('error'), t('saveError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const openShareModal = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowShareModal(true);
  };

  const openMetadataModal = () => {
    if (selectedMemories.size !== 1) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowMetadataModal(true);
  };

  const handleMetadataSave = async (metadata: MemoryMetadata) => {
    if (selectedMemories.size !== 1) return;
    const memoryId = Array.from(selectedMemories)[0];
    const memory = memories.find(m => m.id === memoryId);
    if (!memory) return;

    try {
      await StorageService.updateMemory(memory, user?.id || null, { metadata });
      setShowMetadataModal(false);
      setSelectionMode(false);
      setSelectedMemories(new Set());
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.title}>{t('myMemories')}</Text>
        {memories.length > 0 && viewMode === 'grid' && (
          <Text style={styles.instructionText}>
            {t('galleryInstruction')}
          </Text>
        )}
        <View style={styles.headerButtons}>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.viewToggleButton, viewMode === 'grid' && styles.viewToggleButtonActive]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setViewMode('grid');
                setSelectionMode(false);
                setSelectedMemories(new Set());
              }}
              activeOpacity={0.8}
            >
              <Grid3X3 size={18} color={viewMode === 'grid' ? '#ffffff' : '#9ca3af'} />
              <Text style={[styles.viewToggleText, viewMode === 'grid' && styles.viewToggleTextActive]}>
                {t('viewGrid') || 'Grille'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleButton, viewMode === 'notebook' && styles.viewToggleButtonActive]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setViewMode('notebook');
                setSelectionMode(false);
                setSelectedMemories(new Set());
              }}
              activeOpacity={0.8}
            >
              <BookOpen size={18} color={viewMode === 'notebook' ? '#ffffff' : '#9ca3af'} />
              <Text style={[styles.viewToggleText, viewMode === 'notebook' && styles.viewToggleTextActive]}>
                {t('notebookTitle') || 'Carnet'}
              </Text>
            </TouchableOpacity>
          </View>
          {memories.length > 0 && viewMode === 'grid' && (
            <TouchableOpacity
              style={styles.selectButton}
              onPress={toggleSelectionMode}
              activeOpacity={0.8}
            >
              <Text style={styles.selectButtonText}>
                {selectionMode ? t('cancel') : t('select')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {memories.length > 0 && viewMode === 'grid' && (
          <Text style={styles.subtitle}>
            {selectionMode && selectedMemories.size > 0
              ? `${selectedMemories.size} ${selectedMemories.size > 1 ? t('selectedPlural') : t('selected')}`
              : `${memories.length} ${memories.length > 1 ? t('memories') : t('memory')}`
            }
          </Text>
        )}
      </View>

      {viewMode === 'notebook' && (
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

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : memories.length === 0 ? (
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
      ) : viewMode === 'notebook' ? (
        <ScrollView style={styles.notebookContent} showsVerticalScrollIndicator={false}>
          {filteredNotebookMemories.length === 0 ? (
            <View style={styles.emptyNotebook}>
              <Star size={64} color="#4b5563" />
              <Text style={styles.emptyNotebookTitle}>{t('notebookEmpty') || 'Aucune rencontre'}</Text>
              <Text style={styles.emptyNotebookText}>
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
                      onPress={() => openMemory(memory)}
                      activeOpacity={0.8}
                    >
                      <Image
                        source={{ uri: memory.baseUri || memory.uri }}
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                      <View style={styles.cardContent}>
                        {memory.metadata?.personMet && (
                          <View style={styles.cardRow}>
                            <User size={16} color="#ffffff" />
                            <Text style={styles.cardText} numberOfLines={1}>{memory.metadata.personMet}</Text>
                          </View>
                        )}
                        {memory.metadata?.eventLocation && (
                          <View style={styles.cardRow}>
                            <MapPin size={16} color="#9ca3af" />
                            <Text style={styles.cardTextSecondary} numberOfLines={1}>{memory.metadata.eventLocation}</Text>
                          </View>
                        )}
                        <View style={styles.cardRow}>
                          <Calendar size={16} color="#9ca3af" />
                          <Text style={styles.cardTextSecondary}>
                            {formatDate(memory.metadata?.eventDate, memory.timestamp)}
                          </Text>
                        </View>
                        <View style={[styles.eventBadge, { backgroundColor: color }]}>
                          <IconComponent size={12} color="#ffffff" />
                          <Text style={styles.eventBadgeText}>{getEventTypeLabel(eventType)}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
          <View style={{ height: BOTTOM_NAV_HEIGHT + 40 }} />
        </ScrollView>
      ) : (
        <FlatList
          data={memories}
          numColumns={3}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = selectedMemories.has(item.id);
            return (
              <MemoryThumbnail
                memory={item}
                onPress={() => openMemory(item)}
                isSelected={isSelected}
                selectionMode={selectionMode}
              />
            );
          }}
          contentContainerStyle={[
            styles.gridContent,
            selectionMode && selectedMemories.size > 0 && { paddingBottom: BOTTOM_NAV_HEIGHT + 150 }
          ]}
        />
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

      <SocialShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        imageUri={selectedMemory?.uri || ''}
      />

      {selectionMode && selectedMemories.size > 0 && (
        <View style={[styles.bulkActions, { bottom: BOTTOM_NAV_HEIGHT + Math.max(insets.bottom, 15) }]}>
          {selectedMemories.size === 1 && (
            <TouchableOpacity
              style={[styles.bulkActionButton, styles.bulkNotebookButton]}
              onPress={openMetadataModal}
              activeOpacity={0.8}
            >
              <BookOpen size={24} color="#ffffff" strokeWidth={2} />
              <Text style={styles.bulkActionText}>{t('addToNotebook') || 'Ajouter au carnet'}</Text>
            </TouchableOpacity>
          )}

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
        initialMetadata={selectedMemories.size === 1 ? memories.find(m => m.id === Array.from(selectedMemories)[0])?.metadata : undefined}
      />

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
  headerButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 15,
  },
  notebookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    gap: 6,
  },
  notebookButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
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
  gridContent: {
    paddingHorizontal: 2,
    paddingBottom: BOTTOM_NAV_HEIGHT + 20,
  },
  memoryContainer: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: 2,
  },
  thumbnailWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  memoryImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  thumbnailOverlay: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  selectionOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 4,
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
  bulkNotebookButton: {
    backgroundColor: '#8b5cf6',
  },
  bulkActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
