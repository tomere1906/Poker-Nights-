-- A phone number for Bit ("מספר טלפון (לביט)"), optional, in the user's profile.
--
-- Privacy: the number is NOT a column of profiles (people who share a table
-- read each other's profile). It lives in its own table, readable only by:
--   - its owner, and
--   - a user who has to transfer money to its owner: a stored transfer
--     (public.settlement_transfers) of a closed table, from that user's seat to
--     the owner's seat, with a part that isn't cash.
-- Nobody else: not the rest of the table, not the manager, not strangers,
-- not a player of another game. It is never written to the change log, the
-- invite or the share image. Reopening the table deletes its transfers, so
-- the access goes with them.
--
-- Only Israeli mobile numbers, stored as 05XXXXXXXX. The owner adds, changes or
-- deletes it; deleting the account deletes it (cascade).

create table public.profile_phones (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  phone text not null constraint profile_phones_phone check (phone ~ '^05[0-9]{8}$'),
  updated_at timestamptz not null default now()
);

alter table public.profile_phones enable row level security;

-- The signed-in user has to transfer money to p_user: a stored transfer of a
-- closed table, from my seat to theirs, that isn't all cash.
create function private.pays_by_transfer_to(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.settlement_transfers t
    join public.poker_tables pt on pt.id = t.table_id
    join public.table_players payer on payer.id = t.from_player
    join public.table_players receiver on receiver.id = t.to_player
    where pt.status = 'ended'
      and payer.user_id = (select auth.uid())
      and receiver.user_id = p_user
      and t.amount > t.cash
  );
$$;
revoke all on function private.pays_by_transfer_to(uuid) from public;
grant execute on function private.pays_by_transfer_to(uuid) to authenticated;

create policy "phones: the owner, and people who have to transfer money to them" on public.profile_phones
  for select to authenticated
  using (user_id = (select auth.uid()) or private.pays_by_transfer_to(user_id));

create policy "phones: the owner adds their own" on public.profile_phones
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "phones: the owner changes their own" on public.profile_phones
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "phones: the owner deletes their own" on public.profile_phones
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.profile_phones from public, anon, authenticated;
grant select, delete on public.profile_phones to authenticated;
grant insert (user_id, phone) on public.profile_phones to authenticated;
grant update (phone) on public.profile_phones to authenticated;

create function private.touch_profile_phone()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_profile_phone() from public, anon, authenticated;

create trigger touch_profile_phone before update on public.profile_phones
  for each row execute function private.touch_profile_phone();
