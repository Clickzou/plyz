import { supabase } from './supabase';

export type FanTxStatus =
  | 'created'
  | 'store_confirmed'
  | 'refunded'
  | 'settled'
  | 'included_in_payout'
  | 'paid_out';

export interface FanTransaction {
  id: string;
  session_id: string;
  fan_id: string;
  fan_name: string | null;
  celebrity_id: string;
  celebrity_name: string | null;
  platform: 'apple' | 'google';
  product_id: string | null;
  gross_amount_cents: number;
  currency: string;
  store_transaction_id: string | null;
  purchase_token: string | null;
  store_order_id: string | null;
  status: FanTxStatus;
  store_confirmed_at: string | null;
  refunded_at: string | null;
  net_final_cents: number | null;
  net_currency: string | null;
  settled_at: string | null;
  celebrity_revshare_bps: number;
  created_at: string;
  updated_at: string;
}

export const recordTransaction = async (params: {
  sessionId: string;
  fanId: string;
  fanName?: string;
  celebrityId: string;
  celebrityName?: string;
  platform: 'apple' | 'google';
  productId?: string;
  grossAmountCents: number;
  currency?: string;
  storeTransactionId?: string;
  purchaseToken?: string;
  storeOrderId?: string;
  celebrityRevshareBps?: number;
}): Promise<FanTransaction | null> => {
  try {
    const { data: existing } = await supabase
      .from('fan_transactions')
      .select('id')
      .eq('session_id', params.sessionId)
      .eq('fan_id', params.fanId)
      .maybeSingle();

    if (existing) {
      console.log('[Transaction] Already recorded for this session/fan');
      return existing as any;
    }

    const { data, error } = await supabase
      .from('fan_transactions')
      .insert({
        session_id: params.sessionId,
        fan_id: params.fanId,
        fan_name: params.fanName || null,
        celebrity_id: params.celebrityId,
        celebrity_name: params.celebrityName || null,
        platform: params.platform,
        product_id: params.productId || null,
        gross_amount_cents: params.grossAmountCents,
        currency: params.currency || 'EUR',
        store_transaction_id: params.storeTransactionId || null,
        purchase_token: params.purchaseToken || null,
        store_order_id: params.storeOrderId || null,
        celebrity_revshare_bps: params.celebrityRevshareBps || 5200,
        status: 'created',
      })
      .select()
      .single();

    if (error) {
      console.error('[Transaction] Error recording:', error);
      return null;
    }

    console.log('[Transaction] Recorded:', data?.id);
    return data as FanTransaction;
  } catch (error) {
    console.error('[Transaction] Error recording:', error);
    return null;
  }
};

export const confirmStoreTransaction = async (
  transactionId: string,
  storeTransactionId?: string,
  purchaseToken?: string
): Promise<boolean> => {
  try {
    const updateData: any = {
      status: 'store_confirmed',
      store_confirmed_at: new Date().toISOString(),
    };
    if (storeTransactionId) updateData.store_transaction_id = storeTransactionId;
    if (purchaseToken) updateData.purchase_token = purchaseToken;

    const { error } = await supabase
      .from('fan_transactions')
      .update(updateData)
      .eq('id', transactionId);

    if (error) {
      console.error('[Transaction] Error confirming:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Transaction] Error confirming:', error);
    return false;
  }
};

export const markTransactionRefunded = async (transactionId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('fan_transactions')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
      })
      .eq('id', transactionId);

    if (error) {
      console.error('[Transaction] Error marking refund:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Transaction] Error marking refund:', error);
    return false;
  }
};

export const getTransactionsBySession = async (sessionId: string): Promise<FanTransaction[]> => {
  try {
    const { data, error } = await supabase
      .from('fan_transactions')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Transaction] Error fetching by session:', error);
      return [];
    }
    return (data || []) as FanTransaction[];
  } catch (error) {
    console.error('[Transaction] Error fetching by session:', error);
    return [];
  }
};

export const getTransactionsByCelebrity = async (celebrityId: string): Promise<FanTransaction[]> => {
  try {
    const { data, error } = await supabase
      .from('fan_transactions')
      .select('*')
      .eq('celebrity_id', celebrityId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Transaction] Error fetching by celebrity:', error);
      return [];
    }
    return (data || []) as FanTransaction[];
  } catch (error) {
    console.error('[Transaction] Error fetching by celebrity:', error);
    return [];
  }
};

export const formatCents = (cents: number, currency: string = 'EUR'): string => {
  const amount = cents / 100;
  const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
  const symbol = symbols[currency] || currency;
  return `${amount.toFixed(2)}${symbol}`;
};
