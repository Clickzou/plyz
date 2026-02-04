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

const DOCUMENT_TITLES: { [key: string]: { [doc: string]: string } } = {
  fr: {
    cgu: "Conditions Générales d'Utilisation",
    cgv: 'Conditions Générales de Vente',
    privacy: 'Politique de Confidentialité',
    mentions: 'Mentions Légales',
    header: 'Documents Légaux',
    intro: 'Consultez nos documents légaux pour comprendre comment fonctionne SignTouch et comment nous protégeons vos données.',
    contact: 'Pour toute question, contactez-nous :',
  },
  en: {
    cgu: 'Terms of Use',
    cgv: 'Terms of Sale',
    privacy: 'Privacy Policy',
    mentions: 'Legal Notices',
    header: 'Legal Documents',
    intro: 'Review our legal documents to understand how SignTouch works and how we protect your data.',
    contact: 'For any questions, contact us:',
  },
  es: {
    cgu: 'Condiciones de Uso',
    cgv: 'Condiciones de Venta',
    privacy: 'Política de Privacidad',
    mentions: 'Aviso Legal',
    header: 'Documentos Legales',
    intro: 'Consulte nuestros documentos legales para entender cómo funciona SignTouch y cómo protegemos sus datos.',
    contact: 'Para cualquier pregunta, contáctenos:',
  },
  de: {
    cgu: 'Nutzungsbedingungen',
    cgv: 'Verkaufsbedingungen',
    privacy: 'Datenschutzrichtlinie',
    mentions: 'Impressum',
    header: 'Rechtliche Dokumente',
    intro: 'Lesen Sie unsere rechtlichen Dokumente, um zu verstehen, wie SignTouch funktioniert und wie wir Ihre Daten schützen.',
    contact: 'Bei Fragen kontaktieren Sie uns:',
  },
  it: {
    cgu: 'Condizioni di Utilizzo',
    cgv: 'Condizioni di Vendita',
    privacy: 'Informativa sulla Privacy',
    mentions: 'Note Legali',
    header: 'Documenti Legali',
    intro: 'Consulta i nostri documenti legali per capire come funziona SignTouch e come proteggiamo i tuoi dati.',
    contact: 'Per qualsiasi domanda, contattaci:',
  },
  pt: {
    cgu: 'Condições de Utilização',
    cgv: 'Condições de Venda',
    privacy: 'Política de Privacidade',
    mentions: 'Avisos Legais',
    header: 'Documentos Legais',
    intro: 'Consulte os nossos documentos legais para entender como o SignTouch funciona e como protegemos os seus dados.',
    contact: 'Para qualquer dúvida, contacte-nos:',
  },
  ru: {
    cgu: 'Условия использования',
    cgv: 'Условия продажи',
    privacy: 'Политика конфиденциальности',
    mentions: 'Юридическая информация',
    header: 'Юридические документы',
    intro: 'Ознакомьтесь с нашими юридическими документами, чтобы понять, как работает SignTouch и как мы защищаем ваши данные.',
    contact: 'По любым вопросам свяжитесь с нами:',
  },
  ja: {
    cgu: '利用規約',
    cgv: '販売条件',
    privacy: 'プライバシーポリシー',
    mentions: '法的通知',
    header: '法的文書',
    intro: 'SignTouchの仕組みと、お客様のデータをどのように保護しているかを理解するために、法的文書をご確認ください。',
    contact: 'ご質問はこちらまで：',
  },
  zh: {
    cgu: '使用条款',
    cgv: '销售条款',
    privacy: '隐私政策',
    mentions: '法律声明',
    header: '法律文件',
    intro: '查看我们的法律文件，了解SignTouch如何运作以及我们如何保护您的数据。',
    contact: '如有任何问题，请联系我们：',
  },
  ar: {
    cgu: 'شروط الاستخدام',
    cgv: 'شروط البيع',
    privacy: 'سياسة الخصوصية',
    mentions: 'إشعارات قانونية',
    header: 'المستندات القانونية',
    intro: 'اطلع على مستنداتنا القانونية لفهم كيفية عمل SignTouch وكيف نحمي بياناتك.',
    contact: 'لأي استفسار، تواصل معنا:',
  },
  hi: {
    cgu: 'उपयोग की शर्तें',
    cgv: 'बिक्री की शर्तें',
    privacy: 'गोपनीयता नीति',
    mentions: 'कानूनी सूचनाएं',
    header: 'कानूनी दस्तावेज़',
    intro: 'SignTouch कैसे काम करता है और हम आपके डेटा की कैसे सुरक्षा करते हैं, यह समझने के लिए हमारे कानूनी दस्तावेज़ देखें।',
    contact: 'किसी भी प्रश्न के लिए, हमसे संपर्क करें:',
  },
  bn: {
    cgu: 'ব্যবহারের শর্তাবলী',
    cgv: 'বিক্রয়ের শর্তাবলী',
    privacy: 'গোপনীয়তা নীতি',
    mentions: 'আইনি বিজ্ঞপ্তি',
    header: 'আইনি নথি',
    intro: 'SignTouch কীভাবে কাজ করে এবং আমরা কীভাবে আপনার ডেটা রক্ষা করি তা বুঝতে আমাদের আইনি নথি পর্যালোচনা করুন।',
    contact: 'যেকোনো প্রশ্নের জন্য, আমাদের সাথে যোগাযোগ করুন:',
  },
  ur: {
    cgu: 'استعمال کی شرائط',
    cgv: 'فروخت کی شرائط',
    privacy: 'رازداری کی پالیسی',
    mentions: 'قانونی نوٹس',
    header: 'قانونی دستاویزات',
    intro: 'SignTouch کیسے کام کرتا ہے اور ہم آپ کے ڈیٹا کی حفاظت کیسے کرتے ہیں، یہ سمجھنے کے لیے ہماری قانونی دستاویزات دیکھیں۔',
    contact: 'کسی بھی سوال کے لیے، ہم سے رابطہ کریں:',
  },
  ms: {
    cgu: 'Syarat Penggunaan',
    cgv: 'Syarat Jualan',
    privacy: 'Dasar Privasi',
    mentions: 'Notis Undang-undang',
    header: 'Dokumen Undang-undang',
    intro: 'Semak dokumen undang-undang kami untuk memahami cara SignTouch berfungsi dan cara kami melindungi data anda.',
    contact: 'Untuk sebarang pertanyaan, hubungi kami:',
  },
  id: {
    cgu: 'Syarat Penggunaan',
    cgv: 'Syarat Penjualan',
    privacy: 'Kebijakan Privasi',
    mentions: 'Pemberitahuan Hukum',
    header: 'Dokumen Hukum',
    intro: 'Tinjau dokumen hukum kami untuk memahami cara kerja SignTouch dan cara kami melindungi data Anda.',
    contact: 'Untuk pertanyaan apa pun, hubungi kami:',
  },
};

