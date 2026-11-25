-- DEV ONLY. Backdates a hunter so there are real days for close_days() to
-- settle, and lives some of them so the System Report has something to say.
--
-- This is a tool for your local stack. It is never imported by app code, it is
-- not a migration, and it does NOT roll back - it deliberately leaves state
-- behind for you to look at. It refuses to run anywhere but the local stack:
-- see the isolation guard at the top of the block.
--
--   npm run sim:days
--
-- Then open the app: the day close runs on load and the report appears.
--
-- The simulated days are judged by Phase 2 rules (rules_from is wound back
-- with the hunter), and any penalty left by a previous run is closed first.
--
-- With the defaults the hunter ends up looking like this, relative to today:
--   -4  lived fully   -> cleared, +1 free point
--   -3  lived fully   -> cleared, +1 free point
--   -2  lived fully   -> cleared, +1 free point
--   -1  food only     -> failed: a Standard penalty waits for your choice
--
-- Scenario overrides are plain session settings:
--   npm run sim:days -- --set sim.days_back=9 --set sim.lived={9,8,7}
--
--   sim.days_back   integer    how far back the hunter is wound
--   sim.lived       int array  day offsets lived in full
--   sim.food_only   int array  day offsets with food but nothing else
--   sim.mode        integer    penalty mode: 0 lenient, 1 standard, 2 hardcore
--   sim.rest_days   int array  rest weekdays for the window, ISO 1 = Mon .. 7 = Sun
--   sim.safe        int array  day offsets inside a Sick safe zone
--   sim.gym         integer    1 (default): lived days log 3 working squat sets,
--                              2.5 kg heavier each day - a baseline, then a PR
--                              with its bonus every day; 0: an empty workout
--   sim.choice      integer    0 (default): leave the penalty for the app;
--                              1 trial, 2 debt, 3 weakened: close the days now
--                              and make that choice (Standard mode)
--
-- Two failed days in a row show an escalation:
--   npm run sim:days -- --set 'sim.lived={4,3}' --set 'sim.food_only={2,1}'
--
-- Two weeks: rest Sundays (streak-neutral), a stone at streak 7, a PR every
-- gym day, a sick day, then a failed day answered with a debt:
--   npm run sim:days -- --set sim.days_back=16 --set 'sim.lived={16,15,14,13,12,11,10,9,8,7,6,5,4,3}' --set 'sim.food_only={1}' --set 'sim.safe={2}' --set 'sim.rest_days={7}' --set sim.choice=2

do $sim$
declare
  c_days_back constant integer := coalesce(current_setting('sim.days_back', true)::integer, 4);
  c_rest_days constant smallint[] :=
    nullif(current_setting('sim.rest_days', true), '')::smallint[];
  c_safe constant integer[] :=
    coalesce(nullif(current_setting('sim.safe', true), '')::integer[], '{}'::integer[]);
  c_gym constant boolean := coalesce(nullif(current_setting('sim.gym', true), '')::integer, 1) = 1;
  c_choice constant text :=
    (array[null, 'trial', 'debt', 'weakened'])[coalesce(nullif(current_setting('sim.choice', true), '')::integer, 0) + 1];
  v_squat uuid;
  v_workout public.workouts;
  v_step integer := 0;
  c_lived constant integer[] :=
    coalesce(nullif(current_setting('sim.lived', true), '')::integer[], array[4, 3, 2]);
  c_food_only constant integer[] :=
    coalesce(nullif(current_setting('sim.food_only', true), '')::integer[], array[1]);

  c_mode constant text :=
    (array['lenient', 'standard', 'hardcore'])[coalesce(current_setting('sim.mode', true)::integer, 1) + 1];

  v_user uuid;
  v_timezone text;
  v_today date;
  v_day date;
  v_offset integer;
  v_study public.quests;
  v_targets record;
