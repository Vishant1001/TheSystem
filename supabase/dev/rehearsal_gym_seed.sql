-- DEV ONLY. Step 2.5 rehearsal, part 1 of 2: Phase 1-style workout history.
--
-- Run on a local database built only up to the Phase 2.4 migrations:
--   npx supabase db reset --version 20261124000300
--   npm run db:sql -- supabase/dev/rehearsal_gym_seed.sql
--   npx supabase migration up
--   npm run db:sql -- supabase/dev/rehearsal_gym_check.sql
--
-- Two hunters log sets the way Phase 1 did (exercise_name, reps, weight_kg)
-- with names that do and do not match the library, in mixed case and with
-- stray spaces. The ledger, day logs and sets are fingerprinted into a local
-- `rehearsal` schema so the check can prove the migrations changed none of
-- them. Same isolation guard as simulate_days.sql: local stack only.

do $guard$
begin
  if inet_client_addr() is not null then
    raise exception 'rehearsal refused: local unix socket only (npm run db:sql)';
  end if;
  if md5(coalesce(current_setting('app.settings.jwt_secret', true), ''))
       <> '2a60121f68a3f2b1fb7de7040cb89646' then
    raise exception 'rehearsal refused: this is not the local Supabase stack';
  end if;
  if to_regclass('public.exercises') is not null then
    raise exception 'rehearsal refused: the gym migrations are already applied. Reset first: npx supabase db reset --version 20261124000300';
  end if;
end;
$guard$;

insert into auth.users (id, email)
values
  ('eeeeeeee-0000-0000-0000-00000000000a', 'rehearsal-a@test.local'),
  ('eeeeeeee-0000-0000-0000-00000000000b', 'rehearsal-b@test.local');

do $seed$
declare
  v_a uuid := 'eeeeeeee-0000-0000-0000-00000000000a';
  v_b uuid := 'eeeeeeee-0000-0000-0000-00000000000b';
  v_today date;
  v_workout uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform public.onboard_hunter('Rehearsal B', 'Europe/Berlin', 1700, 1900, 120);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform public.onboard_hunter('Rehearsal A', 'Europe/Berlin', 1700, 1900, 120);
  v_today := public.game_today();

  -- Hunter A, three days ago.
  insert into public.workouts (user_id, occurred_on, title) values (v_a, v_today - 3, 'Legs')
  returning id into v_workout;
  insert into public.workout_sets (user_id, workout_id, exercise_name, set_index, reps, weight_kg)
  values
    (v_a, v_workout, 'barbell squat', 1, 5, 100),
    (v_a, v_workout, 'barbell squat', 2, 2, 110),
    (v_a, v_workout, 'Squat', 3, 8, 60);

  -- Hunter A, two days ago.
  insert into public.workouts (user_id, occurred_on, title) values (v_a, v_today - 2, 'Heavy')
  returning id into v_workout;
  insert into public.workout_sets (user_id, workout_id, exercise_name, set_index, reps, weight_kg)
  values
    (v_a, v_workout, 'Barbell Squat', 1, 5, 105),
    (v_a, v_workout, 'BARBELL DEADLIFT ', 2, 3, 140),
    (v_a, v_workout, 'Bench Press', 3, 8, 80),
    (v_a, v_workout, 'Bench Press', 4, 13, 85);

  -- Hunter A, yesterday.
  insert into public.workouts (user_id, occurred_on, title) values (v_a, v_today - 1, 'Mixed')
  returning id into v_workout;
  insert into public.workout_sets (user_id, workout_id, exercise_name, set_index, reps, weight_kg)
  values
    (v_a, v_workout, ' squat', 1, 5, 70),
    (v_a, v_workout, 'Running, Treadmill', 2, 20, null),
    (v_a, v_workout, 'Pushups', 3, 20, null);

  -- Hunter A, today, through the Phase 1 RPC: this awards the Train quest,
  -- so the ledger has real events to protect.
  perform public.log_workout('Today', null, '[{"exercise_name":"Barbell Squat","reps":3,"weight_kg":100}]'::jsonb);

  -- Hunter B: the same name "Squat" must become B's own custom exercise.
  insert into public.workouts (user_id, occurred_on, title) values (v_b, v_today - 1, 'B legs')
  returning id into v_workout;
  insert into public.workout_sets (user_id, workout_id, exercise_name, set_index, reps, weight_kg)
  values
    (v_b, v_workout, 'Squat', 1, 10, 40),
    (v_b, v_workout, 'barbell squat', 2, 10, 50);
end;
$seed$;

-- Fingerprints of everything the gym migrations must not change.
drop schema if exists rehearsal cascade;
create schema rehearsal;
create table rehearsal.before as
select 'xp_events' as subject,
       (select count(*) from public.xp_events)::text as rows,
       (select coalesce(sum(xp), 0) from public.xp_events)::text as total,
       (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.xp_events x) as digest
union all
select 'daily_logs',
       (select count(*) from public.daily_logs)::text, '',
       (select md5(coalesce(string_agg(d::text, '|' order by d.user_id, d.log_date), '')) from public.daily_logs d)
union all
select 'phase1_sets',
       (select count(*) from public.workout_sets)::text, '',
       (select md5(coalesce(string_agg(concat_ws(',', s.id, s.exercise_name, s.reps, s.weight_kg, s.set_index), '|' order by s.id), ''))
        from public.workout_sets s);

do $$
begin
  raise notice 'rehearsal seeded: % sets, % XP events. Now: npx supabase migration up',
    (select rows from rehearsal.before where subject = 'phase1_sets'),
    (select rows from rehearsal.before where subject = 'xp_events');
end;
$$;
