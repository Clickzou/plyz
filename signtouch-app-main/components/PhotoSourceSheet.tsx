import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Camera, Images } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
}

// Feuille de choix « Appareil photo / Galerie » au thème de l'app, en remplacement
// de l'alerte système Android (boutons collés à droite, fond blanc). Réutilisée
// partout où l'on choisit une photo de profil, pour une expérience cohérente.
export default function PhotoSourceSheet({ visible, onClose, onCamera, onGallery }: Props) {
  const { t } = useLanguage();
  // t() renvoie la clé elle-même si la traduction manque → on retombe sur le libellé FR.
  const tr = (k: string, fb: string) => {
    const v = t(k as any);
    return v && v !== k ? v : fb;
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
          <Text style={styles.title}>{tr('profilePhotoTitle', 'Photo de profil')}</Text>
          <Text style={styles.subtitle}>
            {tr('profilePhotoChooseSource', 'Comment veux-tu ajouter ta photo ?')}
          </Text>

          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.8}
            onPress={() => { onClose(); onCamera(); }}
          >
            <View style={styles.icon}><Camera size={22} color="#10b981" /></View>
            <Text style={styles.optionText}>{tr('camera', 'Appareil photo')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.8}
            onPress={() => { onClose(); onGallery(); }}
          >
            <View style={styles.icon}><Images size={22} color="#10b981" /></View>
            <Text style={styles.optionText}>{tr('gallery', 'Galerie')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancel} activeOpacity={0.8} onPress={onClose}>
            <Text style={styles.cancelText}>{tr('cancel', 'Annuler')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancel: {
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#cbd5e1',
  },
});
