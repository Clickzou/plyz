import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// Cache mémoire partagé : 1 seul appel réseau par célébrité, réutilisé sur tous
// les écrans (join, galerie, live…). null = pas de photo (on affichera l'initiale).
const avatarCache = new Map<string, string | null>();

interface Props {
  /** user_id de la célébrité (created_by pour un événement, celebrity_id pour un live). */
  celebrityId?: string | null;
  /** Nom, utilisé pour l'initiale de repli si aucune photo. */
  name?: string | null;
  /** Photo déjà connue (évite un appel réseau si on l'a déjà). */
  avatarUrl?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

// Affiche la PHOTO DE PROFIL de la célébrité (rassure le fan sur qui il rejoint/paie),
// avec repli sur l'initiale du nom. Récupère la photo via /api/celebrity/:id si besoin.
export default function CelebrityAvatar({ celebrityId, name, avatarUrl, size = 64, style }: Props) {
  const cached = celebrityId && avatarCache.has(celebrityId) ? avatarCache.get(celebrityId)! : undefined;
  const [url, setUrl] = useState<string | null>(avatarUrl || cached || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (avatarUrl) { setUrl(avatarUrl); return; }
    if (!celebrityId) return;
    if (avatarCache.has(celebrityId)) { setUrl(avatarCache.get(celebrityId)!); return; }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/celebrity/${celebrityId}`);
        const data = await res.json().catch(() => ({}));
        const found = data?.avatar_url || null;
        avatarCache.set(celebrityId, found);
        if (!cancelled) setUrl(found);
      } catch {
        avatarCache.set(celebrityId, null);
        if (!cancelled) setUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [celebrityId, avatarUrl]);

  const initial = (name || '').trim().charAt(0).toUpperCase() || '?';
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={[dim, styles.image, style as any]}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[dim, styles.fallback, style]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { borderWidth: 2, borderColor: '#10b981', backgroundColor: '#1e293b' },
  fallback: { backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center' },
  initial: { color: '#fff', fontWeight: '800' },
});
