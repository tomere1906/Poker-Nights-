-- Fix for 20261110120000_clean_names.sql: cleaning must not hide a blank name.
-- A name someone types that is empty (or made only of hidden characters) is
-- rejected again by the existing length checks, as before; it's never swapped
-- silently for "שחקן" or for "no name".
-- The one exception: a new profile created at the first Google sign-in, whose
-- Google name is only hidden characters, gets "שחקן" (otherwise sign-in fails).

create or replace function private.clean_names()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  -- Written with \u escapes (the regex engine reads them), never as the characters themselves.
  hidden constant text := '[\u0001-\u001f\u007f-\u009f\u061c\u180e\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]';
begin
  if tg_table_name = 'profiles' then
    new.display_name := regexp_replace(new.display_name, hidden, '', 'g');
    if tg_op = 'INSERT' and btrim(coalesce(new.display_name, '')) = '' then
      new.display_name := 'שחקן';
    end if;
  elsif tg_table_name = 'table_players' then
    new.nickname := regexp_replace(new.nickname, hidden, '', 'g');
  elsif tg_table_name = 'poker_tables' then
    new.name := regexp_replace(new.name, hidden, '', 'g');
  end if;
  return new;
end;
$$;
