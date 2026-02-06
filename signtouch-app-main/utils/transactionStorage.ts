import { supabase } from './supabase';

export interface FanTransaction {
  id: string;
  session_id: string;
  queue_entry_id: string | null;
  fan_id: string;
  fan_name: string | null;
  celebrity_id: string;
  celebrity_name: string;
  amount_cents: number;
  currency: string;
  store_platform: 'apple' | 'google' | 'web' | 'unknown';
  store_fee_cents: number;
  signtouch_fee_cents: number;
  stripe_fee_cents: number;
  celebrity_net_cents: number;
  status: 'pending' | 'confirmed' | 'received_from_store' | 'paid_to_celebrity' | 'refunded' | 'cancelled';
  store_received_at: string | null;
  paid_to_celebrity_at: string | null;
  payout_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CelebrityPayout {
  id: string;
  celebrity_id: string;
  celebrity_name: string;
  period_start: string;
  period_end: string;
  total_gross_cents: number;
  total_store_fees_cents: number;
  total_signtouch_fees_cents: number;
  total_stripe_fees_cents: number;
  total_net_cents: number;
  transaction_count: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  paid_at: string | null;
  stripe_transfer_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CelebritySummary {
  celebrity_id: string;
  celebrity_name: string;
  total_transactions: number;
  total_gross_cents: number;
  total_net_cents: number;
  pending_payout_cents: number;
  last_transaction_at: string | null;
}

const STORE_FEE_PERCENT = 30;
const SIGNTOUCH_FEE_PERCENT = 15;
const STRIPE_FEE_PERCENT = 2.9;
const STRIPE_FEE_FIXED_CENTS = 30;

export const calculateFees = (amountCents: number, platform: string = 'unknown') => {
  const storeFee = Math.round(amountCents * STORE_FEE_PERCENT / 100);
  const afterStore = amountCents - storeFee;
  const signtouchFee = Math.round(afterStore * SIGNTOUCH_FEE_PERCENT / 100);
  const afterSigntouch = afterStore - signtouchFee;
  const stripeFee = Math.round(afterSigntouch * STRIPE_FEE_PERCENT / 100) + STRIPE_FEE_FIXED_CENTS;
  const celebrityNet = afterSigntouch - stripeFee;

  return {
    store_fee_cents: storeFee,
    signtouch_fee_cents: signtouchFee,
    stripe_fee_cents: stripeFee,
    celebrity_net_cents: Math.max(0, celebrityNet),
  };
};

export const recordTransaction = async (params: {
  sessionId: string;
  queueEntryId?: string;
  fanId: string;
  fanName?: string;
  celebrityId: string;
  celebrityName: string;
  amountCents: number;
  currency?: string;
  storePlatform?: 'apple' | 'google' | 'web' | 'unknown';
}): Promise<FanTransaction | null> => {
  try {
    if (params.queueEntryId) {
      const { data: existing } = await supabase
        .from('fan_transactions')
        .select('id')
        .eq('session_id', params.sessionId)
        .eq('fan_id', params.fanId)
        .eq('queue_entry_id', params.queueEntryId)
        .maybeSingle();

      if (existing) {
        console.log('Transaction already recorded for this call');
        return existing as any;
      }
    }

    const fees = calculateFees(params.amountCents, params.storePlatform);

    const { data, error } = await supabase
      .from('fan_transactions')
      .insert({
        session_id: params.sessionId,
        queue_entry_id: params.queueEntryId || null,
        fan_id: params.fanId,
        fan_name: params.fanName || null,
        celebrity_id: params.celebrityId,
        celebrity_name: params.celebrityName,
        amount_cents: params.amountCents,
        currency: params.currency || 'EUR',
        store_platform: params.storePlatform || 'unknown',
        ...fees,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error recording transaction:', error);
      return null;
    }

    return data as FanTransaction;
  } catch (error) {
    console.error('Error recording transaction:', error);
    return null;
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
      console.error('Error fetching transactions:', error);
      return [];
    }

    return (data || []) as FanTransaction[];
  } catch (error) {
    console.error('Error fetching transactions:', error);
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
      console.error('Error fetching transactions:', error);
      return [];
    }

    return (data || []) as FanTransaction[];
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
};

export const getAllTransactions = async (limit: number = 100): Promise<FanTransaction[]> => {
  try {
    const { data, error } = await supabase
      .from('fan_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching all transactions:', error);
      return [];
    }

    return (data || []) as FanTransaction[];
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    return [];
  }
};

export const getCelebritySummaries = async (): Promise<CelebritySummary[]> => {
  try {
    const { data, error } = await supabase
      .from('fan_transactions')
      .select('celebrity_id, celebrity_name, amount_cents, celebrity_net_cents, status, created_at');

    if (error) {
      console.error('Error fetching summaries:', error);
      return [];
    }

    const summaryMap = new Map<string, CelebritySummary>();

    for (const tx of (data || [])) {
      const existing = summaryMap.get(tx.celebrity_id);
      if (existing) {
        existing.total_transactions += 1;
        existing.total_gross_cents += tx.amount_cents;
        existing.total_net_cents += tx.celebrity_net_cents;
        if (tx.status !== 'paid_to_celebrity') {
          existing.pending_payout_cents += tx.celebrity_net_cents;
        }
        if (!existing.last_transaction_at || tx.created_at > existing.last_transaction_at) {
          existing.last_transaction_at = tx.created_at;
        }
      } else {
        summaryMap.set(tx.celebrity_id, {
          celebrity_id: tx.celebrity_id,
          celebrity_name: tx.celebrity_name,
          total_transactions: 1,
          total_gross_cents: tx.amount_cents,
          total_net_cents: tx.celebrity_net_cents,
          pending_payout_cents: tx.status !== 'paid_to_celebrity' ? tx.celebrity_net_cents : 0,
          last_transaction_at: tx.created_at,
        });
      }
    }

    return Array.from(summaryMap.values()).sort((a, b) => b.total_gross_cents - a.total_gross_cents);
  } catch (error) {
    console.error('Error fetching summaries:', error);
    return [];
  }
};

export const updateTransactionStatus = async (
  transactionId: string,
  status: FanTransaction['status']
): Promise<boolean> => {
  try {
    const updateData: any = { status, updated_at: new Date().toISOString() };

    if (status === 'received_from_store') {
      updateData.store_received_at = new Date().toISOString();
    } else if (status === 'paid_to_celebrity') {
      updateData.paid_to_celebrity_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('fan_transactions')
      .update(updateData)
      .eq('id', transactionId);

    if (error) {
      console.error('Error updating transaction:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating transaction:', error);
    return false;
  }
};

export const createPayout = async (params: {
  celebrityId: string;
  celebrityName: string;
  periodStart: string;
  periodEnd: string;
}): Promise<CelebrityPayout | null> => {
  try {
    const { data: transactions } = await supabase
      .from('fan_transactions')
      .select('*')
      .eq('celebrity_id', params.celebrityId)
      .eq('status', 'received_from_store')
      .gte('created_at', params.periodStart)
      .lte('created_at', params.periodEnd);

    if (!transactions || transactions.length === 0) {
      return null;
    }

    const totals = transactions.reduce((acc, tx) => ({
      gross: acc.gross + tx.amount_cents,
      storeFees: acc.storeFees + tx.store_fee_cents,
      signtouchFees: acc.signtouchFees + tx.signtouch_fee_cents,
      stripeFees: acc.stripeFees + tx.stripe_fee_cents,
      net: acc.net + tx.celebrity_net_cents,
    }), { gross: 0, storeFees: 0, signtouchFees: 0, stripeFees: 0, net: 0 });

    const { data: payout, error } = await supabase
      .from('celebrity_payouts')
      .insert({
        celebrity_id: params.celebrityId,
        celebrity_name: params.celebrityName,
        period_start: params.periodStart,
        period_end: params.periodEnd,
        total_gross_cents: totals.gross,
        total_store_fees_cents: totals.storeFees,
        total_signtouch_fees_cents: totals.signtouchFees,
        total_stripe_fees_cents: totals.stripeFees,
        total_net_cents: totals.net,
        transaction_count: transactions.length,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating payout:', error);
      return null;
    }

    const txIds = transactions.map(tx => tx.id);
    await supabase
      .from('fan_transactions')
      .update({ payout_id: payout.id, updated_at: new Date().toISOString() })
      .in('id', txIds);

    return payout as CelebrityPayout;
  } catch (error) {
    console.error('Error creating payout:', error);
    return null;
  }
};

export const getPayouts = async (celebrityId?: string): Promise<CelebrityPayout[]> => {
  try {
    let query = supabase
      .from('celebrity_payouts')
      .select('*')
      .order('created_at', { ascending: false });

    if (celebrityId) {
      query = query.eq('celebrity_id', celebrityId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching payouts:', error);
      return [];
    }

    return (data || []) as CelebrityPayout[];
  } catch (error) {
    console.error('Error fetching payouts:', error);
    return [];
  }
};

export const markPayoutAsPaid = async (
  payoutId: string,
  stripeTransferId?: string
): Promise<boolean> => {
  try {
    const { data: payout } = await supabase
      .from('celebrity_payouts')
      .select('*')
      .eq('id', payoutId)
      .single();

    if (!payout) return false;

    const { error } = await supabase
      .from('celebrity_payouts')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_transfer_id: stripeTransferId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payoutId);

    if (error) {
      console.error('Error marking payout as paid:', error);
      return false;
    }

    const { data: transactions } = await supabase
      .from('fan_transactions')
      .select('id')
      .eq('payout_id', payoutId);

    if (transactions && transactions.length > 0) {
      const txIds = transactions.map(tx => tx.id);
      await supabase
        .from('fan_transactions')
        .update({
          status: 'paid_to_celebrity',
          paid_to_celebrity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', txIds);
    }

    return true;
  } catch (error) {
    console.error('Error marking payout as paid:', error);
    return false;
  }
};

export const formatCents = (cents: number, currency: string = 'EUR'): string => {
  const amount = cents / 100;
  const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
  const symbol = symbols[currency] || currency;
  return `${amount.toFixed(2)}${symbol}`;
};
