import { supabase } from './supabase';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@signtouch_device_id';

export interface EventSession {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'live' | 'ended';
  join_code: string;
  viewer_soft_limit: number;
  created_by: string | null;
  created_at: string;
  event_type?: 'qr' | 'live_video';
  live_session_id?: string;
  location?: string;
  price_cents?: number;
  duration_per_fan_minutes?: number;
  max_fans?: number;
  scheduled_at?: string;
}

export interface EventSigner {
  id: string;
  event_id: string;
  display_name: string;
  avatar_url: string | null;
  signature_url: string | null;
  created_at: string;
}

export interface SignatureMetadata {
  position_x: number;
  position_y: number;
  scale: number;
  rotation: number;
  color: string;
  signature_url: string;
  container_width: number;
  container_height: number;
}

export interface EventAsset {
  id: string;
  event_id: string;
  signer_id: string | null;
  asset_type: 'photo' | 'photo_signed' | 'signature' | 'signed_photo' | 'signature_only';
  asset_url: string;
  original_photo_url: string | null;
  signature_metadata: SignatureMetadata | null;
  created_at: string;
  signer?: EventSigner;
}

export interface JoinEventResult {
  allowed: boolean;
  reason?: 'full' | 'expired' | 'not_found' | 'scheduled';
  session?: EventSession;
  signers?: EventSigner[];
}

const generateJoinCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const getOrCreateDeviceId = async (): Promise<string> => {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    return `device_${Date.now()}`;
  }
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = cleanBase64.length;
  const bufferLength = Math.floor(len * 3 / 4);
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[cleanBase64.charCodeAt(i)];
    const e2 = lookup[cleanBase64.charCodeAt(i + 1)];
    const e3 = lookup[cleanBase64.charCodeAt(i + 2)];
    const e4 = lookup[cleanBase64.charCodeAt(i + 3)];
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufferLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufferLength) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes;
};

export const uploadSessionImage = async (
  imageUri: string,
  eventId: string,
  type: 'signature' | 'photo' | 'asset'
): Promise<string> => {
  try {
    const timestamp = Date.now();
    const isSvg = imageUri.startsWith('data:image/svg+xml');
    const isJpeg = imageUri.startsWith('data:image/jpeg');
    const isBase64 = imageUri.startsWith('data:');
    
    let extension = 'png';
    let contentType = 'image/png';
    
    if (isSvg) {
      extension = 'svg';
      contentType = 'image/svg+xml';
    } else if (isJpeg) {
      extension = 'jpg';
      contentType = 'image/jpeg';
    }
    
    const fileName = `sessions/${eventId}/${type}_${timestamp}.${extension}`;

    let fileData: Uint8Array | ArrayBuffer;

    if (isBase64) {
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

    console.log('Uploading to events bucket:', fileName, 'size:', fileData.byteLength);

    const { data, error } = await supabase.storage
      .from('events')
      .upload(fileName, fileData, { contentType, upsert: true });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`Upload error: ${error.message}`);
    }
    
    console.log('Upload success:', data.path);
    return data.path;
  } catch (error) {
    console.error('Error uploading session image:', error);
    throw error;
  }
};

export const getSessionImageUrl = (path: string): string => {
  const { data } = supabase.storage.from('events').getPublicUrl(path);
  return data.publicUrl;
};

export const createEventSession = async (
  title: string,
  durationMinutes: number,
  creatorId?: string,
  scheduledStartAt?: Date,
  _location?: string,
  _priceCents?: number
): Promise<EventSession> => {
  const joinCode = generateJoinCode();
  const isScheduled = scheduledStartAt && scheduledStartAt.getTime() > Date.now() + 60000;
  const startsAt = isScheduled ? scheduledStartAt : new Date();
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  console.log('Creating event session with join_code:', joinCode);

  const insertData: any = {
    title,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: isScheduled ? 'scheduled' : 'live',
    join_code: joinCode,
    created_by: creatorId || null,
  };

  const { data, error } = await supabase
    .from('event_sessions')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Create session DB error:', error);
    throw new Error(`Create session error: ${error.message}`);
  }
  
  console.log('Session created successfully:', data.id, 'join_code:', data.join_code);
  
  const result = { ...data } as EventSession;
  if (_location) result.location = _location;
  if (_priceCents && _priceCents > 0) result.price_cents = _priceCents;
  
  return result;
};

