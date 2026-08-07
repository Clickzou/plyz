import { useEffect, useState } from 'react';
import { useAutoTranslate } from '@/utils/translation';

/**
 * Sous-titres d'une vidéo : ce qui est dit, et à quel moment.
 *
 * Le serveur les range à côté de la vidéo, sous le même nom suivi de
 * `-soustitres.json` — même convention que l'image de couverture, donc rien à
 * ajouter en base et rien à migrer pour les vidéos déjà publiées : le fichier
 * n'existe pas pour elles, la requête échoue en silence, et la vidéo s'affiche
 * comme avant.
 */
export interface SegmentSousTitre {
  /** Début, en secondes. */
  d: number;
  /** Fin, en secondes. */
  f: number;
  /** Ce qui est dit. */
  t: string;
}

interface Transcription {
  langue: string | null;
  segments: SegmentSousTitre[];
}

// Une même vidéo est montée et démontée sans cesse au défilement du fil : sans
// ce cache, on retéléchargerait le fichier à chaque passage.
const cache = new Map<string, Transcription | null>();

function urlSousTitres(uri: string): string | null {
  const sansParametres = uri.split('?')[0];
  if (!/\.[^./]+$/.test(sansParametres)) return null;
  return sansParametres.replace(/\.[^./]+$/, '-soustitres.json');
}

async function charger(uri: string): Promise<Transcription | null> {
  const url = urlSousTitres(uri);
  if (!url) return null;
  if (cache.has(uri)) return cache.get(uri) ?? null;

  try {
    const reponse = await fetch(url);
    if (!reponse.ok) {
      // 404 = vidéo publiée avant la mise en place des sous-titres, ou vidéo
      // sans parole. Ce n'est pas une panne.
      cache.set(uri, null);
      return null;
    }
    const donnees = await reponse.json();
    const segments = Array.isArray(donnees?.segments) ? donnees.segments : [];
    const transcription = segments.length ? { langue: donnees.langue ?? null, segments } : null;
    cache.set(uri, transcription);
    return transcription;
  } catch {
    cache.set(uri, null);
    return null;
  }
}

/**
 * Sous-titres d'une vidéo, traduits dans la langue du fan.
 *
 * La traduction passe par la machinerie déjà en place pour les publications et
 * les commentaires : même cache, même service. Tant qu'elle n'est pas revenue,
 * c'est le texte d'origine qui s'affiche — on ne fait jamais attendre.
 *
 * Renvoie `lignePour(seconde)` : la phrase à afficher à cet instant, ou une
 * chaîne vide pendant les silences.
 */
export function useSousTitres(uri: string | null | undefined) {
  const [segments, setSegments] = useState<SegmentSousTitre[]>([]);

  useEffect(() => {
    let vivant = true;
    if (!uri) {
      setSegments([]);
      return;
    }
    charger(uri).then((t) => {
      if (vivant) setSegments(t?.segments || []);
    });
    return () => {
      vivant = false;
    };
  }, [uri]);

  const tr = useAutoTranslate(segments.map((s) => s.t));

  return {
    aDesSousTitres: segments.length > 0,
    lignePour: (seconde: number): string => {
      const segment = segments.find((s) => seconde >= s.d && seconde < s.f);
      return segment ? tr(segment.t) : '';
    },
  };
}
