const DAILY_API_URL = 'https://api.daily.co/v1';

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

interface DailyMeetingToken {
  token: string;
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

export const getDailyApiKey = (): string | null => {
  const apiKey = process.env.DAILY_API_KEY || process.env.EXPO_PUBLIC_DAILY_API_KEY;
  if (!apiKey) {
    console.log('Daily API key not found in environment variables');
    return null;
  }
  return apiKey;
};

export const createDailyRoom = async (options: CreateRoomOptions = {}): Promise<DailyRoom | null> => {
  const apiKey = getDailyApiKey();
  if (!apiKey) {
    console.error('Daily API key not configured');
    return null;
  }

  const {
    name = `signtouch-${Date.now()}`,
    expiryMinutes = 120,
    maxParticipants = 50,
    isPrivate = true,
  } = options;

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name,
        privacy: isPrivate ? 'private' : 'public',
        properties: {
          exp: Math.floor(Date.now() / 1000) + (expiryMinutes * 60),
          max_participants: maxParticipants,
          enable_chat: true,
          enable_screenshare: false,
          enable_recording: 'cloud',
          start_video_off: false,
          start_audio_off: true,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to create Daily room:', errorData);
      return null;
    }

    const room = await response.json();
    return room;
  } catch (error) {
    console.error('Error creating Daily room:', error);
    return null;
  }
};

export const createMeetingToken = async (options: CreateTokenOptions): Promise<string | null> => {
  const apiKey = getDailyApiKey();
  if (!apiKey) {
    console.error('Daily API key not configured');
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
    const response = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: userName,
          user_id: userId,
          is_owner: isOwner,
          enable_screenshare: false,
          start_video_off: false,
          start_audio_off: !isOwner,
          exp: Math.floor(Date.now() / 1000) + (expiryMinutes * 60),
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to create meeting token:', errorData);
      return null;
    }

    const data: DailyMeetingToken = await response.json();
    return data.token;
  } catch (error) {
    console.error('Error creating meeting token:', error);
    return null;
  }
};

export const deleteDailyRoom = async (roomName: string): Promise<boolean> => {
  const apiKey = getDailyApiKey();
  if (!apiKey) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error deleting Daily room:', error);
    return false;
  }
};

export const getDailyRoom = async (roomName: string): Promise<DailyRoom | null> => {
  const apiKey = getDailyApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
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
