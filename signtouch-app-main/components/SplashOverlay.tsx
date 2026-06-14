import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const SPLASH_DURATION = 5000;

// ─────────────────────────────────────────────────────────────
//  THÈME DE L'ÉCRAN DE DÉMARRAGE
//  'football' = thème spécial football (⚽)
//  'default'  = thème classique (à activer après l'événement)
//  → Pour changer, remplacez simplement la valeur ci-dessous.
const SPLASH_THEME: 'football' | 'default' = 'football';
// ─────────────────────────────────────────────────────────────

const GREEN = '#10b981';
const DARK = '#1f2937';
const BG = '#F4F6F8';

export default function SplashOverlay({ onFinish }: { onFinish: () => void }) {
  if (SPLASH_THEME === 'football') {
    return <SplashFootball onFinish={onFinish} />;
  }
  return <SplashDefault onFinish={onFinish} />;
}

/* ============================================================
   THÈME CLASSIQUE
   ============================================================ */
function SplashDefault({ onFinish }: { onFinish: () => void }) {
  const fadeOut = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const sloganY = useRef(new Animated.Value(24)).current;
  const underline = useRef(new Animated.Value(0)).current;
  const sigOpacity = useRef(new Animated.Value(0)).current;
  const blob1 = useRef(new Animated.Value(0)).current;
  const blob2 = useRef(new Animated.Value(0)).current;
  const blob3 = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const floatLoop = (val: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: dur, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: dur, useNativeDriver: true }),
        ])
      );
    floatLoop(blob1, 5000).start();
    floatLoop(blob2, 6500).start();
    floatLoop(blob3, 8000).start();

    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(sloganOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(sloganY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(underline, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.timing(sigOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    ).start();

    Animated.timing(progress, { toValue: 1, duration: SPLASH_DURATION - 600, useNativeDriver: true }).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeOut, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => onFinish());
    }, SPLASH_DURATION);
    return () => clearTimeout(timer);
  }, []);

  const blobStyle = (val: Animated.Value, dx: number, dy: number, s: number) => ({
    transform: [
      { translateX: val.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
      { translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
      { scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, s] }) },
    ],
  });

  return (
    <Animated.View style={[styles.overlay, { backgroundColor: BG }, { opacity: fadeOut }]} pointerEvents="auto">
      <Animated.View style={[styles.blob, styles.blob1, blobStyle(blob1, 40, -50, 1.15)]} />
      <Animated.View style={[styles.blob, styles.blob2, blobStyle(blob2, -50, 40, 1.2)]} />
      <Animated.View style={[styles.blob, styles.blob3, blobStyle(blob3, 30, 30, 1.1)]} />

      <View style={styles.content}>
        <Animated.Image
          source={require('../assets/logo-plyz.png')}
          resizeMode="contain"
          style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: Animated.multiply(logoScale, pulse) }] }]}
        />
        <Animated.View style={{ opacity: sloganOpacity, transform: [{ translateY: sloganY }], alignItems: 'center' }}>
          <Text style={styles.slogan}>
            Vivez l&apos;instant, <Text style={styles.sloganAccent}>gardez la signature.</Text>
          </Text>
          <Animated.View style={[styles.underline, { transform: [{ scaleX: underline }] }]} />
        </Animated.View>
        <Animated.Image
          source={require('../assets/images/signature.png')}
          resizeMode="contain"
          style={[styles.signature, { opacity: sigOpacity }]}
        />
      </View>

      <Animated.View style={[styles.footer, { opacity: sloganOpacity }]}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressBar, { transform: [{ scaleX: progress }] }]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/* ============================================================
   THÈME SPÉCIAL FOOTBALL ⚽
   ============================================================ */
const CONFETTI = [
  { left: 0.08, color: '#ef4444', size: 10, dur: 3200, delay: 0 },
  { left: 0.20, color: '#3b82f6', size: 8, dur: 4200, delay: 600 },
  { left: 0.32, color: '#f59e0b', size: 12, dur: 3600, delay: 1200 },
  { left: 0.45, color: '#ffffff', size: 9, dur: 4600, delay: 300 },
  { left: 0.58, color: '#ef4444', size: 11, dur: 3000, delay: 900 },
  { left: 0.70, color: '#f59e0b', size: 8, dur: 4000, delay: 1500 },
  { left: 0.82, color: '#3b82f6', size: 10, dur: 3400, delay: 450 },
  { left: 0.92, color: '#ffffff', size: 12, dur: 4400, delay: 1100 },
  { left: 0.14, color: '#22c55e', size: 9, dur: 3800, delay: 1800 },
  { left: 0.64, color: '#22c55e', size: 11, dur: 3300, delay: 2100 },
];

