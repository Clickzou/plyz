import { authedFetch } from './authedFetch';

// La clé admin Daily.co ne vit PLUS dans l'app. Toutes les opérations admin
// (créer room, générer meeting token, supprimer/lire room) passent désormais
// par le serveur (process.env.DAILY_API_KEY côté serveur uniquement).
const SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface DailyRoom {
  id: string;
  name: string;
  url: string;
  created_at: string;
  config: {
    exp?: number;
    nbf?: number;
    max_participants?: number;
    enable_chat?: boolean;
    enable_screenshare?: boolean;
    enable_recording?: string;
  };
}

interface CreateRoomOptions {
  name?: string;
  expiryMinutes?: number;
  maxParticipants?: number;
  isPrivate?: boolean;
}

interface CreateTokenOptions {
  roomName: string;
  userName: string;
  userId: string;
  isOwner?: boolean;
  expiryMinutes?: number;
}

export const createDailyRoom = async (options: CreateRoomOptions = {}): Promise<DailyRoom | null> => {
  if (!SERVER_URL) {
    console.error('[Daily] Server URL not configured (EXPO_PUBLIC_STRIPE_SERVER_URL)');
    return null;
  }

  const {
    name = `plyz-${Date.now()}`,
    expiryMinutes = 120,
    maxParticipants = 50,
    isPrivate = true,
  } = options;

  try {
    console.log('[Daily] Creating room via server:', name);
    const response = await authedFetch(`${SERVER_URL}/api/daily/create-room`, {
      method: 'POST',
      body: JSON.stringify({ name, expiryMinutes, maxParticipants, isPrivate }),
    });

    console.log('[Daily] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Daily] Failed to create room:', errorData);
      return null;
    }

    const room = await response.json();
    console.log('[Daily] Room created successfully:', room.url);
    return room;
  } catch (error) {
    console.error('[Daily] Error creating room:', error);
    return null;
  }
};

export const createMeetingToken = async (options: CreateTokenOptions): Promise<string | null> => {
  if (!SERVER_URL) {
    console.error('[Daily] Server URL not configured (EXPO_PUBLIC_STRIPE_SERVER_URL)');
    return null;
  }

  const {
    roomName,
    userName,
    userId,
    isOwner = false,
    expiryMinutes = 120,
  } = options;

  try {
    const response = await authedFetch(`${SERVER_URL}/api/daily/meeting-token`, {
      method: 'POST',
      body: JSON.stringify({ roomName, userName, userId, isOwner, expiryMinutes }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to create meeting token:', errorData);
      return null;
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Error creating meeting token:', error);
    return null;
  }
};

export const deleteDailyRoom = async (roomName: string): Promise<boolean> => {
  if (!SERVER_URL) {
    return false;
  }

  try {
    const response = await authedFetch(`${SERVER_URL}/api/daily/delete-room`, {
      method: 'POST',
      body: JSON.stringify({ roomName }),
    });

    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return !!data.ok;
  } catch (error) {
    console.error('Error deleting Daily room:', error);
    return false;
  }
};

export const getDailyRoom = async (roomName: string): Promise<DailyRoom | null> => {
  if (!SERVER_URL) {
    return null;
  }

  try {
    const response = await authedFetch(`${SERVER_URL}/api/daily/get-room`, {
      method: 'POST',
      body: JSON.stringify({ roomName }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting Daily room:', error);
    return null;
  }
};

export const createSessionVideoRoom = async (sessionId: string, celebrityName: string): Promise<{ roomUrl: string; roomName: string } | null> => {
  const roomName = `session-${sessionId}`;

  const existingRoom = await getDailyRoom(roomName);
  if (existingRoom) {
    console.log('[Daily] Room already exists, reusing:', existingRoom.url);
    return {
      roomUrl: existingRoom.url,
      roomName: existingRoom.name,
    };
  }

  const room = await createDailyRoom({
    name: roomName,
    expiryMinutes: 180,
    maxParticipants: 4,
    isPrivate: false,
  });

  if (!room) {
    return null;
  }

  return {
    roomUrl: room.url,
    roomName: room.name,
  };
};

export const joinSessionAsHost = async (
  roomName: string,
  celebrityName: string,
  celebrityId: string
): Promise<{ token: string; roomUrl: string } | null> => {
  const token = await createMeetingToken({
    roomName,
    userName: celebrityName,
    userId: celebrityId,
    isOwner: true,
    expiryMinutes: 180,
  });

  if (!token) {
    return null;
  }

  const room = await getDailyRoom(roomName);
  if (!room) {
    return null;
  }

  return {
    token,
    roomUrl: room.url,
  };
};

export const joinSessionAsFan = async (
  roomName: string,
  fanName: string,
  fanId: string
): Promise<{ token: string; roomUrl: string } | null> => {
  const token = await createMeetingToken({
    roomName,
    userName: fanName,
    userId: fanId,
    isOwner: false,
    expiryMinutes: 120,
  });

  if (!token) {
    return null;
  }

  const room = await getDailyRoom(roomName);
  if (!room) {
    return null;
  }

  return {
    token,
    roomUrl: room.url,
  };
};
