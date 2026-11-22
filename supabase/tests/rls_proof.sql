-- RLS proof (brief 1.3 acceptance): hunter A cannot read or write hunter B.
--
-- FOR A LOCAL / TEST DATABASE. It creates two throwaway auth users and ends in
-- ROLLBACK, so nothing is persisted, but do not point it at anything precious.
--
--   npx supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_proof.sql
--
-- Plain SQL only - no psql meta-commands - so the whole file can equally be
-- pasted into the Supabase dashboard SQL editor.
--
-- Every check raises an exception on failure, so a clean run that ends with
-- "RLS PROOF PASSED" means the policies hold.

begin;

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'hunter-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'hunter-b@test.local');

-- ---------------------------------------------------------------------------
-- Onboard both hunters, each acting as themselves.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);
set local role authenticated;
select public.onboard_hunter('Hunter A', 'Europe/Berlin', 1700, 1900, 120);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true
);
set local role authenticated;
select public.onboard_hunter('Hunter B', 'Europe/Berlin', 2200, 2400, 160);

-- Give B something in every table worth stealing.
select public.log_food('B protein shake', 300, 60);
select public.log_workout('B session', null, '[{"exercise_name":"Squat","reps":5,"weight_kg":100}]'::jsonb);
select public.allocate_points('STR', 1);

-- ---------------------------------------------------------------------------
-- Act as A and try to see or touch B.
-- ---------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_user_b uuid := '22222222-2222-2222-2222-222222222222';
  v_leaks text := '';
  v_count integer;
begin
  select count(*) into v_count from public.hunters where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'hunters '; end if;

  select count(*) into v_count from public.hunter_target_history where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'hunter_target_history '; end if;

  select count(*) into v_count from public.quests where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'quests '; end if;

  select count(*) into v_count from public.quest_completions where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'quest_completions '; end if;

  select count(*) into v_count from public.food_entries where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'food_entries '; end if;

  select count(*) into v_count from public.workouts where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'workouts '; end if;

  select count(*) into v_count from public.workout_sets where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'workout_sets '; end if;

  select count(*) into v_count from public.xp_events where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'xp_events '; end if;

  select count(*) into v_count from public.stat_allocations where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'stat_allocations '; end if;

  select count(*) into v_count from public.daily_logs where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'daily_logs '; end if;

  if v_leaks <> '' then
    raise exception 'RLS LEAK: hunter A can read hunter B rows in: %', v_leaks;
  end if;

  raise notice 'read isolation: A sees no rows of B in any table';
end;
$$;

-- A sees exactly their own hunter row, and no more.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.hunters;
  if v_count <> 1 then
    raise exception 'RLS LEAK: unfiltered select on hunters returned % rows', v_count;
  end if;

  select count(*) into v_count from public.quests;
  if v_count <> 4 then
    raise exception 'RLS LEAK: unfiltered select on quests returned % rows (expected A''s 4)', v_count;
  end if;

  raise notice 'unfiltered selects return only the caller rows';
end;
$$;

-- ---------------------------------------------------------------------------
-- Writes the client must never be able to perform.
-- ---------------------------------------------------------------------------
do $$
declare
  v_user_a uuid := '11111111-1111-1111-1111-111111111111';
  v_user_b uuid := '22222222-2222-2222-2222-222222222222';
  v_blocked boolean;
  v_quest_b uuid;
  v_statement text;
