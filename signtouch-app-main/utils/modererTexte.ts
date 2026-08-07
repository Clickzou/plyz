import { authedFetch } from '@/utils/authedFetch';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

/**
 * Un texte peut-il être publié dans la Fan zone ?
 *
 * Le filtre des liens et des numéros (`filtreCoordonnees`) attrape les
 * arnaques ; celui-ci attrape les insultes, le racisme, les menaces et le
 * harcèlement. Les deux sont nécessaires et ne se remplacent pas : un message
 * peut être parfaitement propre de coordonnées et rester une insulte.
 *
 * Il laisse passer la critique — « il a été nul hier », un désaccord vif. Un
 * espace de fans où l'on ne pourrait dire que du bien n'est pas un espace de
 * fans, et personne n'y reviendrait.
 *
 * En cas de panne réseau, renvoie `true` : on ne bloque pas quelqu'un parce
 * qu'un service est indisponible. Le signalement et le blocage restent là.
 */
export async function texteAccepte(texte: string): Promise<boolean> {
  const valeur = String(texte || '').trim();
  if (!valeur) return true;
  try {
    const r = await authedFetch(`${API_BASE}/api/moderer-texte`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texte: valeur }),
    });
    if (!r.ok) return true;
    const d = await r.json();
    return d?.safe !== false;
  } catch {
    return true;
  }
}
