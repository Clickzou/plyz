import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff,
  Users,
  RotateCcw,
} from 'lucide-react-native';
import { useLanguage } from '../contexts/LanguageContext';

interface Participant {
  session_id: string;
  user_id: string;
  user_name: string;
  local: boolean;
  video: boolean;
  audio: boolean;
  tracks: {
    video?: { state: string };
    audio?: { state: string };
  };
}

export default function VideoCallScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{
    roomUrl: string;
    token: string;
    isHost: string;
    sessionId: string;
  }>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callObject, setCallObject] = useState<any>(null);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  const isHost = params.isHost === 'true';

  useEffect(() => {
    if (Platform.OS === 'web') {
      setError(t('videoNotSupportedWeb'));
      setIsLoading(false);
      return;
    }

    initializeCall();

    return () => {
      if (callObject) {
        callObject.leave();
        callObject.destroy();
      }
    };
  }, []);

  const initializeCall = async () => {
    try {
      const Daily = require('@daily-co/react-native-daily-js').default;
      
      const call = Daily.createCallObject({
        audioSource: true,
        videoSource: true,
      });

      call.on('joined-meeting', handleJoinedMeeting);
      call.on('left-meeting', handleLeftMeeting);
      call.on('participant-joined', handleParticipantUpdate);
      call.on('participant-updated', handleParticipantUpdate);
      call.on('participant-left', handleParticipantLeft);
      call.on('error', handleError);

      setCallObject(call);

      await call.join({
        url: params.roomUrl,
        token: params.token,
      });

    } catch (err) {
      console.error('Failed to initialize call:', err);
      setError(t('videoCallError'));
      setIsLoading(false);
    }
  };

  const handleJoinedMeeting = useCallback(() => {
    setIsLoading(false);
    if (callObject) {
      setParticipants(callObject.participants());
    }
  }, [callObject]);

  const handleLeftMeeting = useCallback(() => {
    router.back();
  }, [router]);

  const handleParticipantUpdate = useCallback(() => {
    if (callObject) {
      setParticipants({ ...callObject.participants() });
    }
  }, [callObject]);

  const handleParticipantLeft = useCallback((event: { participant: Participant }) => {
    if (callObject) {
      setParticipants({ ...callObject.participants() });
    }
  }, [callObject]);

  const handleError = useCallback((event: { errorMsg: string }) => {
    console.error('Daily error:', event.errorMsg);
    setError(event.errorMsg);
  }, []);

  const toggleMute = useCallback(() => {
    if (callObject) {
      callObject.setLocalAudio(!isMuted);
      setIsMuted(!isMuted);
    }
  }, [callObject, isMuted]);

  const toggleVideo = useCallback(() => {
    if (callObject) {
      callObject.setLocalVideo(!isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  }, [callObject, isVideoOff]);

  const switchCamera = useCallback(() => {
    if (callObject) {
      callObject.cycleCamera();
      setIsFrontCamera(!isFrontCamera);
    }
  }, [callObject, isFrontCamera]);

  const leaveCall = useCallback(() => {
    Alert.alert(
      t('leaveCall'),
      t('leaveCallConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('leave'),
          style: 'destructive',
          onPress: () => {
            if (callObject) {
              callObject.leave();
            }
            router.back();
          },
        },
      ]
    );
  }, [callObject, router, t]);

  const participantCount = Object.keys(participants).length;

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <VideoOff size={64} color="#ef4444" />
          <Text style={styles.errorText}>{t('videoNotSupportedWeb')}</Text>
          <Text style={styles.errorSubtext}>{t('videoWebHint')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>{t('connectingToCall')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <VideoOff size={64} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const DailyMediaView = require('@daily-co/react-native-daily-js').DailyMediaView;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.header}>
        <View style={styles.participantBadge}>
          <Users size={16} color="#fff" />
          <Text style={styles.participantCount}>{participantCount}</Text>
        </View>
        {isHost && (
          <View style={styles.hostBadge}>
            <Text style={styles.hostText}>{t('host')}</Text>
          </View>
        )}
      </View>

      <View style={styles.videoGrid}>
        {Object.values(participants).map((participant) => (
          <View 
            key={participant.session_id} 
            style={[
              styles.videoTile,
              participant.local && styles.localVideoTile,
            ]}
          >
            {participant.tracks?.video?.state === 'playable' ? (
              <DailyMediaView
                videoTrack={participant.tracks.video}
                audioTrack={participant.local ? null : participant.tracks.audio}
                mirror={participant.local && isFrontCamera}
                zOrder={participant.local ? 1 : 0}
                style={styles.videoView}
              />
            ) : (
              <View style={styles.videoPlaceholder}>
                <Text style={styles.videoPlaceholderText}>
                  {participant.user_name?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <View style={styles.participantNameContainer}>
              <Text style={styles.participantName} numberOfLines={1}>
                {participant.user_name || t('anonymous')}
                {participant.local && ` (${t('you')})`}
              </Text>
              {!participant.tracks?.audio?.state && (
                <MicOff size={12} color="#ef4444" />
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity 
          style={[styles.controlButton, isMuted && styles.controlButtonActive]} 
          onPress={toggleMute}
        >
          {isMuted ? (
            <MicOff size={24} color="#fff" />
          ) : (
            <Mic size={24} color="#fff" />
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.controlButton, isVideoOff && styles.controlButtonActive]} 
          onPress={toggleVideo}
        >
          {isVideoOff ? (
            <VideoOff size={24} color="#fff" />
          ) : (
            <Video size={24} color="#fff" />
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton} onPress={switchCamera}>
          <RotateCcw size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.endCallButton} onPress={leaveCall}>
          <PhoneOff size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorSubtext: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#374151',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  participantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  participantCount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  hostBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  hostText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  videoGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
  },
  videoTile: {
    flex: 1,
    minWidth: '45%',
    aspectRatio: 3/4,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  localVideoTile: {
    borderWidth: 2,
    borderColor: '#10B981',
  },
  videoView: {
    flex: 1,
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#374151',
  },
  videoPlaceholderText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#9ca3af',
  },
  participantNameContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  participantName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#ef4444',
  },
  endCallButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
