import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image, Dimensions, Platform,
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
  const { width, height } = Dimensions.get('window');
  const player = useVideoPlayer(uri, (p: any) => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      style={{ width, height: height * 0.7 }}
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
