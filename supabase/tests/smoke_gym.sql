-- End-to-end proof of gym rewards (Phase 2, Step 2.6): set XP, personal
-- records, bosses, reversal on delete, debt repayment, the exercise merge.
--
-- FOR A LOCAL / TEST DATABASE. Creates throwaway auth users and ends in
-- ROLLBACK, so nothing persists. Run with:  npm run db:verify
--
-- Every check raises on failure; a clean run ends with "GYM PASSED".

begin;

-- ---------------------------------------------------------------------------
-- Test helpers (session-temporary, gone with the transaction).
-- ---------------------------------------------------------------------------
create function pg_temp.act_as(p_user uuid) returns void language sql as $f$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$f$;

-- A hunter whose only core quests are p_core, living under p_mode since
-- p_days_back days ago, with nothing closed yet.
create function pg_temp.make_hunter(
  p_user uuid, p_name text, p_days_back integer, p_mode text, p_core text[]
) returns void language plpgsql as $f$
declare
  v_today date;
begin
  insert into auth.users (id, email) values (p_user, lower(p_name) || '@test.local');
  perform pg_temp.act_as(p_user);
  perform public.onboard_hunter(p_name, 'Europe/Berlin', 1700, 1900, 120);
  v_today := public.game_today();
  update public.quests set is_core = (title = any (p_core)) where user_id = p_user;
  execute 'alter table public.quests disable trigger quests_guard_immutable';
  update public.quests set created_at = now() - interval '30 days' where user_id = p_user;
  execute 'alter table public.quests enable trigger quests_guard_immutable';
  update public.hunters
  set created_on = v_today - p_days_back, rules_from = v_today - p_days_back, last_closed_on = null
  where user_id = p_user;
  update public.hunter_target_history
  set effective_on = v_today - p_days_back, penalty_mode = p_mode
  where user_id = p_user;
end;
$f$;

create function pg_temp.lib(p_name text) returns uuid language sql as $f$
  select id from public.exercises where user_id is null and name = p_name;
$f$;

-- p_count identical sets of one exercise, in the new log_workout payload.
create function pg_temp.sets(
  p_exercise uuid, p_count integer, p_reps integer, p_kg numeric, p_type text default 'working'
) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object(
    'exercise_id', p_exercise, 'set_type', p_type, 'reps', p_reps, 'weight_kg', p_kg))
  from generate_series(1, p_count);
$f$;

-- Runs p_sql and requires it to fail with a message starting p_token.
create function pg_temp.expect_error(p_sql text, p_token text) returns void language plpgsql as $f$
declare
  v_error text;
begin
  begin
    execute p_sql;
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null or v_error not like p_token || '%' then
    raise exception 'expected % from [%], got %', p_token, p_sql, coalesce(v_error, 'success');
  end if;
end;
$f$;

-- ===========================================================================
-- G1. Set XP: 2 per working set, warmups 0, one workout event per workout,
--     20 working sets per game day shared by the day's live workouts.
-- ===========================================================================
do $$
declare
  v_user uuid := 'b0000000-0000-0000-0000-000000000001';
  v_squat uuid := pg_temp.lib('Barbell Squat');
  v_row uuid := pg_temp.lib('Rowing, Stationary');
  v_w1 jsonb;
  v_w2 jsonb;
  v_w3 jsonb;
  v_event public.xp_events;