export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentLanguage } = useLanguage();
  const [selectedDoc, setSelectedDoc] = useState<LegalDocument>(null);

  const lang = currentLanguage || 'fr';
  const titles = DOCUMENT_TITLES[lang] || DOCUMENT_TITLES.fr;

  const getDocumentContent = (docId: 'cgv' | 'cgu' | 'privacy' | 'mentions'): string => {
    const contentMap = {
      cgu: CGU_CONTENT,
      cgv: CGV_CONTENT,
      privacy: PRIVACY_CONTENT,
      mentions: MENTIONS_CONTENT,
    } as const;
    const content = contentMap[docId];
    return content[lang] || content.fr || '';
  };

  const DOCUMENTS = [
    { id: 'cgu' as LegalDocument, title: titles.cgu, icon: FileText },
    { id: 'cgv' as LegalDocument, title: titles.cgv, icon: Scale },
    { id: 'privacy' as LegalDocument, title: titles.privacy, icon: Shield },
    { id: 'mentions' as LegalDocument, title: titles.mentions, icon: Building },
  ];

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
          {selectedDoc ? selectedDocument?.title : titles.header}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {!selectedDoc ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.intro}>
            {titles.intro}
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
            {titles.contact}{'\n'}
            contact@clickzou.fr
          </Text>
        </ScrollView>
      ) : selectedDoc ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.docContent}>
          <Text style={styles.docText}>{getDocumentContent(selectedDoc)}</Text>
        </ScrollView>
      ) : null}
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
