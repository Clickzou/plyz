import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

// Écran de bienvenue = vidéo plein écran (lecture auto, muette).
// La source est dans assets/. Pour revenir à l'ancien splash animé, voir l'historique git.
const VIDEO_SOURCE = require('../assets/plyz-top.mp4');

// Filet de sécurité : si la vidéo ne signale pas sa fin (ex: web), on entre dans l'app après ce délai.
const MAX_DURATION_MS = 12000;

export default function SplashOverlay({ onFinish }: { onFinish: () => void }) {
  const player = useVideoPlayer(VIDEO_SOURCE, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onFinish();
    };

    const endSub = player.addListener('playToEnd', finish);
    const fallback = setTimeout(finish, MAX_DURATION_MS);

    return () => {
      endSub.remove();
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      <Pressable style={styles.skip} onPress={onFinish} hitSlop={12}>
        <Text style={styles.skipText}>Passer ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 9999,
    elevation: 9999,
  },
  skip: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  skipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
