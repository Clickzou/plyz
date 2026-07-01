import { showAlert } from './alertHelper';
import { getDateLocale } from '@/utils/dateLocale';

// Texte lisible de la date de fin de bannissement.
export const banUntilText = (banUntil: string | null): string => {
  if (!banUntil) return 'définitivement';
  try {
    return `jusqu'au ${new Date(banUntil).toLocaleDateString(getDateLocale(), { day: '2-digit', month: 'long', year: 'numeric' })}`;
  } catch {
    return 'définitivement';
  }
};

/**
 * À appeler AVANT toute action payante. Si le compte est banni, affiche un
 * message d'avertissement (avec le délai) et renvoie false pour bloquer le paiement.
 */
export const ensureCanPay = (isBanned: boolean, banUntil: string | null): boolean => {
  if (!isBanned) return true;
  showAlert(
    'Paiement indisponible',
    `Votre compte est suspendu ${banUntilText(banUntil)}.\n` +
    `Vous ne pouvez pas effectuer de paiement ni d'achat pendant cette période.`
  );
  return false;
};
