import { useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { signInWithGoogle } from '../lib/auth.js';
import Avatar, { profileAvatar } from './Avatar.jsx';

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-6 w-6" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function AccountBar({ auth, onOpenProfile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!isSupabaseConfigured) return null;

  if (auth.loading) {
    return <div className="h-14 animate-pulse rounded-2xl bg-slate-800/60" aria-label="טוען" />;
  }

  if (auth.session) {
    const { profile } = auth;
    return (
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex w-full items-center gap-3 rounded-2xl bg-slate-800/70 p-2 ps-3 text-start ring-1 ring-white/5 active:scale-[0.99]"
      >
        <Avatar player={profileAvatar(profile)} size="h-10 w-10 text-base" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-slate-400">מחובר/ת בתור</span>
          <span className="block truncate font-bold">{profile.display_name}</span>
        </span>
        <span className="rounded-xl px-3 py-2 text-sm font-bold text-slate-300">עריכה ←</span>
      </button>
    );
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(); // navigates away to Google
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const shownError = error || auth.error;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-lg font-bold text-slate-800 shadow-lg transition active:scale-[0.98] disabled:opacity-60"
      >
        <GoogleLogo />
        {busy ? 'מעביר ל־Google…' : 'התחברות עם Google'}
      </button>
      {shownError && (
        <p className="rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200 ring-1 ring-rose-400/30">
          ההתחברות לא הצליחה: {shownError}
        </p>
      )}
    </div>
  );
}
