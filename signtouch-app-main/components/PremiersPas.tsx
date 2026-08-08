import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { Check, Sparkles } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useAutoTranslate } from '@/utils/translation';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface Proposition {
  slug: string;
  nom: string;
  metier?: string | null;
  pays?: string | null;
}

const FAMILLES = ['football', 'musique', 'web', 'cinema'];

/**
 * Le premier pas d'un nouveau venu.
 *
 * Sans lui, un fan qui ouvre la Fan zone pour la première fois trouve une
 * page vide et le message « Suis une personnalité pour entrer ». C'est la
 * pire porte d'entrée possible : on lui demande de faire une chose sans lui
 * dire laquelle, ni où la trouver.
 *
 * Ici on propose, il touche, c'est fait. Trois personnalités suffisent à
 * remplir sa Fan zone — et chaque nom réclamé est un signal de plus pour la
 * personne concernée.
 *
 * Il disparaît dès qu'on a réclamé quelqu'un : ce n'est pas un écran de
 * bienvenue à faire défiler, c'est un raccourci qui n'a plus lieu d'être une
 * fois qu'on est entré.
 */
export default function PremiersPas({ onTermine }: { onTermine?: () => void }) {
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();

  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);

  const trUI = useAutoTranslate([
    'Choisis 3 personnalités pour commencer',
    'Tu verras leur actualité, et tu entreras dans l’espace de leurs fans.',
    'C’est parti',
    'Passer',
    'Plus tu es nombreux à en réclamer une, plus elle a de raisons de venir.',
  ]);

  const charger = useCallback(async () => {
    try {
      // Un échantillon de familles différentes plutôt qu'une seule : proposer
      // dix footballeurs à quelqu'un qui vient pour la musique le ferait
      // partir. On mélange, il choisit.
      const listes = await Promise.all(
        FAMILLES.map((f) =>
          fetch(`${API_BASE}/api/reclamations/catalogue?famille=${f}`)
            .then((r) => r.json())
            .then((d) => (Array.isArray(d?.catalogue) ? d.catalogue.slice(0, 6) : []))
            .catch(() => []),
        ),
      );
      // Entrelacé : une de chaque famille à tour de rôle, pour que les quatre
      // apparaissent dès les premières lignes.
      const melange: Proposition[] = [];
      for (let i = 0; i < 6; i++) {
        for (const liste of listes) if (liste[i]) melange.push(liste[i]);
      }
      setPropositions(melange.slice(0, 18));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const basculer = (slug: string) => {
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  };

  const valider = () => {
    if (!choisis.size) { onTermine?.(); return; }
    requireAuth(async () => {
      setEnvoi(true);
      try {
        const noms = propositions.filter((p) => choisis.has(p.slug)).map((p) => p.nom);
        // Une réclamation par personnalité choisie. On ne demande pas ici ce
        // que le fan veut ni ce qu'il mettrait : à la première seconde, on
        // n'interroge pas quelqu'un qui n'a encore rien vu. Il précisera plus
        // tard, depuis « Réclame ta star ».
        const { data: { session } } = await supabase.auth.getSession();
        await Promise.all(noms.map((nom) =>
          fetch(`${API_BASE}/api/reclamer`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({ nom }),
          }).catch(() => null),
        ));
      } finally {
        setEnvoi(false);
        onTermine?.();
      }
    }, { reason: trUI('Choisis 3 personnalités pour commencer'), requireBillingIdentity: false });
  };

  if (chargement) {
    return <ActivityIndicator color="#10b981" style={{ marginVertical: 24 }} />;
  }
  if (!propositions.length) return null;

  return (
    <View style={styles.carte}>
      <View style={styles.entete}>
        <Sparkles size={17} color="#f59e0b" />
        <Text style={styles.titre}>{trUI('Choisis 3 personnalités pour commencer')}</Text>
      </View>
      <Text style={styles.aide}>
        {trUI('Tu verras leur actualité, et tu entreras dans l’espace de leurs fans.')}
      </Text>

      <ScrollView
        horizontal={false}
        style={{ maxHeight: 260 }}
        contentContainerStyle={styles.grille}
        showsVerticalScrollIndicator={false}
      >
        {propositions.map((p) => {
          const pris = choisis.has(p.slug);
          return (
            <TouchableOpacity
              key={p.slug}
              style={[styles.puce, pris && styles.puceActive]}
              onPress={() => basculer(p.slug)}
              activeOpacity={0.85}
            >
              {pris && <Check size={13} color="#052e1f" />}
              <Text style={[styles.puceTxt, pris && styles.puceTxtActif]} numberOfLines={1}>
                {p.nom}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.note}>
        {trUI('Plus tu es nombreux à en réclamer une, plus elle a de raisons de venir.')}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => onTermine?.()} style={styles.passer} activeOpacity={0.8}>
          <Text style={styles.passerTxt}>{trUI('Passer')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.valider, (!choisis.size || envoi) && { opacity: 0.5 }]}
          onPress={valider}
          disabled={envoi}
          activeOpacity={0.85}
        >
          {envoi
            ? <ActivityIndicator size="small" color="#052e1f" />
            : <Text style={styles.validerTxt}>
                {trUI('C’est parti')}{choisis.size ? ` (${choisis.size})` : ''}
              </Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    marginHorizontal: 16, marginBottom: 12,
    padding: 14, borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.07)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  titre: { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },
  aide: { color: '#d1d5db', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    maxWidth: '100%',
  },
  puceActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  puceTxt: { color: '#e5e7eb', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  puceTxtActif: { color: '#052e1f', fontWeight: '800' },
  note: { color: '#9ca3af', fontSize: 12, lineHeight: 17, marginTop: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  passer: { paddingVertical: 12, paddingHorizontal: 14 },
  passerTxt: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },
  valider: {
    flex: 1, backgroundColor: '#10b981', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  validerTxt: { color: '#052e1f', fontSize: 15, fontWeight: '800' },
});
