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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Download, Trash2, Camera, CheckCircle2, Circle, X, Pencil, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import { Memory } from '@/utils/memoriesStorage';
import * as StorageService from '@/utils/storageService';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AdModal from '@/components/AdModal';
import SocialShareModal from '@/components/SocialShareModal';
import { maybeShowSubscriptionOffer } from '@/utils/subscriptionOffer';

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

export default function GalleryScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMemories, setSelectedMemories] = useState<Set<string>>(new Set());
  const [showAdModal, setShowAdModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [pendingSave, setPendingSave] = useState<'single' | 'multiple' | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useSubscription();
  const { t } = useTranslation();
  const { user } = useAuth();

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


  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.title}>{t('myMemories')}</Text>
        {memories.length > 0 && (
          <Text style={styles.instructionText}>
            {t('galleryInstruction')}
          </Text>
        )}
        {memories.length > 0 && (
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
        {memories.length > 0 && (
          <Text style={styles.subtitle}>
            {selectionMode && selectedMemories.size > 0
              ? `${selectedMemories.size} ${selectedMemories.size > 1 ? t('selectedPlural') : t('selected')}`
              : `${memories.length} ${memories.length > 1 ? t('memories') : t('memory')}`
            }
          </Text>
        )}
      </View>

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
          <TouchableOpacity
            style={styles.bulkActionButton}
            onPress={saveSelectedMemories}
            activeOpacity={0.8}
          >
            <Download size={24} color="#ffffff" strokeWidth={2} />
            <Text style={styles.bulkActionText}>{t('save')}</Text>
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

      <AdModal
        visible={showAdModal}
        onClose={() => {
          setShowAdModal(false);
          setPendingSave(null);
        }}
        onAdWatched={handleAdWatched}
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
  selectButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#10b981',
    marginTop: 15,
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
  bulkActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
