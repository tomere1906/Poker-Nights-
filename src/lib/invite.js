// Invite links look like <app>?join=<tableId>&key=<inviteCode> (not "code":
// that's Supabase's sign-in parameter). Opening one saves the invite, so it
// survives the Google sign-in redirect, and cleans the URL.
const KEY = 'poker-nights-pending-join';

export function captureInviteFromUrl() {
  const url = new URL(window.location.href);
  const tableId = url.searchParams.get('join');
  const code = url.searchParams.get('key');
  if (!tableId || !code) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ tableId, code }));
  } catch {
    // Storage blocked: the invite just won't survive a sign-in redirect.
  }
  url.searchParams.delete('join');
  url.searchParams.delete('key');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[0-9a-f]{32}$/i;

// A link someone edited (or broke) never reaches the database.
export function isValidInvite(invite) {
  return typeof invite?.tableId === 'string' && typeof invite?.code === 'string' && UUID.test(invite.tableId) && CODE.test(invite.code);
}

export function pendingInvite() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