export const startScheduledEvent = async (sessionId: string): Promise<EventSession> => {
  const { data: session } = await supabase
    .from('event_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  
  if (!session) throw new Error('Session not found');
  
  const now = new Date();
  const originalDuration = new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime();
  const newEndsAt = new Date(now.getTime() + originalDuration);

  const { data, error } = await supabase
    .from('event_sessions')
    .update({
      starts_at: now.toISOString(),
      ends_at: newEndsAt.toISOString(),
      status: 'live',
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw new Error(`Start event error: ${error.message}`);
  return data;
};

export const getMyScheduledEvents = async (creatorId?: string): Promise<EventSession[]> => {
  let userId = creatorId;
  
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id;
  }

  let allEvents: EventSession[] = [];

  if (userId) {
    const { data, error } = await supabase
      .from('event_sessions')
      .select('*')
      .eq('created_by', userId)
      .in('status', ['scheduled', 'active', 'live', 'ended'])
      .order('starts_at', { ascending: true });

    if (!error && data) {
      allEvents = data;
    } else if (error) {
      console.error('Error fetching scheduled events by user:', error);
    }
  }

  const { data: liveVideoSessions, error: lvsError } = await supabase
    .from('live_sessions')
    .select('*')
    .in('status', ['scheduled', 'waiting', 'active', 'ended'])
    .order('created_at', { ascending: false });

  if (!lvsError && liveVideoSessions) {
    const existingIds = new Set(allEvents.map(e => e.id));
    for (const ls of liveVideoSessions) {
      if (!existingIds.has(ls.id)) {
        const converted: EventSession = {
          id: ls.id,
          title: ls.celebrity_name || 'Live Session',
          starts_at: ls.scheduled_at || ls.started_at || ls.created_at,
          ends_at: ls.ends_at || new Date(new Date(ls.created_at).getTime() + (ls.duration_minutes || 30) * 60000).toISOString(),
          status: ls.status === 'waiting' ? 'live' : (ls.status === 'active' ? 'live' : ls.status),
          join_code: ls.code,
          viewer_soft_limit: ls.max_slots || 60,
          created_by: null,
          created_at: ls.created_at,
          event_type: 'live_video',
          live_session_id: ls.id,
          price_cents: ls.price_cents || 0,
          duration_per_fan_minutes: ls.duration_per_fan_minutes || 5,
          max_fans: ls.max_slots || 60,
          scheduled_at: ls.scheduled_at || null,
        };
        allEvents.push(converted);
      }
    }
  } else if (lvsError) {
    console.warn('[getMyScheduledEvents] live_sessions query failed:', lvsError.message);
  }

  const locallyDeleted = getLocallyDeletedEvents();
  const filteredData = allEvents.filter(event => !locallyDeleted.includes(event.id));
  
  console.log('[getMyScheduledEvents] Found', filteredData.length, 'events (filtered out', allEvents.length - filteredData.length, 'deleted)');
  
  return filteredData;
};

// Local storage key for deleted events (workaround for RLS restrictions)
const DELETED_EVENTS_KEY = 'signtouch_deleted_events';

// In-memory cache for deleted events (loaded from storage on first access)
let deletedEventsCache: string[] | null = null;

const getLocallyDeletedEvents = (): string[] => {
  // Return cached value if available
  if (deletedEventsCache !== null) {
    return deletedEventsCache;
  }
  
  try {
    // Use localStorage on web, will be synced with AsyncStorage on mobile
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DELETED_EVENTS_KEY);
      deletedEventsCache = stored ? JSON.parse(stored) : [];
    } else {
      deletedEventsCache = [];
    }
    return deletedEventsCache;
  } catch {
    deletedEventsCache = [];
    return [];
  }
};

