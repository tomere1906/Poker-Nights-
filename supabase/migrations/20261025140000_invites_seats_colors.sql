-- Invites: members pick their own seat. Seats become unique per table.
-- Palette: 12 colors (indexes 0-11).

-- ---------------------------------------------------------------------------
-- 12 colors
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint profiles_color_check;
alter table public.profiles add constraint profiles_color_check check (color between 0 and 11);

alter table public.table_players drop constraint table_players_color_range;
alter table public.table_players add constraint table_players_color_range check (color is null or color between 0 and 11);

-- ---------------------------------------------------------------------------
-- One player per seat. Deferrable, so a swap can run inside one transaction.
-- ---------------------------------------------------------------------------
alter table public.table_players
  add constraint table_players_seat_unique unique (table_id, seat) deferrable initially immediate;

-- Managers move a player to a seat; if someone sits there, the two swap.
-- SECURITY INVOKER: runs with the caller's rights, so RLS still decides
-- (a non-manager's updates simply affect no rows).
create function public.swap_seats(p_player uuid, p_seat integer)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_table uuid;
  v_from smallint;
begin
  select table_id, seat into v_table, v_from from public.table_players where id = p_player;
  if v_table is null or v_from = p_seat then
    return;
  end if;
  set constraints public.table_players_seat_unique deferred;
  update public.table_players set seat = v_from where table_id = v_table and seat = p_seat and id <> p_player;
  update public.table_players set seat = p_seat where id = p_player;
  -- Check right away (and stop deferring for the rest of the transaction).
  set constraints public.table_players_seat_unique immediate;
end;
$$;

revoke all on function public.swap_seats(uuid, integer) from public, anon;
grant execute on function public.swap_seats(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Members take their own free seat
-- ---------------------------------------------------------------------------
create function private.table_not_ended(p_table uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.poker_tables t where t.id = p_table and t.status <> 'ended');
$$;
revoke all on function private.table_not_ended(uuid) from public;
grant execute on function private.table_not_ended(uuid) to authenticated;

-- One insert policy (managers OR a member seating themselves) keeps the
-- Performance Advisor free of "multiple permissive policies".
drop policy "players: managers seat guests or people in the table" on public.table_players;

create policy "players: managers seat anyone in the table, members seat themselves" on public.table_players
  for insert to authenticated
  with check (
    (
      private.can_manage_table(table_id)
      and (user_id is null or private.user_in_table(table_id, user_id))
    )
    or (
      -- Their own seat only, once (unique table_id+user_id), in a free seat
      -- (unique table_id+seat), before the game ends, with no overrides or results.
      user_id = (select auth.uid())
      and private.is_in_table(table_id)
      and private.table_not_ended(table_id)
      and nickname is null
      and color is null
      and final_value is null
      and final_net is null
    )
  );
