import { isAccountPromptSnoozed } from './postPurchaseAccountStorage';

let postPurchaseAccountCallback: (() => void) | null = null;
let manualAccountModalCallback: (() => void) | null = null;

export function setPostPurchaseAccountCallback(callback: () => void) {
  console.log('[PostPurchaseAccount] Callback registered');
  postPurchaseAccountCallback = callback;
}

export function setManualAccountModalCallback(callback: () => void) {
  console.log('[PostPurchaseAccount] Manual callback registered');
  manualAccountModalCallback = callback;
}

export function showAccountModal(): boolean {
  if (manualAccountModalCallback) {
    console.log('[PostPurchaseAccount] Manually showing modal');
    manualAccountModalCallback();
    return true;
  } else {
    console.warn('[PostPurchaseAccount] Manual callback is null, cannot show modal');
    return false;
  }
}

export async function maybeShowPostPurchaseAccountModal(
  purchaseSuccess: boolean,
  isUserConnected: boolean
): Promise<boolean> {
  try {
    console.log('[PostPurchaseAccount] Checking if should show modal...');
    console.log('[PostPurchaseAccount] Purchase success:', purchaseSuccess);
    console.log('[PostPurchaseAccount] User connected:', isUserConnected);
    console.log('[PostPurchaseAccount] Callback exists:', !!postPurchaseAccountCallback);

    if (!purchaseSuccess) {
      console.log('[PostPurchaseAccount] No purchase success, skipping');
      return false;
    }

    if (isUserConnected) {
      console.log('[PostPurchaseAccount] User already connected, skipping');
      return false;
    }

    const isSnoozed = await isAccountPromptSnoozed();
    console.log('[PostPurchaseAccount] Is snoozed:', isSnoozed);

    if (isSnoozed) {
      console.log('[PostPurchaseAccount] Modal snoozed, skipping');
      return false;
    }

    if (postPurchaseAccountCallback) {
      console.log('[PostPurchaseAccount] Showing modal');
      postPurchaseAccountCallback();
      return true;
    } else {
      console.warn('[PostPurchaseAccount] Callback is null, cannot show modal');
      return false;
    }
  } catch (error) {
    console.error('[PostPurchaseAccount] Error checking if should show modal:', error);
    return false;
  }
}
