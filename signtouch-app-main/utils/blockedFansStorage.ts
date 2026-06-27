import { supabase } from '@/utils/supabase';

// Blocage de fans par une célébrité (harcèlement / injures).
// Table `blocked_fans` : UNIQUE(celebrity_id, fan_id). RLS : INSERT/DELETE par la
// célébrité (celebrity_id = auth.uid()), SELECT public.
// IMPORTANT : `fan_id` suit le format de session_queue.fan_id (ex. `fan_user_<uid>`).

/**
 * Bloque un fan. Idempotent : ignore le doublon (contrainte UNIQUE, code 23505 /
 * PGRST). Ne lève pas pour un doublon ; les autres erreurs sont loggées mais non
 * propagées (appelé en fire-and-forget côté UI).
 */
export const blockFan = async (
  celebrityId: string,
  fanId: string,
  fanName?: string | null,
  reason?: string | null
): Promise<boolean> => {
  if (!celebrityId || !fanId) return false;
  try {
    const { error } = await supabase.from('blocked_fans').insert({
      celebrity_id: celebrityId,
      fan_id: fanId,
      fan_name: fanName || null,
      reason: reason || null,
    });
    if (error) {
      // Doublon (déjà bloqué) -> on considère le blocage comme effectif.
      const code = (error as { code?: string }).code;
      if (code === '23505' || code === 'PGRST116' || /duplicate/i.test(error.message || '')) {
        return true;
      }
      console.error('[BlockedFans] blockFan error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[BlockedFans] blockFan exception:', e);
    return false;
  }
};

/**
 * Indique si un fan est bloqué par une célébrité donnée.
 */
export const isFanBlocked = async (
  celebrityId: string,
  fanId: string
): Promise<boolean> => {
  if (!celebrityId || !fanId) return false;
  try {
    const { data, error } = await supabase
      .from('blocked_fans')
      .select('id')
      .eq('celebrity_id', celebrityId)
      .eq('fan_id', fanId)
      .maybeSingle();
    if (error) {
      console.error('[BlockedFans] isFanBlocked error:', error);
      return false;
    }
    return !!data;
  } catch (e) {
    console.error('[BlockedFans] isFanBlocked exception:', e);
    return false;
  }
};

/**
 * Débloque un fan.
 */
export const unblockFan = async (
  celebrityId: string,
  fanId: string
): Promise<boolean> => {
  if (!celebrityId || !fanId) return false;
  try {
    const { error } = await supabase
      .from('blocked_fans')
      .delete()
      .eq('celebrity_id', celebrityId)
      .eq('fan_id', fanId);
    if (error) {
      console.error('[BlockedFans] unblockFan error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[BlockedFans] unblockFan exception:', e);
    return false;
  }
};
