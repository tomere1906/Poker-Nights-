-- Players who leave mid-game give up their seat.
--
-- A real game: the table was full, someone left ("הפסיד הכל"), and a new player
-- couldn't sit down. Now a player who leaves (out_kind set) has no seat
-- (seat = null): the app moves the seated players after them one seat back and
-- shows the ones who left next to the table. They stay in the results and the
-- settlement. "חזר לשחק" gives them a free seat again.
--
-- Rules: only a player who left may have no seat (a seated player always has
-- one); seats stay unique per table and between 0 and 8. Leaving and coming
-- back are logged as player_out / player_back, not as a seat move.
-- The live version of the app (which keeps the seat when leaving) still works:
-- the rule allows a player who left to keep a seat.

alter table public.table_players
  alter column seat drop not null,
  add constraint table_players_seat_unless_out check (seat is not null or out_kind is not null);

-- ---------------------------------------------------------------------------
-- Log: as in 20261110100000_chip_value_absent.sql; seat changes to or from
-- "no seat" are part of leaving / coming back, not a move.
-- ---------------------------------------------------------------------------
create or replace function private.log_table_players()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  label text;
begin
  if tg_op = 'INSERT' then
    perform private.write_log(new.table_id, 'player_seated', jsonb_build_object(
      'player_id', new.id, 'name', private.player_label(new.id), 'seat', new.seat, 'guest', new.user_id is null));
    return null;
  end if;

  if tg_op = 'DELETE' then
    label := coalesce(old.nickname, (select display_name from public.profiles where id = old.user_id));
    perform private.write_log(old.table_id, 'player_removed', jsonb_build_object('player_id', old.id, 'name', label));
    return null;
  end if;

  label := private.player_label(new.id);
  -- Leaving (seat -> none) and coming back (none -> seat) are logged as player_out / player_back.
  if new.seat is distinct from old.seat and new.seat is not null and old.seat is not null then
    perform private.write_log(new.table_id, 'player_moved', jsonb_build_object(
      'player_id', new.id, 'name', label, 'from', old.seat, 'to', new.seat));
  end if;
  if new.nickname is distinct from old.nickname then
    perform private.write_log(new.table_id, 'player_renamed', jsonb_build_object(
      'player_id', new.id, 'name', label, 'old', old.nickname, 'new', new.nickname));
  end if;
  if new.color is distinct from old.color then
    perform private.write_log(new.table_id, 'player_recolored', jsonb_build_object(
      'player_id', new.id, 'name', label, 'old', old.color, 'new', new.color));
  end if;
  if (new.out_kind, new.out_chips) is distinct from (old.out_kind, old.out_chips) then
    if new.out_kind is null then
      perform private.write_log(new.table_id, 'player_back', jsonb_build_object('player_id', new.id, 'name', label));
    else
      perform private.write_log(new.table_id, 'player_out', jsonb_build_object(
        'player_id', new.id, 'name', label, 'kind', new.out_kind, 'chips', new.out_chips));
    end if;
  end if;
  if new.final_value is distinct from old.final_value then
    perform private.write_log(new.table_id, 'result_set', jsonb_build_object(
      'player_id', new.id, 'name', label, 'value', new.final_value));
  end if;
  if new.absent is distinct from old.absent and new.absent is not null then
    perform private.write_log(new.table_id, 'presence_changed', jsonb_build_object(
      'player_id', new.id, 'name', label, 'absent', new.absent));
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables being played right now: players who already left give up their seat,
-- and the seated players close the gaps (keeping their order). Once.
-- ---------------------------------------------------------------------------
update public.table_players p
   set seat = null
  from public.poker_tables t
 where t.id = p.table_id and t.status = 'playing' and p.out_kind is not null and p.seat is not null;

with ranked as (
  select p.id, (row_number() over (partition by p.table_id order by p.seat) - 1)::smallint as new_seat
  from public.table_players p
  join public.poker_tables t on t.id = p.table_id
  where t.status = 'playing' and p.seat is not null
)
update public.table_players p
   set seat = r.new_seat
  from ranked r
 where p.id = r.id and p.seat <> r.new_seat;
