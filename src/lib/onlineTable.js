// Online tables: load a table from Supabase, shape it like the local game
// state (so the same UI renders it), and write changes back. RLS decides what
// each user may actually do; the UI only hides what would be refused anyway.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { MAX_PLAYERS, cleanSettings, exitChips, firstFreeSeat, totalIn } from './game.js';
import { firstFreeColor, suggestedColor } from './colors.js';
import { appUrl } from './auth.js';

const TABLE_COLUMNS =
  'id, name, manager_id, status, initial_buy_in, rebuy_amounts, buy_in_mode, end_mode, invite_code, created_at, ended_at';

// Same limit as the database check (poker_tables_name_length).
export const MAX_TABLE_NAME = 30;

// Optional: blank means no name.
export function cleanTableName(name) {
  const trimmed = (name ?? '').trim().slice(0, MAX_TABLE_NAME);
  return trimmed || null;
}

function must({ data, error }) {
  if (error) throw error;
  return data;
}

export async function createOnlineTable(settings, buyInMode, name) {
  const row = must(
    await supabase
      .from('poker_tables')
      .insert({
        name: cleanTableName(name),
        initial_buy_in: settings.initialBuyIn,
        rebuy_amounts: settings.rebuyAmounts,
        buy_in_mode: buyInMode,
      })
      .select('id')
      .single()
  );
  return row.id;
}

// The link friends open to join: the table id + its secret invite code.
export function inviteLink(view) {
  const url = new URL(appUrl());
  url.searchParams.set('join', view.id);
  url.searchParams.set('key', view.inviteCode); // not 'code': Supabase sign-in uses it
  return url.href;
}

// Join a table with its invite code (RLS checks the code and that it hasn't ended).
// Joining twice is fine: the second time is a no-op.
export async function joinTable(tableId, code) {
  const { error } = await supabase.from('table_members').insert({ table_id: tableId, invite_code: code });
  if (error && error.code !== '23505') throw error;
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
      .select('id, user_id, nickname, color, seat, out_kind, out_chips, final_value, final_net, profile:profiles(display_name, color)')
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
    out: row.out_kind ? { kind: row.out_kind, chips: row.out_chips } : null,
    // Chips the player left with, as entered on the end-game screen; else the exit amount.
    finalChips: row.final_value ?? (row.out_kind ? row.out_chips : null),
    finalNet: row.final_net,
  };
}

// Results in the end-game screen's terms: profit/loss ('net') or chips ('chips').
// The database always stores chips, so switching modes never rewrites anything.
export function finalsFor(players, endMode, chipsOf = (p) => p.finalChips) {
  const finals = {};
  for (const p of players) {
    const chips = chipsOf(p);
    if (chips !== null && chips !== undefined) finals[p.id] = endMode === 'chips' ? chips : chips - totalIn(p);
  }
  return finals;
}

export function toChips(player, value, endMode) {
  if (value === null) return null;
  return endMode === 'chips' ? value : value + totalIn(player);
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
    // (The manager may also have a member row, e.g. after opening their own invite link.)
    ...raw.members
      .filter((m) => m.user_id !== table.manager_id)
      .map((m) => person(m.user_id, m.profile, { isManager: false, isCoManager: m.is_co_manager })),
  ];
  const seated = new Set(players.map((p) => p.userId).filter(Boolean));
  const ended = table.status === 'ended';

  const endMode = table.end_mode ?? 'net';

  return {
    id: table.id,
    name: table.name ?? null,
    managerName: table.manager?.display_name ?? 'מנהל השולחן',
    status: table.status,
    ended,
    started: table.status !== 'seating',
    endMode,
    finals: finalsFor(players, endMode),
    settings: cleanSettings({ initialBuyIn: table.initial_buy_in, rebuyAmounts: table.rebuy_amounts }),
    buyInMode: table.buy_in_mode,
    inviteCode: table.invite_code,
    players,
    people,
    unseated: people.filter((p) => !seated.has(p.userId)),
    isManager,
    canManage,
    // A player who joined by invite and isn't seated yet picks their own free seat.
    canSeatSelf: !canManage && !ended && !seated.has(userId) && players.length < MAX_PLAYERS,
    myUserId: userId,
    log: raw.log,
  };
}

