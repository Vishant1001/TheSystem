-- Hosted security check. READ-ONLY: this whole file is one SELECT, so it cannot
-- write anything, create a user, or change a setting.
--
-- Paste it into the Supabase dashboard SQL editor after `npx supabase db push`
-- and press Run. You get one row per check and a final ALL CHECKS row. Every
-- row should read PASS; a FAIL row's detail column says exactly what is wrong.
--
-- It checks the security model only through the catalog. The behavioural
-- proofs (test users, the RLS proof, the smoke test) stay on the local stack:
-- npm run db:verify. Locally this file passes too: npm run db:sql -- <path>.

with
-- ---------------------------------------------------------------------------
-- What the migrations are supposed to have produced
-- ---------------------------------------------------------------------------
expected_tables(name) as (
  values
    ('hunters'), ('hunter_target_history'), ('quests'), ('quest_completions'),
    ('food_entries'), ('workouts'), ('workout_sets'), ('xp_events'),
    ('stat_allocations'), ('daily_logs'), ('game_config'),
    ('safe_periods'), ('redemption_stone_events')
),
-- The client surface: the 17 RPCs, plus the quests trigger function, which can
-- only ever run as a trigger.
expected_client_functions(name) as (
  values
    ('acknowledge_report'), ('allocate_points'), ('close_days'), ('complete_quest'),
    ('delete_food'), ('delete_workout'), ('game_today'), ('hunter_snapshot'),
    ('log_food'), ('log_workout'), ('onboard_hunter'), ('pending_report'),
    ('undo_completion'), ('update_hunter_profile'),
    ('start_safe_period'), ('end_safe_period'), ('update_hunter_rules'),
    ('quests_guard_immutable')
),
expected_config_keys(key) as (
  values
    ('version'), ('game_day_start_hour'), ('quest_xp_by_difficulty'), ('daily_caps'),
    ('stat_xp_divisor'), ('min_stat_xp_per_tag'), ('free_points_per_daily_clear'),
    ('close_days_max_backfill'), ('level_curve'), ('stat_order'), ('award_sources'),
    ('penalty'), ('stones'), ('safe_zones'), ('gym')
),
-- Objects created by the last migration; their presence means every migration
-- before it ran too.
latest_migration_functions(name) as (
  values ('day_outcome'), ('safe_period_refusal'), ('update_hunter_rules')
),

