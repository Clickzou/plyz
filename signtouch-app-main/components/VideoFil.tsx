import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, StyleProp, ViewStyle, Pressable, Image } from 'react-native';
import { Play, Volume2, VolumeX } from 'lucide-react-native';
import { useSplashVisible } from '@/utils/splashState';
import { getSonFil, setSonFil, useSonFil } from '@/utils/sonFil';
import { useSousTitres } from '@/utils/sousTitres';

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

/**
 * Adresse de l'image de couverture d'une vidéo : le serveur la range à côté
 * d'elle, sous le même nom suivi de `-poster.jpg`.
 *
 * Rien n'est stocké en base : les vidéos publiées avant cette mise en place
 * n'en ont tout simplement pas, et l'image échoue en silence — le cadre reste
 * noir, comme avant.
 */
function urlCouverture(uri: string): string | null {
  const sansParametres = uri.split('?')[0];
  if (!/\.[^./]+$/.test(sansParametres)) return null;
  return sansParametres.replace(/\.[^./]+$/, '-poster.jpg');
}

function Lecteur({ uri, actif, style }: Props) {
  // Réglage commun à tout le fil : ce que le fan décide sur une vidéo vaut
  // pour les suivantes.
  const sonActif = useSonFil();

  const player = useVideoPlayer(uri, (p: any) => {
    p.loop = true;
    // Par défaut en sourdine : une vidéo qui se met à parler toute seule
    // pendant qu'on fait défiler un fil est une nuisance.
    p.muted = !getSonFil();
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

  useEffect(() => {
    if (!player) return;
    try {
      player.muted = !sonActif;
    } catch {}
  }, [sonActif, player]);

  // Sous-titres : le fil démarre les vidéos en sourdine, donc sans eux une
  // annonce parlée passe sans être comprise. Ils sont traduits dans la langue
  // du fan par la machinerie déjà en place pour les publications.
  const { lignePour } = useSousTitres(uri);
  const [seconde, setSeconde] = useState(0);
  useEffect(() => {
    if (!player) return;
    let sub: any;
    try {
      // Deux fois par seconde : assez pour suivre la parole, assez peu pour ne
      // pas redessiner la carte à chaque image.
      player.timeUpdateEventInterval = 0.5;
      sub = player.addListener('timeUpdate', ({ currentTime }: any) => {
        setSeconde(Number(currentTime) || 0);
      });
    } catch {}
    return () => {
      try { sub?.remove(); } catch {}
    };
  }, [player]);
  const ligne = lignePour(seconde);

  // La surface vidéo n'est posée qu'une fois la vidéo prête, et l'image de
  // couverture occupe le cadre en attendant. Sur Android cette surface se
  // dessine au-dessus de tout : une couverture placée SOUS elle serait
  // invisible, on ne verrait que son rectangle noir le temps du chargement.
  const [pret, setPret] = useState(false);
  useEffect(() => {
    if (!player) return;
    // Filet de sécurité : si l'événement n'arrive jamais (source inhabituelle,
    // lecteur muet sur l'erreur), on affiche quand même la vidéo au bout de
    // quelques secondes plutôt que de rester sur l'image fixe.
    const secours = setTimeout(() => setPret(true), 5000);
    let sub: any;
    try {
      sub = player.addListener('statusChange', ({ status }: any) => {
        if (status === 'readyToPlay' || status === 'error') setPret(true);
      });
    } catch {}
    return () => {
      clearTimeout(secours);
      try { sub?.remove(); } catch {}
    };
  }, [player]);

  const couverture = urlCouverture(uri);

  return (
    <View>
      <View style={style}>
        {!pret && !!couverture && (
          <Image source={{ uri: couverture }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
        {pret && (
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            contentFit="cover"
            nativeControls={false}
            allowsFullscreen={false}
            allowsPictureInPicture={false}
          />
        )}
        {/* La pastille coupe et remet le son sur place. Elle n'était qu'un
            dessin : le toucher traversait jusqu'à la carte, qui ouvrait la
            vidéo en grand — on demandait le son, on recevait le plein écran. */}
        <Pressable
          style={styles.pastilleSon}
          onPress={() => setSonFil(!sonActif)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={sonActif ? 'Couper le son' : 'Activer le son'}
        >
          {sonActif ? (
            <Volume2 size={14} color="#ffffff" />
          ) : (
            <VolumeX size={14} color="#ffffff" />
          )}
        </Pressable>
      </View>
      {/* Dans le fil, les sous-titres vivent SOUS la vidéo, dans leur propre
          encart : posés par-dessus, ils masqueraient le visage — c'est-à-dire
          exactement ce que le fan est venu voir. En plein écran, où l'image est
          grande, ils repassent sur la vidéo. */}
      {!!ligne && (
        <View style={styles.encartSousTitres}>
          <Text style={styles.texteSousTitres} numberOfLines={2}>{ligne}</Text>
        </View>
      )}
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
  // Pendant la vidéo de bienvenue, aucun lecteur n'est monté : sur Android la
  // surface vidéo se dessine au-dessus de tout le reste et venait s'afficher
  // en plein milieu du splash.
  const splashVisible = useSplashVisible();

  // Sans le module natif (web, dev client qui ne l'embarque pas), on montre
  // l'image de couverture et le bouton de lecture : le toucher ouvre le plein
  // écran. Un rectangle gris ne disait pas ce qu'il y avait dans la vidéo.
  if (!lecteurDispo || splashVisible) {
    const couverture = urlCouverture(uri);
    return (
      <View style={[styles.repli, style]}>
        {!!couverture && (
          <Image source={{ uri: couverture }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
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
  // Encart des sous-titres, sous la vidéo. Fond légèrement éclairci plutôt que
  // noir : la carte est déjà sombre, et un bloc noir sur bleu nuit ressemble à
  // un trou dans la mise en page.
  encartSousTitres: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
  },
  texteSousTitres: {
    color: '#e5e7eb',
    fontSize: 14,
    lineHeight: 19,
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
