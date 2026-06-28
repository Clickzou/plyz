import { supabase } from './supabase';

export async function authedFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return fetch(url, { ...options, headers });
}