-- ---------------------------------------------------------------------------
-- What is actually there
-- ---------------------------------------------------------------------------
public_tables as (
  select c.relname::text as name, c.relrowsecurity as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
public_functions as (
  select p.oid, p.proname::text as name, p.prosecdef, p.pronargs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
authenticated_can_execute as (
  select distinct name from public_functions
  where has_function_privilege('authenticated', oid, 'execute')
),
anon_can_execute as (
  select distinct name from public_functions
  where has_function_privilege('anon', oid, 'execute')
),
-- Table privileges that differ from the design: authenticated may SELECT every
-- table, INSERT and UPDATE only quests, DELETE nothing; anon may do nothing.
grant_violations as (
  select format('%s %s on %s', role_name, privilege, t.name) as violation
  from expected_tables t
  cross join (values ('authenticated'), ('anon')) as roles(role_name)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as privs(privilege)
  where to_regclass('public.' || t.name) is not null
    and has_table_privilege(role_name, ('public.' || t.name)::regclass, privilege)
      <> case
           when role_name = 'anon' then false
           when privilege = 'SELECT' then true
           when privilege in ('INSERT', 'UPDATE') then t.name = 'quests'
           else false
         end
),

checks(ord, check_name, passed, detail) as (
  -- 1 -----------------------------------------------------------------------
  select 1, 'All 13 tables exist',
    not exists (select 1 from expected_tables e where e.name not in (select name from public_tables)),
    coalesce(
      'missing: ' || (select string_agg(e.name, ', ') from expected_tables e
                      where e.name not in (select name from public_tables)),
      'all present')

  -- 2 -----------------------------------------------------------------------
  union all
  select 2, 'RLS enabled on every public table',
    not exists (select 1 from public_tables where not rls),
    coalesce(
      'RLS OFF on: ' || (select string_agg(name, ', ') from public_tables where not rls),
      format('on for all %s public tables', (select count(*) from public_tables)))

  -- 3 -----------------------------------------------------------------------
  union all
  select 3, 'xp_events has no INSERT/UPDATE/DELETE policies',
    not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'xp_events'
        and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
    coalesce(
      'write policies found: ' || (
        select string_agg(policyname || ' (' || cmd || ')', ', ') from pg_policies
        where schemaname = 'public' and tablename = 'xp_events'
          and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
      format('only read policies: %s', (
        select coalesce(string_agg(policyname, ', '), 'none') from pg_policies
        where schemaname = 'public' and tablename = 'xp_events')))

  -- 4 -----------------------------------------------------------------------
  union all
  select 4, 'No client role can write xp_events (grants)',
    not exists (
      select 1
      from (values ('anon'), ('authenticated')) as r(role_name)
      cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(privilege)
      where has_table_privilege(role_name, 'public.xp_events'::regclass, privilege)),
    coalesce(
      'granted: ' || (
        select string_agg(role_name || ' ' || privilege, ', ')
        from (values ('anon'), ('authenticated')) as r(role_name)
        cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(privilege)
        where has_table_privilege(role_name, 'public.xp_events'::regclass, privilege)),
      'anon and authenticated hold no INSERT, UPDATE, DELETE or TRUNCATE on xp_events')

  -- 5 -----------------------------------------------------------------------
  union all
  select 5, 'authenticated can EXECUTE exactly the 17 RPCs + trigger function',
    not exists (select name from expected_client_functions
                except select name from authenticated_can_execute)
    and not exists (select name from authenticated_can_execute
                    except select name from expected_client_functions),
    coalesce(nullif(concat_ws('; ',
      'missing: ' || (select string_agg(name, ', ') from (
         select name from expected_client_functions
         except select name from authenticated_can_execute) m),
      'EXTRA, should be revoked: ' || (select string_agg(name, ', ') from (
         select name from authenticated_can_execute
         except select name from expected_client_functions) x)
    ), ''), format('exactly %s functions', (select count(*) from authenticated_can_execute)))

  -- 6 -----------------------------------------------------------------------
  union all
  select 6, 'anon can EXECUTE no RPC',
    not exists (select name from anon_can_execute where name <> 'quests_guard_immutable'),
    coalesce(
      'anon can run: ' || (select string_agg(name, ', ') from anon_can_execute
                           where name <> 'quests_guard_immutable'),
      'none (only the trigger function, which cannot be called directly)')

  -- 7 -----------------------------------------------------------------------
  union all
  select 7, 'Table grants match the design',
    not exists (select 1 from grant_violations),
    coalesce(
      'differs: ' || (select string_agg(violation, ', ') from grant_violations),
      'authenticated: SELECT all, INSERT/UPDATE quests only; anon: nothing')

  -- 8 -----------------------------------------------------------------------
  union all
  select 8, 'Every owner policy is scoped to auth.uid()',
    not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and policyname <> 'game_config_select_all'
        and coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%'),
    coalesce(
      'unscoped: ' || (
        select string_agg(tablename || '.' || policyname, ', ') from pg_policies
        where schemaname = 'public'
          and policyname <> 'game_config_select_all'
          and coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%'),
      format('%s policies, all owner-scoped (game_config is shared reference data)',
             (select count(*) from pg_policies where schemaname = 'public')))

  -- 9 -----------------------------------------------------------------------
  union all
  select 9, 'hunter_snapshot / game_today: definer, no user id argument',
    (select count(*) = 2 from public_functions
     where name in ('hunter_snapshot', 'game_today') and prosecdef and pronargs = 0),
    'both SECURITY DEFINER with zero parameters (C1 as amended)'

  -- 10 ----------------------------------------------------------------------
  union all
  select 10, 'game_config is seeded',
    not exists (select key from expected_config_keys
                except select key from public.game_config),
    coalesce(
      'missing keys: ' || (select string_agg(key, ', ') from (
        select key from expected_config_keys except select key from public.game_config) k),
      format('all %s keys present', (select count(*) from expected_config_keys)))

  -- 11 ----------------------------------------------------------------------
  union all
  select 11, 'Latest migration applied',
    not exists (select name from latest_migration_functions
                except select name from public_functions),
    coalesce(
      'missing: ' || (select string_agg(name, ', ') from (
        select name from latest_migration_functions
        except select name from public_functions) l),
      'Safe Zones functions present (migration 20261123000300)')

  -- 12 ----------------------------------------------------------------------
  union all
  select 12, 'Every hunter has a rules epoch (Phase 2 rules start date)',
    not exists (select 1 from public.hunters where rules_from is null),
    format('%s hunters, all with rules_from', (select count(*) from public.hunters))
)

select check_name, case when passed then 'PASS' else 'FAIL' end as status, detail
from (
  select ord, check_name, passed, detail from checks
  union all
  select 99, 'ALL CHECKS', bool_and(passed),
         format('%s of %s passing', count(*) filter (where passed), count(*))
  from checks
) as results
order by ord;
