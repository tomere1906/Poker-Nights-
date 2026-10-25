import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

// Google sends the user back to the app's own address (live site, localhost or
// the LAN address), so the session lands in the same app that started the
// sign-in — including the home-screen app on iPhone.
export function appUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: appUrl(),
      // Let people pick which Google account to use.
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

export function signOut() {
  return supabase.auth.signOut();
}

const AUTH_PARAMS = ['code', 'error', 'error_code', 'error_description'];

// An error Google/Supabase sent back in the URL (e.g. the user cancelled).
function readAuthError() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return params.get('error_description') || hash.get('error_description') || null;
}

// Remove ?code=… / ?error=… once handled, so a refresh doesn't replay them.
function cleanAuthParams() {
  const url = new URL(window.location.href);
  const had = AUTH_PARAMS.some((p) => url.searchParams.has(p)) || url.hash.includes('error');
  if (!had) return;
  AUTH_PARAMS.forEach((p) => url.searchParams.delete(p));
  url.hash = '';
  window.history.replaceState(null, '', url.pathname + url.search);
}

const PROFILE_COLUMNS = 'id, display_name, color, avatar_url, name_confirmed_at';

async function fetchProfile(user) {
  const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle();
  // Fall back to the sign-in data if the profile row isn't there yet.
  return (
    data ?? {
      id: user.id,
      display_name: (user.user_metadata?.full_name ?? user.user_metadata?.name ?? '').split(' ')[0],
      color: null,
      avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
      name_confirmed_at: null,
    }
  );
}

export const MAX_NAME_LENGTH = 30;

// Save the user's own name + color (RLS: only their own row; only these columns).
export async function saveProfile(userId, { displayName, color }) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName.trim(), color, name_confirmed_at: new Date().toISOString() })
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// { loading, session, profile, error, setProfile }. With no Supabase config: signed out forever.
export function useAuth() {
  const [auth, setAuth] = useState({ loading: Boolean(supabase), session: null, profile: null, error: readAuthError() });

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    async function apply(session) {
      const profile = session ? await fetchProfile(session.user) : null;
      if (active) setAuth((a) => ({ ...a, loading: false, session, profile }));
    }

    // getSession() waits until a ?code=… from Google has been exchanged.
    supabase.auth.getSession().then(({ data, error }) => {
      if (error && active) setAuth((a) => ({ ...a, error: error.message }));
      cleanAuthParams();
      apply(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer: calling Supabase inside this callback can deadlock the client.
      setTimeout(() => apply(session), 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setProfile = useCallback((profile) => setAuth((a) => ({ ...a, profile })), []);
  return { ...auth, setProfile };
}
