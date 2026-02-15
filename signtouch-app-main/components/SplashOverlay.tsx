import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const SPLASH_DURATION = 5000;

export default function SplashOverlay({ onFinish }: { onFinish: () => void }) {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const signatureOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const circle1Anim = useRef(new Animated.Value(1)).current;
  const circle2Anim = useRef(new Animated.Value(1)).current;
  const circle3Anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(circle1Anim, { toValue: 1.1, duration: 2000, useNativeDriver: true }),
        Animated.timing(circle1Anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(circle2Anim, { toValue: 1.15, duration: 2500, useNativeDriver: true }),
        Animated.timing(circle2Anim, { toValue: 1, duration: 2500, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(circle3Anim, { toValue: 1.08, duration: 1800, useNativeDriver: true }),
        Animated.timing(circle3Anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    ).start();

    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 4, tension: 50, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
      Animated.timing(signatureOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(subtitleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, SPLASH_DURATION);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeOut }]} pointerEvents="auto">
      <LinearGradient
        colors={['#064e3b', '#10b981', '#059669', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.bgCircle1, { transform: [{ scale: circle1Anim }] }]} />
      <Animated.View style={[styles.bgCircle2, { transform: [{ scale: circle2Anim }] }]} />
      <Animated.View style={[styles.bgCircle3, { transform: [{ scale: circle3Anim }] }]} />

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: Animated.multiply(logoScale, pulseAnim) }],
            },
          ]}
        >
          <Image
            source={require('../assets/logo-signtouch.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[styles.signatureContainer, { opacity: signatureOpacity }]}>
          <Image
            source={require('../assets/images/signature.png')}
            style={styles.signatureImage}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
          Admirer, expérimenter et Garder un souvenir.
        </Animated.Text>
      </View>

      <Animated.View style={[styles.footer, { opacity: subtitleOpacity }]}>
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: '#10b981',
  },
  bgCircle1: {
    position: 'absolute',
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: width * 0.75,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -width * 0.3,
    left: -width * 0.3,
  },
  bgCircle2: {
    position: 'absolute',
    width: width,
    height: width,
    borderRadius: width * 0.5,
    backgroundColor: 'rgba(255,255,255,0.03)',
    bottom: -width * 0.2,
    right: -width * 0.2,
  },
  bgCircle3: {
    position: 'absolute',
    width: width * 0.6,
    height: width * 0.6,
    borderRadius: width * 0.3,
    backgroundColor: 'rgba(0,0,0,0.05)',
    top: height * 0.15,
    right: -width * 0.1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoImage: {
    width: 160,
    height: 160,
  },
  signatureContainer: {
    marginBottom: 16,
  },
  signatureImage: {
    width: 200,
    height: 60,
    tintColor: '#000',
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    letterSpacing: 0.5,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 40,
  },
  footer: {
    paddingBottom: 60,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 24,
  },
});
