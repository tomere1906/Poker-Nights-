-- Display names and colors.
--
-- Users choose their own display name and color (profiles). Inside a table the
-- manager may override both for a player (table_players.nickname / .color),
-- without touching the user's profile. Guests get a manager-chosen name+color.
-- Everything stays linked by user_id, so renames never break history or stats.
--
-- Palette: 8 clear, distinct colors, stored as an index 0-7 (see src/lib/colors.js).

-- ---------------------------------------------------------------------------
-- profiles: user-chosen name + color
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column color smallint check (color between 0 and 7),
  -- Null until the user confirms their name on first sign-in.
  add column name_confirmed_at timestamptz;

-- Existing rows: make sure they fit the new length rule before adding it.
update public.profiles
set display_name = coalesce(nullif(left(btrim(display_name), 30), ''), 'שחקן')
where char_length(btrim(display_name)) not between 1 and 30;

alter table public.profiles
  add constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 30);

-- Google data now sets the name only on the FIRST sign-in (prefilled with the
-- first name). Later sign-ins update only the picture, never a chosen name.
create or replace function private.sync_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(left(btrim(new.raw_user_meta_data ->> 'given_name'), 30), ''),
      nullif(left(split_part(btrim(new.raw_user_meta_data ->> 'full_name'), ' ', 1), 30), ''),
      nullif(left(split_part(btrim(new.raw_user_meta_data ->> 'name'), ' ', 1), 30), ''),
      nullif(left(split_part(coalesce(new.email, ''), '@', 1), 30), ''),
      'שחקן'
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update
    set avatar_url = excluded.avatar_url;
  return new;
end;
$$;

-- A user may change only their own name, color and the "confirmed" mark.
-- Column-level grant: the avatar and id stay trigger-only.
grant update (display_name, color, name_confirmed_at) on public.profiles to authenticated;

create policy "profiles: users update their own name and color" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- table_players: per-table nickname + color (manager-only, as before)
-- ---------------------------------------------------------------------------
alter table public.table_players drop constraint table_players_name_check;
alter table public.table_players rename column name to nickname;
alter table public.table_players alter column nickname drop not null;

alter table public.table_players drop constraint table_players_color_check;
alter table public.table_players alter column color drop default;
alter table public.table_players alter column color drop not null;

alter table public.table_players
  add constraint table_players_nickname_length
    check (nickname is null or char_length(btrim(nickname)) between 1 and 30),
  add constraint table_players_color_range
    check (color is null or color between 0 and 7),
  -- Guests have no profile, so the manager must give them a name and a color.
  add constraint table_players_guest_has_name_and_color
    check (user_id is not null or (nickname is not null and color is not null));

comment on column public.table_players.nickname is
  'Per-table name set by the manager. Null for a user = show profiles.display_name. Required for guests.';
comment on column public.table_players.color is
  'Per-table color (0-7) set by the manager. Null for a user = use profiles.color. Required for guests.';
