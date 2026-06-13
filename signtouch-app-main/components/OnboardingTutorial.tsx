import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, Platform, Modal, Pressable, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Sparkles, PenTool, Search, Calendar, Star, Camera,
  ChevronRight, ChevronLeft
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOnboarding } from '@/contexts/OnboardingContext';

const { width } = Dimensions.get('window');

interface Slide {
  icon: (size: number, color: string) => React.ReactNode;
  iconColor: string;
  gradientColors: [string, string, string];
  titleKey: string;
  descKey: string;
  titleFallback: string;
  descFallback: string;
  highlightKey?: string;
  highlightFallback?: string;
  logoImage?: any;
}

const SLIDES: Slide[] = [
  {
    icon: (s, c) => <Sparkles size={s} color={c} strokeWidth={1.5} />,
    iconColor: '#ffffff',
    gradientColors: ['#022c22', '#065f46', '#10b981'],
    titleKey: 'onboardingWelcomeTitle',
    descKey: 'onboardingWelcomeDesc',
    titleFallback: 'Bienvenue sur Plyz',
    descFallback: 'L\'app qui rapproche les fans et leurs célébrités préférées : signe tes photos, demande des autographes, rejoins des événements live.',
    logoImage: require('../assets/images/icon.png'),
  },
  {
    icon: (s, c) => <PenTool size={s} color={c} strokeWidth={1.5} />,
    iconColor: '#ffffff',
    gradientColors: ['#064e3b', '#059669', '#10b981'],
    titleKey: 'onboardingSignTitle',
    descKey: 'onboardingSignDesc',
    titleFallback: 'Personnalise tes photos',
    descFallback: 'Prends une photo, ajoute une signature manuscrite ou une dédicace parmi 50+ polices. Conserve tes plus beaux souvenirs.',
    highlightKey: 'onboardingSignHint',
    highlightFallback: 'Touche le bouton 📷 en bas pour commencer',
  },
  {
    icon: (s, c) => <Search size={s} color={c} strokeWidth={1.5} />,
    iconColor: '#ffffff',
    gradientColors: ['#1e1b4b', '#3b82f6', '#6366f1'],
    titleKey: 'onboardingDiscoverTitle',
    descKey: 'onboardingDiscoverDesc',
    titleFallback: 'Connecte-toi à tes stars',
    descFallback: 'Parcours le mur des célébrités vérifiées, demande un autographe personnalisé ou réserve un appel vidéo privé. Paiement sécurisé.',
    highlightKey: 'onboardingDiscoverHint',
    highlightFallback: 'Onglet 🔍 Découvrir',
  },
  {
    icon: (s, c) => <Calendar size={s} color={c} strokeWidth={1.5} />,
    iconColor: '#ffffff',
    gradientColors: ['#1e1b4b', '#4f46e5', '#8b5cf6'],
    titleKey: 'onboardingEventsTitle',
    descKey: 'onboardingEventsDesc',
    titleFallback: 'Événements live',
    descFallback: 'Rejoins des sessions de dédicaces en direct par QR code, ou organise ton propre événement et invite tes fans.',
    highlightKey: 'onboardingEventsHint',
    highlightFallback: 'Onglet 📅 Événements',
  },
  {
    icon: (s, c) => <Star size={s} color={c} strokeWidth={1.5} />,
    iconColor: '#ffffff',
    gradientColors: ['#451a03', '#b45309', '#f59e0b'],
    titleKey: 'onboardingCelebrityTitle',
    descKey: 'onboardingCelebrityDesc',
    titleFallback: 'Tu es une célébrité ?',
    descFallback: 'Active le mode célébrité depuis Compte pour proposer tes prestations, recevoir des paiements et créer tes propres événements.',
    highlightKey: 'onboardingCelebrityHint',
    highlightFallback: 'Avatar 👤 en haut → Devenir Célébrité',
  },
  {
    icon: (s, c) => <Camera size={s} color={c} strokeWidth={1.5} />,
    iconColor: '#ffffff',
    gradientColors: ['#022c22', '#10b981', '#34d399'],
    titleKey: 'onboardingReadyTitle',
    descKey: 'onboardingReadyDesc',
    titleFallback: 'Prêt à commencer ?',
    descFallback: 'Appuie sur le bouton caméra en bas pour signer ta première photo, ou explore l\'app à ton rythme. À toi de jouer !',
  },
];

