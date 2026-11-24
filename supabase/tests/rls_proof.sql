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
select public.start_safe_period('travel', 2);
select public.update_hunter_rules('lenient', array[6, 7]::smallint[]);

-- A stone for B. Only close_days() earns one, so the setup writes it as owner.
reset role;
insert into public.redemption_stone_events (user_id, occurred_on, delta, reason, log_date)
values ('22222222-2222-2222-2222-222222222222', current_date, 1, 'earned', current_date);

-- Penalties only come from close_days(); the setup writes them as owner.
insert into public.penalties (user_id, trigger_day, mode, state, missed_quests)
values ('22222222-2222-2222-2222-222222222222', current_date - 1, 'standard', 'pending_choice',
        '[{"quest_id": null, "title": "Study", "category": "life", "stat_tags": ["INT"]}]');
insert into public.penalties (user_id, trigger_day, mode, state, missed_quests)
values ('11111111-1111-1111-1111-111111111111', current_date - 1, 'standard', 'pending_choice',
        '[{"quest_id": null, "title": "Study", "category": "life", "stat_tags": ["INT"]}]');
select public.start_trial(id) from public.penalties
where user_id = '11111111-1111-1111-1111-111111111111';

-- A custom exercise and a record for B (records only come from logging).
insert into public.exercises (user_id, name, kind)
values ('22222222-2222-2222-2222-222222222222', 'B secret lift', 'strength');
insert into public.personal_records (user_id, exercise_id, pr_kind, value_centi, occurred_on, baseline)
select '22222222-2222-2222-2222-222222222222', id, 'max_weight', 10000, current_date, true
from public.exercises where name = 'B secret lift';
insert into public.bosses (user_id, exercise_id, target_weight_kg, target_reps, difficulty)
select '22222222-2222-2222-2222-222222222222', id, 100, 1, 'C'
from public.exercises where name = 'B secret lift';

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

  select count(*) into v_count from public.safe_periods where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'safe_periods '; end if;

  select count(*) into v_count from public.redemption_stone_events where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'redemption_stone_events '; end if;

  select count(*) into v_count from public.penalties where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'penalties '; end if;

  select count(*) into v_count from public.exercises where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'exercises '; end if;

  select count(*) into v_count from public.personal_records where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'personal_records '; end if;

  select count(*) into v_count from public.bosses where user_id = v_user_b;
  if v_count <> 0 then v_leaks := v_leaks || 'bosses '; end if;

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
  if v_count <> 5 then
    raise exception 'RLS LEAK: unfiltered select on quests returned % rows (expected A''s 4 + 1 trial)', v_count;
  end if;

  -- ...except the shared exercise library, which every hunter reads.
  select count(*) into v_count from public.exercises where user_id is null;
  if v_count = 0 then
    raise exception 'the exercise library must be readable by a signed-in hunter';
  end if;
  select count(*) into v_count from public.exercises where user_id is not null;
  if v_count <> 0 then
    raise exception 'RLS LEAK: A sees % custom exercises that are not A''s', v_count;
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

  -- 4b. Phase 2 tables are written only by RPCs: no direct writes at all.
  foreach v_statement in array array[
    format('insert into public.safe_periods (user_id, kind, start_on, end_on) values (%L, ''sick'', current_date, current_date)', v_user_a),
    'update public.safe_periods set end_on = end_on + 30',
    'delete from public.safe_periods',
    format('insert into public.redemption_stone_events (user_id, occurred_on, delta, reason, log_date) values (%L, current_date, 1, ''earned'', current_date)', v_user_a),
    'update public.redemption_stone_events set delta = 1',
    'delete from public.redemption_stone_events',
    'update public.hunter_target_history set penalty_mode = ''lenient''',
    'update public.daily_logs set status = ''cleared'', streak = 99',
    'update public.hunters set rules_from = current_date + 365',
    format('insert into public.penalties (user_id, trigger_day, mode, state, missed_quests) values (%L, current_date, ''standard'', ''pending_choice'', ''[]'')', v_user_a),
    'update public.penalties set state = ''redeemed''',
    'delete from public.penalties',
    'update public.xp_events set related_event_id = null',
    'delete from public.quests',
    'insert into public.exercises (user_id, source_id, name, kind) values (null, ''Fake_Lift'', ''Fake lift'', ''strength'')',
    format('insert into public.exercises (user_id, name, kind) values (%L, ''Planted'', ''strength'')', v_user_b),
    'delete from public.exercises',
    format('insert into public.personal_records (user_id, exercise_id, pr_kind, value_centi, occurred_on, baseline) select %L, id, ''e1rm'', 99999, current_date, false from public.exercises limit 1', v_user_a),
    'update public.personal_records set value_centi = 1',
    'delete from public.personal_records',
    format('insert into public.bosses (user_id, exercise_id, target_weight_kg, target_reps, difficulty) select %L, id, 1, 1, ''S'' from public.exercises limit 1', v_user_a),
    'update public.bosses set defeated_on = current_date',
    'delete from public.bosses'
  ]
  loop
    v_blocked := false;
    begin
      execute v_statement;
    exception when insufficient_privilege then
      v_blocked := true;
    end;
    if not v_blocked then
      raise exception 'SECURITY FAILURE: client ran a direct write: %', v_statement;
    end if;
  end loop;

  -- 4c. A trial is a quest, but not one the client may create or touch.
  v_blocked := false;
  begin
    insert into public.quests (
      user_id, title, type, category, tracking, goal_type, target_value, stat_tags, difficulty
    )
    values (v_user_a, 'Fake trial', 'trial', 'life', 'manual', 'duration', 1, array['INT'], 'E');
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: client inserted a trial quest';
  end if;

  v_blocked := false;
  begin
    update public.quests set target_value = 1 where user_id = v_user_a and type = 'trial';
  exception when others then
    v_blocked := sqlerrm like 'TRIAL_IMMUTABLE%';
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: client edited its own trial quest';
  end if;

  -- ...while editing an ordinary quest still works (the guard trigger runs
  -- for the client even though no client role holds EXECUTE on it).
  update public.quests set title = 'Study hard' where user_id = v_user_a and title = 'Study';
  if not found then
    raise exception 'a client could not edit its own quest';
  end if;

  -- 4d. The library is read-only: an update reaches no row at all.
  update public.exercises set name = 'Renamed by A' where user_id is null;
  if found then
    raise exception 'SECURITY FAILURE: a client renamed a library exercise';
  end if;

  -- A may create, rename and archive its own custom exercise - but never
  -- change what kind of exercise it is.
  insert into public.exercises (user_id, name, kind) values (v_user_a, 'A custom lift', 'cardio');
  update public.exercises set name = 'A renamed lift' where user_id = v_user_a;
  if not found then
    raise exception 'a client could not rename its own custom exercise';
  end if;
  v_blocked := false;
  begin
    update public.exercises set kind = 'strength' where user_id = v_user_a;
  exception when others then
    v_blocked := sqlerrm like 'EXERCISE_IMMUTABLE%';
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: a client changed the kind of an exercise';
  end if;
  execute 'reset role';
  select id into v_quest_b from public.exercises where user_id = v_user_b limit 1;
  execute 'set local role authenticated';
  v_blocked := false;
  begin
    update public.exercises set archived_at = now(), merged_into_id = v_quest_b where user_id = v_user_a;
  exception when others then
    v_blocked := sqlerrm like 'EXERCISE_IMMUTABLE%';
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: a client linked its exercise to one owned by B';
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

  -- 5b. A cannot end B's safe period, even knowing its id.
  execute 'reset role';
  select id into v_quest_b from public.safe_periods where user_id = v_user_b limit 1;
  execute 'set local role authenticated';
  v_blocked := false;
  begin
    perform public.end_safe_period(v_quest_b);
  exception when others then
    v_blocked := sqlerrm like 'SAFE_PERIOD_NOT_FOUND%';
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: hunter A could end a safe period owned by B';
  end if;

  -- 5c. Nor redeem B's penalty, even knowing its id.
  execute 'reset role';
  select id into v_quest_b from public.penalties where user_id = v_user_b limit 1;
  execute 'set local role authenticated';
  v_blocked := false;
  begin
    perform public.redeem_penalty(v_quest_b);
  exception when others then
    v_blocked := sqlerrm like 'PENALTY_NOT_FOUND%';
  end;
  if not v_blocked then
    raise exception 'SECURITY FAILURE: hunter A could redeem a penalty owned by B';
  end if;

  -- 5e. exercise_summaries() lists only A's own sets.
  if exists (
    select 1 from jsonb_array_elements(public.exercise_summaries()) e
    where (e ->> 'exercise_id')::uuid in (
      select exercise_id from public.workout_sets where user_id = v_user_b)
  ) then
    raise exception 'RLS LEAK: exercise_summaries() returned hunter B''s history';
  end if;

  -- 5d. Nor edit or retire B's boss, nor merge or log B's custom exercise.
  execute 'reset role';
  select id into v_quest_b from public.bosses where user_id = v_user_b limit 1;
  execute 'set local role authenticated';
  foreach v_statement in array array[
    format('select public.update_boss(%L, 1, 1, ''E'')', v_quest_b),
    format('select public.archive_boss(%L)', v_quest_b)
  ] loop
    v_blocked := false;
    begin
      execute v_statement;
    exception when others then
      v_blocked := sqlerrm like 'BOSS_NOT_FOUND%';
    end;
    if not v_blocked then
      raise exception 'SECURITY FAILURE: hunter A reached B''s boss: %', v_statement;
    end if;
  end loop;
  execute 'reset role';
  select id into v_quest_b from public.exercises where user_id = v_user_b limit 1;
  execute 'set local role authenticated';
  foreach v_statement in array array[
    format('select public.merge_exercise(%L, (select id from public.exercises where user_id is null limit 1))', v_quest_b),
    format('select public.create_boss(%L, 50, 1, ''E'')', v_quest_b),
    format('select public.log_workout(''Sneaky'', null, %L::jsonb)',
      jsonb_build_array(jsonb_build_object('exercise_id', v_quest_b, 'reps', 5)))
  ] loop
    v_blocked := false;
    begin
      execute v_statement;
    exception when others then
      v_blocked := sqlerrm like 'EXERCISE_NOT_FOUND%';
    end;
    if not v_blocked then
      raise exception 'SECURITY FAILURE: hunter A used B''s custom exercise: %', v_statement;
    end if;
  end loop;

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
    'select public.assert_authenticated()',
    'select public.weekdays_are_distinct(array[1]::smallint[])',
    'select public.effective_rules(''22222222-2222-2222-2222-222222222222''::uuid, current_date)',
    'select public.counts_toward_core_tally(true, false, true, false)',
    'select public.day_outcome(true, false, false, 1, 1)',
    'select public.next_streak(1, ''extend'')',
    'select public.earns_stone(6, 7, 0, ''standard'')',
    'select public.stones_held(''22222222-2222-2222-2222-222222222222''::uuid)',
    'select public.safe_effective_end(current_date, null)',
    'select public.is_safe_on(''22222222-2222-2222-2222-222222222222''::uuid, current_date)',
    'select public.safe_period_start(now(), ''UTC'', ''standard'')',
    'select public.safe_period_refusal(''{}''::date[], ''{}''::date[], ''{}''::date[], current_date, 1)',
    'select public.safe_period_refusal_for(''22222222-2222-2222-2222-222222222222''::uuid, current_date, 1)',
    'select public.safe_days_bookable(''22222222-2222-2222-2222-222222222222''::uuid, current_date)',
    'select public.safe_start_for(''22222222-2222-2222-2222-222222222222''::uuid)',
    'select public.xp_to_next(1)',
    'select public.level_from_total_xp(100)',
    'select public.hunter_level(''22222222-2222-2222-2222-222222222222''::uuid)',
    'select public.debt_amount(20, 1)',
    'select public.debt_repayment(10, 10)',
    'select public.trial_category(array[''life''])',
    'select public.weakened_stat_for(array[''INT''])',
    'select public.failed_day_action(null, false, ''standard'')',
    'select public.penalty_transition_allowed(''cleared'', ''debt_active'', ''debt'')',
    'select public.split_by_weight(10, ''[]''::jsonb, 0)',
    'select public.compute_award(''quest'', 10, 10, ''[]''::jsonb, null, 0)',
    'select public.capped_xp_on(''22222222-2222-2222-2222-222222222222''::uuid, current_date, ''life'')',
    'select public.open_penalty(''22222222-2222-2222-2222-222222222222''::uuid)',
    'select public.penalty_debt_remaining(gen_random_uuid())',
    'select public.weakened_stat_on(''22222222-2222-2222-2222-222222222222''::uuid, current_date)',
    'select public.apply_award(''22222222-2222-2222-2222-222222222222''::uuid, current_date, ''quest'', null, ''life'', 999, ''[]''::jsonb, 0, null)',
    'select public.reverse_award(''22222222-2222-2222-2222-222222222222''::uuid, gen_random_uuid())',
    'select public.start_trial(gen_random_uuid())',
    'select public.start_debt(gen_random_uuid(), 30, true)',
    'select public.penalty_on_failed_day(''22222222-2222-2222-2222-222222222222''::uuid, current_date, ''standard'', ''[]''::jsonb)',
    'select public.expire_trials(''22222222-2222-2222-2222-222222222222''::uuid)',
    'select public.close_days_for(''22222222-2222-2222-2222-222222222222''::uuid)',
    'select public.catch_up_days(''22222222-2222-2222-2222-222222222222''::uuid)',
    'select public.penalty_json(null::public.penalties)',
    'select public.penalty_options(null::public.penalties)',
    'select public.clear_trial(''22222222-2222-2222-2222-222222222222''::uuid, null::public.quests, null)',
    'select public.evaluate_food_trial(''22222222-2222-2222-2222-222222222222''::uuid)',
    'select public.to_centi(1.5)',
    'select public.e1rm_centi(10000, 5)',
    'select public.pr_kind_allowed(''strength'')',
    'select public.stat_for_kind(''strength'')',
    'select public.workout_set_xp(''[]''::jsonb, 0)',
    'select public.detect_prs(''strength'', null, null, ''[]''::jsonb)',
    'select public.payable_pr_bonuses(1, 0)',
    'select public.defeats_boss(''strength'', 1, 1, ''working'', 1, 1)',
    'select public.pr_best(''22222222-2222-2222-2222-222222222222''::uuid, gen_random_uuid(), ''e1rm'')',
    'select public.pr_bonuses_paid_on(''22222222-2222-2222-2222-222222222222''::uuid, current_date)',
    'select public.exercise_after_merges(null::public.exercises)',
    'select public.resolve_exercise(''22222222-2222-2222-2222-222222222222''::uuid, null, ''Planted'')',
    'select public.rebase_pr_baselines(''22222222-2222-2222-2222-222222222222''::uuid, gen_random_uuid())',
    'select public.award_workout(''22222222-2222-2222-2222-222222222222''::uuid, null::public.workouts)',
    'select public.reverse_workout_awards(''22222222-2222-2222-2222-222222222222''::uuid, gen_random_uuid())',
    'select public.boss_json(null::public.bosses)',
    'select public.assert_boss_fields(1, 1, ''E'', null)'
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
    'select public.log_food(''X'', 1, 1)',
    'select public.start_safe_period(''sick'', 1)',
    'select public.end_safe_period(gen_random_uuid())',
    'select public.update_hunter_rules(''lenient'', ''{}''::smallint[])',
    'select public.choose_penalty(''debt'')',
    'select public.acknowledge_penalty()',
    'select public.redeem_penalty(gen_random_uuid())',
    'select public.create_boss(gen_random_uuid(), 1, 1, ''E'')',
    'select public.update_boss(gen_random_uuid(), 1, 1, ''E'')',
    'select public.archive_boss(gen_random_uuid())',
    'select public.merge_exercise(gen_random_uuid(), gen_random_uuid())',
    'select public.set_rest_timer(90)',
    'select public.exercise_summaries()'
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

