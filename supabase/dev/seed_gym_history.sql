-- DEV ONLY. Gives the local hunter Phase 1-style gym history, so the logger's
-- "Last time" prefill, exercise history, sparkline and merge have something
-- to show (Step 2.7 walkthrough). Local stack only; leaves its data behind.
--
--   npm run db:sql -- supabase/dev/seed_gym_history.sql
--
-- It logs, on the three days before today:
--   - a custom "Squat" (the way Phase 1 names landed after the 2.5 mapping),
--     ready to be merged into "Barbell Full Squat";
--   - "Barbell Bench Press - Medium Grip" from the library;
-- then records their baselines exactly as the 2.5 backfill would (no XP).
-- Run it once after `npm run sim:days`; running it again adds more sessions.

do $seed$
declare
  v_user uuid;
  v_today date;
  v_squat uuid;
  v_bench uuid;
  v_workout uuid;
  v_back integer;
begin
  if inet_client_addr() is not null then
    raise exception 'seed refused: local unix socket only (npm run db:sql)';
  end if;
  if md5(coalesce(current_setting('app.settings.jwt_secret', true), ''))
       <> '2a60121f68a3f2b1fb7de7040cb89646' then
    raise exception 'seed refused: this is not the local Supabase stack';
  end if;

  select user_id into v_user from public.hunters order by created_at desc limit 1;
  if v_user is null then
    raise exception 'No hunter found. Sign up and finish onboarding first.';
  end if;
  v_today := public.game_today_for(v_user);

  select id into v_squat from public.exercises
  where user_id = v_user and lower(name) = 'squat' and archived_at is null;
  if v_squat is null then
    insert into public.exercises (user_id, name, kind) values (v_user, 'Squat', 'strength')
    returning id into v_squat;
  end if;
  select id into v_bench from public.exercises
  where user_id is null and name = 'Barbell Bench Press - Medium Grip';

  foreach v_back in array array[3, 2, 1] loop
    insert into public.workouts (user_id, occurred_on, title)
    values (v_user, v_today - v_back, 'Phase 1 session')
    returning id into v_workout;
    insert into public.workout_sets (
      user_id, workout_id, exercise_id, exercise_name, set_index, set_type, reps, weight_kg
    )
    values
      (v_user, v_workout, v_squat, 'Squat', 1, 'working', 8, 55 + 2.5 * (4 - v_back)),
      (v_user, v_workout, v_squat, 'Squat', 2, 'working', 8, 55 + 2.5 * (4 - v_back)),
      (v_user, v_workout, v_squat, 'Squat', 3, 'working', 8, 55 + 2.5 * (4 - v_back)),
      (v_user, v_workout, v_bench, 'Barbell Bench Press - Medium Grip', 4, 'working', 8, 50),
      (v_user, v_workout, v_bench, 'Barbell Bench Press - Medium Grip', 5, 'working', 8, 50),
      (v_user, v_workout, v_bench, 'Barbell Bench Press - Medium Grip', 6, 'working', 6, 52.5);
  end loop;

  perform public.rebase_pr_baselines(v_user, v_squat);
  perform public.rebase_pr_baselines(v_user, v_bench);
  raise notice 'gym history seeded: 3 sessions of Squat (custom) and Barbell Bench Press';
end;
$seed$;