const addLocallyDeletedEvent = (sessionId: string): void => {
  const deleted = getLocallyDeletedEvents();
  if (!deleted.includes(sessionId)) {
    deleted.push(sessionId);
    deletedEventsCache = deleted;
    
    // Save to localStorage on web
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DELETED_EVENTS_KEY, JSON.stringify(deleted));
    }
    
    // Also save to AsyncStorage for mobile (import dynamically to avoid web issues)
    import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
      AsyncStorage.setItem(DELETED_EVENTS_KEY, JSON.stringify(deleted)).catch(() => {});
    }).catch(() => {});
  }
};

// Initialize deleted events from AsyncStorage on mobile
export const initDeletedEventsCache = async (): Promise<void> => {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const stored = await AsyncStorage.getItem(DELETED_EVENTS_KEY);
    if (stored) {
      deletedEventsCache = JSON.parse(stored);
    }
  } catch {
    // On web or if AsyncStorage fails, use localStorage
  }
};

export const deleteEventSession = async (sessionId: string): Promise<void> => {
  console.log('[deleteEventSession] Deleting event:', sessionId);
  
  const { data: liveSession } = await supabase
    .from('live_sessions')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle();

  if (liveSession) {
    const { error: lsError } = await supabase
      .from('live_sessions')
      .update({ status: 'ended' })
      .eq('id', sessionId);

    if (!lsError) {
      console.log('[deleteEventSession] Live session marked as ended');
    } else {
      console.warn('[deleteEventSession] Live session update failed:', lsError.message);
    }
    addLocallyDeletedEvent(sessionId);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    addLocallyDeletedEvent(sessionId);
    console.log('[deleteEventSession] Not authenticated, stored locally');
    return;
  }
  
  const { data, error } = await supabase
    .from('event_sessions')
    .update({ status: 'deleted' })
    .eq('id', sessionId)
    .select();

  if (data && data.length > 0) {
    console.log('[deleteEventSession] Successfully marked as deleted in Supabase');
    return;
  }
  
  console.log('[deleteEventSession] Supabase update failed, storing deletion locally');
  addLocallyDeletedEvent(sessionId);
};

export { getLocallyDeletedEvents };