// Writes. Each takes the current view (for seat math) and throws on failure.
function makeActions(view) {
  const tableId = view.id;
  const players = () => [...view.players].sort((a, b) => a.seat - b.seat);

  async function setSeat(playerId, seat) {
    must(await supabase.from('table_players').update({ seat }).eq('id', playerId));
  }

  // A user keeps their profile color unless another one was picked (per-table override).
  async function insertPlayer({ seat, name, amount, color, userId }) {
    const freeColor = color ?? firstFreeColor(view.players.map((p) => p.color));
    const person = userId && view.people.find((p) => p.userId === userId);
    const row = userId
      ? { table_id: tableId, user_id: userId, seat, color: person && freeColor !== person.color ? freeColor : null }
      : { table_id: tableId, nickname: name, color: freeColor, seat };
    const player = must(await supabase.from('table_players').insert(row).select('id').single());
    must(await supabase.from('buy_ins').insert({ table_id: tableId, player_id: player.id, amount }));
  }

  return {
    // Setup: exact seat or the first free one. Game on: insert at a position, shifting the rest.
    async add({ seat, position, name, amount, color, userId }) {
      if (!view.started) {
        const target = seat ?? firstFreeSeat(view.players);
        if (target === null) throw new Error('השולחן מלא');
        return insertPlayer({ seat: target, name, amount, color, userId });
      }
      const at = Math.min(Math.max(position ?? view.players.length, 0), view.players.length);
      for (const p of players().reverse()) if (p.seat >= at) await setSeat(p.id, p.seat + 1);
      return insertPlayer({ seat: at, name, amount, color, userId });
    },

    // A member takes their own seat: the tapped free seat, or (game on) the end of the table.
    // No buy-in here: in "רק מנהלים" mode only managers add buy-ins.
    async seatSelf(seat) {
      const target = seat ?? (view.started ? view.players.length : firstFreeSeat(view.players));
      if (target === null) throw new Error('השולחן מלא');
      must(await supabase.from('table_players').insert({ table_id: tableId, user_id: view.myUserId, seat: target }));
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

    // Onto an empty seat: move. Onto a player: swap the two, atomically in the
    // database (seats are unique per table, so two separate updates would collide).
    async move(playerId, seat) {
      must(await supabase.rpc('swap_seats', { p_player: playerId, p_seat: seat }));
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

    // Left mid-game: the seat stays, the exit amount prefills the end-game screen.
    async markOut(player, kind, amount) {
      const out = { out_kind: kind, out_chips: exitChips(player, kind, amount) };
      must(await supabase.from('table_players').update(out).eq('id', player.id));
    },

    // "חזר לשחק": no exit and no result yet.
    async markBack(player) {
      must(
        await supabase
          .from('table_players')
          .update({ out_kind: null, out_chips: null, final_value: null })
          .eq('id', player.id)
      );
    },

    async setName(name) {
      must(await supabase.from('poker_tables').update({ name: cleanTableName(name) }).eq('id', tableId));
    },

    async setEndMode(mode) {
      must(await supabase.from('poker_tables').update({ end_mode: mode }).eq('id', tableId));
    },

    // chips: what the player left with (null clears it).
    async setFinalChips(playerId, chips) {
      must(await supabase.from('table_players').update({ final_value: chips }).eq('id', playerId));
    },

    // nets: the settled whole-shekel results ({ id, net }[]). One transaction:
    // the database checks they add up to 0 and that only the manager ends the game.
    async endGame(nets) {
      const byId = Object.fromEntries(nets.map((e) => [e.id, e.net]));
      must(await supabase.rpc('end_game', { p_table: tableId, p_nets: byId }));
    },

    async reopen() {
      must(await supabase.from('poker_tables').update({ status: 'playing' }).eq('id', tableId));
    },

    async deleteTable() {
      must(await supabase.from('poker_tables').delete().eq('id', tableId));
    },
  };
}

// PGRST116 = no row: the table was deleted, or this user isn't in it (any more).
export function loadErrorText(e) {
  return e?.code === 'PGRST116' ? 'השולחן לא זמין: הוא נמחק, או שאינך חבר בו.' : e?.message ?? String(e);
}

// { view, error, loading, live, actions, refresh }. Every action reloads the table
// afterwards, and so does every change anyone else makes (Realtime, below).
export function useOnlineTable(tableId, userId) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    // Loads can overlap (my action + its Realtime echo): only the newest one wins.
    const request = ++latest.current;
    try {
      const data = await loadTable(tableId);
      if (request !== latest.current) return;
      setRaw(data);
      setError(null);
    } catch (e) {
      if (request !== latest.current) return;
      // Gone (deleted / removed from it): stop showing it. A network hiccup keeps the last view.
      if (e?.code === 'PGRST116') setRaw(null);
      setError(loadErrorText(e));
    }
  }, [tableId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates. Every change at a table (buy-ins, seats, names, members, start/end,
  // settings) writes a log row in the same transaction, so one subscription to new
  // log rows of this table covers everything. Realtime checks RLS for each
  // subscriber, so only people in the table get the rows. The event is only a
  // "something changed" ping: the table is reloaded through the normal RLS reads.
  useEffect(() => {
    let timer;
    // One action can write several rows (e.g. starting the game moves seats): reload once.
    const reloadSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 250);
    };
    const channel = supabase
      .channel(`table-log:${tableId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_log', filter: `table_id=eq.${tableId}` }, reloadSoon)
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
        // (Re)connected: catch up on anything missed meanwhile.
        if (status === 'SUBSCRIBED') reloadSoon();
      });
    // Phones drop the connection in the background: catch up on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadSoon();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', reloadSoon);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', reloadSoon);
      supabase.removeChannel(channel);
    };
  }, [tableId, refresh]);

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

  return { view, error, loading: !raw && !error, live, actions, refresh };
}