begin
  perform pg_temp.make_hunter(v_user, 'Lifter', 0, 'standard', array['Train']);

  -- 15 working sets and 2 warmups: 30 XP, STR 15.
  v_w1 := public.log_workout('Legs', null,
    pg_temp.sets(v_squat, 2, 5, 40, 'warmup') || pg_temp.sets(v_squat, 15, 5, 60));
  if (v_w1 ->> 'counted_sets')::integer <> 15 or (v_w1 -> 'workout_award' ->> 'xp')::integer <> 30
     or (v_w1 -> 'workout_award' -> 'stat_xp' ->> 'STR')::integer <> 15 then
    raise exception 'G1: 15 working sets should earn 30 XP and STR 15: %', v_w1;
  end if;
  if (v_w1 -> 'auto_workout' ->> 'action') <> 'completed'
     or (v_w1 -> 'auto_workout' -> 'result' ->> 'xp')::integer <> 35 then
    raise exception 'G1: the Train quest must still pay its Phase 1 35 XP: %', v_w1 -> 'auto_workout';
  end if;
  select * into v_event from public.xp_events
  where user_id = v_user and source_type = 'workout' and source_id = (v_w1 ->> 'workout_id')::uuid;
  if v_event.category <> 'fitness' or v_event.xp <> 30 then
    raise exception 'G1: one fitness workout event per workout: %', v_event;
  end if;

  -- 4 squats then 4 rowing sessions: only 5 fit. Cardio trains AGI.
  v_w2 := public.log_workout('Mixed', null,
    pg_temp.sets(v_squat, 4, 5, 60)
    || (select jsonb_agg(jsonb_build_object('exercise_id', v_row, 'duration_s', 600))
        from generate_series(1, 4)));
  if (v_w2 ->> 'counted_sets')::integer <> 5 or (v_w2 -> 'workout_award' ->> 'xp')::integer <> 10
     or (v_w2 -> 'workout_award' -> 'stat_xp' ->> 'STR')::integer <> 4
     or (v_w2 -> 'workout_award' -> 'stat_xp' ->> 'AGI')::integer <> 1 then
    raise exception 'G1: only 5 of 8 sets fit under 20 (4 STR, 1 AGI): %', v_w2;
  end if;

  -- The allowance is used up: no workout event at all.
  v_w3 := public.log_workout('Extra', null, pg_temp.sets(v_squat, 3, 5, 60));
  if (v_w3 ->> 'counted_sets')::integer <> 0 or v_w3 -> 'workout_award' <> 'null'::jsonb
     or exists (select 1 from public.xp_events where source_type = 'workout'
                and source_id = (v_w3 ->> 'workout_id')::uuid) then
    raise exception 'G1: sets beyond 20 earn nothing: %', v_w3;
  end if;
  perform public.delete_workout((v_w3 ->> 'workout_id')::uuid);

  -- Deleting the first workout reverses its event and frees its 15 sets.
  perform public.delete_workout((v_w1 ->> 'workout_id')::uuid);
  if not exists (select 1 from public.xp_events where reverses_event_id = v_event.id and xp = -30) then
    raise exception 'G1: deleting a workout must reverse its set XP';
  end if;
  v_w3 := public.log_workout('After', null, pg_temp.sets(v_squat, 10, 5, 60));
  if (v_w3 ->> 'counted_sets')::integer <> 10 then
    raise exception 'G1: a deleted workout frees its share of the 20: %', v_w3;
  end if;

  -- Every set is linked to an exercise.
  if exists (select 1 from public.workout_sets where user_id = v_user and exercise_id is null) then
    raise exception 'G1: unlinked sets';
  end if;

  raise notice 'G1. set XP: 2 per working set, warmups 0, one event per workout, 20 a day shared and freed by delete';
end;
$$;

-- ===========================================================================
-- G2. The fitness cap: set XP is capped, the Train quest keeps its Phase 1
--     place, PR bonuses are cap-exempt.
-- ===========================================================================
do $$
declare
  v_user uuid := 'b0000000-0000-0000-0000-000000000002';
  v_squat uuid := pg_temp.lib('Barbell Squat');
  v_quest uuid;
  v_result jsonb;
begin
  perform pg_temp.make_hunter(v_user, 'Capped', 0, 'standard', array['Train']);
  insert into public.quests (
    user_id, title, type, category, tracking, goal_type, stat_tags, difficulty, due_on
  )
  values (v_user, 'Long run', 'one_time', 'fitness', 'manual', 'boolean', array['AGI'], 'S',
          public.game_today_for(v_user))
  returning id into v_quest;
  perform public.complete_quest(v_quest, null);   -- 100 fitness XP

  -- Train 35 (135), then 20 working sets = 40 capped to the 15 left.
  v_result := public.log_workout('Heavy', null, pg_temp.sets(v_squat, 20, 5, 100));
  if (v_result -> 'auto_workout' -> 'result' ->> 'xp')::integer <> 35
     or (v_result -> 'workout_award' ->> 'xp')::integer <> 15
     or not (v_result -> 'workout_award' ->> 'capped')::boolean
     or (v_result -> 'workout_award' ->> 'full_xp')::integer <> 40 then
    raise exception 'G2: Train 35, then set XP 40 capped to 15: %', v_result;
  end if;
  if public.capped_xp_on(v_user, public.game_today_for(v_user), 'fitness') <> 150 then
    raise exception 'G2: capped fitness XP must stop at 150';
  end if;

  -- A record on a full cap still pays 25.
  v_result := public.log_workout('PR', null, pg_temp.sets(v_squat, 1, 5, 110));
  if jsonb_array_length(v_result -> 'pr_bonuses') <> 1
     or (v_result -> 'pr_bonuses' -> 0 ->> 'xp')::integer <> 25 then
    raise exception 'G2: PR bonuses are exempt from the fitness cap: %', v_result;
  end if;

  raise notice 'G2. fitness cap: Train unchanged, set XP capped at 150, PR bonus paid in full on a full cap';
