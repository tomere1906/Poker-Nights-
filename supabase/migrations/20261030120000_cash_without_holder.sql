-- Cash goes into the night's common pot: nobody "holds" it.
--
-- A cash payment is now just who paid and how much (always part, or all, of
-- that player's loss; the app blocks more). The settlement splits the pot among
-- the winners and only the rest is transferred. So holder_id goes away, with
-- its foreign key, check (payer <> holder) and index, and the log stops
-- naming a holder.

-- The log first (it reads holder_id), then the column.
create or replace function private.log_cash_payments()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_log(new.table_id, 'cash_added', jsonb_build_object(
      'payer_id', new.payer_id, 'name', private.player_label(new.payer_id), 'amount', new.amount));
  elsif tg_op = 'DELETE' then
    -- Skip when the seat is being removed (logged once as player_removed).
    if exists (select 1 from public.table_players p where p.id = old.payer_id) then
      perform private.write_log(old.table_id, 'cash_removed', jsonb_build_object(
        'payer_id', old.payer_id, 'name', private.player_label(old.payer_id), 'amount', old.amount));
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.log_cash_payments() from public, anon, authenticated;

alter table public.cash_payments drop constraint if exists cash_payments_two_people;
alter table public.cash_payments drop constraint if exists cash_payments_holder_id_table_id_fkey;
drop index if exists public.cash_payments_holder_id_table_id_idx;
alter table public.cash_payments drop column holder_id;