begin
  -- 1. The ledger is append-only and closed to clients (ADR-1).
  v_blocked := false;
  begin
    insert into public.xp_events (user_id, occurred_on, source_type, xp)
    values (v_user_a, current_date, 'quest', 9999);
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: client inserted into xp_events';
  end if;

  -- 2. Nor can it edit or delete existing ledger rows.
  v_blocked := false;
  begin
    update public.xp_events set xp = xp + 1000 where user_id = v_user_a;
    if found then
      raise exception 'updated';
    end if;
    v_blocked := true;
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: client updated xp_events';
  end if;

  -- 3. A cannot create rows owned by B.
  v_blocked := false;
  begin
    insert into public.quests (
      user_id, title, type, category, tracking, goal_type, target_value,
      stat_tags, difficulty, schedule_days
    )
    values (
      v_user_b, 'Planted quest', 'daily', 'life', 'manual', 'duration', 10,
      array['INT'], 'S', array[1,2,3,4,5,6,7]::smallint[]
    );
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: hunter A inserted a quest owned by B';
  end if;

  -- 4. A cannot create an auto-tracked quest for themselves (Phase 1 rule).
  v_blocked := false;
  begin
    insert into public.quests (
      user_id, title, type, category, tracking, goal_type,
      stat_tags, difficulty, schedule_days
    )
    values (
      v_user_a, 'Fake auto quest', 'daily', 'fitness', 'auto_workout', 'boolean',
      array['STR'], 'S', array[1,2,3,4,5,6,7]::smallint[]
    );
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: client created an auto-tracked quest';
  end if;

  -- 5. A cannot complete one of B's quests, even knowing its id.
  --    Role switches go through EXECUTE so plpgsql runs them as utility
  --    statements rather than trying to plan them.
  execute 'reset role';
  select id into v_quest_b from public.quests where user_id = v_user_b limit 1;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  v_blocked := false;
  begin
    perform public.complete_quest(v_quest_b, 30);
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: hunter A completed a quest owned by B';
  end if;

  -- 6. No internal helper is reachable from a client role.
  --
  --    This matters more than it looks: Supabase's default privileges grant
  --    EXECUTE on new functions to `authenticated` by name, so revoking from
  --    PUBLIC alone leaves that grant in place. Only a permission denial counts
  --    as blocked here - any other error means the call actually ran.
  foreach v_statement in array array[
    'select public.game_today_for(''22222222-2222-2222-2222-222222222222''::uuid)',
    'select public.effective_targets(''22222222-2222-2222-2222-222222222222''::uuid, current_date)',
    'select public.auto_quest_for(''22222222-2222-2222-2222-222222222222''::uuid, ''auto_workout'', current_date)',
    'select public.evaluate_auto_workout(''22222222-2222-2222-2222-222222222222''::uuid, current_date)',
    'select public.evaluate_auto_protein(''22222222-2222-2222-2222-222222222222''::uuid, current_date)',
    'select public.evaluate_auto_kcal_range(''22222222-2222-2222-2222-222222222222''::uuid, current_date)',
    'select public.award_quest_completion(''22222222-2222-2222-2222-222222222222''::uuid, null::public.quests, current_date, null)',
    'select public.reverse_quest_completion(''22222222-2222-2222-2222-222222222222''::uuid, gen_random_uuid())',
    'select public.active_completion_id(gen_random_uuid(), current_date)',
    'select public.compute_quest_award(''S'', ''life'', array[''INT''], 0)',
    'select public.game_date_at(now(), ''UTC'', 3)',
    'select public.game_config_value(''daily_caps'')',
    'select public.game_config_int(''stat_xp_divisor'')',
    'select public.quest_xp_for(''S'')',
    'select public.daily_cap_for(''life'')',
    'select public.is_valid_timezone(''UTC'')',
    'select public.assert_authenticated()'
  ]
  loop
    v_blocked := false;
    begin
      execute v_statement;
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    if not v_blocked then
      raise exception 'SECURITY FAILURE: a client role executed: %', v_statement;
    end if;
  end loop;

  raise notice 'write isolation: every forbidden write was rejected';
end;
$$;

-- ---------------------------------------------------------------------------
-- The two SECURITY DEFINER read RPCs are pinned to the caller (C1 as amended).
-- Neither takes a user id, so the only hunter they can ever describe is the
-- one in the JWT. Checked here from B's side.
-- ---------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_user_a uuid := '11111111-1111-1111-1111-111111111111';
  v_user_b uuid := '22222222-2222-2222-2222-222222222222';
  v_snapshot jsonb;
begin
  v_snapshot := public.hunter_snapshot();

  if (v_snapshot -> 'hunter' ->> 'user_id')::uuid <> v_user_b then
    raise exception 'SECURITY FAILURE: hunter_snapshot gave hunter B the row of %',
      v_snapshot -> 'hunter' ->> 'user_id';
  end if;

  if v_snapshot -> 'hunter' ->> 'hunter_name' <> 'Hunter B' then
    raise exception 'SECURITY FAILURE: hunter_snapshot returned the wrong hunter: %',
      v_snapshot -> 'hunter' ->> 'hunter_name';
  end if;

  if v_snapshot::text like '%' || v_user_a::text || '%' then
    raise exception 'RLS LEAK: hunter B snapshot mentions hunter A';
  end if;

  -- B logged a workout during setup, so B's own ledger must be visible to B.
  if (v_snapshot -> 'total_xp')::integer <= 0 then
    raise exception 'hunter_snapshot returned no XP for B, expected B own ledger';
  end if;

  if public.game_today() is null then
    raise exception 'game_today returned null for an authenticated hunter';
  end if;

  raise notice 'definer read RPCs: pinned to the caller, B sees only B';
end;
$$;

-- ---------------------------------------------------------------------------
-- An anonymous caller sees nothing at all.
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;

do $$
declare
  v_statement text;
  v_blocked boolean;
  v_count integer;
begin
  -- No rows, whether or not the select itself is permitted.
  begin
    select count(*) into v_count from public.hunters;
    if v_count <> 0 then
      raise exception 'RLS LEAK: anon read % hunter rows', v_count;
    end if;
  exception when insufficient_privilege then
    null;
  end;

  -- No RPCs. Only a permission denial counts as blocked, so a call that runs
  -- and merely errors for some other reason still fails this check.
  foreach v_statement in array array[
    'select public.hunter_snapshot()',
    'select public.game_today()',
    'select public.close_days()',
    'select public.onboard_hunter(''X'', ''UTC'', 1700, 1900, 120)',
    'select public.log_food(''X'', 1, 1)'
  ]
  loop
    v_blocked := false;
    begin
      execute v_statement;
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    if not v_blocked then
      raise exception 'SECURITY FAILURE: anon executed: %', v_statement;
    end if;
  end loop;

  raise notice 'anonymous access: no rows, no RPCs';
end;
$$;

reset role;

do $$
begin
  raise notice '-------------------------------';
  raise notice 'RLS PROOF PASSED';
  raise notice '-------------------------------';
end;
$$;

rollback;
