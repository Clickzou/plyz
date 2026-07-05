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
  Modal,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, KeyRound, Camera, Sparkles, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/utils/supabase';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'email' | 'code' | 'profile';

interface WelcomeAuthScreenProps {
  /** Quand true, le contenu est enveloppé dans un Modal plein écran avec une croix. */
  asModal?: boolean;
  /** Petit texte d'accroche affiché sous le titre (ex: « Crée ton compte pour ... »). */
  reason?: string;
  /** Appelé dès que la connexion + le profil sont validés. */
  onAuthenticated?: () => void;
  /** Appelé quand l'utilisateur ferme le modal (croix). Ignoré hors mode modal. */
  onClose?: () => void;
}

export default function WelcomeAuthScreen({
  asModal = false,
  reason,
  onAuthenticated,
  onClose,
}: WelcomeAuthScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const { user, sendOtpCode, verifyOtpCode } = useAuth();
  const { setProfilePhoto } = useCelebrityMode();
  const { t } = useLanguage();
  // Raccourci : t() renvoie la clé si absente → on garde un repli français lisible.
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const v = t(key as any, params);
    return v === key ? fallback : v;
  };

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Profile step state
  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoContentType, setPhotoContentType] = useState<string | null>(null);

  // After successful OTP verification we wait for `user` to be set, then decide
  // whether the profile is incomplete (-> show 'profile' step) or not (-> let
  // the gate fall through and enter the app).
  // Init à true si l'utilisateur est DÉJÀ connecté à l'ouverture (cas d'un profil
  // incomplet ouvert via requireAuth) : on lance la vérification de profil au montage.
  const [awaitingProfileCheck, setAwaitingProfileCheck] = useState<boolean>(!!user);

  // Once the profile step is finished we render nothing so the (already
  // authenticated) app behind the gate becomes visible.
  const [profileDone, setProfileDone] = useState(false);

  // Garde-fou pour n'appeler onAuthenticated qu'une seule fois.
  const [notifiedAuthenticated, setNotifiedAuthenticated] = useState(false);

  // Détermine si l'authentification (connexion + profil) est terminée :
  // - soit le profil vient d'être complété (profileDone),
  // - soit l'utilisateur est connecté avec un profil déjà complet (user présent,
  //   on n'est plus dans l'étape profil et on n'attend plus la vérification).
  const isFullyAuthenticated =
    profileDone || (!!user && step !== 'profile' && !awaitingProfileCheck);

  useEffect(() => {
    if (isFullyAuthenticated && !notifiedAuthenticated) {
      setNotifiedAuthenticated(true);
      onAuthenticated?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullyAuthenticated, notifiedAuthenticated]);

  useEffect(() => {
    if (!awaitingProfileCheck || !user?.id) return;
    let cancelled = false;

    const checkProfile = async () => {
      try {
        const { data, error: selErr } = await supabase
          .from('profiles')
          .select('display_name, first_name, last_name, address')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;

        // On error, do NOT block the user: let the gate enter the app.
        if (selErr) {
          setAwaitingProfileCheck(false);
          return;
        }

        // Profil complet = identité de facturation présente (prénom + nom + adresse).
        const hasBilling =
          !!(data?.first_name || '').trim() &&
          !!(data?.last_name || '').trim() &&
          !!(data?.address || '').trim();
        if (!hasBilling) {
          // Pré-remplit les champs déjà connus.
          setFirstName((data?.first_name || '').trim());
          setLastName((data?.last_name || '').trim());
          setAddress((data?.address || '').trim());
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
      setError(tr('waEmailInvalid', 'Adresse email invalide'));
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
      setError(err?.message || tr('waGenericError', 'Une erreur est survenue'));
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
      setError(err?.message || tr('waGenericError', 'Une erreur est survenue'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.trim().length < 6) {
      setError(tr('waCodeInvalid', 'Code invalide'));
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
      setError(err?.message || tr('waGenericError', 'Une erreur est survenue'));
    } finally {
      setLoading(false);
    }
  };

  const applyPhoto = (asset: ImagePicker.ImagePickerAsset) => {
    setPhotoUri(asset.uri);
    setPhotoBase64(asset.base64 || null);
    setPhotoContentType(asset.mimeType || 'image/jpeg');
    setError('');
  };

  const pickFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError(tr('waErrPhotoPerm', "Autorise l'accès à tes photos pour ajouter une image."));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
      });
      if (!result.canceled && result.assets[0]) applyPhoto(result.assets[0]);
    } catch (err: any) {
      setError(err?.message || tr('waErrPhotoLoad', 'Impossible de charger la photo'));
    }
  };

  const takeWithCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setError(tr('waErrCameraPerm', "Autorise l'accès à l'appareil photo pour prendre une photo."));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
      });
      if (!result.canceled && result.assets[0]) applyPhoto(result.assets[0]);
    } catch (err: any) {
      setError(err?.message || tr('waErrPhotoLoad', 'Impossible de charger la photo'));
    }
  };

  // Sur mobile : propose Appareil photo OU Galerie. Sur web : galerie directe
  // (l'appareil photo n'est pas disponible via ImagePicker sur navigateur).
  const pickPhoto = () => {
    if (Platform.OS === 'web') { pickFromLibrary(); return; }
    Alert.alert(
      tr('profilePhotoTitle', 'Photo de profil'),
      tr('profilePhotoChooseSource', 'Comment veux-tu ajouter ta photo ?'),
      [
        { text: tr('camera', 'Appareil photo'), onPress: () => takeWithCamera() },
        { text: tr('gallery', 'Galerie'), onPress: () => pickFromLibrary() },
        { text: tr('cancel', 'Annuler'), style: 'cancel' },
      ],
    );
  };

  const handleFinish = async () => {
    if (!user?.id) return;
    if (!firstName.trim() || !lastName.trim() || !address.trim()) {
      setError(tr('waErrNames', 'Renseigne ton prénom, ton nom et ton adresse pour continuer.'));
      return;
    }
    if (!name.trim()) {
      setError(tr('waErrPseudo', 'Choisis un pseudo public.'));
      return;
    }
    if (!photoBase64 && !photoUri) {
      setError(tr('waErrPhoto', 'Ajoute une photo de profil pour continuer.'));
      return;
    }
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
      // display_name (nom public) = pseudo si fourni, sinon « Prénom Nom ».
      const publicName = name.trim() || `${firstName.trim()} ${lastName.trim()}`.trim();
      await supabase
        .from('profiles')
        .update({
          display_name: publicName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          address: address.trim(),
          bio: bio.trim() || null,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        })
        .eq('id', user.id);

      // Profile saved -> stop rendering this screen and reveal the app.
      setProfileDone(true);
    } catch (err: any) {
      setError(err?.message || tr('waErrProfileSave', "Impossible d'enregistrer le profil"));
    } finally {
      setLoading(false);
    }
  };

  if (profileDone) return null;

  // If user is authenticated and we are NOT in the profile step and not waiting
  // for the profile check, render nothing (let the gate fall through / close the modal).
  if (user && step !== 'profile' && !awaitingProfileCheck) {
    return null;
  }

  const content = (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.gradient}>
      {asModal && (
        <TouchableOpacity
          style={[styles.modalCloseButton, { top: insets.top + 10 }]}
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X size={24} color="#fff" />
        </TouchableOpacity>
      )}
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
            {reason ? <Text style={styles.reasonText}>{reason}</Text> : null}
          </View>

          {step === 'email' && !awaitingProfileCheck && (
            <View style={styles.card}>
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>{tr('waFree', 'GRATUIT')}</Text>
              </View>
              <View style={styles.iconCircle}>
                <Mail size={40} color="#10b981" />
              </View>
              <Text style={styles.title}>{tr('waWelcomeTitle', 'Bienvenue sur Plyz')}</Text>
              <Text style={styles.subtitle}>
                {tr('waWelcomeSubtitle', 'Crée ton compte gratuit en 30 secondes (ou connecte-toi)')}
              </Text>

              <TextInput
                style={styles.input}
                placeholder={tr('waEmailPlaceholder', 'Ton adresse email')}
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
                  <Text style={styles.primaryButtonText}>{tr('waSendCode', 'Recevoir mon code')}</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.hint}>
                {tr('waEmailHint', '100% gratuit, sans engagement. Aucun mot de passe : tu recevras un code à 6 chiffres par email.')}
              </Text>
            </View>
          )}

          {step === 'code' && (
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <KeyRound size={40} color="#f59e0b" />
              </View>
              <Text style={styles.title}>{tr('waCodeTitle', 'Entre le code reçu par email')}</Text>
              <Text style={styles.subtitle}>
                {tr('waCodeSubtitle', `Nous avons envoyé un code à 6 chiffres à ${email.trim()}.`, { email: email.trim() })}
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
                  <Text style={styles.primaryButtonText}>{tr('waValidate', 'Valider')}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleResendCode}
                disabled={loading}
                style={styles.linkButton}
              >
                <Text style={styles.linkGreen}>{tr('waResend', 'Renvoyer le code')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                }}
                style={styles.linkButton}
              >
                <Text style={styles.linkMuted}>{tr('waChangeEmail', "Changer d'email")}</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'profile' && (
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <Sparkles size={40} color="#10b981" />
              </View>
              <Text style={styles.title}>{tr('waProfileTitle', 'Tes informations')}</Text>
              <Text style={styles.subtitle}>
                {tr('waProfileSubtitle', 'Ta photo et ton pseudo seront visibles publiquement. Ton prénom, ton nom et ton adresse restent privés : ils sont nécessaires pour établir tes factures de paiement, téléchargeables depuis ton compte.')}
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
                {photoUri ? tr('waChangePhoto', 'Changer la photo') : tr('waAddPhoto', 'Ajouter une photo *')}
              </Text>

              <TextInput
                style={styles.input}
                placeholder={tr('waFirstName', 'Prénom *')}
                placeholderTextColor="#64748b"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoComplete="name-given"
                editable={!loading}
              />

              <TextInput
                style={styles.input}
                placeholder={tr('waLastName', 'Nom *')}
                placeholderTextColor="#64748b"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoComplete="name-family"
                editable={!loading}
              />

              <TextInput
                style={[styles.input, styles.bioInput]}
                placeholder={tr('waAddress', 'Adresse (n°, rue, code postal, ville, pays) *')}
                placeholderTextColor="#64748b"
                value={address}
                onChangeText={setAddress}
                multiline
                autoComplete="street-address"
                editable={!loading}
              />

              <TextInput
                style={styles.input}
                placeholder={tr('waPseudo', 'Pseudo public *')}
                placeholderTextColor="#64748b"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!loading}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (loading || !firstName.trim() || !lastName.trim() || !address.trim() ||
                    !name.trim() || (!photoBase64 && !photoUri)) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleFinish}
                activeOpacity={0.85}
                disabled={
                  loading || !firstName.trim() || !lastName.trim() || !address.trim() ||
                  !name.trim() || (!photoBase64 && !photoUri)
                }
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{tr('waFinish', 'Terminer')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {awaitingProfileCheck && step !== 'profile' && (
            <View style={styles.card}>
              <ActivityIndicator color="#10b981" size="large" />
              <Text style={[styles.subtitle, { marginTop: 16 }]}>
                {tr('waConnecting', 'Connexion en cours...')}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );

  if (asModal) {
    return (
      <Modal
        visible
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
      >
        {content}
      </Modal>
    );
  }

  return content;
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
  modalCloseButton: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reasonText: {
    fontSize: 15,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 16,
    paddingHorizontal: 12,
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
    overflow: 'hidden',
    position: 'relative',
  },
  freeBadge: {
    position: 'absolute',
    top: 16,
    right: -36,
    backgroundColor: '#10b981',
    paddingHorizontal: 42,
    paddingVertical: 5,
    transform: [{ rotate: '45deg' }],
    zIndex: 10,
  },
  freeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
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