begin
  -- -------------------------------------------------------------------------
  -- ISOLATION GUARD. This script rewrites history, so it must never touch the
  -- hosted project. Two independent checks, and both must pass; if a future
  -- CLI drops either signal the script refuses even locally, which is the
  -- safe way to fail.
  --
  -- 1. Connection: only the local container's unix socket. A unix-socket
  --    session has no client address; every network session does, and the
  --    hosted project is reachable only over the network. Run it with
  --    `npm run sim:days`, which pipes it into the local container.
  if inet_client_addr() is not null then
    raise exception
      'simulate_days.sql refused: it only runs over the local stack''s unix socket, and this session came from %. Use: npm run sim:days',
      inet_client_addr();
  end if;

  -- 2. Identity: the Supabase CLI's local stack sets app.settings.jwt_secret
  --    to its public demo value, the same on every machine and never used by a
  --    hosted project. Compared by hash so the literal is not committed here.
  if md5(coalesce(current_setting('app.settings.jwt_secret', true), ''))
       <> '2a60121f68a3f2b1fb7de7040cb89646' then
    raise exception
      'simulate_days.sql refused: this database does not carry the local stack''s demo secret, so it is not the local Supabase stack.';
  end if;
  -- -------------------------------------------------------------------------

  select user_id, timezone into v_user, v_timezone
  from public.hunters
  order by created_at
  limit 1;

  if v_user is null then
    raise exception 'No hunter found. Sign up and finish onboarding first.';
  end if;

  v_today := public.game_date_at(now(), v_timezone);
  select * into v_study from public.quests where user_id = v_user and title = 'Study';

  if c_mode is null then
    raise exception 'sim.mode must be 0 (lenient), 1 (standard) or 2 (hardcore)';
  end if;

  -- Wind the hunter back and clear the watermark so close_days() has work.
  -- The window is judged by Phase 2 rules, under the chosen penalty mode.
  update public.hunters
  set created_on = v_today - c_days_back,
      rules_from = v_today - c_days_back,
      last_closed_on = null
  where user_id = v_user;

  update public.hunter_target_history
  set penalty_mode = c_mode,
      rest_days = coalesce(c_rest_days, rest_days)
  where user_id = v_user;
  update public.hunter_target_history
  set effective_on = v_today - c_days_back
  where user_id = v_user
    and effective_on = (select min(effective_on) from public.hunter_target_history where user_id = v_user)
    and effective_on > v_today - c_days_back;

  -- A previous run's penalty would block a new one (one open at a time):
  -- close it, retire its trial, and reset the stones.
  update public.penalties
  set state = 'redeemed', resolved_at = now(), acknowledged_at = now()
  where user_id = v_user
    and state in ('pending_choice', 'trial_active', 'debt_active', 'weakened_active');
  delete from public.redemption_stone_events where user_id = v_user;

  -- The quests have to have existed on those days too. The immutability
  -- trigger exists to stop the client doing this; a dev script may.
  execute 'alter table public.quests disable trigger quests_guard_immutable';
  update public.quests
  set created_at = (v_today - c_days_back - 1)::timestamptz
  where user_id = v_user;
  update public.quests
  set archived_at = now()
  where user_id = v_user and type = 'trial' and archived_at is null;
  execute 'alter table public.quests enable trigger quests_guard_immutable';

  -- Start the simulated window from a genuinely clean slate. The ledger rows
  -- have to go too: leaving a previous run's daily_clear event behind makes a
  -- re-closed day report as failed while still showing the free point it was
  -- paid the first time. Only a dev script may do this - the app never erases
  -- ledger history (ADR-1), it appends reversals.
  delete from public.xp_events
  where user_id = v_user and occurred_on >= v_today - c_days_back and occurred_on < v_today;
  delete from public.quest_completions
  where user_id = v_user and occurred_on >= v_today - c_days_back and occurred_on < v_today;
  delete from public.daily_logs
  where user_id = v_user and log_date >= v_today - c_days_back and log_date < v_today;
  delete from public.food_entries
  where user_id = v_user and occurred_on >= v_today - c_days_back and occurred_on < v_today;
  -- Gym state that pointed at those workouts: records and boss defeats.
  delete from public.personal_records
  where user_id = v_user and occurred_on >= v_today - c_days_back and occurred_on < v_today;
  update public.bosses
  set defeated_on = null, defeated_workout_id = null, defeated_set_id = null, xp_event_id = null
  where user_id = v_user and defeated_on >= v_today - c_days_back and defeated_on < v_today;
  delete from public.workouts
  where user_id = v_user and occurred_on >= v_today - c_days_back and occurred_on < v_today;
  delete from public.safe_periods
  where user_id = v_user and end_on >= v_today - c_days_back and start_on < v_today;

  foreach v_offset in array c_safe loop
    insert into public.safe_periods (user_id, kind, start_on, end_on)
    values (v_user, 'sick', v_today - v_offset, v_today - v_offset);
    raise notice 'safe %: sick day', v_today - v_offset;
  end loop;

  select id into v_squat from public.exercises where user_id is null and name = 'Barbell Squat';

  -- Oldest first, so the squat gets heavier day by day.
  foreach v_offset in array (select array_agg(o order by o desc) from unnest(c_lived) o) loop
    v_day := v_today - v_offset;
    select * into v_targets from public.effective_targets(v_user, v_day);

    insert into public.food_entries (user_id, occurred_on, name, kcal, protein_g)
    values
      (v_user, v_day, 'Simulated breakfast', (v_targets.kcal_min / 2)::integer,
       (v_targets.protein_target_g / 2)::numeric),
      (v_user, v_day, 'Simulated dinner', (v_targets.kcal_min / 2 + 50)::integer,
       (v_targets.protein_target_g / 2 + 10)::numeric);

    insert into public.workouts (user_id, occurred_on, title)
    values (v_user, v_day, 'Simulated session')
    returning * into v_workout;
    if c_gym and v_squat is not null then
      insert into public.workout_sets (
        user_id, workout_id, exercise_id, exercise_name, set_index, set_type, reps, weight_kg
      )
      select v_user, v_workout.id, v_squat, 'Barbell Squat', n, 'working', 5, 60 + 2.5 * v_step
      from generate_series(1, 3) n;
      v_step := v_step + 1;
    end if;

    -- What live logging would have done on the day itself: the Train quest
    -- first, then set XP, records and bosses, through the award pipeline.
    perform public.evaluate_auto_workout(v_user, v_day);
    if c_gym then
      perform public.award_workout(v_user, v_workout);
    end if;
    perform public.evaluate_auto_protein(v_user, v_day);

    if v_study.id is not null and public.active_completion_id(v_study.id, v_day) is null then
      perform public.award_quest_completion(v_user, v_study, v_day, v_study.target_value);
    end if;

    raise notice 'lived %: food, workout and Study', v_day;
  end loop;

  foreach v_offset in array c_food_only loop
    v_day := v_today - v_offset;

    insert into public.food_entries (user_id, occurred_on, name, kcal, protein_g)
    values (v_user, v_day, 'Simulated snack', 400, 20);

    perform public.evaluate_auto_protein(v_user, v_day);
    raise notice 'partially lived %: food only', v_day;
  end loop;

  -- Optionally settle the days now and answer the penalty, as the hunter.
  if c_choice is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform public.close_days();
    if (public.open_penalty(v_user)).state = 'pending_choice' then
      perform public.choose_penalty(c_choice);
      raise notice 'days closed; penalty answered with %', c_choice;
    else
      raise notice 'days closed; no penalty was waiting for a choice';
    end if;
  end if;

  raise notice '----------------------------------------';
  raise notice 'Hunter wound back to % (% mode). Open the app: close_days() settles % days.',
    v_today - c_days_back, c_mode, c_days_back;
  raise notice '----------------------------------------';
end;
$sim$;