end;
$$;

-- ===========================================================================
-- G3. Records: baselines pay nothing, one bonus per record-breaking set, the
--     3rd bonus of a game day is not paid, delete reverses and frees slots.
-- ===========================================================================
do $$
declare
  v_user uuid := 'b0000000-0000-0000-0000-000000000003';
  v_squat uuid := pg_temp.lib('Barbell Squat');
  v_bench uuid := pg_temp.lib('Barbell Bench Press - Medium Grip');
  v_dead uuid := pg_temp.lib('Barbell Deadlift');
  v_w1 jsonb;
  v_w2 jsonb;
  v_w3 jsonb;
  v_w4 jsonb;
  v_today date;
begin
  perform pg_temp.make_hunter(v_user, 'Recorder', 0, 'standard', array['Train']);
  v_today := public.game_today();

  -- First time ever: six baselines, no bonus.
  v_w1 := public.log_workout('Base', null,
    pg_temp.sets(v_squat, 1, 5, 100) || pg_temp.sets(v_bench, 1, 5, 80) || pg_temp.sets(v_dead, 1, 3, 140));
  if jsonb_array_length(v_w1 -> 'records') <> 6
     or exists (select 1 from jsonb_array_elements(v_w1 -> 'records') r where not (r ->> 'baseline')::boolean)
     or jsonb_array_length(v_w1 -> 'pr_bonuses') <> 0
     or exists (select 1 from public.xp_events where user_id = v_user and source_type = 'pr') then
    raise exception 'G3: the first log of an exercise is a baseline with no bonus: %', v_w1;
  end if;

  -- One squat set and one bench set break both of their records: 2 bonuses.
  v_w2 := public.log_workout('Records', null,
    pg_temp.sets(v_squat, 1, 5, 105) || pg_temp.sets(v_bench, 1, 5, 85));
  if jsonb_array_length(v_w2 -> 'records') <> 4 or jsonb_array_length(v_w2 -> 'pr_bonuses') <> 2
     or exists (select 1 from jsonb_array_elements(v_w2 -> 'pr_bonuses') b
                where (b ->> 'xp')::integer <> 25 or (b -> 'stat_xp' ->> 'STR')::integer <> 10)
     or exists (select 1 from jsonb_array_elements(v_w2 -> 'records') r where r ->> 'bonus_event_id' is null) then
    raise exception 'G3: two record-breaking sets pay two 25 XP / STR 10 bonuses: %', v_w2;
  end if;
  if public.pr_best(v_user, v_squat, 'e1rm') <> 12250 or public.pr_best(v_user, v_squat, 'max_weight') <> 10500 then
    raise exception 'G3: the derived best must follow the new records';
  end if;

  -- The 3rd record of the day is stored but not paid.
  v_w3 := public.log_workout('Third', null, pg_temp.sets(v_dead, 1, 3, 150));
  if jsonb_array_length(v_w3 -> 'records') <> 2 or jsonb_array_length(v_w3 -> 'pr_bonuses') <> 0
     or exists (select 1 from public.personal_records
                where workout_id = (v_w3 ->> 'workout_id')::uuid and xp_event_id is not null) then
    raise exception 'G3: a 3rd PR in a day is recorded without a bonus: %', v_w3;
  end if;

  -- Deleting the 2-bonus workout reverses both bonuses and its records...
  perform public.delete_workout((v_w2 ->> 'workout_id')::uuid);
  if public.pr_bonuses_paid_on(v_user, v_today) <> 0
     or exists (select 1 from public.personal_records
                where user_id = v_user and exercise_id in (v_squat, v_bench) and not baseline and reversed_at is null)
     or public.pr_best(v_user, v_squat, 'e1rm') <> 11667 then
    raise exception 'G3: delete must reverse the bonuses and records it created';
  end if;

  -- ...which frees today's slots.
  v_w4 := public.log_workout('Fourth', null, pg_temp.sets(v_dead, 1, 3, 160));
  if jsonb_array_length(v_w4 -> 'pr_bonuses') <> 1 then
    raise exception 'G3: a reversed bonus frees its daily slot: %', v_w4;
  end if;

  raise notice 'G3. records: baselines unpaid, one bonus per set, the 3rd PR of a day unpaid, delete reverses and frees';