export const addEventSigner = async (
  eventId: string,
  displayName: string,
  signatureUri?: string,
  avatarUrl?: string
): Promise<EventSigner> => {
  let signatureUrl: string | null = null;

  if (signatureUri) {
    const path = await uploadSessionImage(signatureUri, eventId, 'signature');
    signatureUrl = getSessionImageUrl(path);
  }

  const { data, error } = await supabase
    .from('event_signers')
    .insert({
      event_id: eventId,
      display_name: displayName,
      signature_url: signatureUrl,
      avatar_url: avatarUrl || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Add signer error: ${error.message}`);
  return data;
};

export const getEventSigners = async (eventId: string): Promise<EventSigner[]> => {
  const { data, error } = await supabase
    .from('event_signers')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Get signers error: ${error.message}`);
  return data || [];
};

export const joinEventSession = async (
  joinCode: string,
  viewerId: string
): Promise<JoinEventResult> => {
  console.log('joinEventSession called with code:', joinCode.toUpperCase());
  
  try {
    // Skip Edge Function and RPC - go directly to table query
    console.log('Querying event_sessions table directly for code:', joinCode.toUpperCase());
    
    const { data: session, error: sessionError } = await supabase
      .from('event_sessions')
      .select('*')
      .eq('join_code', joinCode.toUpperCase())
      .single();

    console.log('Session query result:', { session, error: sessionError });
    
    if (sessionError || !session) {
      console.log('Session not found or error:', sessionError?.message);
      return { allowed: false, reason: 'not_found' };
    }
    
    console.log('Found session:', session.id, session.title);

    if (new Date(session.ends_at) < new Date()) {
      return { allowed: false, reason: 'expired' };
    }

    if (new Date(session.starts_at) > new Date()) {
      return { 
        allowed: false, 
        reason: 'scheduled', 
        session: session as EventSession 
      };
    }

    await supabase
      .from('event_viewers')
      .delete()
      .eq('event_id', session.id)
      .lt('last_seen_at', new Date(Date.now() - 2 * 60 * 1000).toISOString());

    const { count, error: countError } = await supabase
      .from('event_viewers')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', session.id);

    if (countError) throw countError;

    if ((count || 0) >= session.viewer_soft_limit) {
      return { allowed: false, reason: 'full' };
    }

    await supabase
      .from('event_viewers')
      .upsert(
        { event_id: session.id, viewer_id: viewerId, last_seen_at: new Date().toISOString() },
        { onConflict: 'event_id,viewer_id' }
      );

    const signers = await getEventSigners(session.id);

    return { allowed: true, session, signers };
  } catch (error) {
    console.error('Error joining event session:', error);
    return { allowed: false, reason: 'not_found' };
  }
};

export const updateViewerHeartbeat = async (
  eventId: string,
  viewerId: string
): Promise<void> => {
  await supabase
    .from('event_viewers')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('viewer_id', viewerId);
};

export const leaveEventSession = async (
  eventId: string,
  viewerId: string
): Promise<void> => {
  await supabase
    .from('event_viewers')
    .delete()
    .eq('event_id', eventId)
    .eq('viewer_id', viewerId);
};

export const publishEventAsset = async (
  eventId: string,
  imageUri: string,
  type: 'photo' | 'photo_signed' | 'signature',
  signerId?: string,
  options?: {
    originalPhotoUri?: string;
    signatureMetadata?: SignatureMetadata;
  }
): Promise<EventAsset> => {
  const path = await uploadSessionImage(imageUri, eventId, 'asset');
  const imageUrl = getSessionImageUrl(path);

  let originalPhotoUrl: string | null = null;
  if (options?.originalPhotoUri) {
    const origPath = await uploadSessionImage(options.originalPhotoUri, eventId, 'asset');
    originalPhotoUrl = getSessionImageUrl(origPath);
  }

  const metadataWithOriginal = options?.signatureMetadata
    ? { ...options.signatureMetadata, original_photo_url: originalPhotoUrl }
    : originalPhotoUrl ? { original_photo_url: originalPhotoUrl } : null;

  const { data, error } = await supabase
    .from('event_assets')
    .insert({
      event_id: eventId,
      signer_id: signerId || null,
      asset_type: type,
      asset_url: imageUrl,
      signature_metadata: metadataWithOriginal,
    })
    .select()
    .single();

  if (!error && data && originalPhotoUrl) {
    data.original_photo_url = originalPhotoUrl;
  }

  if (error) {
    console.error('Insert asset error:', error);
    throw new Error(`Publish asset error: ${error.message}`);
  }
  return data;
};

export const fetchEventAssets = async (
  eventId: string,
  options?: {
    afterCreatedAt?: string;
    beforeCreatedAt?: string;
    limit?: number;
    type?: 'photo' | 'photo_signed' | 'signature' | 'all';
  }
): Promise<EventAsset[]> => {
  let query = supabase
    .from('event_assets')
    .select('*, signer:event_signers(*)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(options?.limit || 30);

  if (options?.afterCreatedAt) {
    query = query.gt('created_at', options.afterCreatedAt);
  }
  if (options?.beforeCreatedAt) {
    query = query.lt('created_at', options.beforeCreatedAt);
  }
  if (options?.type && options.type !== 'all') {
    if (options.type === 'photo_signed') {
      query = query.in('asset_type', ['photo_signed', 'signature']);
    } else {
      query = query.eq('asset_type', options.type);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(`Fetch assets error: ${error.message}`);
  return data || [];
};

export const getSessionByCode = async (joinCode: string): Promise<EventSession | null> => {
  const { data, error } = await supabase
    .from('event_sessions')
    .select('*')
    .eq('join_code', joinCode.toUpperCase())
    .single();

  if (error) return null;
  return data;
};

export const endEventSession = async (sessionId: string): Promise<void> => {
  const { error } = await supabase
    .from('event_sessions')
    .update({ status: 'ended' })
    .eq('id', sessionId);

  if (error) throw new Error(`End session error: ${error.message}`);
};

export const getActiveViewerCount = async (eventId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('event_viewers')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .gt('last_seen_at', new Date(Date.now() - 2 * 60 * 1000).toISOString());

  if (error) return 0;
  return count || 0;
};

export const getEventTotalViews = async (eventId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('event_viewers')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (error) return 0;
  return count || 0;
};

export const getEventPublishedCount = async (eventId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('event_assets')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (error) return 0;
  return count || 0;
};
