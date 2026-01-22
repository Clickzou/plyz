import { getSubscriptionStatus, getLastSubscriptionOfferDate } from './subscriptionStorage';

const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

let subscriptionOfferCallback: (() => void) | null = null;

export function setSubscriptionOfferCallback(callback: () => void) {
  console.log('[Subscription] Callback registered');
  subscriptionOfferCallback = callback;
}

export async function maybeShowSubscriptionOffer(): Promise<boolean> {
  try {
    console.log('[Subscription] Checking if should show offer...');
    console.log('[Subscription] Callback exists:', !!subscriptionOfferCallback);

    const status = await getSubscriptionStatus();
    console.log('[Subscription] Status:', status);

    // Si l'utilisateur est déjà payant, ne jamais montrer l'offre
    if (status === 'paid') {
      console.log('[Subscription] User is paid, skipping offer');
      return false;
    }

    const lastOfferDate = await getLastSubscriptionOfferDate();
    console.log('[Subscription] Last offer date:', lastOfferDate ? new Date(lastOfferDate).toISOString() : 'null');

    // Premier affichage : si lastOfferDate est null
    if (lastOfferDate === null) {
      console.log('[Subscription] First time showing offer (status free, lastOfferDate=null)');
      if (subscriptionOfferCallback) {
        console.log('[Subscription] Calling callback to show modal');
        subscriptionOfferCallback();
        return true;
      } else {
        console.warn('[Subscription] Callback is null, cannot show modal!');
        return false;
      }
    }

    // Affichages ultérieurs : si plus de 7 jours se sont écoulés
    const now = Date.now();
    const daysSinceLastOffer = (now - lastOfferDate) / SEVEN_DAYS_IN_MS;

    if (daysSinceLastOffer >= 1) {
      console.log(`[Subscription] Showing offer again (status free, lastOfferDate=${new Date(lastOfferDate).toISOString()}, ${Math.floor(daysSinceLastOffer * 7)} days ago)`);
      if (subscriptionOfferCallback) {
        subscriptionOfferCallback();
        return true;
      }
      return false;
    }

    console.log(`[Subscription] Not showing offer yet (last shown ${Math.floor(daysSinceLastOffer * 7)} days ago, need 7 days)`);
    return false;
  } catch (error) {
    console.error('[Subscription] Error checking if should show offer:', error);
    return false;
  }
}
