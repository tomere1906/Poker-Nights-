// Online tables: load a table from Supabase, shape it like the local game
// state (so the same UI renders it), and write changes back. RLS decides what
// each user may actually do; the UI only hides what would be refused anyway.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { AVATAR_COLORS, cleanSettings, firstFreeSeat } from './game.js';
import { suggestedColor } from './colors.js';

const TABLE_COLUMNS =
  'id, manager_id, status, initial_buy_in, rebuy_amounts, buy_in_mode, invite_code, created_at';

function must({ data, error }) {
  if (error) throw error;
  return data;
}

export async function createOnlineTable(settings, buyInMode) {
  const row = must(
    await supabase
      .from('poker_tables')
      .insert({ initial_buy_in: settings.initialBuyIn, rebuy_amounts: settings.rebuyAmounts, buy_in_mode: buyInMode })
      .select('id')
      .single()
  );
  return row.id;
}

// Tables I manage or joined that haven't ended (RLS returns only those).
export async function listOpenTables() {
  return must(
    await supabase
      .from('poker_tables')
      .select(`${TABLE_COLUMNS}, table_players(count)`)
      .neq('status', 'ended')
      .order('created_at', { ascending: false })
  );
}

async function loadTable(tableId) {
  const [table, players, buyIns, members, log] = await Promise.all([
    // poker_tables reaches profiles several ways (manager, members, players): name the FK.
    supabase
      .from('poker_tables')
      .select(`${TABLE_COLUMNS}, manager:profiles!poker_tables_manager_id_fkey(display_name, color)`)
      .eq('id', tableId)
      .single(),
    supabase
      .from('table_players')
      .select('id, user_id, nickname, color, seat, final_value, profile:profiles(display_name, color)')
      .eq('table_id', tableId),
    supabase.from('buy_ins').select('id, player_id, amount, created_at').eq('table_id', tableId).order('created_at'),
    supabase
      .from('table_members')
      .select('user_id, is_co_manager, joined_at, profile:profiles(display_name, color)')
      .eq('table_id', tableId)
      .order('joined_at'),
    supabase
      .from('table_log')
      .select('id, action, details, created_at, actor_id, actor:profiles(display_name)')
      .eq('table_id', tableId)
      .order('created_at', { ascending: false })
      .limit(300),
  ]);
  return { table: must(table), players: must(players), buyIns: must(buyIns), members: must(members), log: must(log) };
}

// Same shape as a local player, plus what the online UI needs.
function toPlayer(row, buyIns) {
  return {
    id: row.id,
    userId: row.user_id,
    seat: row.seat,
    name: row.nickname ?? row.profile?.display_name ?? 'שחקן',
    color: row.color ?? row.profile?.color ?? suggestedColor(row.user_id ?? row.id),
    nickname: row.nickname,
    colorOverride: row.color,
    buyIns: buyIns.map((b) => b.amount),
    buyInTimes: buyIns.map((b) => Date.parse(b.created_at)),
    buyInIds: buyIns.map((b) => b.id),
  };
}

export function toView(raw, userId) {
  const { table } = raw;
  const byPlayer = new Map();
  for (const b of raw.buyIns) byPlayer.set(b.player_id, [...(byPlayer.get(b.player_id) ?? []), b]);
  const players = raw.players.map((p) => toPlayer(p, byPlayer.get(p.id) ?? []));

  const isManager = table.manager_id === userId;
  const me = raw.members.find((m) => m.user_id === userId);
  const canManage = isManager || Boolean(me?.is_co_manager);

  const person = (id, profile, extra) => ({
    userId: id,
    name: profile?.display_name ?? 'שחקן',
    color: profile?.color ?? suggestedColor(id),
    isMe: id === userId,
    ...extra,
  });
  const people = [
    person(table.manager_id, table.manager, { isManager: true, isCoManager: false }),
    ...raw.members.map((m) => person(m.user_id, m.profile, { isManager: false, isCoManager: m.is_co_manager })),
  ];
  const seated = new Set(players.map((p) => p.userId).filter(Boolean));

  return {
    id: table.id,
    status: table.status,
    started: table.status !== 'seating',
    settings: cleanSettings({ initialBuyIn: table.initial_buy_in, rebuyAmounts: table.rebuy_amounts }),
    buyInMode: table.buy_in_mode,
    inviteCode: table.invite_code,
    players,
    people,
    unseated: people.filter((p) => !seated.has(p.userId)),
    isManager,
    canManage,
    myUserId: userId,
    log: raw.log,
  };
}

