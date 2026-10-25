import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialScreen, rememberScreen } from './screen.js';

const ID = '11111111-aaaa-4aaa-8aaa-111111111111';
const APP = 'https://example.github.io/Poker-Nights-/';

function fakeBrowser(href) {
  const store = new Map();
  const location = { href };
  vi.stubGlobal('localStorage', {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
  vi.stubGlobal('window', {
    location,
    history: { state: null, replaceState: (_s, _t, url) => (location.href = new URL(url, location.href).href) },
  });
  return location;
}

describe('screen memory', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('opens at home by default', () => {
    fakeBrowser(APP);
    expect(initialScreen(false)).toEqual({ screen: 'home', tableId: null });
  });

  it('a refresh at an online table returns to it (URL)', () => {
    fakeBrowser(`${APP}?table=${ID}`);
    expect(initialScreen(false)).toEqual({ screen: 'online', tableId: ID });
  });

  it('reopening the home-screen app returns to the online table (storage)', () => {
    const location = fakeBrowser(APP);
    rememberScreen('online', ID);
    expect(location.href).toBe(`${APP}?table=${ID}`);
    location.href = APP; // the app starts from start_url
    expect(initialScreen(false)).toEqual({ screen: 'online', tableId: ID });
  });

  it('returns to the local game only while it is open', () => {
    fakeBrowser(APP);
    rememberScreen('game', null);
    expect(initialScreen(true)).toEqual({ screen: 'game', tableId: null });
    expect(initialScreen(false).screen).toBe('home');
  });

  it('going home forgets the table and cleans the URL, keeping other params', () => {
    const location = fakeBrowser(`${APP}?code=abc&table=${ID}`);
    rememberScreen('home', null);
    expect(location.href).toBe(`${APP}?code=abc`);
    expect(initialScreen(true).screen).toBe('home');
  });

  it('ignores a table id that is not a UUID', () => {
    fakeBrowser(`${APP}?table=<script>`);
    expect(initialScreen(false).screen).toBe('home');
  });
});
