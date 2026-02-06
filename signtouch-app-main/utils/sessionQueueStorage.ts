import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCelebrityPushToken } from './liveSessionStorage';

export interface QueueEntry {
  id: string;
  session_id: string;
  fan_id: string;
  fan_name: string;
  push_token: string | null;
  position: number;
  status: 'waiting' | 'called' | 'in_call' | 'missed' | 'completed' | 'left';
  estimated_call_time: string | null;
  called_at: string | null;
  completed_at: string | null;
  missed_count: number;
  created_at: string;
}

export interface QueueStats {
  totalInQueue: number;
  currentPosition: number;
  estimatedWaitMinutes: number;
  currentFanName: string | null;
  sessionStatus: string;
}

const DEVICE_ID_KEY = '@signtouch_device_id';

export const getOrCreateFanId = async (): Promise<string> => {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = `fan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch (error) {
    return `fan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

export const joinQueue = async (
  sessionId: string,
  fanName: string,
  pushToken: string | null = null
): Promise<QueueEntry | null> => {
  try {
    const fanId = await getOrCreateFanId();

    const { data: existing } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .eq('fan_id', fanId)
      .in('status', ['waiting', 'called'])
      .single();

    if (existing) {
      if (pushToken && pushToken !== existing.push_token) {
        await supabase
          .from('session_queue')
          .update({ push_token: pushToken })
          .eq('id', existing.id);
      }
      return existing as QueueEntry;
    }

    const { data: lastPosition } = await supabase
      .from('session_queue')
      .select('position')
      .eq('session_id', sessionId)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const newPosition = (lastPosition?.position || 0) + 1;

    const { data, error } = await supabase
      .from('session_queue')
      .insert({
        session_id: sessionId,
        fan_id: fanId,
        fan_name: fanName,
        push_token: pushToken,
        position: newPosition,
        status: 'waiting',
        missed_count: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error joining queue:', error);
      return null;
    }

    const entry = data as QueueEntry;

    try {
      const isFirstFan = newPosition === 1;
      notifyCelebrityFanJoined(sessionId, fanName, isFirstFan);
    } catch (e) {}

    return entry;
  } catch (error) {
    console.error('Error joining queue:', error);
    return null;
  }
};

export const getQueuePosition = async (
  sessionId: string
): Promise<QueueStats | null> => {
  try {
    const fanId = await getOrCreateFanId();

    const { data: myEntry } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .eq('fan_id', fanId)
      .in('status', ['waiting', 'called', 'in_call'])
      .single();

    if (!myEntry) {
      return null;
    }

    const { data: allWaiting } = await supabase
      .from('session_queue')
      .select('id, position')
      .eq('session_id', sessionId)
      .in('status', ['waiting', 'called', 'in_call']);

    const { data: waitingAhead } = await supabase
      .from('session_queue')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'waiting')
      .lt('position', myEntry.position);

    const { data: session } = await supabase
      .from('live_sessions')
      .select('duration_per_fan_minutes, status, celebrity_name')
      .eq('id', sessionId)
      .single();

    const { data: currentFan } = await supabase
      .from('session_queue')
      .select('fan_name')
      .eq('session_id', sessionId)
      .eq('status', 'in_call')
      .single();

    const totalInQueue = allWaiting?.length || 0;
    const aheadCount = waitingAhead?.length || 0;
    const durationPerFan = session?.duration_per_fan_minutes || 5;
    
    const hasCurrentCall = currentFan ? 1 : 0;
    const myPosition = aheadCount + 1 + hasCurrentCall;

    return {
      totalInQueue,
      currentPosition: myPosition,
      estimatedWaitMinutes: (aheadCount + hasCurrentCall) * durationPerFan,
      currentFanName: currentFan?.fan_name || null,
      sessionStatus: session?.status || 'waiting',
    };
  } catch (error) {
    console.error('Error getting queue position:', error);
    return null;
  }
};

export const getFullQueue = async (sessionId: string): Promise<QueueEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .in('status', ['waiting', 'called', 'in_call'])
      .order('position', { ascending: true });

    if (error) {
      console.error('Error getting queue:', error);
      return [];
    }

    return (data || []) as QueueEntry[];
  } catch (error) {
    console.error('Error getting queue:', error);
    return [];
  }
};

export const callNextFan = async (sessionId: string): Promise<QueueEntry | null> => {
  try {
    await supabase
      .from('session_queue')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('status', 'in_call');

    const { data: nextFan } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'waiting')
      .order('position', { ascending: true })
      .limit(1)
      .single();

    if (!nextFan) {
      return null;
    }

    const { data: updatedFan, error } = await supabase
      .from('session_queue')
      .update({ 
        status: 'called', 
        called_at: new Date().toISOString() 
      })
      .eq('id', nextFan.id)
      .select()
      .single();

    if (error) {
      console.error('Error calling next fan:', error);
      return null;
    }

    const fan = updatedFan as QueueEntry;

    if (fan.push_token) {
      try {
        await sendQueueNotification(
          fan.push_token,
          'SignTouch',
          "C'est votre tour ! Rejoignez l'appel vidéo maintenant.",
          { sessionId, action: 'your_turn' }
        );
      } catch (e) {}
    }

    return fan;
  } catch (error) {
    console.error('Error calling next fan:', error);
    return null;
  }
};

