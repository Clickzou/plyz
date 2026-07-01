// Locale active pour le formatage des dates/heures, synchronisée avec la langue
// choisie dans l'app (mise à jour par LanguageContext). Évite les dates figées
// en français quand l'utilisateur est dans une autre langue.
let currentLocale = 'en';

export function setDateLocale(lang: string) {
  if (lang) currentLocale = lang;
}

export function getDateLocale(): string {
  return currentLocale;
}
