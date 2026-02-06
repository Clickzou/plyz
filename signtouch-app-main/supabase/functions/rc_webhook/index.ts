import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    if (WEBHOOK_SECRET) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const body = await req.json();
    const event = body.event;

    if (!event) {
      return new Response('No event in payload', { status: 400 });
    }

    const eventId = event.id || `${event.type}_${Date.now()}`;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: webhookError } = await supabase
      .from('webhook_events')
      .insert({
        event_id: eventId,
        source: 'revenuecat',
        payload: body,
        processed: true,
      });

    if (webhookError) {
      if (webhookError.code === '23505') {
        console.log(`[Webhook] Event ${eventId} already processed (idempotent)`);
        return new Response(JSON.stringify({ status: 'already_processed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      console.error('[Webhook] Error logging event:', webhookError);
    }

    const eventType = event.type;
    const storeTransactionId =
      event.transaction_id ||
      event.store_transaction_id ||
      event.original_transaction_id;

    if (!storeTransactionId) {
      console.log(`[Webhook] No transaction ID in event type: ${eventType}`);
      return new Response(JSON.stringify({ status: 'ok', note: 'no transaction id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE'].includes(eventType)) {
      const { error } = await supabase
        .from('fan_transactions')
        .update({
          status: 'store_confirmed',
          store_confirmed_at: new Date().toISOString(),
          rc_event_id: eventId,
        })
        .or(`store_transaction_id.eq.${storeTransactionId},rc_transaction_id.eq.${storeTransactionId}`)
        .eq('status', 'created');

      if (error) {
        console.error('[Webhook] Error confirming transaction:', error);
      } else {
        console.log(`[Webhook] Transaction confirmed: ${storeTransactionId}`);
      }
    }

    if (['CANCELLATION', 'REFUND'].includes(eventType)) {
      const { error } = await supabase
        .from('fan_transactions')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
          rc_event_id: eventId,
        })
        .or(`store_transaction_id.eq.${storeTransactionId},rc_transaction_id.eq.${storeTransactionId}`);

      if (error) {
        console.error('[Webhook] Error processing refund:', error);
      } else {
        console.log(`[Webhook] Transaction refunded: ${storeTransactionId}`);
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