export const admitFanToCall = async (queueEntryId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('session_queue')
      .update({ status: 'in_call' })
      .eq('id', queueEntryId);

    return !error;
  } catch (error) {
    console.error('Error admitting fan:', error);
    return false;
  }
};

export const markFanAsMissed = async (queueEntryId: string): Promise<boolean> => {
  try {
    const { data: entry } = await supabase
      .from('session_queue')
      .select('*')
      .eq('id', queueEntryId)
      .single();

    if (!entry) return false;

    const { data: lastPosition } = await supabase
      .from('session_queue')
      .select('position')
      .eq('session_id', entry.session_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const newPosition = (lastPosition?.position || 0) + 1;

    const { error } = await supabase
      .from('session_queue')
      .update({ 
        status: 'waiting',
        position: newPosition,
        missed_count: (entry.missed_count || 0) + 1,
        called_at: null,
      })
      .eq('id', queueEntryId);

    if (!error && entry.push_token) {
      try {
        await sendQueueNotification(
          entry.push_token,
          'SignTouch',
          "Vous avez manqué votre tour. Vous avez été replacé dans la file d'attente.",
          { sessionId: entry.session_id, action: 'missed_turn' }
        );
      } catch (e) {}
    }

    return !error;
  } catch (error) {
    console.error('Error marking fan as missed:', error);
    return false;
  }
};

export const leaveQueue = async (sessionId: string): Promise<boolean> => {
  try {
    const fanId = await getOrCreateFanId();

    const { error } = await supabase
      .from('session_queue')
      .update({ status: 'left' })
      .eq('session_id', sessionId)
      .eq('fan_id', fanId)
      .in('status', ['waiting', 'called']);

    return !error;
  } catch (error) {
    console.error('Error leaving queue:', error);
    return false;
  }
};

export const updatePushToken = async (
  sessionId: string,
  pushToken: string
): Promise<boolean> => {
  try {
    const fanId = await getOrCreateFanId();

    const { error } = await supabase
      .from('session_queue')
      .update({ push_token: pushToken })
      .eq('session_id', sessionId)
      .eq('fan_id', fanId);

    return !error;
  } catch (error) {
    console.error('Error updating push token:', error);
    return false;
  }
};

export const getMyQueueEntry = async (sessionId: string): Promise<QueueEntry | null> => {
  try {
    const fanId = await getOrCreateFanId();

    const { data } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .eq('fan_id', fanId)
      .in('status', ['waiting', 'called', 'in_call'])
      .single();

    return data as QueueEntry | null;
  } catch (error) {
    console.error('Error getting my queue entry:', error);
    return null;
  }
};

export const sendQueueNotification = async (
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, any> = {}
): Promise<boolean> => {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
      }),
    });

    const result = await response.json();
    return result.data?.status === 'ok';
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
};

export const notifyUpcomingFans = async (
  sessionId: string,
  celebrityName: string,
  durationPerFanMinutes: number
): Promise<void> => {
  try {
    const { data: queue } = await supabase
      .from('session_queue')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'waiting')
      .order('position', { ascending: true })
      .limit(3);

    if (!queue || queue.length === 0) return;

    for (let i = 0; i < queue.length; i++) {
      const fan = queue[i];
      if (!fan.push_token) continue;

      const waitMinutes = i * durationPerFanMinutes;
      
      if (waitMinutes <= 2) {
        await sendQueueNotification(
          fan.push_token,
          `${celebrityName} - SignTouch`,
          "C'est bientôt votre tour ! Ouvrez l'app maintenant.",
          { sessionId, action: 'your_turn_soon' }
        );
      } else if (waitMinutes <= 5) {
        await sendQueueNotification(
          fan.push_token,
          `${celebrityName} - SignTouch`,
          `Plus que ~${waitMinutes} minutes avant votre tour !`,
          { sessionId, action: 'upcoming' }
        );
      }
    }
  } catch (error) {
    console.error('Error notifying upcoming fans:', error);
  }
};

export const notifyCelebrityFanJoined = async (
  sessionId: string,
  fanName: string,
  isFirstFan: boolean
): Promise<void> => {
  try {
    const celebrityToken = await getCelebrityPushToken(sessionId);
    if (!celebrityToken) return;

    const title = isFirstFan
      ? 'SignTouch'
      : 'SignTouch';
    const body = isFirstFan
      ? `${fanName} a rejoint votre session !`
      : `${fanName} a rejoint la file d'attente.`;

    await sendQueueNotification(
      celebrityToken,
      title,
      body,
      { sessionId, action: isFirstFan ? 'first_fan_joined' : 'fan_joined', fanName }
    );
  } catch (error) {
    console.error('Error notifying celebrity:', error);
  }
};

export const notifyCelebrityQueueFull = async (
  sessionId: string
): Promise<void> => {
  try {
    const celebrityToken = await getCelebrityPushToken(sessionId);
    if (!celebrityToken) return;

    await sendQueueNotification(
      celebrityToken,
      'SignTouch',
      'Tous les fans ont rejoint ! Vous pouvez lancer le live.',
      { sessionId, action: 'queue_full' }
    );
  } catch (error) {
    console.error('Error notifying celebrity queue full:', error);
  }
};