-- ---------------------------------------------------------------------------
-- Exhaustive privilege check, straight from the catalog: every function in
-- public, for both client roles. A new function that forgets its revoke fails
-- here even if nobody adds it to a list above.
-- ---------------------------------------------------------------------------
do $$
declare
  v_client_rpcs text[] := array[
    'acknowledge_report', 'allocate_points', 'close_days', 'complete_quest',
    'delete_food', 'delete_workout', 'end_safe_period', 'game_today', 'hunter_snapshot',
    'log_food', 'log_workout', 'onboard_hunter', 'pending_report', 'start_safe_period',
    'undo_completion', 'update_hunter_profile', 'update_hunter_rules',
    'choose_penalty', 'acknowledge_penalty', 'redeem_penalty',
    'create_boss', 'update_boss', 'archive_boss', 'merge_exercise',
    'set_rest_timer', 'exercise_summaries'
  ];
  -- A trigger function cannot be called directly, whatever its grant says.
  v_trigger_functions text[] := array[
    'quests_guard_immutable', 'penalties_guard_transition', 'exercises_guard_immutable'
  ];
  v_extra text;
  v_missing text;
  v_anon text;
  v_total integer;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  into v_extra
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not (p.proname = any (v_client_rpcs || v_trigger_functions));
  if v_extra is not null then
    raise exception 'SECURITY FAILURE: authenticated can execute internal functions: %', v_extra;
  end if;

  select string_agg(rpc, ', ')
  into v_missing
  from unnest(v_client_rpcs) as rpc
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = rpc
      and has_function_privilege('authenticated', p.oid, 'execute'));
  if v_missing is not null then
    raise exception 'authenticated is missing execute on RPCs: %', v_missing;
  end if;

  select string_agg(p.proname, ', ')
  into v_anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute')
    and not (p.proname = any (v_trigger_functions));
  if v_anon is not null then
    raise exception 'SECURITY FAILURE: anon can execute: %', v_anon;
  end if;

  select count(*) into v_total
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public';

  raise notice 'privileges: % public functions checked, authenticated runs exactly % RPCs, anon none',
    v_total, cardinality(v_client_rpcs);
end;
$$;

do $$
begin
  raise notice '-------------------------------';
  raise notice 'RLS PROOF PASSED';
  raise notice '-------------------------------';
end;
$$;

rollback;
