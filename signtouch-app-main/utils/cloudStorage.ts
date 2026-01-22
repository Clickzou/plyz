import { supabase } from './supabase';
import { Memory, SignatureOverlay, TextOverlay, PhotoAdjustments } from './memoriesStorage';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

interface CloudMemory {
  id: string;
  user_id: string;
  image_path: string;
  thumbnail_path: string | null;
  timestamp: number;
  updated_at: number | null;
  signature_overlays: SignatureOverlay[];
  text_overlays: TextOverlay[];
  filter: string | null;
  adjustments: PhotoAdjustments | null;
  is_edited: boolean;
  created_at: string;
}

export const uploadImage = async (imageUri: string, userId: string): Promise<string> => {
  try {
    const timestamp = Date.now();
    const fileName = `${userId}/${timestamp}.jpg`;

    let fileData: Blob | ArrayBuffer;

    if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      fileData = await response.blob();
    } else {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64',
      });
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      fileData = byteArray.buffer;
    }

    const { data, error } = await supabase.storage
      .from('memories')
      .upload(fileName, fileData, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) {
      throw new Error(`Upload error: ${error.message}`);
    }

    return data.path;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

export const getImageUrl = (path: string): string => {
  const { data } = supabase.storage.from('memories').getPublicUrl(path);
  return data.publicUrl;
};

export const saveMemoryToCloud = async (
  imageUri: string,
  userId: string,
  metadata: {
    signatureOverlays?: SignatureOverlay[];
    textOverlays?: TextOverlay[];
    filter?: string;
    adjustments?: PhotoAdjustments;
    isEdited?: boolean;
  } = {}
): Promise<Memory> => {
  try {
    const imagePath = await uploadImage(imageUri, userId);
    const timestamp = Date.now();

    const { data, error } = await supabase
      .from('memories')
      .insert({
        user_id: userId,
        image_path: imagePath,
        timestamp,
        signature_overlays: metadata.signatureOverlays || [],
        text_overlays: metadata.textOverlays || [],
        filter: metadata.filter || null,
        adjustments: metadata.adjustments || null,
        is_edited: metadata.isEdited || false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    const cloudMemory = data as CloudMemory;
    const imageUrl = getImageUrl(cloudMemory.image_path);

    return {
      id: cloudMemory.id,
      uri: imageUrl,
      baseUri: imageUrl,
      timestamp: cloudMemory.timestamp,
      updatedAt: cloudMemory.updated_at || undefined,
      signatureOverlays: cloudMemory.signature_overlays,
      textOverlays: cloudMemory.text_overlays,
      filter: cloudMemory.filter || undefined,
      adjustments: cloudMemory.adjustments || undefined,
      isEdited: cloudMemory.is_edited,
    };
  } catch (error) {
    console.error('Error saving memory to cloud:', error);
    throw error;
  }
};

export const getAllMemoriesFromCloud = async (userId: string): Promise<Memory[]> => {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    const cloudMemories = (data || []) as CloudMemory[];

    return cloudMemories.map((cloudMemory) => {
      const imageUrl = getImageUrl(cloudMemory.image_path);

      return {
        id: cloudMemory.id,
        uri: imageUrl,
        baseUri: imageUrl,
        timestamp: cloudMemory.timestamp,
        updatedAt: cloudMemory.updated_at || undefined,
        signatureOverlays: cloudMemory.signature_overlays,
        textOverlays: cloudMemory.text_overlays,
        filter: cloudMemory.filter || undefined,
        adjustments: cloudMemory.adjustments || undefined,
        isEdited: cloudMemory.is_edited,
      };
    });
  } catch (error) {
    console.error('Error getting memories from cloud:', error);
    throw error;
  }
};

export const updateMemoryInCloud = async (
  memoryId: string,
  userId: string,
  updates: {
    imageUri?: string;
    signatureOverlays?: SignatureOverlay[];
    textOverlays?: TextOverlay[];
    filter?: string;
    adjustments?: PhotoAdjustments;
    isEdited?: boolean;
  }
): Promise<void> => {
  try {
    const updateData: any = {
      updated_at: Date.now(),
    };

    if (updates.imageUri) {
      updateData.image_path = await uploadImage(updates.imageUri, userId);
    }

    if (updates.signatureOverlays !== undefined) {
      updateData.signature_overlays = updates.signatureOverlays;
    }

    if (updates.textOverlays !== undefined) {
      updateData.text_overlays = updates.textOverlays;
    }

    if (updates.filter !== undefined) {
      updateData.filter = updates.filter;
    }

    if (updates.adjustments !== undefined) {
      updateData.adjustments = updates.adjustments;
    }

    if (updates.isEdited !== undefined) {
      updateData.is_edited = updates.isEdited;
    }

    const { error } = await supabase
      .from('memories')
      .update(updateData)
      .eq('id', memoryId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Update error: ${error.message}`);
    }
  } catch (error) {
    console.error('Error updating memory in cloud:', error);
    throw error;
  }
};

export const deleteMemoryFromCloud = async (memoryId: string, userId: string): Promise<void> => {
  try {
    const { data: memory, error: fetchError } = await supabase
      .from('memories')
      .select('image_path')
      .eq('id', memoryId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw new Error(`Fetch error: ${fetchError.message}`);
    }

    if (memory) {
      const { error: storageError } = await supabase.storage
        .from('memories')
        .remove([memory.image_path]);

      if (storageError) {
        console.error('Error deleting image from storage:', storageError);
      }
    }

    const { error: deleteError } = await supabase
      .from('memories')
      .delete()
      .eq('id', memoryId)
      .eq('user_id', userId);

    if (deleteError) {
      throw new Error(`Delete error: ${deleteError.message}`);
    }
  } catch (error) {
    console.error('Error deleting memory from cloud:', error);
    throw error;
  }
};