end;
$$;

-- ===========================================================================
-- G4. Bosses: defeat pays 2x difficulty XP + 1 free point (cap-exempt),
--     trophies are final, delete undefeats, the limit of 5 active.
-- ===========================================================================
do $$
declare
  v_user uuid := 'b0000000-0000-0000-0000-000000000004';
  v_squat uuid := pg_temp.lib('Barbell Squat');
  v_boss jsonb;
  v_result jsonb;
  v_event public.xp_events;
  v_i integer;
begin
  perform pg_temp.make_hunter(v_user, 'Slayer', 0, 'standard', array['Train']);

  v_boss := public.create_boss(v_squat, 100, 3, 'C', 'Igris: 100 kg squat');
  if (v_boss ->> 'reward_xp')::integer <> 70 or (v_boss ->> 'reward_free_points')::integer <> 1 then
    raise exception 'G4: a C boss is worth 70 XP and 1 free point: %', v_boss;
  end if;
  perform pg_temp.expect_error(
    format('select public.create_boss(%L, 50, 1, ''E'')', pg_temp.lib('Rowing, Stationary')),
    'BOSS_KIND_NOT_ALLOWED');
  perform pg_temp.expect_error(format('select public.create_boss(%L, 0, 1, ''E'')', v_squat), 'INVALID_BOSS');
  perform pg_temp.expect_error(format('select public.create_boss(%L, 50, 1, ''X'')', v_squat), 'INVALID_BOSS');

  -- Heavier but too few reps: no.
  v_result := public.log_workout('Try', null, pg_temp.sets(v_squat, 1, 2, 110));
  if jsonb_array_length(v_result -> 'bosses_defeated') <> 0 then
    raise exception 'G4: 110 x 2 must not beat a 100 x 3 boss';
  end if;

  -- Met: defeated.
  v_result := public.log_workout('Win', null,
    pg_temp.sets(v_squat, 1, 5, 60, 'warmup') || pg_temp.sets(v_squat, 1, 3, 100));
  if jsonb_array_length(v_result -> 'bosses_defeated') <> 1
     or (v_result -> 'bosses_defeated' -> 0 ->> 'xp')::integer <> 70
     or (v_result -> 'bosses_defeated' -> 0 ->> 'free_points')::integer <> 1
     or (v_result -> 'bosses_defeated' -> 0 ->> 'boss_name') <> 'Igris: 100 kg squat' then
    raise exception 'G4: 100 x 3 defeats the boss for 70 XP + 1 point: %', v_result -> 'bosses_defeated';
  end if;
  select * into v_event from public.xp_events
  where id = (v_result -> 'bosses_defeated' -> 0 ->> 'event_id')::uuid;
  if v_event.source_type <> 'boss' or v_event.capped or v_event.source_id <> (v_boss ->> 'id')::uuid then
    raise exception 'G4: a boss event, never capped: %', v_event;
  end if;
  if (select defeated_on from public.bosses where id = (v_boss ->> 'id')::uuid) is null then
    raise exception 'G4: the boss must be marked defeated';
  end if;

  -- A trophy cannot be edited or retired.
  perform pg_temp.expect_error(
    format('select public.update_boss(%L, 120, 1, ''C'')', v_boss ->> 'id'), 'BOSS_DEFEATED');
  perform pg_temp.expect_error(format('select public.archive_boss(%L)', v_boss ->> 'id'), 'BOSS_DEFEATED');

  -- Deleting the defeating workout: reversed, undefeated again.
  perform public.delete_workout((v_result ->> 'workout_id')::uuid);
  if not exists (select 1 from public.xp_events where reverses_event_id = v_event.id
                 and xp = -70 and free_points = -1)
     or (select defeated_on from public.bosses where id = (v_boss ->> 'id')::uuid) is not null
     or (select xp_event_id from public.bosses where id = (v_boss ->> 'id')::uuid) is not null then
    raise exception 'G4: delete must reverse the boss reward and undefeat the boss';
  end if;

  -- Max 5 active: 4 more fit, the 6th is refused until one is retired.
  for v_i in 1 .. 4 loop
    perform public.create_boss(v_squat, 100 + v_i * 10, 1, 'E');
  end loop;
  perform pg_temp.expect_error(format('select public.create_boss(%L, 200, 1, ''E'')', v_squat), 'BOSS_LIMIT');
  perform public.archive_boss((select id from public.bosses where user_id = v_user and target_weight_kg = 140));
  perform public.create_boss(v_squat, 200, 1, 'E');
  v_boss := public.update_boss((v_boss ->> 'id')::uuid, 102.5, 2, 'B', null);
  if (v_boss ->> 'target_weight_kg')::numeric <> 102.5 or v_boss ->> 'name' is not null then
    raise exception 'G4: an undefeated boss can be edited: %', v_boss;
  end if;

  raise notice 'G4. bosses: 2x XP + 1 point cap-exempt, trophies final, delete undefeats, 5 active max';
