import { Paths, Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SignatureOverlay {
  id: string;
  uri: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
  width?: number;
  height?: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
  fontFamily: string;
  fontSize: number;
}

export interface PhotoAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface Memory {
  id: string;
  uri: string;
  baseUri?: string;
  timestamp: number;
  updatedAt?: number;
  signatureOverlays?: SignatureOverlay[];
  textOverlays?: TextOverlay[];
  filter?: string;
  adjustments?: PhotoAdjustments;
  isEdited?: boolean;
}

const STORAGE_KEY = 'memories';
const METADATA_STORAGE_KEY = 'memories_metadata';
const MAX_MEMORIES_WEB = 8; // Limite réduite pour éviter quota exceeded

const getMemoriesDirectory = (): Directory => {
  return new Directory(Paths.cache, 'memories');
};

export const ensureDirectoryExists = async () => {
  if (Platform.OS === 'web') {
    return;
  }
  const memoriesDir = getMemoriesDirectory();
  if (!memoriesDir.exists) {
    await memoriesDir.create();
  }
};

/**
 * Compresse une image data URL pour réduire sa taille
 * Réduit la résolution et la qualité pour économiser l'espace localStorage
 */
const compressImageDataUrl = async (dataUrl: string, maxWidth: number = 600, quality: number = 0.5): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Réduire la taille si nécessaire
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Cannot get canvas context'));
        return;
      }

      // Remplir le fond en blanc pour éviter les zones noires lors de la conversion PNG → JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(img, 0, 0, width, height);

      // Compression JPEG avec qualité réduite
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
};

/**
 * Nettoie les données corrompues ou trop volumineuses du localStorage
 */
const cleanupCorruptedData = (): void => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const memories = JSON.parse(stored) as Memory[];

    // Filtrer les souvenirs valides (avec uri court = déjà compressé ou file URI)
    const validMemories = memories.filter(m => {
      // Garder les souvenirs avec URI de taille raisonnable
      return m.uri && m.timestamp && m.uri.length < 300000; // ~300KB max par image
    });

    // Limiter au nombre max et garder les plus récents
    const limitedMemories = validMemories
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_MEMORIES_WEB);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(limitedMemories));
    console.log(`✅ Nettoyage: ${memories.length} → ${limitedMemories.length} souvenirs`);
  } catch (error) {
    console.error('Erreur nettoyage:', error);
    // En cas d'erreur, réinitialiser complètement
    localStorage.removeItem(STORAGE_KEY);
  }
};

