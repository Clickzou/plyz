import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CollectorLiveItem {
  id: string;
  uri: string;
  timestamp: number;
  celebrityName: string;
  fanName: string;
  sessionId?: string;
  sessionCode?: string;
}

const STORAGE_KEY = '@signtouch_collector_live';
const MAX_ITEMS_WEB = 10;

const compressImageDataUrl = async (dataUrl: string, maxWidth: number = 800, quality: number = 0.6): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
};

export const getAllCollectorLive = async (): Promise<CollectorLiveItem[]> => {
  try {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    }
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[CollectorLive] Error loading:', error);
    return [];
  }
};

export const saveCollectorLive = async (
  imageUri: string,
  celebrityName: string,
  fanName: string,
  sessionId?: string,
  sessionCode?: string,
): Promise<CollectorLiveItem> => {
  const timestamp = Date.now();
  const id = `collector_${timestamp}`;

  let finalUri = imageUri;
  if (Platform.OS === 'web' && imageUri.startsWith('data:')) {
    try {
      finalUri = await compressImageDataUrl(imageUri, 800, 0.6);
    } catch (e) {
      console.warn('[CollectorLive] Compression failed, using original');
    }
  }

  const item: CollectorLiveItem = {
    id,
    uri: finalUri,
    timestamp,
    celebrityName,
    fanName,
    sessionId,
    sessionCode,
  };

  const items = await getAllCollectorLive();
  items.unshift(item);

  const limited = Platform.OS === 'web' ? items.slice(0, MAX_ITEMS_WEB) : items;

  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    }
  } catch (quotaError: any) {
    if (quotaError?.name === 'QuotaExceededError' || quotaError?.code === 22) {
      const reduced = limited.slice(0, 3);
      if (Platform.OS === 'web') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
      } else {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
      }
    } else {
      throw quotaError;
    }
  }

  return item;
};

export const deleteCollectorLive = async (id: string): Promise<void> => {
  try {
    const items = await getAllCollectorLive();
    const filtered = items.filter(item => item.id !== id);
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch (error) {
    console.error('[CollectorLive] Error deleting:', error);
  }
};

export const downloadImageWeb = (dataUrl: string, fileName: string = 'dedication.jpg') => {
  if (Platform.OS !== 'web') return;
  try {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('[CollectorLive] Download error:', error);
  }
};