end;
$$;

-- ===========================================================================
-- G5. Debt: workout and PR awards repay, boss rewards do not; deleting the
--     workout takes its repayments back and reopens the debt.
-- ===========================================================================
do $$
declare
  v_user uuid := 'b0000000-0000-0000-0000-000000000005';
  v_squat uuid := pg_temp.lib('Barbell Squat');
  v_bench uuid := pg_temp.lib('Barbell Bench Press - Medium Grip');
  v_penalty public.penalties;
  v_result jsonb;
begin
  perform pg_temp.make_hunter(v_user, 'GymDebtor', 1, 'standard', array['Study']);
  perform public.close_days();
  -- Train and the squat baseline before the debt exists.
  perform public.log_workout('Before', null, pg_temp.sets(v_squat, 1, 5, 60));
  perform public.choose_penalty('debt');
  v_penalty := public.open_penalty(v_user);
  if v_penalty.state <> 'debt_active' or public.penalty_debt_remaining(v_penalty.id) <> 12 then
    raise exception 'G5: expected a 12 XP debt: %', v_penalty;
  end if;

  -- 3 sets = 6 XP repays 3.
  v_result := public.log_workout('Repay', null, pg_temp.sets(v_squat, 3, 5, 60));
  if (v_result -> 'workout_award' ->> 'debt_repayment')::integer <> 3
     or public.penalty_debt_remaining(v_penalty.id) <> 9 then
    raise exception 'G5: set XP repays half: %', v_result -> 'workout_award';
  end if;

  -- A boss reward repays nothing (the set XP still does).
  perform public.create_boss(v_bench, 60, 3, 'E');
  v_result := public.log_workout('Boss', null, pg_temp.sets(v_bench, 1, 3, 60));
  if (v_result -> 'bosses_defeated' -> 0 ->> 'xp')::integer <> 20
     or (v_result -> 'bosses_defeated' -> 0 ->> 'debt_repayment')::integer <> 0
     or exists (select 1 from public.xp_events
                where related_event_id = (v_result -> 'bosses_defeated' -> 0 ->> 'event_id')::uuid)
     or public.penalty_debt_remaining(v_penalty.id) <> 8 then
    raise exception 'G5: boss rewards are debt-exempt: %', v_result;
  end if;

  -- A PR: set XP repays 1, the bonus repays the 7 left and clears the debt.
  v_result := public.log_workout('PR', null, pg_temp.sets(v_squat, 1, 5, 70));
  if (v_result -> 'pr_bonuses' -> 0 ->> 'debt_repayment')::integer <> 7
     or not (v_result -> 'pr_bonuses' -> 0 ->> 'debt_cleared')::boolean
     or (select state from public.penalties where id = v_penalty.id) <> 'cleared' then
    raise exception 'G5: the PR bonus repays and clears the debt: %', v_result -> 'pr_bonuses';
  end if;

  -- Delete it: both repayments come back, the debt reopens with 8 left.
  v_result := public.delete_workout((v_result ->> 'workout_id')::uuid);
  if not (v_result ->> 'debt_reopened')::boolean
     or (select state from public.penalties where id = v_penalty.id) <> 'debt_active'
     or public.penalty_debt_remaining(v_penalty.id) <> 8 then
    raise exception 'G5: deleting the workout must reopen the debt: %', v_result;
  end if;

  raise notice 'G5. debt: workout and PR awards repay, bosses do not, delete reopens the debt';
