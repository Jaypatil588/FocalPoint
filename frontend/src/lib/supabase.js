import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PROFILE_KEY = 'fp_user_default';

export async function loadSessionsFromDB() {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, messages, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('loadSessions:', error);
    return [];
  }
  return data || [];
}

export async function saveSessionToDB(session) {
  const { error } = await supabase
    .from('chat_sessions')
    .upsert({ id: session.id, title: session.title, messages: session.messages });
  if (error) console.error('saveSession:', error);
}

export async function deleteSessionFromDB(sessionId) {
  const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId);
  if (error) console.error('deleteSession:', error);
}

export async function loadProfileFromDB() {
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('id', PROFILE_KEY)
    .maybeSingle();
  if (error) { console.error('loadProfile:', error); return null; }
  return data;
}

export async function saveProfileToDB(profile) {
  const { error } = await supabase
    .from('user_profile')
    .upsert({ id: PROFILE_KEY, ...profile, updated_at: new Date().toISOString() });
  if (error) console.error('saveProfile:', error);
}
