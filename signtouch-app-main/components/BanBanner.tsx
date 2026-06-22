import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { showAlert } from '@/utils/alertHelper';
import { banUntilText } from '@/utils/banGuard';

/**
 * N'affiche rien en permanence : montre UNE SEULE FOIS au lancement de l'app un
 * message d'avertissement si le compte est suspendu (le blocage des paiements,
 * lui, est géré au moment de payer via ensureCanPay).
 */
export default function BanBanner() {
  const { isBanned, banReason, banUntil } = useAuth();
  const shownRef = useRef(false);

  useEffect(() => {
    if (isBanned && !shownRef.current) {
      shownRef.current = true;
      showAlert(
        'Compte suspendu',
        `Votre compte est suspendu ${banUntilText(banUntil)}.\n` +
        `Vous pouvez continuer à utiliser l'application, mais les paiements et achats sont désactivés.` +
        (banReason ? `\n\nMotif : ${banReason}` : '')
      );
    }
  }, [isBanned, banUntil, banReason]);

  return null;
}