end;
$$;

-- ===========================================================================
-- G6. merge_exercise: sets move (sealed days too), source records retire,
--     the target's baselines come from the combined history, no XP, the next
--     PR is judged against the combined best, repeats are no-ops, and
--     cross-kind or cross-hunter merges are refused.
-- ===========================================================================
do $$
declare
  v_user uuid := 'b0000000-0000-0000-0000-000000000006';
  v_other uuid := 'b0000000-0000-0000-0000-000000000007';
  v_target uuid := pg_temp.lib('Barbell Full Squat');
  v_custom uuid;
  v_cardio uuid;
  v_foreign uuid;
  v_workout uuid;
  v_today date;
  v_xp_count bigint;
  v_xp_sum bigint;
  v_sets_before integer;
  v_result jsonb;
begin
  perform pg_temp.make_hunter(v_other, 'Stranger', 0, 'standard', array['Train']);
  insert into public.exercises (user_id, name, kind) values (v_other, 'Squat', 'strength')
  returning id into v_foreign;

  perform pg_temp.make_hunter(v_user, 'Merger', 0, 'standard', array['Train']);
  v_today := public.game_today();

  -- Phase 1 history, as the legacy mapping left it: a custom "Squat" and the
  -- library squat, on sealed days, with their baselines.
  insert into public.exercises (user_id, name, kind) values (v_user, 'Squat', 'strength')
  returning id into v_custom;
  insert into public.workouts (user_id, occurred_on, title) values (v_user, v_today - 3, 'Old')
  returning id into v_workout;
  insert into public.workout_sets (user_id, workout_id, exercise_id, exercise_name, set_index, reps, weight_kg)
  values (v_user, v_workout, v_custom, 'Squat', 1, 5, 120),
         (v_user, v_workout, v_custom, 'Squat', 2, 8, 90),
         (v_user, v_workout, v_target, 'Barbell Full Squat', 3, 5, 100),
         (v_user, v_workout, v_target, 'Barbell Full Squat', 4, 1, 110);
  perform public.rebase_pr_baselines(v_user, v_custom);
  perform public.rebase_pr_baselines(v_user, v_target);
  perform public.create_boss(v_custom, 130, 1, 'B');

  select count(*), coalesce(sum(xp), 0) into v_xp_count, v_xp_sum from public.xp_events where user_id = v_user;
  select count(*) into v_sets_before from public.workout_sets where user_id = v_user;

  v_result := public.merge_exercise(v_custom, v_target);
  if (v_result ->> 'sets_moved')::integer <> 2 or (v_result ->> 'bosses_moved')::integer <> 1
     or (v_result ->> 'records_retired')::integer <> 2 or (v_result ->> 'baselines_added')::integer <> 2
     or (v_result ->> 'already_merged')::boolean then
    raise exception 'G6: merge result: %', v_result;
  end if;

  -- Sets preserved and moved; names kept as logged.
  if (select count(*) from public.workout_sets where user_id = v_user) <> v_sets_before
     or (select count(*) from public.workout_sets where exercise_id = v_target and user_id = v_user) <> 4
     or exists (select 1 from public.workout_sets where exercise_id = v_custom)
     or (select count(*) from public.workout_sets
         where exercise_id = v_target and user_id = v_user and exercise_name = 'Squat') <> 2 then
    raise exception 'G6: the merge must move every set and keep exercise_name';
  end if;
  -- Combined baselines: 120 x 5 beats the library history on both kinds.
  if public.pr_best(v_user, v_target, 'e1rm') <> 14000 or public.pr_best(v_user, v_target, 'max_weight') <> 12000
     or exists (select 1 from public.personal_records where exercise_id = v_custom and reversed_at is null)
     or exists (select 1 from public.personal_records
                where exercise_id = v_target and user_id = v_user
                  and reversed_at is null and xp_event_id is not null) then
    raise exception 'G6: the target must carry the combined best as unpaid baselines';
  end if;
  -- No XP.
  if (select count(*) from public.xp_events where user_id = v_user) <> v_xp_count
     or (select coalesce(sum(xp), 0) from public.xp_events where user_id = v_user) <> v_xp_sum then
    raise exception 'G6: a merge must write no xp_events';
  end if;
  if (select archived_at is null or merged_into_id <> v_target from public.exercises where id = v_custom) then
    raise exception 'G6: the source is archived and linked to the target';
  end if;

  -- Repeating it is a no-op.
  v_result := public.merge_exercise(v_custom, v_target);
  if not (v_result ->> 'already_merged')::boolean or (v_result ->> 'sets_moved')::integer <> 0 then
    raise exception 'G6: a repeated merge is a no-op: %', v_result;
  end if;

  -- The next PR is judged against the combined best: 115 x 5 is not one...
  v_result := public.log_workout('Below', null, pg_temp.sets(v_target, 1, 5, 115));
  if jsonb_array_length(v_result -> 'records') <> 0 then
    raise exception 'G6: 115 x 5 is below the combined best: %', v_result -> 'records';
  end if;
  -- ...125 x 5 is, on both kinds, for one bonus.
  v_result := public.log_workout('Above', null, pg_temp.sets(v_target, 1, 5, 125));
  if jsonb_array_length(v_result -> 'records') <> 2 or jsonb_array_length(v_result -> 'pr_bonuses') <> 1 then
    raise exception 'G6: 125 x 5 beats the combined best: %', v_result;
  end if;

  -- The old name still finds its new home (the Phase 1 payload).
  v_result := public.log_workout('By name', null, '[{"exercise_name":"squat","reps":5,"weight_kg":50}]'::jsonb);
  if (select exercise_id from public.workout_sets where workout_id = (v_result ->> 'workout_id')::uuid) <> v_target then
    raise exception 'G6: a set logged as "squat" must follow the merge';
  end if;

  -- Refusals.
  insert into public.exercises (user_id, name, kind) values (v_user, 'Rower', 'cardio')
  returning id into v_cardio;
  perform pg_temp.expect_error(format('select public.merge_exercise(%L, %L)', v_cardio, v_target), 'MERGE_KIND_MISMATCH');
  perform pg_temp.expect_error(format('select public.merge_exercise(%L, %L)', v_cardio, v_cardio), 'MERGE_INTO_SELF');
  perform pg_temp.expect_error(format('select public.merge_exercise(%L, %L)', v_target, v_cardio), 'EXERCISE_NOT_FOUND');
  perform pg_temp.expect_error(format('select public.merge_exercise(%L, %L)', v_foreign, v_target), 'EXERCISE_NOT_FOUND');
  insert into public.exercises (user_id, name, kind) values (v_user, 'Box squat', 'strength')
  returning id into v_custom;
  perform pg_temp.expect_error(format('select public.merge_exercise(%L, %L)', v_custom, v_foreign), 'EXERCISE_NOT_FOUND');

  raise notice 'G6. merge: sets kept and moved, combined baselines, no XP, next PR vs combined best, repeat no-op, refusals';