export default function OnboardingTutorial() {
  const { t } = useLanguage();
  const { isOnboarding, skipOnboarding } = useOnboarding();
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (isOnboarding) {
      setStep(0);
    }
  }, [isOnboarding]);

  useEffect(() => {
    if (isOnboarding) {
      animateIn();
      startGlow();
    }
  }, [isOnboarding, step]);

  const animateIn = () => {
    iconScale.setValue(0);
    contentOpacity.setValue(0);
    slideAnim.setValue(40);

    Animated.parallel([
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const startGlow = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.7,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const goToStep = (nextStep: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      fadeAnim.setValue(1);
    });
  };

  const handleNext = () => {
    if (step < SLIDES.length - 1) {
      goToStep(step + 1);
    } else {
      handleDone();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      goToStep(step - 1);
    }
  };

  const handleDone = async () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await skipOnboarding();
  };

  if (!isOnboarding) return null;

  const current = SLIDES[step];
  const isLast = step === SLIDES.length - 1;
  const isFirst = step === 0;

  return (
    <Modal visible={isOnboarding} animationType="fade" transparent={false} statusBarTranslucent>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={current.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.bgOrb1} />
        <View style={styles.bgOrb2} />

        <Pressable
          onPress={handleNext}
          style={styles.tapHint}
          accessibilityLabel={t('next' as any) || 'Suivant'}
        >
          <View />
        </Pressable>

        <View style={styles.header} pointerEvents="box-none">
          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>{step + 1} / {SLIDES.length}</Text>
          </View>
          {!isLast && (
            <TouchableOpacity onPress={handleDone} style={styles.skipBtn} activeOpacity={0.7}>
              <Text style={styles.skipText}>{t('skip' as any) || 'Passer'}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.body} pointerEvents="box-none">
          <Animated.View
            pointerEvents="none"
            style={[
              styles.iconGlow,
              {
                opacity: glowAnim,
                transform: [{ scale: iconScale }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.iconWrap,
              { transform: [{ scale: iconScale }] },
            ]}
          >
            {current.logoImage ? (
              <Image
                source={current.logoImage}
                style={styles.logoImageStyle}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.iconCircle}>
                {current.icon(60, current.iconColor)}
              </View>
            )}
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.textWrap,
              {
                opacity: contentOpacity,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.title}>
              {t(current.titleKey as any) || current.titleFallback}
            </Text>
            <Text style={styles.description}>
              {t(current.descKey as any) || current.descFallback}
            </Text>
            {current.highlightKey && (
              <View style={styles.hintBadge}>
                <Text style={styles.hintText}>
                  {t(current.highlightKey as any) || current.highlightFallback}
                </Text>
              </View>
            )}
          </Animated.View>
        </View>

        <View style={styles.footer} pointerEvents="box-none">
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === step && styles.dotActive]}
              />
            ))}
          </View>

          <View style={styles.navRow}>
            {!isFirst ? (
              <TouchableOpacity onPress={handlePrev} style={styles.prevBtn} activeOpacity={0.7}>
                <ChevronLeft size={20} color="rgba(255,255,255,0.85)" />
                <Text style={styles.prevText}>{t('previous' as any) || 'Précédent'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 110 }} />
            )}

            <TouchableOpacity
              onPress={handleNext}
              style={[styles.nextBtn, isLast && styles.doneBtn]}
              activeOpacity={0.8}
            >
              <Text style={[styles.nextText, isLast && styles.doneText]}>
                {isLast ? (t('getStarted' as any) || "C'est parti !") : (t('next' as any) || 'Suivant')}
              </Text>
              {!isLast && <ChevronRight size={20} color="#ffffff" />}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgOrb1: {
    position: 'absolute',
    width: width * 1.3,
    height: width * 1.3,
    borderRadius: width * 0.65,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: -width * 0.5,
    right: -width * 0.4,
  },
  bgOrb2: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    backgroundColor: 'rgba(0,0,0,0.08)',
    bottom: -width * 0.25,
    left: -width * 0.3,
  },
  tapHint: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  counterBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  counterText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  skipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  iconGlow: {
    position: 'absolute',
    top: '32%',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 24,
  },
  iconWrap: {
    marginBottom: 48,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  logoImageStyle: {
    width: 180,
    height: 180,
  },
  textWrap: {
    alignItems: 'center',
    maxWidth: 360,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  description: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  hintBadge: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  hintText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    paddingBottom: Platform.OS === 'ios' ? 50 : 32,
    paddingHorizontal: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
    width: 28,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: 110,
  },
  prevText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '500',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  nextText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
    paddingHorizontal: 36,
  },
  doneText: {
    color: '#064e3b',
    fontSize: 17,
    fontWeight: '800',
  },
});