function SplashFootball({ onFinish }: { onFinish: () => void }) {
  const fadeOut = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(0.6)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const sloganY = useRef(new Animated.Value(24)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const ballBounce = useRef(new Animated.Value(0)).current;
  const ballSpin = useRef(new Animated.Value(0)).current;
  const confetti = useRef(CONFETTI.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Ballon : rebond + rotation continue
    Animated.loop(
      Animated.sequence([
        Animated.timing(ballBounce, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(ballBounce, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(Animated.timing(ballSpin, { toValue: 1, duration: 2500, useNativeDriver: true })).start();

    // Confettis qui tombent (départs décalés)
    confetti.forEach((val, i) => {
      const cfg = CONFETTI[i];
      const loop = Animated.loop(Animated.timing(val, { toValue: 1, duration: cfg.dur, useNativeDriver: true }));
      const t = setTimeout(() => loop.start(), cfg.delay);
      // nettoyage implicite au démontage
      void t;
    });

    // Entrée : badge → carte logo → slogan
    Animated.sequence([
      Animated.spring(badgeScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(sloganOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(sloganY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.timing(progress, { toValue: 1, duration: SPLASH_DURATION - 600, useNativeDriver: true }).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeOut, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => onFinish());
    }, SPLASH_DURATION);
    return () => clearTimeout(timer);
  }, []);

  const ballTranslateY = ballBounce.interpolate({ inputRange: [0, 1], outputRange: [0, -26] });
  const ballRotate = ballSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeOut }]} pointerEvents="auto">
      <LinearGradient
        colors={['#065f46', '#047857', '#059669', '#10b981']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Lignes de terrain (subtiles) */}
      <View style={styles.fieldCircle} pointerEvents="none" />
      <View style={styles.fieldLine} pointerEvents="none" />

      {/* Confettis */}
      {confetti.map((val, i) => {
        const cfg = CONFETTI[i];
        const translateY = val.interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] });
        const rotate = val.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '420deg'] });
        return (
          <Animated.View
            key={`c-${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: width * cfg.left,
              width: cfg.size,
              height: cfg.size * 1.4,
              borderRadius: 2,
              backgroundColor: cfg.color,
              opacity: 0.9,
              transform: [{ translateY }, { rotate }],
            }}
          />
        );
      })}

      <View style={styles.content}>
        {/* Badge football */}
        <Animated.View style={[styles.cupBadge, { transform: [{ scale: badgeScale }] }]}>
          <Text style={styles.cupBadgeText}>⚽  C&apos;EST LA FÊTE DU FOOT</Text>
        </Animated.View>

        {/* Ballon qui rebondit */}
        <Animated.Text
          style={[styles.ball, { transform: [{ translateY: ballTranslateY }, { rotate: ballRotate }] }]}
        >
          ⚽
        </Animated.Text>

        {/* Logo sur carte blanche (ressort sur le fond vert) */}
        <Animated.View style={[styles.logoCard, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
          <Image source={require('../assets/logo-plyz.png')} resizeMode="contain" style={styles.logoCardImg} />
        </Animated.View>

        {/* Slogan */}
        <Animated.View style={{ opacity: sloganOpacity, transform: [{ translateY: sloganY }], alignItems: 'center' }}>
          <Text style={styles.wcSlogan}>
            Vivez chaque but, <Text style={styles.wcSloganAccent}>gardez le souvenir.</Text>
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.footer, { opacity: sloganOpacity }]}>
        <View style={styles.wcProgressTrack}>
          <Animated.View style={[styles.wcProgressBar, { transform: [{ scaleX: progress }] }]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  footer: {
    paddingBottom: 64,
    alignItems: 'center',
  },

  // ----- Thème classique -----
  blob: { position: 'absolute', borderRadius: 9999 },
  blob1: {
    width: width * 0.9, height: width * 0.9,
    backgroundColor: 'rgba(16,185,129,0.14)',
    top: -width * 0.25, left: -width * 0.25,
  },
  blob2: {
    width: width * 0.8, height: width * 0.8,
    backgroundColor: 'rgba(5,150,105,0.10)',
    bottom: -width * 0.2, right: -width * 0.25,
  },
  blob3: {
    width: width * 0.55, height: width * 0.55,
    backgroundColor: 'rgba(52,211,153,0.12)',
    top: height * 0.18, right: -width * 0.12,
  },
  logo: { width: 280, height: 108, marginBottom: 26 },
  slogan: { fontSize: 17, color: DARK, fontWeight: '600', letterSpacing: 0.3, textAlign: 'center', paddingHorizontal: 40 },
  sloganAccent: { color: GREEN, fontWeight: '800' },
  underline: { marginTop: 12, width: 90, height: 3, borderRadius: 2, backgroundColor: GREEN },
  signature: { width: 180, height: 54, marginTop: 26, tintColor: DARK },
  progressTrack: { width: 140, height: 4, borderRadius: 2, backgroundColor: 'rgba(16,185,129,0.15)', overflow: 'hidden' },
  progressBar: { width: '100%', height: '100%', borderRadius: 2, backgroundColor: GREEN, alignSelf: 'flex-start' },

  // ----- Thème football -----
  fieldCircle: {
    position: 'absolute',
    width: width * 0.7, height: width * 0.7, borderRadius: width * 0.35,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)',
    top: height * 0.5 - width * 0.35, left: width * 0.15,
  },
  fieldLine: {
    position: 'absolute',
    width: width, height: 2, backgroundColor: 'rgba(255,255,255,0.10)',
    top: height * 0.5,
  },
  cupBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    marginBottom: 22,
  },
  cupBadgeText: { color: '#ffffff', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  ball: { fontSize: 44, marginBottom: 10 },
  logoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingVertical: 18, paddingHorizontal: 26,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  logoCardImg: { width: 240, height: 90 },
  wcSlogan: { fontSize: 17, color: '#ffffff', fontWeight: '600', letterSpacing: 0.3, textAlign: 'center', paddingHorizontal: 40, marginTop: 26 },
  wcSloganAccent: { color: '#fde047', fontWeight: '800' },
  wcProgressTrack: { width: 140, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  wcProgressBar: { width: '100%', height: '100%', borderRadius: 2, backgroundColor: '#fde047', alignSelf: 'flex-start' },
});
