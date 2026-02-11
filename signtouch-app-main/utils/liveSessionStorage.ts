import { supabase } from './supabase';

export interface LiveSession {
  id: string;
  code: string;
  celebrity_id: string;
  celebrity_name: string;
  duration_minutes: number;
  duration_per_fan_minutes: number;
  max_slots: number;
  price_cents: number;
  currency: string;
  status: 'waiting' | 'active' | 'paused' | 'ended';
  current_fan_id: string | null;
  started_at: string | null;
  ends_at: string | null;
  created_at: string;
  slots_used: number;
  room_url?: string | null;
  fan_call_started_at?: string | null;
  cover_photo_url?: string | null;
  celebrity_push_token?: string | null;
  dedication_photo_url?: string | null;
  dedication_signature_svg?: string | null;
  celebrity_stripe_account_id?: string | null;
}

export interface QueueEntry {
  id: string;
  session_id: string;
  fan_id: string;
  fan_name: string | null;
  photo_url: string | null;
  message: string | null;
  position: number;
  status: 'waiting' | 'current' | 'signing' | 'completed' | 'skipped';
  signature_svg: string | null;
  signed_image_url: string | null;
  created_at: string;
  called_at: string | null;
  completed_at: string | null;
}

const generateSessionCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const uploadCoverPhoto = async (
  sessionId: string,
  photoUri: string
): Promise<string | null> => {
  try {
    const response = await fetch(photoUri);
    const blob = await response.blob();
    const fileName = `cover_${sessionId}_${Date.now()}.jpg`;
    const filePath = `live-sessions/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('memories')
      .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) {
      console.error('Error uploading cover photo:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('memories')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading cover photo:', error);
    return null;
  }
};

export const uploadDedicationPhoto = async (
  sessionId: string,
  photoUri: string
): Promise<string | null> => {
  try {
    const response = await fetch(photoUri);
    const blob = await response.blob();
    const fileName = `dedication_${sessionId}_${Date.now()}.jpg`;
    const filePath = `live-sessions/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('memories')
      .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) {
      console.error('Error uploading dedication photo:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('memories')
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('live_sessions')
      .update({ dedication_photo_url: publicUrl } as any)
      .eq('id', sessionId);

    if (updateError) {
      console.error('Error updating session dedication photo:', updateError);
    }

    return publicUrl;
  } catch (error) {
    console.error('Error uploading dedication photo:', error);
    return null;
  }
};

export const updateDedicationSignature = async (
  sessionId: string,
  signatureSvg: string
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('live_sessions')
      .update({ dedication_signature_svg: signatureSvg } as any)
      .eq('id', sessionId);

    if (error) {
      console.error('Error updating dedication signature:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error updating dedication signature:', error);
    return false;
  }
};

export const getDedicationAssets = async (
  sessionId: string
): Promise<{ photoUrl: string | null; signatureSvg: string | null; celebrityName: string } | null> => {
  try {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('dedication_photo_url, dedication_signature_svg, celebrity_name')
      .eq('id', sessionId)
      .single();

    if (error || !data) return null;

    return {
      photoUrl: (data as any).dedication_photo_url || null,
      signatureSvg: (data as any).dedication_signature_svg || null,
      celebrityName: (data as any).celebrity_name || '',
    };
  } catch (error) {
    console.error('Error getting dedication assets:', error);
    return null;
  }
};

export const createLiveSession = async (
  celebrityId: string,
  celebrityName: string,
  durationMinutes: number,
  maxSlots: number,
  priceCents: number = 0,
  durationPerFanMinutes: number = 5,
  coverPhotoUrl: string | null = null,
  celebrityStripeAccountId: string | null = null
): Promise<LiveSession | null> => {
  const code = generateSessionCode();
  
  const durationPerFanInt = durationPerFanMinutes < 1 
    ? 1 
    : Math.round(durationPerFanMinutes);

  const insertData: any = {
    code,
    celebrity_id: celebrityId,
    celebrity_name: celebrityName,
    duration_minutes: durationMinutes,
    duration_per_fan_minutes: durationPerFanInt,
    max_slots: maxSlots,
    price_cents: priceCents,
    status: 'waiting',
    cover_photo_url: coverPhotoUrl,
  };

  if (celebrityStripeAccountId) {
    insertData.celebrity_stripe_account_id = celebrityStripeAccountId;
  }

  console.log('[createLiveSession] Inserting session with code:', code, 'data:', JSON.stringify(insertData));

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase
        .from('live_sessions')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error(`[createLiveSession] Attempt ${attempt}/3 error:`, JSON.stringify(error));
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        return null;
      }

      console.log('[createLiveSession] Session created successfully:', data?.id, data?.code);
      return data as LiveSession;
    } catch (error) {
      console.error(`[createLiveSession] Attempt ${attempt}/3 exception:`, error);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return null;
    }
  }
  return null;
};

