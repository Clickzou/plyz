import en from './en';
import fr from './fr';
import es from './es';
import de from './de';
import pt from './pt';
import it from './it';
import hi from './hi';
import ur from './ur';
import ar from './ar';
import zh from './zh';
import bn from './bn';
import ru from './ru';
import id from './id';
import ja from './ja';
import ms from './ms';

// Map all locales to supported languages
const localeMap: Record<string, keyof typeof translations> = {
  // English
  'en': 'en', 'en-US': 'en', 'en-GB': 'en', 'en-AU': 'en', 'en-CA': 'en',
  // French
  'fr': 'fr', 'fr-FR': 'fr', 'fr-CA': 'fr', 'fr-BE': 'fr', 'fr-CH': 'fr',
  // Spanish
  'es': 'es', 'es-ES': 'es', 'es-MX': 'es', 'es-AR': 'es', 'es-CL': 'es', 'es-CO': 'es',
  // German
  'de': 'de', 'de-DE': 'de', 'de-AT': 'de', 'de-CH': 'de',
  // Portuguese
  'pt': 'pt', 'pt-PT': 'pt', 'pt-BR': 'pt',
  // Italian
  'it': 'it', 'it-IT': 'it', 'it-CH': 'it',
  // Chinese
  'zh': 'zh', 'zh-CN': 'zh', 'zh-TW': 'zh', 'zh-HK': 'zh',
  // Hindi
  'hi': 'hi', 'hi-IN': 'hi',
  // Arabic
  'ar': 'ar', 'ar-SA': 'ar', 'ar-EG': 'ar', 'ar-AE': 'ar',
  // Russian
  'ru': 'ru', 'ru-RU': 'ru',
  // Japanese
  'ja': 'ja', 'ja-JP': 'ja',
  // Indonesian
  'id': 'id', 'id-ID': 'id',
  // Bengali
  'bn': 'bn', 'bn-BD': 'bn', 'bn-IN': 'bn',
  // Urdu
  'ur': 'ur', 'ur-PK': 'ur',
  // Malay
  'ms': 'ms', 'ms-MY': 'ms',
  // Korean
  'ko': 'en', 'ko-KR': 'en',
  // Turkish
  'tr': 'en', 'tr-TR': 'en',
  // Polish
  'pl': 'en', 'pl-PL': 'en',
  // Dutch
  'nl': 'en', 'nl-NL': 'en', 'nl-BE': 'en',
  // Vietnamese
  'vi': 'en', 'vi-VN': 'en',
  // Thai
  'th': 'en', 'th-TH': 'en',
  // Ukrainian
  'uk': 'en', 'uk-UA': 'en',
  // Tamil
  'ta': 'en', 'ta-IN': 'en',
  // Telugu
  'te': 'en', 'te-IN': 'en',
  // Marathi
  'mr': 'en', 'mr-IN': 'en',
  // Farsi/Persian
  'fa': 'en', 'fa-IR': 'en',
  // Swahili
  'sw': 'en', 'sw-KE': 'en', 'sw-TZ': 'en',
  // Tagalog/Filipino
  'tl': 'en', 'fil': 'en', 'tl-PH': 'en', 'fil-PH': 'en',
  // Gujarati
  'gu': 'en', 'gu-IN': 'en',
  // Kannada
  'kn': 'en', 'kn-IN': 'en',
  // Punjabi
  'pa': 'en', 'pa-IN': 'en',
  // Romanian
  'ro': 'en', 'ro-RO': 'en',
  // Burmese
  'my': 'en', 'my-MM': 'en',
  // Yoruba
  'yo': 'en', 'yo-NG': 'en',
  // Hausa
  'ha': 'en', 'ha-NG': 'en',
};

export const translations = {
  en,
  fr,
  es,
  de,
  pt,
  it,
  hi,
  ur,
  ar,
  zh,
  bn,
  ru,
  id,
  ja,
  ms,
};

export type Language = keyof typeof translations;
export type TranslationKeys = keyof typeof en;

export const supportedLanguages: { code: Language; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
];

export function getLanguageFromLocale(locale: string): Language {
  const mapped = localeMap[locale] || localeMap[locale.split('-')[0]];
  return mapped || 'en';
}
