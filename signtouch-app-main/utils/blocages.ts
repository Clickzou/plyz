import { supabase } from '@/utils/supabase';

/**
 * Blocage entre utilisateurs.
 *
 * Exigé par Apple (1.2) et Google pour tout espace où des utilisateurs se
 * lisent entre eux : sans lui, la Fan zone ferait refuser l'application. Le
 * blocage existait déjà en célébrité → fan (table `blocked_fans`, liée aux
 * prestations payantes) ; ceci est le blocage entre fans.
 *
 * Le filtrage lui-même se fait en base : les règles de lecture de la Fan zone
 * appellent `blocage_entre()`, donc un message bloqué n'arrive même pas sur le
 * téléphone. Ce fichier ne sert qu'à gérer la liste.
 */

export interface PersonneBloquee {
  bloque_id: string;
  nom: string;
  avatar_url: string | null;
  depuis: string;
}

/** Ceux que j'ai bloqués. Personne ne peut savoir qui l'a bloqué : c'est ce
 *  qui protège de représailles celui qui bloque. */
export async function listerBlocages(): Promise<PersonneBloquee[]> {
  const { data, error } = await supabase.rpc('mes_blocages');
  if (error) return [];
  return (data || []) as PersonneBloquee[];
}

export async function bloquer(userId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id === userId) return false;
  const { error } = await supabase
    .from('blocages')
    .upsert({ bloqueur_id: user.id, bloque_id: userId }, { onConflict: 'bloqueur_id,bloque_id' });
  return !error;
}

export async function debloquer(userId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from('blocages')
    .delete()
    .eq('bloqueur_id', user.id)
    .eq('bloque_id', userId);
  return !error;
}
