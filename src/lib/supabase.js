import { createClient } from '@supabase/supabase-js';

// Public project URL + publishable key, injected at build time:
// locally from .env.local, in CI from GitHub Actions variables.
// Never put the service_role/secret key in the app.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

// Null when not configured, so the local (single-device) game keeps working.
export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        // PKCE redirect flow: works in Safari and in the installed home-screen app.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