export const saveMemory = async (imageUri: string, existingId?: string): Promise<Memory> => {
  const timestamp = Date.now();
  const fileName = existingId || `memory_${timestamp}.jpg`;
  const isUpdate = !!existingId;

  if (Platform.OS === 'web') {
    try {
      cleanupCorruptedData();

      let memories = await getAllMemories();

      if (!isUpdate && memories.length >= MAX_MEMORIES_WEB) {
        memories = memories.slice(0, MAX_MEMORIES_WEB - 1);
        console.log(`⚠️ Limite atteinte, suppression du plus ancien`);
      }

      let finalUri = imageUri;
      if (imageUri.startsWith('data:')) {
        console.log('🗜️ Compression de l\'image...', imageUri.length, 'bytes');
        finalUri = await compressImageDataUrl(imageUri, 600, 0.5);
        console.log('✅ Image compressée:', finalUri.length, 'bytes');
      }

      const memory: Memory = {
        id: fileName,
        uri: finalUri,
        baseUri: isUpdate ? memories.find(m => m.id === fileName)?.baseUri : finalUri,
        timestamp: isUpdate ? memories.find(m => m.id === fileName)?.timestamp || timestamp : timestamp,
        updatedAt: isUpdate ? timestamp : undefined,
      };

      if (isUpdate) {
        const index = memories.findIndex(m => m.id === fileName);
        if (index !== -1) {
          memories[index] = memory;
        } else {
          memories.unshift(memory);
        }
      } else {
        memories.unshift(memory);
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
      } catch (quotaError: any) {
        if (quotaError.name === 'QuotaExceededError') {
          console.error('❌ Quota dépassé, nettoyage forcé...');
          memories = memories.slice(0, 3);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
            console.log(`✅ Nettoyage forcé: ${memories.length} souvenirs restants`);
          } catch (e) {
            localStorage.clear();
            memories = [memory];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
            console.log(`✅ localStorage réinitialisé`);
          }
        } else {
          throw quotaError;
        }
      }

      return memory;
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      throw new Error('Impossible de sauvegarder le souvenir: ' + (error as Error).message);
    }
  } else {
    await ensureDirectoryExists();
    const memoriesDir = getMemoriesDirectory();
    const destinationFile = new File(memoriesDir, fileName);
    const sourceFile = new File(imageUri);
    await sourceFile.copy(destinationFile);

    const memory: Memory = {
      id: fileName,
      uri: destinationFile.uri,
      baseUri: destinationFile.uri,
      timestamp,
      updatedAt: isUpdate ? timestamp : undefined,
    };

    // Sauvegarder les métadonnées dans AsyncStorage
    const existingMetadataStr = await AsyncStorage.getItem(METADATA_STORAGE_KEY);
    const existingMetadata: Memory[] = existingMetadataStr ? JSON.parse(existingMetadataStr) : [];

    if (isUpdate) {
      const index = existingMetadata.findIndex(m => m.id === fileName);
      if (index !== -1) {
        existingMetadata[index] = memory;
      } else {
        existingMetadata.unshift(memory);
      }
    } else {
      existingMetadata.unshift(memory);
    }

    await AsyncStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(existingMetadata));

    return memory;
  }
};

