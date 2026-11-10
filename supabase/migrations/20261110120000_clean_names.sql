-- Names can't hide characters: invisible and direction-control characters are
-- removed from every name before it's saved (profile names, per-table names,
-- table names), including the first name that comes from Google.
--
-- Why: with them, "Tomer" + an invisible character looks exactly like the real
-- Tomer, and a right-to-left override flips how the rest of a line displays
-- (in the log, the settlement, the WhatsApp invite).
-- Removed: control characters, zero-width space, LRM/RLM, Arabic letter mark,
-- the embedding/override/isolate controls (U+202A–202E, U+2066–2069), word
-- joiner and invisible operators (U+2060–2064), BOM, Mongolian vowel separator,
-- line/paragraph separators. Kept: the zero-width (non-)joiner, which
-- family and flag emoji need.
-- A profile name left empty becomes 'שחקן'; an empty per-table name is
-- rejected (the existing length check); an empty table name means no name.
-- Existing names aren't rewritten (a table name can only be changed by its
-- manager); the next change of any name cleans it.
-- The trigger runs before guard_table_update (alphabetical), so the guard sees
-- the cleaned name.

create function private.clean_names()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  -- Written with \u escapes (the regex engine reads them), never as the characters themselves.
  hidden constant text := '[\u0001-\u001f\u007f-\u009f\u061c\u180e\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]';
begin
  if tg_table_name = 'profiles' then
    new.display_name := regexp_replace(new.display_name, hidden, '', 'g');
    if btrim(coalesce(new.display_name, '')) = '' then
      new.display_name := 'שחקן';
    end if;
  elsif tg_table_name = 'table_players' then
    new.nickname := regexp_replace(new.nickname, hidden, '', 'g');
  elsif tg_table_name = 'poker_tables' then
    new.name := nullif(btrim(regexp_replace(new.name, hidden, '', 'g')), '');
  end if;
  return new;
end;
$$;
revoke all on function private.clean_names() from public, anon, authenticated;

create trigger clean_names before insert or update of display_name on public.profiles
  for each row execute function private.clean_names();
create trigger clean_names before insert or update of nickname on public.table_players
  for each row execute function private.clean_names();
create trigger clean_names before insert or update of name on public.poker_tables
  for each row execute function private.clean_names();
