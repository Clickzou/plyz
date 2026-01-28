import { supabase } from './supabase';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
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
}

export interface EventSigner {
  id: string;
  event_id: string;
  display_name: string;
  avatar_url: string | null;
  signature_url: string | null;
  created_at: string;
}

export interface EventAsset {
  id: string;
  event_id: string;
  signer_id: string | null;
  type: 'photo' | 'photo_signed' | 'signature';
  image_url: string;
  created_at: string;
  signer?: EventSigner;
}

export interface JoinEventResult {
  allowed: boolean;
  reason?: 'full' | 'expired' | 'not_found';
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
    const extension = isSvg ? 'svg' : 'png';
    const contentType = isSvg ? 'image/svg+xml' : 'image/png';
    const fileName = `sessions/${eventId}/${type}_${timestamp}.${extension}`;

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
      .upload(fileName, fileData, { contentType, upsert: true });

    if (error) throw new Error(`Upload error: ${error.message}`);
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
  scheduledStartAt?: Date
): Promise<EventSession> => {
  const joinCode = generateJoinCode();
  const isScheduled = scheduledStartAt && scheduledStartAt.getTime() > Date.now() + 60000;
  const startsAt = isScheduled ? scheduledStartAt : new Date();
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  const { data, error } = await supabase
    .from('event_sessions')
    .insert({
      title,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: isScheduled ? 'scheduled' : 'live',
      join_code: joinCode,
      created_by: creatorId || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Create session error: ${error.message}`);
  return data;
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
  
  if (!userId) {
    console.log('No user found for getMyScheduledEvents');
    return [];
  }
  
  const { data, error } = await supabase
    .from('event_sessions')
    .select('*')
    .eq('created_by', userId)
    .in('status', ['scheduled', 'active'])
    .order('starts_at', { ascending: true });

  if (error) {
    console.error('Error fetching scheduled events:', error);
    return [];
  }
  return data || [];
};

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
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    
    if (supabaseUrl) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/joinEvent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            join_code: joinCode.toUpperCase(),
            viewer_id: viewerId,
          }),
        });

        const result = await response.json();
        
        if (result.allowed && result.event) {
          return {
            allowed: true,
            session: {
              id: result.event.id,
              title: result.event.title,
              status: result.event.status,
              starts_at: result.event.starts_at,
              ends_at: result.event.ends_at,
              join_code: joinCode.toUpperCase(),
              viewer_soft_limit: result.event.viewer_soft_limit,
              created_by: null,
              created_at: '',
            },
            signers: result.signers || [],
          };
        }
        
        return {
          allowed: false,
          reason: result.reason || 'not_found',
        };
      } catch (edgeFnError) {
        console.log('Edge Function not available, falling back to RPC');
      }
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('join_event', {
      p_join_code: joinCode.toUpperCase(),
      p_viewer_id: viewerId,
    });

    if (!rpcError && rpcResult) {
      if (rpcResult.allowed && rpcResult.event) {
        return {
          allowed: true,
          session: {
            id: rpcResult.event.id,
            title: rpcResult.event.title,
            status: rpcResult.event.status,
            starts_at: rpcResult.event.starts_at,
            ends_at: rpcResult.event.ends_at,
            join_code: joinCode.toUpperCase(),
            viewer_soft_limit: rpcResult.event.viewer_soft_limit,
            created_by: null,
            created_at: '',
          },
          signers: rpcResult.signers || [],
        };
      }
      return {
        allowed: false,
        reason: rpcResult.reason || 'not_found',
      };
    }

    const { data: session, error: sessionError } = await supabase
      .from('event_sessions')
      .select('*')
      .eq('join_code', joinCode.toUpperCase())
      .single();

    if (sessionError || !session) {
      return { allowed: false, reason: 'not_found' };
    }

    if (new Date(session.ends_at) < new Date()) {
      return { allowed: false, reason: 'expired' };
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
  signerId?: string
): Promise<EventAsset> => {
  const path = await uploadSessionImage(imageUri, eventId, 'asset');
  const imageUrl = getSessionImageUrl(path);

  const { data, error } = await supabase
    .from('event_assets')
    .insert({
      event_id: eventId,
      signer_id: signerId || null,
      type,
      image_url: imageUrl,
    })
    .select()
    .single();

  if (error) throw new Error(`Publish asset error: ${error.message}`);
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
      query = query.in('type', ['photo_signed', 'signature']);
    } else {
      query = query.eq('type', options.type);
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
