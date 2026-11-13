-- "הסכומים לא מתאזנים": when the results don't add up (a counting mistake),
-- the manager chooses who covers the difference instead of the app taking it
-- all from the biggest winner:
--   equal   = "חלוקה שווה בין כל השחקנים"
--   winners = "חלוקה בין המנצחים לפי הרווח"
--   player  = "שחקן מסוים" (adjust_player: that player's seat; null while
--             the manager hasn't picked the player yet)
-- The app applies the choice to the results it sends to public.end_game (which
-- still checks they add up to 0). The database only stores the choice, so
-- every manager at the table sees it live, and logs it:
--   - adjust_changed: the manager changed the choice;
--   - results_adjusted (when the game ends): how much each player's stored
--     result differs from the result that was typed (rounded to the table's
--     rounding), i.e. who absorbed how much. Derived from the stored rows, so
--     it can't be made up.
--
-- Only the manager chooses, only while the game isn't ended.
-- Additive: the live version doesn't read or write these columns, and closing a
-- table from it works as before (the biggest winner covers the difference).

alter table public.poker_tables
  add column adjust_method text constraint poker_tables_adjust_method check (adjust_method in ('equal', 'winners', 'player')),
  add column adjust_player uuid,
  add constraint poker_tables_adjust_player check (adjust_player is null or adjust_method = 'player');

comment on column public.poker_tables.adjust_method is
  'Who covers results that don''t add up: equal / winners / player (null = not chosen)';
comment on column public.poker_tables.adjust_player is
  'With adjust_method = player: the seat (table_players.id) that covers the difference';

-- Only the manager chooses; locked once the game ended; the player must be a
-- seat of this table. (No foreign key on purpose: removing that player's seat
-- must not be blocked or change the table row; the app then asks again.)
create function private.guard_adjust()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.adjust_method, new.adjust_player) is not distinct from (old.adjust_method, old.adjust_player) then
      return new;
    end if;
    if (select auth.uid()) is distinct from old.manager_id then
      raise exception 'Only the table manager can choose who covers the difference' using errcode = '42501';
    end if;
    if old.status = 'ended' and new.status = 'ended' then
      raise exception 'The game has ended; reopen it to make changes' using errcode = '42501';
    end if;
  end if;
  if new.adjust_player is not null and not exists (
    select 1 from public.table_players p where p.id = new.adjust_player and p.table_id = new.id
  ) then
    raise exception 'The chosen player is not at this table' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_adjust() from public, anon, authenticated;

create trigger guard_adjust before insert or update on public.poker_tables
  for each row execute function private.guard_adjust();

-- How each stored result differs from the typed one (rounded to the table's
-- rounding, halves away from zero, like the app): [{ player_id, name, amount }],
-- only players whose result moved. The typed result: what the player left with
-- (their exit if they left mid-game, else final_value; none = 0) − their buy-ins.
create function private.result_changes(p_table uuid)
returns table (gap integer, changes jsonb)
language sql stable security definer set search_path = ''
as $$
  with left_with as (
    select
      p.id,
      p.final_net,
      case when p.out_kind is not null then p.out_chips else p.final_value end as chips,
      coalesce((select sum(b.amount) from public.buy_ins b where b.player_id = p.id), 0) as bought,
      t.rounding
    from public.table_players p
    join public.poker_tables t on t.id = p.table_id
    where p.table_id = p_table
  ),
  typed as (
    select id, final_net, rounding, case when chips is null then 0 else chips - bought end as net
    from left_with
  ),
  moved as (
    select id, net, final_net - (sign(net) * round(abs(net)::numeric / rounding) * rounding)::integer as amount
    from typed
  )
  select
    coalesce(sum(net), 0)::integer,
    coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'name', private.player_label(id), 'amount', amount)
      order by amount, id) filter (where amount <> 0), '[]'::jsonb)
  from moved;
$$;
revoke all on function private.result_changes(uuid) from public, anon, authenticated;

create function private.log_adjust()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if (new.adjust_method, new.adjust_player) is distinct from (old.adjust_method, old.adjust_player) then
    perform private.write_log(new.id, 'adjust_changed', jsonb_build_object(
      'method', new.adjust_method, 'player_id', new.adjust_player,
      'name', case when new.adjust_player is null then null else private.player_label(new.adjust_player) end));
  end if;
  if new.status = 'ended' and old.status <> 'ended' then
    select * into r from private.result_changes(new.id);
    if jsonb_array_length(r.changes) > 0 then
      perform private.write_log(new.id, 'results_adjusted', jsonb_build_object(
        'gap', r.gap, 'method', new.adjust_method, 'rounding', new.rounding, 'changes', r.changes));
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.log_adjust() from public, anon, authenticated;

-- Named to fire after log_poker_tables (alphabetical), so "ended" comes first in the log.
create trigger log_poker_tables_adjust after update on public.poker_tables
  for each row execute function private.log_adjust();