end;
$$;

-- ===========================================================================
-- G7. The Phase 1 payload still works and links by name; the new payload's
--     cardio measures; bad input is refused.
-- ===========================================================================
do $$
declare
  v_user uuid := 'b0000000-0000-0000-0000-000000000008';
  v_result jsonb;
  v_set public.workout_sets;
begin
  perform pg_temp.make_hunter(v_user, 'Legacy', 0, 'standard', array['Train']);

  v_result := public.log_workout('Phase 1', null,
    '[{"exercise_name":" barbell squat","reps":5,"weight_kg":60},{"exercise_name":"Zercher thing","reps":8,"weight_kg":40},{"exercise_name":"zercher thing","reps":8,"weight_kg":40}]'::jsonb);
  select * into v_set from public.workout_sets where workout_id = (v_result ->> 'workout_id')::uuid and set_index = 1;
  if v_set.exercise_id <> pg_temp.lib('Barbell Squat') or v_set.exercise_name <> 'barbell squat' or v_set.set_type <> 'working' then
    raise exception 'G7: a Phase 1 set links to the library by name: %', v_set;
  end if;
  if (select count(*) from public.exercises where user_id = v_user) <> 1
     or (select count(distinct exercise_id) from public.workout_sets
         where workout_id = (v_result ->> 'workout_id')::uuid and set_index in (2, 3)) <> 1 then
    raise exception 'G7: an unknown name becomes one custom exercise';
  end if;

  v_result := public.log_workout('Cardio', null, jsonb_build_array(
    jsonb_build_object('exercise_id', pg_temp.lib('Rowing, Stationary'), 'duration_s', 900, 'distance_m', 3000)));
  if (v_result -> 'workout_award' -> 'stat_xp' ->> 'AGI')::integer <> 1 then
    raise exception 'G7: a cardio entry with duration and distance earns AGI: %', v_result;
  end if;

  perform pg_temp.expect_error(
    format('select public.log_workout(''X'', null, %L::jsonb)',
      jsonb_build_array(jsonb_build_object('exercise_id', pg_temp.lib('Barbell Squat'), 'set_type', 'working'))),
    'INVALID_SETS');
  perform pg_temp.expect_error(
    format('select public.log_workout(''X'', null, %L::jsonb)',
      jsonb_build_array(jsonb_build_object('exercise_id', pg_temp.lib('Barbell Squat'), 'set_type', 'drop', 'reps', 5))),
    'INVALID_SETS');
  perform pg_temp.expect_error(
    format('select public.log_workout(''X'', null, %L::jsonb)',
      jsonb_build_array(jsonb_build_object('exercise_id',
        (select id from public.exercises where user_id = 'b0000000-0000-0000-0000-000000000007'), 'reps', 5))),
    'EXERCISE_NOT_FOUND');

  raise notice 'G7. payloads: Phase 1 shape links by name, cardio measures, bad sets and foreign exercises refused';
