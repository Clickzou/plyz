import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { useTranslation } from '@/contexts/LanguageContext';

// Même serveur que le reste de l'app (sur web : chemin relatif via le proxy).
const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// Cache mémoire (session) : `${lang}${texte}` -> traduction
const memCache = new Map<string, string>();
const STORE_PREFIX = '@tr_';
const cacheKey = (lang: string, text: string) => `${lang}${text}`;

async function loadPersisted(lang: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(STORE_PREFIX + lang);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function persist(lang: string, entries: Record<string, string>) {
  try {
    const existing = await loadPersisted(lang);
    await AsyncStorage.setItem(STORE_PREFIX + lang, JSON.stringify({ ...existing, ...entries }));
  } catch {
    /* le cache disque est best-effort */
  }
}

/**
 * Traduit une liste de textes vers `targetLang`. Renvoie les traductions dans le
 * même ordre. Ne bloque jamais l'affichage : en cas d'erreur réseau, renvoie
 * les textes d'origine. Chaque texte n'est traduit qu'une fois (cache mémoire +
 * disque côté app, cache en base côté serveur).
 */
export async function translateTexts(texts: string[], targetLang: string): Promise<string[]> {
  if (!texts.length || !targetLang) return texts;

  const persisted = await loadPersisted(targetLang);
  const resolved: (string | null)[] = texts.map((t) => {
    if (!t || !t.trim()) return t;
    const k = cacheKey(targetLang, t);
    if (memCache.has(k)) return memCache.get(k)!;
    if (persisted[t] !== undefined) {
      memCache.set(k, persisted[t]);
      return persisted[t];
    }
    return null; // à traduire
  });

  const toTranslate = Array.from(
    new Set(texts.filter((t, i) => resolved[i] === null && t && t.trim()))
  );
  if (toTranslate.length === 0) return resolved.map((r, i) => r ?? texts[i]);

  try {
    const resp = await fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: toTranslate, targetLang }),
    });
    if (!resp.ok) throw new Error('translate http ' + resp.status);
    const data = await resp.json();
    const arr: string[] = data.translations || [];
    const newEntries: Record<string, string> = {};
    toTranslate.forEach((src, i) => {
      const tr = arr[i] ?? src;
      memCache.set(cacheKey(targetLang, src), tr);
      newEntries[src] = tr;
    });
    persist(targetLang, newEntries);
  } catch {
    return texts; // jamais de blocage : on garde l'original
  }

  return texts.map((t) =>
    t && t.trim() ? memCache.get(cacheKey(targetLang, t)) ?? t : t
  );
}

/**
 * Hook : passe la liste des textes affichés à l'écran, récupère une fonction
 * `tr(text)` qui renvoie la version dans la langue de l'utilisateur (ou le
 * texte d'origine tant que la traduction n'est pas arrivée).
 */
export function useAutoTranslate(texts: (string | null | undefined)[]): (text: string | null | undefined) => string {
  const { language } = useTranslation();
  const [map, setMap] = useState<Record<string, string>>({});
  const list = texts.filter((t): t is string => !!t && t.trim().length > 0);
  const joinKey = list.join('');

  useEffect(() => {
    let alive = true;
    if (!list.length) {
      setMap({});
      return;
    }
    translateTexts(list, language)
      .then((res) => {
        if (!alive) return;
        const m: Record<string, string> = {};
        list.forEach((t, i) => {
          m[t] = res[i];
        });
        setMap(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinKey, language]);

  return (text) => (text && map[text] ? map[text] : text || '');
}
