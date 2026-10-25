// The open table survives a refresh and reopening the home-screen app.
// An online table is also in the URL (?table=<id>), so the address itself
// points at it; localStorage covers the home-screen app, which always starts
// from the manifest's start_url.
const KEY = 'poker-nights-screen';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HOME = { screen: 'home', tableId: null };

// { screen: 'home' | 'game' | 'online', tableId }
export function initialScreen(localTableOpen, href = window.location.href) {
  const fromUrl = new URL(href).searchParams.get('table');
  if (fromUrl && UUID.test(fromUrl)) return { screen: 'online', tableId: fromUrl };

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY));
  } catch {
    // Storage blocked or broken: start at home.
  }
  if (saved?.screen === 'online' && UUID.test(saved.tableId ?? '')) return { screen: 'online', tableId: saved.tableId };
  if (saved?.screen === 'game' && localTableOpen) return { screen: 'game', tableId: null };
  return HOME;
}

// Only the tables themselves are remembered; setup and profile screens reopen at home.
export function rememberScreen(screen, tableId) {
  const online = screen === 'online' && tableId;
  try {
    if (online) localStorage.setItem(KEY, JSON.stringify({ screen, tableId }));
    else if (screen === 'game') localStorage.setItem(KEY, JSON.stringify({ screen }));
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }

  // Keep any other parameters (e.g. Supabase's sign-in ?code=).
  const url = new URL(window.location.href);
  if (online) url.searchParams.set('table', tableId);
  else url.searchParams.delete('table');
  if (url.href !== window.location.href) {
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
}