export const getAllMemories = async (): Promise<Memory[]> => {
  if (Platform.OS === 'web') {
    try {
      // Nettoyer les données corrompues au chargement
      cleanupCorruptedData();

      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return [];
      }

      const memories = JSON.parse(stored) as Memory[];

      // Filtrer les souvenirs valides et nettoyer les anciennes propriétés texte
      const validMemories = memories.filter(m => m.uri && m.timestamp && m.id).map(m => {
        const cleaned: Memory = {
          id: m.id,
          uri: m.uri,
          baseUri: m.baseUri,
          timestamp: m.timestamp,
          updatedAt: m.updatedAt,
          signatureOverlays: m.signatureOverlays,
          textOverlays: m.textOverlays,
          filter: m.filter,
          adjustments: m.adjustments,
          isEdited: m.isEdited
        };

        if (cleaned.signatureOverlays && cleaned.signatureOverlays.length > 0) {
          console.log('📦 Loaded memory', cleaned.id, 'with', cleaned.signatureOverlays.length, 'signatures');
          cleaned.signatureOverlays.forEach((overlay, idx) => {
            console.log(`  Signature ${idx}: color=${overlay.color}`);
          });
        }

        if (cleaned.textOverlays && cleaned.textOverlays.length > 0) {
          console.log('📦 Loaded memory', cleaned.id, 'with', cleaned.textOverlays.length, 'text overlays');
          cleaned.textOverlays.forEach((overlay, idx) => {
            console.log(`  Text ${idx}: text=${overlay.text}, font=${overlay.fontFamily}`);
          });
        }

        return cleaned;
      });

      return validMemories.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Erreur chargement souvenirs:', error);
      // En cas d'erreur, réinitialiser
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  } else {
    await ensureDirectoryExists();
    const memoriesDir = getMemoriesDirectory();

    if (!memoriesDir.exists) {
      return [];
    }

    // Lire les métadonnées depuis AsyncStorage
    const metadataStr = await AsyncStorage.getItem(METADATA_STORAGE_KEY);
    const metadata: Memory[] = metadataStr ? JSON.parse(metadataStr) : [];

    // Vérifier que les fichiers existent toujours
    const validMemories: Memory[] = [];
    for (const memory of metadata) {
      const file = new File(memoriesDir, memory.id);
      if (file.exists) {
        // Mettre à jour l'URI au cas où le chemin a changé
        validMemories.push({
          ...memory,
          uri: file.uri,
        });
      }
    }

    // Si pas de métadonnées, fallback vers l'ancien système
    if (validMemories.length === 0) {
      const contents = memoriesDir.list();
      const fallbackMemories: Memory[] = contents
        .filter(item => item instanceof File && item.name.startsWith('memory_') && item.name.endsWith('.jpg'))
        .map(file => {
          const fileName = (file as File).name;
          const timestampStr = fileName.replace('memory_', '').replace('.jpg', '');
          const timestamp = parseInt(timestampStr, 10);

          return {
            id: fileName,
            uri: file.uri,
            timestamp,
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      return fallbackMemories;
    }

    return validMemories.sort((a, b) => b.timestamp - a.timestamp);
  }
};

export const updateMemory = async (updatedMemory: Memory): Promise<void> => {
  if (Platform.OS === 'web') {
    const memories = await getAllMemories();
    const index = memories.findIndex(m => m.id === updatedMemory.id);

    if (index !== -1) {
      const existingMemory = memories[index];
      memories[index] = {
        ...existingMemory,
        ...updatedMemory,
        uri: updatedMemory.uri || existingMemory.uri,
        baseUri: updatedMemory.baseUri !== undefined ? updatedMemory.baseUri : existingMemory.baseUri,
        timestamp: existingMemory.timestamp,
        updatedAt: Date.now(),
      };

      console.log('✅ Mémoire mise à jour:', updatedMemory.id);
      if (memories[index].signatureOverlays && memories[index].signatureOverlays!.length > 0) {
        console.log('  📝 Sauvegarde de', memories[index].signatureOverlays!.length, 'signatures:');
        memories[index].signatureOverlays!.forEach((overlay, idx) => {
          console.log(`    Signature ${idx}: color=${overlay.color}, id=${overlay.id}`);
        });
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
    }
  } else {
    const metadataStr = await AsyncStorage.getItem(METADATA_STORAGE_KEY);
    const metadata: Memory[] = metadataStr ? JSON.parse(metadataStr) : [];
    const index = metadata.findIndex(m => m.id === updatedMemory.id);

    if (index !== -1) {
      const existingMemory = metadata[index];
      metadata[index] = {
        ...existingMemory,
        ...updatedMemory,
        uri: updatedMemory.uri || existingMemory.uri,
        baseUri: updatedMemory.baseUri !== undefined ? updatedMemory.baseUri : existingMemory.baseUri,
        timestamp: existingMemory.timestamp,
        updatedAt: Date.now(),
      };
      await AsyncStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(metadata));
      console.log('✅ Mémoire mise à jour:', updatedMemory.id);
    }
  }
};

export const deleteMemory = async (memoryId: string): Promise<void> => {
  console.log('🗑️ Suppression demandée pour:', memoryId);

  if (Platform.OS === 'web') {
    const memories = await getAllMemories();
    console.log('📋 Souvenirs avant suppression:', memories.length);
    const filtered = memories.filter(m => m.id !== memoryId);
    console.log('📋 Souvenirs après suppression:', filtered.length);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    console.log('✅ LocalStorage mis à jour');
  } else {
    const memoriesDir = getMemoriesDirectory();
    const file = new File(memoriesDir, memoryId);

    if (file.exists) {
      await file.delete();
      console.log('✅ Fichier supprimé');
    }

    // Supprimer des métadonnées AsyncStorage
    const metadataStr = await AsyncStorage.getItem(METADATA_STORAGE_KEY);
    const metadata: Memory[] = metadataStr ? JSON.parse(metadataStr) : [];
    const filtered = metadata.filter(m => m.id !== memoryId);
    await AsyncStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(filtered));
    console.log('✅ Métadonnées mises à jour');
  }
};

