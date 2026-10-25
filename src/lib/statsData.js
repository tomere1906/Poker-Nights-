// Loads the viewer's stats. Both views run with the viewer's own rights (RLS),
// contain only closed games the viewer played in, and only the viewer's data.
import { supabase } from './supabase.js';

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
  const [games, mates, hidden] = await Promise.all([
    supabase.from('my_games').select('*').order('ended_at'),
    supabase.from('my_tablemates').select('*'),
    supabase.from('my_hidden_games').select('*').order('hidden_at', { ascending: false }),
  ]);
  return { games: must(games).map(toGame), mates: must(mates).map(toMate), hidden: must(hidden).map(toHidden) };
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
