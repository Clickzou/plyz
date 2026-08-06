import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image, Dimensions, Platform, useWindowDimensions,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Chargement paresseux : expo-video est un module natif, absent du web et des
// builds qui ne l'embarquent pas. Une visionneuse ne doit jamais faire tomber
// l'écran qui l'appelle.
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

// Une dédicace, c'est une image qu'on veut REGARDER. Elle ne s'affichait que
// dans la largeur d'une carte du fil, sans aucun moyen de l'agrandir — l'objet
// même de l'app restait en vignette.

export type MediaVisionnable = { uri: string; estVideo?: boolean; titre?: string };

interface Props {
  media: MediaVisionnable | null;
  onClose: () => void;
}

function LecteurVideo({ uri }: { uri: string }) {
  // `useWindowDimensions` et non `Dimensions.get` : la fenêtre change de forme
  // quand on tourne le téléphone, et une taille figée au premier rendu
  // laisserait la vidéo dans un cadre portrait au milieu d'un écran paysage.
  const { width, height } = useWindowDimensions();
  const paysage = width > height;
  const player = useVideoPlayer(uri, (p: any) => {
    p.loop = true;
    // Le son EST présent en plein écran : c'est le geste qui le demande. Seule
    // la lecture automatique du fil reste muette.
    p.muted = false;
    p.play();
  });
  return (
    <VideoView
      style={{ width, height: paysage ? height : height * 0.7 }}
      player={player}
      allowsFullscreen
      allowsPictureInPicture={false}
      contentFit="contain"
      nativeControls
    />
  );
}

export default function VisionneuseMedia({ media, onClose }: Props) {
  const insets = useSafeAreaInsets();

  // L'app est verrouillée en portrait — c'est le bon réglage partout ailleurs.
  // Mais une vidéo filmée à l'horizontale n'occuperait alors qu'une bande au
  // milieu de l'écran, même en plein écran. On libère donc la rotation le temps
  // de la lecture, et on la reverrouille en sortant : tourner son téléphone
  // pour regarder une vidéo est un réflexe, pas une option à trouver.
  useEffect(() => {
    if (!media?.estVideo || Platform.OS === 'web') return;
    let annule = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const SO = require('expo-screen-orientation');
        if (!annule) await SO.unlockAsync();
      } catch { /* rotation indisponible : la vidéo reste lisible en portrait */ }
    })();
    return () => {
      annule = true;
      (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const SO = require('expo-screen-orientation');
          await SO.lockAsync(SO.OrientationLock.PORTRAIT_UP);
        } catch { /* rien à rétablir */ }
      })();
    };
  }, [media?.estVideo, media?.uri]);

  if (!media) return null;

  const { width, height } = Dimensions.get('window');
  const lecteurDispo = !!VideoView && !!useVideoPlayer && Platform.OS !== 'web';

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.fond}>
        <TouchableOpacity
          style={[styles.fermer, { top: insets.top + 10 }]}
          onPress={onClose}
          hitSlop={14}
          activeOpacity={0.8}
        >
          <X size={22} color="#ffffff" />
        </TouchableOpacity>

        {media.estVideo && lecteurDispo ? (
          <LecteurVideo uri={media.uri} />
        ) : (
          /* Toucher l'image la referme : c'est le geste attendu, et il évite de
             viser une croix de 22 pixels dans un coin. */
          <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.zoneImage}>
            <Image
              source={{ uri: media.uri }}
              style={{ width, height: height * 0.8 }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        )}

        {!!media.titre && (
          <Text style={[styles.titre, { bottom: insets.bottom + 24 }]} numberOfLines={2}>
            {media.titre}
          </Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  fermer: {
    position: 'absolute', right: 16, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  zoneImage: { alignItems: 'center', justifyContent: 'center' },
  titre: {
    position: 'absolute', left: 24, right: 24,
    color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center',
  },
});
