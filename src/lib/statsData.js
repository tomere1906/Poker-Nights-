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

export async function loadStats() {
  const [games, mates] = await Promise.all([
    supabase.from('my_games').select('*').order('ended_at'),
    supabase.from('my_tablemates').select('*'),
  ]);
  return { games: must(games).map(toGame), mates: must(mates).map(toMate) };
}