end;
$$;

-- ===========================================================================
-- G8. Logger support (2.7): the rest timer setting stays inside the config
--     bounds; exercise_summaries() counts the caller's sets per exercise.
-- ===========================================================================
do $$
declare
  v_user uuid := 'b0000000-0000-0000-0000-000000000008';
  v_timer jsonb := public.game_config_value('gym') -> 'restTimer';
  v_result jsonb;
  v_summary jsonb;
begin
  perform pg_temp.act_as(v_user);

  v_result := public.set_rest_timer(null);
  if (v_result ->> 'rest_timer_s')::integer <> (v_timer ->> 'defaultSeconds')::integer
     or not (v_result ->> 'is_default')::boolean then
    raise exception 'G8: null resets the rest timer to the config default: %', v_result;
  end if;
  v_result := public.set_rest_timer((v_timer ->> 'maxSeconds')::integer);
  if (select rest_timer_s from public.hunters where user_id = v_user) <> (v_timer ->> 'maxSeconds')::integer then
    raise exception 'G8: the maximum is accepted';
  end if;
  perform pg_temp.expect_error(
    format('select public.set_rest_timer(%s)', (v_timer ->> 'maxSeconds')::integer + 1), 'INVALID_REST_TIMER');
  perform pg_temp.expect_error(
    format('select public.set_rest_timer(%s)', (v_timer ->> 'minSeconds')::integer - 1), 'INVALID_REST_TIMER');

  -- G7 logged 3 sets on Barbell Squat for this hunter (1 by name + ...).
  select e into v_summary from jsonb_array_elements(public.exercise_summaries()) e
  where (e ->> 'exercise_id')::uuid = pg_temp.lib('Barbell Squat');
  if v_summary is null
     or (v_summary ->> 'set_count')::integer <> (
       select count(*) from public.workout_sets
       where user_id = v_user and exercise_id = pg_temp.lib('Barbell Squat'))
     or (v_summary ->> 'last_on')::date <> public.game_today() then
    raise exception 'G8: exercise_summaries() must count the caller''s sets: %', v_summary;
  end if;

  raise notice 'G8. logger support: rest timer bounded by config, per-exercise set counts';
  raise notice '-------------------------------';
  raise notice 'GYM PASSED';
  raise notice '-------------------------------';
end;
$$;

rollback;
