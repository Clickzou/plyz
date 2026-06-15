import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Asset } from 'expo-asset';

// Écran de bienvenue = vidéo plein écran (lecture auto, muette).
// Web : balise <video> HTML (autoplay muet fiable). Mobile : expo-video (lecteur natif).
// Pour revenir à l'ancien splash animé, voir l'historique git.
const VIDEO_SOURCE = require('../assets/plyz-top.mp4');

// Filet de sécurité : si la fin de la vidéo n'est pas signalée, on entre dans l'app après ce délai.
const MAX_DURATION_MS = 12000;

export default function SplashOverlay({ onFinish }: { onFinish: () => void }) {
  if (Platform.OS === 'web') {
    return <SplashWeb onFinish={onFinish} />;
  }
  return <SplashNative onFinish={onFinish} />;
}

// ── Web : vraie balise <video> (autoplay muet autorisé par les navigateurs) ──
function SplashWeb({ onFinish }: { onFinish: () => void }) {
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinish();
  };

  useEffect(() => {
    const t = setTimeout(finish, MAX_DURATION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uri = Asset.fromModule(VIDEO_SOURCE).uri;

  // Force muted + play sur l'element DOM (fiabilise l'autoplay sur navigateur).
  const setVideoRef = (el: any) => {
    if (!el) return;
    el.muted = true;
    const p = el.play && el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  return (
    <View style={styles.container}>
      {React.createElement('video', {
        ref: setVideoRef,
        src: uri,
        autoPlay: true,
        muted: true,
        playsInline: true,
        controls: false,
        onEnded: finish,
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        },
      })}
      <Pressable style={styles.skip} onPress={finish} hitSlop={12}>
        <Text style={styles.skipText}>Passer ›</Text>
      </Pressable>
    </View>
  );
}

// ── Mobile : lecteur natif expo-video ──
function SplashNative({ onFinish }: { onFinish: () => void }) {
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
    // Relance la lecture dès que la vidéo est prête (au cas où le play() initial est ignoré).
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        player.muted = true;
        player.play();
      }
    });
    const fallback = setTimeout(finish, MAX_DURATION_MS);

    return () => {
      endSub.remove();
      statusSub.remove();
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
