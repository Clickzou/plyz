import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, KeyRound, Camera, Sparkles } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import { supabase } from '@/utils/supabase';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'email' | 'code' | 'profile';

export default function WelcomeAuthScreen() {
  const insets = useSafeAreaInsets();
  const { user, sendOtpCode, verifyOtpCode } = useAuth();
  const { setProfilePhoto } = useCelebrityMode();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Profile step state
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoContentType, setPhotoContentType] = useState<string | null>(null);

  // After successful OTP verification we wait for `user` to be set, then decide
  // whether the profile is incomplete (-> show 'profile' step) or not (-> let
  // the gate fall through and enter the app).
  const [awaitingProfileCheck, setAwaitingProfileCheck] = useState(false);

  // Once the profile step is finished we render nothing so the (already
  // authenticated) app behind the gate becomes visible.
  const [profileDone, setProfileDone] = useState(false);

  useEffect(() => {
    if (!awaitingProfileCheck || !user?.id) return;
    let cancelled = false;

    const checkProfile = async () => {
      try {
        const { data, error: selErr } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;

        // On error, do NOT block the user: let the gate enter the app.
        if (selErr) {
          setAwaitingProfileCheck(false);
          return;
        }

        const displayName = (data?.display_name || '').trim();
        if (!displayName) {
          setStep('profile');
          setAwaitingProfileCheck(false);
        } else {
          // Profile complete -> nothing to show, gate enters the app.
          setAwaitingProfileCheck(false);
        }
      } catch {
        if (!cancelled) setAwaitingProfileCheck(false);
      }
    };

    checkProfile();
    return () => {
      cancelled = true;
    };
  }, [awaitingProfileCheck, user?.id]);

  const handleSendCode = async () => {
    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Adresse email invalide');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error: sendError } = await sendOtpCode(trimmed);
      if (sendError) {
        setError(sendError.message);
      } else {
        setStep('code');
      }
    } catch (err: any) {
      setError(err?.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError('');
    setCode('');
    try {
      const { error: sendError } = await sendOtpCode(email.trim());
      if (sendError) setError(sendError.message);
    } catch (err: any) {
      setError(err?.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.trim().length < 6) {
      setError('Code invalide');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error: verifyError } = await verifyOtpCode(email.trim(), code.trim());
      if (verifyError) {
        setError(verifyError.message);
      } else {
        // Connected. Now decide if profile completion is needed.
        setAwaitingProfileCheck(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const pickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError("Autorise l'accès à tes photos pour ajouter une image.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setPhotoUri(asset.uri);
        setPhotoBase64(asset.base64 || null);
        setPhotoContentType(asset.mimeType || 'image/jpeg');
        setError('');
      }
    } catch (err: any) {
      setError(err?.message || "Impossible de charger la photo");
    }
  };

  const handleFinish = async () => {
    if (!user?.id || !name.trim()) return;
    setLoading(true);
    setError('');
    try {
      let avatarUrl: string | null = null;

      // 1. Upload photo if one was chosen.
      if (photoBase64) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          const res = await fetch(`${API_BASE}/api/upload-celebrity-avatar`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              user_id: user.id,
              image_base64: photoBase64,
              content_type: photoContentType || 'image/jpeg',
            }),
          });
          const data = await res.json();
          if (data?.avatar_url) {
            avatarUrl = data.avatar_url;
            await setProfilePhoto(data.avatar_url);
          }
        } catch (e) {
          // Photo upload failure should not block account creation.
          console.warn('[WelcomeAuth] avatar upload failed', e);
        }
      }

      // 2. Update the profile row.
      await supabase
        .from('profiles')
        .update({
          display_name: name.trim(),
          bio: bio.trim() || null,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        })
        .eq('id', user.id);

      // Profile saved -> stop rendering this screen and reveal the app.
      setProfileDone(true);
    } catch (err: any) {
      setError(err?.message || "Impossible d'enregistrer le profil");
    } finally {
      setLoading(false);
    }
  };

  if (profileDone) return null;

  // If user is authenticated and we are NOT in the profile step and not waiting
  // for the profile check, render nothing (let the gate fall through).
  if (user && step !== 'profile' && !awaitingProfileCheck) {
    return null;
  }

  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.gradient}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand */}
          <View style={styles.brand}>
            <Text style={styles.brandName}>Plyz</Text>
            <View style={styles.brandAccent} />
          </View>

          {step === 'email' && (
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <Mail size={40} color="#10b981" />
              </View>
              <Text style={styles.title}>Bienvenue sur Plyz</Text>
              <Text style={styles.subtitle}>
                Connecte-toi ou crée ton compte gratuit en 30 secondes
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Ton adresse email"
                placeholderTextColor="#64748b"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!loading}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleSendCode}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Recevoir mon code</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.hint}>
                100% gratuit, sans engagement. Aucun mot de passe : tu recevras un code à 6 chiffres par email.
              </Text>
            </View>
          )}

          {step === 'code' && (
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <KeyRound size={40} color="#f59e0b" />
              </View>
              <Text style={styles.title}>Entre le code reçu par email</Text>
              <Text style={styles.subtitle}>
                Nous avons envoyé un code à 6 chiffres à {email.trim()}.
              </Text>

              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor="#64748b"
                value={code}
                onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoCapitalize="none"
                maxLength={6}
                editable={!loading}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (loading || code.length < 6) && styles.buttonDisabled,
                ]}
                onPress={handleVerifyCode}
                activeOpacity={0.85}
                disabled={loading || code.length < 6}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Valider</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleResendCode}
                disabled={loading}
                style={styles.linkButton}
              >
                <Text style={styles.linkGreen}>Renvoyer le code</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                }}
                style={styles.linkButton}
              >
                <Text style={styles.linkMuted}>Changer d'email</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'profile' && (
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <Sparkles size={40} color="#10b981" />
              </View>
              <Text style={styles.title}>Complète ton profil</Text>
              <Text style={styles.subtitle}>
                Encore une étape pour personnaliser ton compte.
              </Text>

              <TouchableOpacity
                style={styles.avatarPicker}
                onPress={pickPhoto}
                activeOpacity={0.85}
                disabled={loading}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Camera size={28} color="#10b981" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.avatarLabel}>
                {photoUri ? 'Changer la photo' : 'Ajouter une photo (optionnel)'}
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Ton nom"
                placeholderTextColor="#64748b"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!loading}
              />

              <TextInput
                style={[styles.input, styles.bioInput]}
                placeholder="Décris-toi en quelques mots (optionnel)"
                placeholderTextColor="#64748b"
                value={bio}
                onChangeText={(text) => setBio(text.slice(0, 200))}
                multiline
                maxLength={200}
                editable={!loading}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (loading || !name.trim()) && styles.buttonDisabled,
                ]}
                onPress={handleFinish}
                activeOpacity={0.85}
                disabled={loading || !name.trim()}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Terminer</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {awaitingProfileCheck && step !== 'profile' && (
            <View style={styles.card}>
              <ActivityIndicator color="#10b981" size="large" />
              <Text style={[styles.subtitle, { marginTop: 16 }]}>
                Connexion en cours...
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brandName: {
    fontSize: 44,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  brandAccent: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#10b981',
    marginTop: 8,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  codeInput: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 6,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  hint: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  linkButton: {
    paddingVertical: 6,
  },
  linkGreen: {
    fontSize: 14,
    color: '#10b981',
    textAlign: 'center',
    fontWeight: '600',
  },
  linkMuted: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  avatarPicker: {
    marginBottom: 8,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLabel: {
    fontSize: 13,
    color: '#10b981',
    marginBottom: 20,
  },
});
