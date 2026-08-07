import React, { useEffect } from 'react';
import { View, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native';
import { Play, VolumeX } from 'lucide-react-native';

// Chargement paresseux : expo-video est un module natif, absent du web et des
// builds qui ne l'embarquent pas. Le fil d'actualité ne doit jamais tomber
// parce qu'une vidéo s'y trouve.
let VideoView: any = null;
let useVideoPlayer: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-video');
  VideoView = mod.VideoView;
  useVideoPlayer = mod.useVideoPlayer;
} catch {
  VideoView = null;
}

const lecteurDispo = !!VideoView && !!useVideoPlayer && Platform.OS !== 'web';

interface Props {
  uri: string;
  /** Vrai quand la carte est réellement visible à l'écran. */
  actif: boolean;
  style?: StyleProp<ViewStyle>;
}

function Lecteur({ uri, actif, style }: Props) {
  const player = useVideoPlayer(uri, (p: any) => {
    p.loop = true;
    // Muette : une vidéo qui se met à parler toute seule pendant qu'on fait
    // défiler un fil est une nuisance. Le son vient au toucher, en plein écran.
    p.muted = true;
  });

  // Seule la vidéo visible tourne. Sans cela, tout le fil jouerait en même
  // temps : batterie, données mobiles et mémoire y passeraient.
  useEffect(() => {
    if (!player) return;
    try {
      if (actif) player.play();
      else player.pause();
    } catch {}
  }, [actif, player]);

  return (
    <View style={style}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      {/* Dit pourquoi il n'y a pas de son, et que le toucher en donnera. */}
      <View style={styles.pastilleSon}>
        <VolumeX size={14} color="#ffffff" />
      </View>
    </View>
  );
}

/**
 * Vidéo d'une publication du fil : lecture automatique, muette et en boucle
 * tant que la carte reste visible.
 *
 * Auparavant le fil passait l'adresse de la vidéo à une balise `<Image>`, qui
 * n'en pouvait évidemment rien faire : il ne restait qu'un rectangle vide avec
 * un triangle dessus. Aucune image, aucun mouvement — rien qui donne envie de
 * toucher.
 */
export default function VideoFil({ uri, actif, style }: Props) {
  // Sans le module natif (web, dev client qui ne l'embarque pas), on montre un
  // cadre sobre avec le bouton de lecture : le toucher ouvre le plein écran.
  if (!lecteurDispo) {
    return (
      <View style={[styles.repli, style]}>
        <Play size={26} color="#ffffff" fill="#ffffff" />
      </View>
    );
  }
  return <Lecteur uri={uri} actif={actif} style={style} />;
}

const styles = StyleSheet.create({
  repli: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pastilleSon: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
