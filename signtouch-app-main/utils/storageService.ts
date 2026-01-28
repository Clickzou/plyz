import { Memory, SignatureOverlay, TextOverlay, PhotoAdjustments, MemoryMetadata } from './memoriesStorage';
import * as LocalStorage from './memoriesStorage';
import * as CloudStorage from './cloudStorage';
import { markFirstPhotoSaved } from './trialStorage';

export const saveMemory = async (
  imageUri: string,
  userId: string | null,
  metadata?: {
    baseUri?: string;
    signatureOverlays?: SignatureOverlay[];
    textOverlays?: TextOverlay[];
    filter?: string;
    adjustments?: PhotoAdjustments;
    isEdited?: boolean;
  }
): Promise<Memory> => {
  console.log('[StorageService] saveMemory called, marking first photo...');
  await markFirstPhotoSaved(userId);
  console.log('[StorageService] markFirstPhotoSaved completed');
  
  if (userId) {
    return await CloudStorage.saveMemoryToCloud(imageUri, userId, metadata);
  } else {
    const memory = await LocalStorage.saveMemory(imageUri);

    if (metadata) {
      await LocalStorage.updateMemory({
        ...memory,
        baseUri: metadata.baseUri,
        signatureOverlays: metadata.signatureOverlays,
        textOverlays: metadata.textOverlays,
        filter: metadata.filter,
        adjustments: metadata.adjustments,
        isEdited: metadata.isEdited,
      });

      return {
        ...memory,
        baseUri: metadata.baseUri,
        signatureOverlays: metadata.signatureOverlays,
        textOverlays: metadata.textOverlays,
        filter: metadata.filter,
        adjustments: metadata.adjustments,
        isEdited: metadata.isEdited,
      };
    }

    return memory;
  }
};

export const getAllMemories = async (userId: string | null): Promise<Memory[]> => {
  if (userId) {
    return await CloudStorage.getAllMemoriesFromCloud(userId);
  } else {
    return await LocalStorage.getAllMemories();
  }
};

export const updateMemory = async (
  memory: Memory,
  userId: string | null,
  updates?: {
    imageUri?: string;
    baseUri?: string;
    signatureOverlays?: SignatureOverlay[];
    textOverlays?: TextOverlay[];
    filter?: string;
    adjustments?: PhotoAdjustments;
    isEdited?: boolean;
    metadata?: MemoryMetadata;
  }
): Promise<void> => {
  if (userId) {
    await CloudStorage.updateMemoryInCloud(memory.id, userId, updates || {});
  } else {
    const updatedMemory: Memory = {
      ...memory,
      ...(updates?.imageUri && { uri: updates.imageUri }),
      ...(updates?.baseUri && { baseUri: updates.baseUri }),
      ...(updates?.signatureOverlays !== undefined && { signatureOverlays: updates.signatureOverlays }),
      ...(updates?.textOverlays !== undefined && { textOverlays: updates.textOverlays }),
      ...(updates?.filter !== undefined && { filter: updates.filter }),
      ...(updates?.adjustments !== undefined && { adjustments: updates.adjustments }),
      ...(updates?.isEdited !== undefined && { isEdited: updates.isEdited }),
      ...(updates?.metadata !== undefined && { metadata: updates.metadata }),
    };

    await LocalStorage.updateMemory(updatedMemory);
  }
};

export const deleteMemory = async (memoryId: string, userId: string | null): Promise<void> => {
  if (userId) {
    await CloudStorage.deleteMemoryFromCloud(memoryId, userId);
  } else {
    await LocalStorage.deleteMemory(memoryId);
  }
};
