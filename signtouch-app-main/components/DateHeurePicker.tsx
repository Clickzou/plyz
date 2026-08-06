import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, ScrollView,
} from 'react-native';
import { getDateLocale } from '@/utils/dateLocale';
import { useAutoTranslate } from '@/utils/translation';

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Reçoit la date choisie, heure comprise. */
  onValider: (date: Date) => void;
  /** Point de départ du calendrier (défaut : maintenant + 1 h, arrondi). */
  valeurInitiale?: Date | null;
  titre?: string;
  /** Empêche de choisir une date passée. */
  interdirePasse?: boolean;
}

/**
 * Choix d'une date ET d'une heure, en un seul geste.
 *
 * Pourquoi : la personnalité devait taper « 2026-08-20T18:30 » à la main pour
 * proposer un créneau d'appel vidéo. Un format qui ne pardonne rien, sur un
 * clavier de téléphone, au moment précis où elle répond à un fan qui attend.
 */
export default function DateHeurePicker({
  visible, onClose, onValider, valeurInitiale, titre, interdirePasse = true,
}: Props) {
  const depart = valeurInitiale || new Date(Date.now() + 3600_000);
  const trUI = useAutoTranslate([
    'Choisir un créneau', 'Heures', 'Minutes', 'Valider', 'Annuler',
    'Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam',
  ]);

  const [mois, setMois] = useState(new Date(depart.getFullYear(), depart.getMonth(), 1));
  const [jour, setJour] = useState<number | null>(depart.getDate());
  const [heure, setHeure] = useState(depart.getHours());
  const [minute, setMinute] = useState(Math.round(depart.getMinutes() / 5) * 5 % 60);

  // Cases du mois affiché, décalées pour tomber sur le bon jour de semaine.
  const cases = (): (number | null)[] => {
    const premier = new Date(mois.getFullYear(), mois.getMonth(), 1).getDay();
    const nb = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: premier }, () => null),
      ...Array.from({ length: nb }, (_, i) => i + 1),
    ];
  };

  const estPasse = (j: number) => {
    if (!interdirePasse) return false;
    const d = new Date(mois.getFullYear(), mois.getMonth(), j, 23, 59, 59);
    return d.getTime() < Date.now();
  };

  const valider = () => {
    if (jour == null) return;
    onValider(new Date(mois.getFullYear(), mois.getMonth(), jour, heure, minute, 0, 0));
    onClose();
  };

  const aujourdhui = new Date();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.carte} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titre}>{titre || trUI('Choisir un créneau')}</Text>

          <View style={styles.entete}>
            <TouchableOpacity
              onPress={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}
              style={styles.navBtn}
            >
              <Text style={styles.navTexte}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.moisTexte}>
              {mois.toLocaleDateString(getDateLocale(), { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity
              onPress={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}
              style={styles.navBtn}
            >
              <Text style={styles.navTexte}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.ligneJours}>
            {JOURS.map((j) => (
              <Text key={j} style={styles.jourEntete}>{trUI(j)}</Text>
            ))}
          </View>

          <View style={styles.grille}>
            {cases().map((j, i) => {
              const choisi = j != null && j === jour;
              const cejour = j != null
                && aujourdhui.getDate() === j
                && aujourdhui.getMonth() === mois.getMonth()
                && aujourdhui.getFullYear() === mois.getFullYear();
              const passe = j != null && estPasse(j);
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.case_,
                    choisi && styles.caseChoisie,
                    cejour && !choisi && styles.caseAujourdhui,
                  ]}
                  onPress={() => j != null && !passe && setJour(j)}
                  disabled={j == null || passe}
                >
                  <Text style={[
                    styles.caseTexte,
                    choisi && styles.caseTexteChoisi,
                    passe && styles.caseTextePasse,
                  ]}>
                    {j || ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.colonnes}>
            <View style={styles.colonne}>
              <Text style={styles.colonneTitre}>{trUI('Heures')}</Text>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {Array.from({ length: 24 }, (_, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.item, heure === i && styles.itemChoisi]}
                    onPress={() => setHeure(i)}
                  >
                    <Text style={[styles.itemTexte, heure === i && styles.itemTexteChoisi]}>
                      {String(i).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={styles.separateur}>:</Text>

            <View style={styles.colonne}>
              <Text style={styles.colonneTitre}>{trUI('Minutes')}</Text>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.item, minute === m && styles.itemChoisi]}
                    onPress={() => setMinute(m)}
                  >
                    <Text style={[styles.itemTexte, minute === m && styles.itemTexteChoisi]}>
                      {String(m).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <TouchableOpacity style={styles.valider} onPress={valider} activeOpacity={0.85}>
            <Text style={styles.validerTexte}>{trUI('Valider')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.annuler} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.annulerTexte}>{trUI('Annuler')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  carte: {
    width: '100%', maxWidth: 380, backgroundColor: '#111827',
    borderRadius: 20, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  titre: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 14 },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  navTexte: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 26 },
  moisTexte: { color: '#fff', fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  ligneJours: { flexDirection: 'row', marginBottom: 4 },
  jourEntete: { flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700' },
  grille: { flexDirection: 'row', flexWrap: 'wrap' },
  case_: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
  },
  caseChoisie: { backgroundColor: '#6366f1', borderRadius: 999 },
  caseAujourdhui: { borderWidth: 1, borderColor: 'rgba(99,102,241,0.6)', borderRadius: 999 },
  caseTexte: { color: '#e5e7eb', fontSize: 14, fontWeight: '600' },
  caseTexteChoisi: { color: '#fff', fontWeight: '800' },
  caseTextePasse: { color: 'rgba(255,255,255,0.2)' },
  colonnes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 },
  colonne: { width: 88 },
  colonneTitre: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  scroll: { maxHeight: 132, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10 },
  item: { paddingVertical: 9, alignItems: 'center' },
  itemChoisi: { backgroundColor: '#6366f1' },
  itemTexte: { color: '#d1d5db', fontSize: 15, fontWeight: '600' },
  itemTexteChoisi: { color: '#fff', fontWeight: '800' },
  separateur: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 16 },
  valider: {
    marginTop: 16, backgroundColor: '#10b981', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  validerTexte: { color: '#052e1f', fontSize: 15, fontWeight: '800' },
  annuler: { paddingVertical: 12, alignItems: 'center' },
  annulerTexte: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
});