export const updateCelebrityPushToken = async (
  sessionId: string,
  pushToken: string
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('live_sessions')
      .update({ celebrity_push_token: pushToken })
      .eq('id', sessionId);

    if (error) {
      console.error('Error updating celebrity push token:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error updating celebrity push token:', error);
    return false;
  }
};

export const getCelebrityPushToken = async (
  sessionId: string
): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('celebrity_push_token')
      .eq('id', sessionId)
      .single();

    if (error || !data) return null;
    return data.celebrity_push_token || null;
  } catch (error) {
    return null;
  }
};

export const startFanCall = async (sessionId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('live_sessions')
      .update({ fan_call_started_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) {
      console.error('Error starting fan call timer:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error starting fan call timer:', error);
    return false;
  }
};

export const getSessionByCode = async (code: string): Promise<LiveSession | null> => {
  try {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error) {
      console.error('Error fetching session:', error);
      return null;
    }

    return data as LiveSession;
  } catch (error) {
    console.error('Error fetching session:', error);
    return null;
  }
};

export const getSessionById = async (sessionId: string): Promise<LiveSession | null> => {
  try {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('Error fetching session:', error);
      return null;
    }

    return data as LiveSession;
  } catch (error) {
    console.error('Error fetching session:', error);
    return null;
  }
};

export const updateSessionRoomUrl = async (sessionId: string, roomUrl: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('live_sessions')
      .update({ room_url: roomUrl, status: 'active' })
      .eq('id', sessionId);

    if (error) {
      console.error('Error updating session room_url:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating session room_url:', error);
    return false;
  }
};

export const startSession = async (sessionId: string): Promise<boolean> => {
  try {
    const now = new Date();
    const session = await getSessionById(sessionId);
    if (!session) return false;

    const endsAt = new Date(now.getTime() + session.duration_minutes * 60 * 1000);

    const { error } = await supabase
      .from('live_sessions')
      .update({
        status: 'active',
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .eq('id', sessionId);

    return !error;
  } catch (error) {
    console.error('Error starting session:', error);
    return false;
  }
};

export const pauseSession = async (sessionId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('live_sessions')
      .update({ status: 'paused' })
      .eq('id', sessionId);

    return !error;
  } catch (error) {
    console.error('Error pausing session:', error);
    return false;
  }
};

export const resumeSession = async (sessionId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('live_sessions')
      .update({ status: 'active' })
      .eq('id', sessionId);

    return !error;
  } catch (error) {
    console.error('Error resuming session:', error);
    return false;
  }
};

export const endSession = async (sessionId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('live_sessions')
      .update({ status: 'ended' })
      .eq('id', sessionId);

    return !error;
  } catch (error) {
    console.error('Error ending session:', error);
    return false;
  }
};

export const joinSessionQueue = async (
  sessionId: string,
  fanId: string,
  fanName: string,
  photoUrl: string | null,
  message: string | null
): Promise<QueueEntry | null> => {
  try {
    const { data: lastPosition } = await supabase
      .from('session_queue')
      .select('position')
      .eq('session_id', sessionId)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const nextPosition = (lastPosition?.position || 0) + 1;

    const { data, error } = await supabase
      .from('session_queue')
      .insert({
        session_id: sessionId,
        fan_id: fanId,
        fan_name: fanName,
        photo_url: photoUrl,
        message: message,
        position: nextPosition,
        status: 'waiting',
      })
      .select()
      .single();

    if (error) {
      console.error('Error joining queue:', error);
      return null;
    }

    await supabase
      .from('live_sessions')
      .update({ slots_used: nextPosition })
      .eq('id', sessionId);

    return data as QueueEntry;
  } catch (error) {
    console.error('Error joining queue:', error);
    return null;
  }
};

export const getQueueForSession = async (sessionId: string): Promise<QueueEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .order('position', { ascending: true });

    if (error) {
      console.error('Error fetching queue:', error);
      return [];
    }

    return data as QueueEntry[];
  } catch (error) {
    console.error('Error fetching queue:', error);
    return [];
  }
};

export const getWaitingQueue = async (sessionId: string): Promise<QueueEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .in('status', ['waiting', 'current', 'signing'])
      .order('position', { ascending: true });

    if (error) {
      console.error('Error fetching waiting queue:', error);
      return [];
    }

    return data as QueueEntry[];
  } catch (error) {
    console.error('Error fetching waiting queue:', error);
    return [];
  }
};

export const getQueueEntry = async (entryId: string): Promise<QueueEntry | null> => {
  try {
    const { data, error } = await supabase
      .from('session_queue')
      .select('*')
      .eq('id', entryId)
      .single();

    if (error) {
      console.error('Error fetching queue entry:', error);
      return null;
    }

    return data as QueueEntry;
  } catch (error) {
    console.error('Error fetching queue entry:', error);
    return null;
  }
};