function nextFreeColor(players) {
  const used = new Set(players.map((p) => p.color));
  for (let i = 0; i < AVATAR_COLORS; i++) if (!used.has(i)) return i;
  return players.length % AVATAR_COLORS;
}

// Writes. Each takes the current view (for seat math) and throws on failure.
function makeActions(view) {
  const tableId = view.id;
  const players = () => [...view.players].sort((a, b) => a.seat - b.seat);

  async function setSeat(playerId, seat) {
    must(await supabase.from('table_players').update({ seat }).eq('id', playerId));
  }

  async function insertPlayer({ seat, name, amount, userId }) {
    const row = userId
      ? { table_id: tableId, user_id: userId, seat }
      : { table_id: tableId, nickname: name, color: nextFreeColor(view.players), seat };
    const player = must(await supabase.from('table_players').insert(row).select('id').single());
    must(await supabase.from('buy_ins').insert({ table_id: tableId, player_id: player.id, amount }));
  }

  return {
    // Setup: exact seat or the first free one. Game on: insert at a position, shifting the rest.
    async add({ seat, position, name, amount, userId }) {
      if (!view.started) {
        const target = seat ?? firstFreeSeat(view.players);
        if (target === null) throw new Error('השולחן מלא');
        return insertPlayer({ seat: target, name, amount, userId });
      }
      const at = Math.min(Math.max(position ?? view.players.length, 0), view.players.length);
      for (const p of players().reverse()) if (p.seat >= at) await setSeat(p.id, p.seat + 1);
      return insertPlayer({ seat: at, name, amount, userId });
    },

    async buyIn(player, amount) {
      must(await supabase.from('buy_ins').insert({ table_id: tableId, player_id: player.id, amount }));
    },

    async undoBuyIn(player) {
      const last = player.buyInIds[player.buyInIds.length - 1];
      if (player.buyInIds.length > 1 && last) must(await supabase.from('buy_ins').delete().eq('id', last));
    },

    async remove(player) {
      must(await supabase.from('table_players').delete().eq('id', player.id));
      if (view.started) {
        for (const p of players()) if (p.seat > player.seat) await setSeat(p.id, p.seat - 1);
      }
    },

    // Onto an empty seat: move. Onto a player: swap the two.
    async move(playerId, seat) {
      const mover = view.players.find((p) => p.id === playerId);
      const other = view.players.find((p) => p.seat === seat && p.id !== playerId);
      if (!mover) return;
      if (other) await setSeat(other.id, mover.seat);
      await setSeat(playerId, seat);
    },

    // Close the seat gaps (keeping the order) and mark the game as started.
    async start() {
      const ordered = players();
      for (let i = 0; i < ordered.length; i++) if (ordered[i].seat !== i) await setSeat(ordered[i].id, i);
      must(await supabase.from('poker_tables').update({ status: 'playing' }).eq('id', tableId));
    },

    async setIdentity(player, { nickname, color }) {
      must(await supabase.from('table_players').update({ nickname, color }).eq('id', player.id));
    },

    async setBuyInMode(mode) {
      must(await supabase.from('poker_tables').update({ buy_in_mode: mode }).eq('id', tableId));
    },

    async setCoManager(userId, isCoManager) {
      must(
        await supabase
          .from('table_members')
          .update({ is_co_manager: isCoManager })
          .eq('table_id', tableId)
          .eq('user_id', userId)
      );
    },

    async deleteTable() {
      must(await supabase.from('poker_tables').delete().eq('id', tableId));
    },
  };
}

// { view, error, loading, actions, refresh }. Every action reloads the table afterwards.
export function useOnlineTable(tableId, userId) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setRaw(await loadTable(tableId));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [tableId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const view = useMemo(() => (raw ? toView(raw, userId) : null), [raw, userId]);

  const actions = useMemo(() => {
    if (!view) return null;
    const base = makeActions(view);
    return Object.fromEntries(
      Object.entries(base).map(([name, fn]) => [
        name,
        async (...args) => {
          try {
            return await fn(...args);
          } finally {
            await refresh();
          }
        },
      ])
    );
  }, [view, refresh]);

  return { view, error, loading: !raw && !error, actions, refresh };
}
