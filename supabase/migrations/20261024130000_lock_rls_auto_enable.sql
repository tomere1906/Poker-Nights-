-- Security Advisor: public.rls_auto_enable() (created by Supabase for
-- "Enable automatic RLS") was executable by PUBLIC/anon/authenticated.
--
-- Safe to revoke: it's an event trigger function, so it can't be called
-- directly anyway ("can only be called as event trigger"), and Postgres
-- checks EXECUTE only when the event trigger is created, not when it fires.
-- Automatic RLS on new tables keeps working.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
