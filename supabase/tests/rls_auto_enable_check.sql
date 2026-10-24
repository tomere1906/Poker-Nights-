-- Checks that automatic RLS still works after revoking EXECUTE on
-- public.rls_auto_enable(). Creates a scratch table, reads its RLS flag and
-- the function's privileges, then raises ON PURPOSE so the table is rolled
-- back. The error message is the report.
do $$
declare
  rls_on boolean;
  report text;
begin
  create table public._rls_auto_enable_probe (id int);

  select c.relrowsecurity into rls_on
  from pg_class c
  where c.oid = 'public._rls_auto_enable_probe'::regclass;

  report := format(
    E'automatic RLS on new table: %s\npublic can execute: %s\nanon can execute: %s\nauthenticated can execute: %s',
    case when rls_on then 'YES ✅' else 'NO ❌' end,
    case when has_function_privilege('public', 'public.rls_auto_enable()', 'execute') then 'yes ❌' else 'no ✅' end,
    case when has_function_privilege('anon', 'public.rls_auto_enable()', 'execute') then 'yes ❌' else 'no ✅' end,
    case when has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute') then 'yes ❌' else 'no ✅' end
  );

  raise exception E'%\n(scratch table rolled back)', report;
end
$$;
