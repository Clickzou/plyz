import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, FileText, Shield, Scale, Building } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { CGV_CONTENT, CGU_CONTENT, PRIVACY_CONTENT, MENTIONS_CONTENT } from '@/assets/legal';

type LegalDocument = 'cgv' | 'cgu' | 'privacy' | 'mentions' | null;

const DOCUMENTS = [
  { id: 'cgu' as LegalDocument, title: "Conditions Générales d'Utilisation", icon: FileText, content: CGU_CONTENT },
  { id: 'cgv' as LegalDocument, title: 'Conditions Générales de Vente', icon: Scale, content: CGV_CONTENT },
  { id: 'privacy' as LegalDocument, title: 'Politique de Confidentialité', icon: Shield, content: PRIVACY_CONTENT },
  { id: 'mentions' as LegalDocument, title: 'Mentions Légales', icon: Building, content: MENTIONS_CONTENT },
];

export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [selectedDoc, setSelectedDoc] = useState<LegalDocument>(null);

  const selectedDocument = DOCUMENTS.find(d => d.id === selectedDoc);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => selectedDoc ? setSelectedDoc(null) : router.back()}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {selectedDoc ? selectedDocument?.title : 'Documents Légaux'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {!selectedDoc ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.intro}>
            Consultez nos documents légaux pour comprendre comment fonctionne SignTouch et comment nous protégeons vos données.
          </Text>

          {DOCUMENTS.map((doc) => {
            const Icon = doc.icon;
            return (
              <TouchableOpacity
                key={doc.id}
                style={styles.docCard}
                onPress={() => setSelectedDoc(doc.id)}
              >
                <View style={styles.docIcon}>
                  <Icon size={24} color="#4ade80" />
                </View>
                <Text style={styles.docTitle}>{doc.title}</Text>
                <ArrowLeft size={20} color="rgba(255,255,255,0.5)" style={{ transform: [{ rotate: '180deg' }] }} />
              </TouchableOpacity>
            );
          })}

          <Text style={styles.contact}>
            Pour toute question, contactez-nous :{'\n'}
            contact@clickzou.fr
          </Text>
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.docContent}>
          <Text style={styles.docText}>{selectedDocument?.content}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  intro: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  docIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  docTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  contact: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 22,
  },
  docContent: {
    padding: 20,
    paddingBottom: 40,
  },
  docText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 24,
  },
});
