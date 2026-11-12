// Loads the viewer's stats. Both views run with the viewer's own rights (RLS),
// contain only closed games the viewer played in, and only the viewer's data.
import { supabase } from './supabase.js';
import { dayToMs } from './importFile.js';

function must({ data, error }) {
  if (error) throw error;
  return data;
}

export function toGame(row) {
  return {
    tableId: row.table_id,
    tableName: row.table_name,
    endedAt: Date.parse(row.ended_at),
    net: row.final_net,
    buyInTotal: row.buy_in_total,
    buyInCount: row.buy_in_count,
    playerCount: row.player_count,
  };
}

// An imported night (personal history from a file): no table, no buy-ins, no tablemates.
export function toImported(row) {
  return {
    tableId: `import:${row.id}`,
    imported: true,
    importId: row.import_id,
    playedOn: row.played_on,
    tableName: row.note,
    endedAt: dayToMs(row.played_on),
    net: row.net,
    buyInTotal: 0,
    buyInCount: 0,
    playerCount: null,
  };
}

// A read that may not exist yet while its migration hasn't been applied: an empty list then.
function optional({ data, error }) {
  if (error && ['42P01', 'PGRST200', 'PGRST205'].includes(error.code)) return [];
  return must({ data, error });
}

export function toMate(row) {
  return {
    key: row.mate_key,
    userId: row.user_id,
    isGuest: row.is_guest,
    name: row.name ?? 'שחקן',
    color: row.color,
    games: row.games,
    total: row.total_net,
    lastPlayed: Date.parse(row.last_played),
  };
}

export function toHidden(row) {
  return {
    tableId: row.table_id,
    tableName: row.table_name,
    status: row.status,
    endedAt: row.ended_at ? Date.parse(row.ended_at) : null,
    hiddenAt: Date.parse(row.hidden_at),
    net: row.final_net,
  };
}

// my_games and my_tablemates already leave out the viewer's hidden (and removed) games;
// my_hidden_games lists only the ones that can still be brought back.
export async function loadStats() {
  const [games, mates, hidden, imported] = await Promise.all([
    supabase.from('my_games').select('*').order('ended_at'),
    supabase.from('my_tablemates').select('*'),
    supabase.from('my_hidden_games').select('*').order('hidden_at', { ascending: false }),
    supabase.from('imported_games').select('id, import_id, played_on, net, note').order('played_on'),
  ]);
  return {
    games: must(games).map(toGame),
    mates: must(mates).map(toMate),
    hidden: must(hidden).map(toHidden),
    imported: optional(imported).map(toImported),
  };
}

// Saves one file's games ({ playedOn, net, note }) under one import id. Only
// the viewer sees them (RLS); the database stamps the owner and the time.
export async function importGames(games) {
  const importId = crypto.randomUUID();
  const rows = games.map((g) => ({ import_id: importId, played_on: g.playedOn, net: g.net, note: g.note }));
  for (let i = 0; i < rows.length; i += 500) {
    must(await supabase.from('imported_games').insert(rows.slice(i, i + 500)));
  }
}

// "מחק את כל המיובאים": RLS limits it to the viewer's own rows. (The filter is
// only there because the API refuses a delete without one.)
export async function deleteAllImported() {
  must(await supabase.from('imported_games').delete().not('id', 'is', null));
}

// "מחק": removed from the viewer's own stats for good (no way back). The game
// itself and everyone else's stats are untouched; the database blocks undoing it.
export async function removeGameForGood(tableId) {
  const { error } = await supabase.from('hidden_games').insert({ table_id: tableId, permanent: true });
  if (!error) return;
  if (error.code !== '23505') throw error;
  // Already hidden: mark that row as permanent.
  must(await supabase.from('hidden_games').update({ permanent: true }).eq('table_id', tableId));
}

// Hiding only affects the viewer's own stats; nothing is deleted.
export async function hideGame(tableId) {
  const { error } = await supabase.from('hidden_games').insert({ table_id: tableId });
  if (error && error.code !== '23505') throw error; // already hidden is fine
}

export async function unhideGame(tableId) {
  must(await supabase.from('hidden_games').delete().eq('table_id', tableId));
}
