import { supabase } from './supabase';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface LiveEvent {
  id: string;
  code: string;
  name: string;
  creator_id: string;
  signature_url: string | null;
  photo_url: string | null;
  created_at: string;
  expires_at: string;
  is_active: boolean;
}


const generateEventCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = cleanBase64.length;
  const bufferLength = Math.floor(len * 3 / 4) - (cleanBase64[len - 1] === '=' ? 1 : 0) - (cleanBase64[len - 2] === '=' ? 1 : 0);
  const bytes = new Uint8Array(bufferLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const encoded1 = lookup[cleanBase64.charCodeAt(i)];
    const encoded2 = lookup[cleanBase64.charCodeAt(i + 1)];
    const encoded3 = lookup[cleanBase64.charCodeAt(i + 2)];
    const encoded4 = lookup[cleanBase64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (p < bufferLength) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    if (p < bufferLength) bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
  }
  return bytes;
};

export const uploadEventImage = async (
  imageUri: string, 
  eventId: string, 
  type: 'signature' | 'photo'
): Promise<string> => {
  try {
    const timestamp = Date.now();
    const isSvg = imageUri.startsWith('data:image/svg+xml');
    const extension = isSvg ? 'svg' : 'png';
    const contentType = isSvg ? 'image/svg+xml' : 'image/png';
    const fileName = `events/${eventId}/${type}_${timestamp}.${extension}`;

    let fileData: Uint8Array | ArrayBuffer;

    if (isSvg) {
      const base64Data = imageUri.split(',')[1];
      fileData = base64ToUint8Array(base64Data);
    } else if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      fileData = await response.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64',
      });
      fileData = base64ToUint8Array(base64);
    }

    const { data, error } = await supabase.storage
      .from('events')
      .upload(fileName, fileData, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload error: ${error.message}`);
    }

    return data.path;
  } catch (error) {
    console.error('Error uploading event image:', error);
    throw error;
  }
};

export const getEventImageUrl = (path: string): string => {
  const { data } = supabase.storage.from('events').getPublicUrl(path);
  return data.publicUrl;
};

export const createLiveEvent = async (
  creatorId: string,
  name: string,
  signatureUri?: string,
  photoUri?: string,
  durationHours: number = 24
): Promise<LiveEvent> => {
  try {
    const code = generateEventCode();
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

    const { data: eventData, error: eventError } = await supabase
      .from('live_events')
      .insert({
        code,
        name,
        creator_id: creatorId,
        expires_at: expiresAt,
        is_active: true,
      })
      .select()
      .single();

    if (eventError) {
      throw new Error(`Event creation error: ${eventError.message}`);
    }

    const eventId = eventData.id;
    let signatureUrl = null;
    let photoUrl = null;

    if (signatureUri) {
      const signaturePath = await uploadEventImage(signatureUri, eventId, 'signature');
      signatureUrl = getEventImageUrl(signaturePath);
      
      await supabase
        .from('live_events')
        .update({ signature_url: signatureUrl })
        .eq('id', eventId);
    }

    if (photoUri) {
      const photoPath = await uploadEventImage(photoUri, eventId, 'photo');
      photoUrl = getEventImageUrl(photoPath);
      
      await supabase
        .from('live_events')
        .update({ photo_url: photoUrl })
        .eq('id', eventId);
    }

    return {
      ...eventData,
      signature_url: signatureUrl,
      photo_url: photoUrl,
    };
  } catch (error) {
    console.error('Error creating live event:', error);
    throw error;
  }
};

export const getEventByCode = async (code: string): Promise<LiveEvent | null> => {
  try {
    const { data, error } = await supabase
      .from('live_events')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Fetch error: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting event by code:', error);
    return null;
  }
};

export const getMyEvents = async (creatorId: string): Promise<LiveEvent[]> => {
  try {
    const { data, error } = await supabase
      .from('live_events')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Fetch error: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error getting my events:', error);
    return [];
  }
};

export const deactivateEvent = async (eventId: string, creatorId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('live_events')
      .update({ is_active: false })
      .eq('id', eventId)
      .eq('creator_id', creatorId);

    if (error) {
      throw new Error(`Deactivate error: ${error.message}`);
    }
  } catch (error) {
    console.error('Error deactivating event:', error);
    throw error;
  }
};

export const updateEventSignature = async (
  eventId: string,
  creatorId: string,
  signatureUri: string
): Promise<string> => {
  try {
    const signaturePath = await uploadEventImage(signatureUri, eventId, 'signature');
    const signatureUrl = getEventImageUrl(signaturePath);

    const { error } = await supabase
      .from('live_events')
      .update({ signature_url: signatureUrl })
      .eq('id', eventId)
      .eq('creator_id', creatorId);

    if (error) {
      throw new Error(`Update error: ${error.message}`);
    }

    return signatureUrl;
  } catch (error) {
    console.error('Error updating event signature:', error);
    throw error;
  }
};
