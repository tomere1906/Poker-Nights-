-- Personal game history imported from a file (stats screen → "📥 ייבוא היסטוריה").
--
-- Each row is one night of the user's own history: the date, their net result
-- in whole shekels and an optional note. Imported games count only in that
-- user's own stats (never in "החבר׳ה שלי", never for anyone else) and are
-- marked "מיובא". Rows of one file share an import_id; "מחק את כל המיובאים"
-- deletes all of the user's rows.
--
-- Only the owner reads, adds and deletes their rows. Rows are never updated.
-- A user may keep at most 2,000 imported games.

create table public.imported_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  import_id uuid not null,
  played_on date not null,
  net integer not null,
  note text,
  imported_at timestamptz not null default now(),
  constraint imported_games_date_range check (played_on between date '2000-01-01' and date '2100-12-31'),
  constraint imported_games_net_range check (net between -10000000 and 10000000),
  constraint imported_games_note_length check (note is null or char_length(note) between 1 and 200)
);
create index imported_games_user_id_idx on public.imported_games (user_id, played_on);

-- Notes: hidden characters out (same list as private.clean_names), blank = no note.
create function private.clean_import_note()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  -- Written with \u escapes (the regex engine reads them), never as the characters themselves.
  hidden constant text := '[\u0001-\u001f\u007f-\u009f؜᠎​‎‏ -‮⁠-⁤⁦-⁩﻿]';
begin
  new.note := nullif(btrim(regexp_replace(new.note, hidden, '', 'g')), '');
  return new;
end;
$$;
revoke all on function private.clean_import_note() from public, anon, authenticated;

create trigger clean_import_note before insert on public.imported_games
  for each row execute function private.clean_import_note();

-- At most 2,000 imported games per user.
create function private.limit_imported_games()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.imported_games where user_id = new.user_id) >= 2000 then
    raise exception 'Too many imported games' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_imported_games() from public, anon, authenticated;

create trigger limit_imported_games before insert on public.imported_games
  for each row execute function private.limit_imported_games();

alter table public.imported_games enable row level security;

create policy "imported: read your own" on public.imported_games
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "imported: add your own" on public.imported_games
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "imported: delete your own" on public.imported_games
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.imported_games from public, anon, authenticated;
grant select, delete on public.imported_games to authenticated;
-- Only these columns may be written; id, user_id and imported_at come from the defaults.
grant insert (import_id, played_on, net, note) on public.imported_games to authenticated;
