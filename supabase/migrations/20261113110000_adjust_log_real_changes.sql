-- The "results_adjusted" log entry shows each player's REAL change, like the
-- "⚖️ תיקון הפרש" card: from the result as typed to the stored result,
-- rounding included. Before, it showed only each player's share of the
-- difference, so with rounding 10 it could say "יורי −10" while Yuri really
-- went from +175 to +170 (rounding first moved him to +180, and Ido from −75
-- to −80).
--
-- Each change is { player_id, name, amount, share }: amount = the real change,
-- share = their part of the difference (amount − share = what rounding moved).
-- Only players whose result moved are listed. The entry is written only when
-- someone covered a difference (a share ≠ 0), not for rounding alone.
--
-- Replaces two private functions; nothing else changes. Log rows written
-- before this keep their old shape (no share): the app shows them as before.

drop function private.result_changes(uuid);

create function private.result_changes(p_table uuid)
returns table (gap integer, adjusted boolean, changes jsonb)
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
    select
      id,
      net,
      (final_net - net)::integer as amount,
      final_net - (sign(net) * round(abs(net)::numeric / rounding) * rounding)::integer as share
    from typed
  )
  select
    coalesce(sum(net), 0)::integer,
    coalesce(bool_or(share <> 0), false),
    coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'name', private.player_label(id), 'amount', amount, 'share', share)
      order by amount, id) filter (where amount <> 0), '[]'::jsonb)
  from moved;
$$;
revoke all on function private.result_changes(uuid) from public, anon, authenticated;

create or replace function private.log_adjust()
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
    if r.adjusted then
      perform private.write_log(new.id, 'results_adjusted', jsonb_build_object(
        'gap', r.gap, 'method', new.adjust_method, 'rounding', new.rounding, 'changes', r.changes));
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.log_adjust() from public, anon, authenticated;
