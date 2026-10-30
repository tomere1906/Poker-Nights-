-- Cash paid during the night ("השאיר מזומן").
--
-- A player who loses (when leaving mid-game, or at the end) may pay part of it
-- in cash to someone at the table: payer, holder, amount. Settlement subtracts
-- it and only the rest is transferred; the holder passes the cash on to the
-- winners. final_net (the night's result, stats) doesn't change.
--
-- Rules: everyone at the table reads it; only managers and co-managers record
-- or delete it, only while the game isn't over; no edits (delete + add again);
-- payer and holder are two different seats of the same table; every add and
-- delete is in the change log.

create table public.cash_payments (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.poker_tables (id) on delete cascade,
  payer_id uuid not null,
  holder_id uuid not null,
  amount integer not null constraint cash_payments_amount check (amount between 1 and 1000000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cash_payments_two_people check (payer_id <> holder_id),
  -- Both seats must be at the same table (and go away with the seat).
  foreign key (payer_id, table_id) references public.table_players (id, table_id) on delete cascade,
  foreign key (holder_id, table_id) references public.table_players (id, table_id) on delete cascade
);

create index cash_payments_table_id_idx on public.cash_payments (table_id);
create index cash_payments_payer_id_table_id_idx on public.cash_payments (payer_id, table_id);
create index cash_payments_holder_id_table_id_idx on public.cash_payments (holder_id, table_id);
create index cash_payments_created_by_idx on public.cash_payments (created_by);

alter table public.cash_payments enable row level security;

create policy "cash: people in the table read" on public.cash_payments
  for select to authenticated
  using (private.is_in_table(table_id));

create policy "cash: managers record while the game is on" on public.cash_payments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.can_manage_table(table_id)
    and private.table_not_ended(table_id)
  );

create policy "cash: managers delete while the game is on" on public.cash_payments
  for delete to authenticated
  using (private.can_manage_table(table_id) and private.table_not_ended(table_id));

revoke all on public.cash_payments from public, anon, authenticated;
grant select, insert, delete on public.cash_payments to authenticated;

-- ---------------------------------------------------------------------------
-- Change log
-- ---------------------------------------------------------------------------
create function private.log_cash_payments()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_log(new.table_id, 'cash_added', jsonb_build_object(
      'payer_id', new.payer_id, 'name', private.player_label(new.payer_id),
      'holder_id', new.holder_id, 'holder', private.player_label(new.holder_id), 'amount', new.amount));
  elsif tg_op = 'DELETE' then
    -- Skip when a seat is being removed (logged once as player_removed).
    if exists (select 1 from public.table_players p where p.id = old.payer_id)
       and exists (select 1 from public.table_players p where p.id = old.holder_id) then
      perform private.write_log(old.table_id, 'cash_removed', jsonb_build_object(
        'payer_id', old.payer_id, 'name', private.player_label(old.payer_id),
        'holder_id', old.holder_id, 'holder', private.player_label(old.holder_id), 'amount', old.amount));
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.log_cash_payments() from public, anon, authenticated;

create trigger log_cash_payments after insert or delete on public.cash_payments
  for each row execute function private.log_cash_payments();