export const getQueueEntryByFanId = async (sessionId: string, fanId: string): Promise<QueueEntry | null> => {
  try {
    const { data, error } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .eq('fan_id', fanId)
      .single();

    if (error) {
      console.error('Error fetching queue entry:', error);
      return null;
    }

    return data as QueueEntry;
  } catch (error) {
    console.error('Error fetching queue entry:', error);
    return null;
  }
};

export const callNextFan = async (sessionId: string): Promise<QueueEntry | null> => {
  try {
    await supabase
      .from('session_queue')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('status', 'signing');

    const { data: nextFan, error } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'waiting')
      .order('position', { ascending: true })
      .limit(1)
      .single();

    if (error || !nextFan) {
      await supabase
        .from('live_sessions')
        .update({ current_fan_id: null })
        .eq('id', sessionId);
      return null;
    }

    await supabase
      .from('session_queue')
      .update({ status: 'current', called_at: new Date().toISOString() })
      .eq('id', nextFan.id);

    await supabase
      .from('live_sessions')
      .update({ current_fan_id: nextFan.id })
      .eq('id', sessionId);

    return { ...nextFan, status: 'current' } as QueueEntry;
  } catch (error) {
    console.error('Error calling next fan:', error);
    return null;
  }
};

export const startSigning = async (entryId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('session_queue')
      .update({ status: 'signing' })
      .eq('id', entryId);

    return !error;
  } catch (error) {
    console.error('Error starting signing:', error);
    return false;
  }
};

export const updateSignatureSvg = async (entryId: string, signatureSvg: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('session_queue')
      .update({ signature_svg: signatureSvg })
      .eq('id', entryId);

    return !error;
  } catch (error) {
    console.error('Error updating signature:', error);
    return false;
  }
};

export const completeSignature = async (
  entryId: string,
  signatureSvg: string,
  signedImageUrl: string | null
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('session_queue')
      .update({
        status: 'completed',
        signature_svg: signatureSvg,
        signed_image_url: signedImageUrl,
        completed_at: new Date().toISOString(),
      })
      .eq('id', entryId);

    return !error;
  } catch (error) {
    console.error('Error completing signature:', error);
    return false;
  }
};

export const skipFan = async (entryId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('session_queue')
      .update({ status: 'skipped', completed_at: new Date().toISOString() })
      .eq('id', entryId);

    return !error;
  } catch (error) {
    console.error('Error skipping fan:', error);
    return false;
  }
};

export const getQueuePosition = async (sessionId: string, fanId: string): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from('session_queue')
      .select('position')
      .eq('session_id', sessionId)
      .eq('fan_id', fanId)
      .single();

    if (error || !data) return -1;

    const { data: waitingBefore } = await supabase
      .from('session_queue')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'waiting')
      .lt('position', data.position);

    return (waitingBefore?.length || 0) + 1;
  } catch (error) {
    console.error('Error getting queue position:', error);
    return -1;
  }
};

export const uploadFanPhoto = async (
  sessionId: string,
  fanId: string,
  photoUri: string
): Promise<string | null> => {
  try {
    const response = await fetch(photoUri);
    const blob = await response.blob();
    
    const fileName = `${sessionId}/${fanId}_${Date.now()}.jpg`;
    
    const { data, error } = await supabase.storage
      .from('session_photos')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('Error uploading photo:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('session_photos')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading photo:', error);
    return null;
  }
};

export const subscribeToSession = (
  sessionId: string,
  onUpdate: (session: LiveSession) => void
) => {
  return supabase
    .channel(`session_${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'live_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        if (payload.new) {
          onUpdate(payload.new as LiveSession);
        }
      }
    )
    .subscribe();
};

export const subscribeToQueue = (
  sessionId: string,
  onUpdate: (queue: QueueEntry[]) => void
) => {
  const channel = supabase
    .channel(`queue_${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'session_queue',
        filter: `session_id=eq.${sessionId}`,
      },
      async () => {
        const queue = await getWaitingQueue(sessionId);
        onUpdate(queue);
      }
    )
    .subscribe();

  return channel;
};

export const subscribeToQueueEntry = (
  entryId: string,
  onUpdate: (entry: QueueEntry) => void
) => {
  return supabase
    .channel(`entry_${entryId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'session_queue',
        filter: `id=eq.${entryId}`,
      },
      (payload) => {
        if (payload.new) {
          onUpdate(payload.new as QueueEntry);
        }
      }
    )
    .subscribe();
};

export const broadcastSignatureStroke = async (
  sessionId: string,
  entryId: string,
  strokeData: string
): Promise<void> => {
  await supabase.channel(`signing_${entryId}`).send({
    type: 'broadcast',
    event: 'stroke',
    payload: { strokeData },
  });
};

export const subscribeToSignatureStrokes = (
  entryId: string,
  onStroke: (strokeData: string) => void
) => {
  return supabase
    .channel(`signing_${entryId}`)
    .on('broadcast', { event: 'stroke' }, (payload) => {
      if (payload.payload?.strokeData) {
        onStroke(payload.payload.strokeData);
      }
    })
    .subscribe();
};
