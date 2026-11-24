-- DEV ONLY. Step 2.5 rehearsal, part 2 of 2: after `npx supabase migration up`.
-- Proves on the history from rehearsal_gym_seed.sql that the gym migrations
-- mapped every legacy set, created exactly the expected custom exercises,
-- recorded the expected baselines with no XP, and left the ledger, the day
-- logs and the Phase 1 set columns byte-for-byte unchanged.

do $check$
declare
  v_a uuid := 'eeeeeeee-0000-0000-0000-00000000000a';
  v_b uuid := 'eeeeeeee-0000-0000-0000-00000000000b';
  v_before record;
  v_now text;
  v_count integer;
  v_case record;
begin
  if inet_client_addr() is not null then
    raise exception 'rehearsal refused: local unix socket only';
  end if;
  if to_regclass('rehearsal.before') is null then
    raise exception 'run supabase/dev/rehearsal_gym_seed.sql first';
  end if;

  -- 1. Nothing Phase 1 changed.
  for v_before in select * from rehearsal.before loop
    v_now := case v_before.subject
      when 'xp_events' then
        (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.xp_events x)
      when 'daily_logs' then
        (select md5(coalesce(string_agg(d::text, '|' order by d.user_id, d.log_date), '')) from public.daily_logs d)
      else
        (select md5(coalesce(string_agg(concat_ws(',', s.id, s.exercise_name, s.reps, s.weight_kg, s.set_index), '|' order by s.id), ''))
         from public.workout_sets s)
    end;
    if v_now is distinct from v_before.digest then
      raise exception 'REHEARSAL FAILED: % changed during the migration', v_before.subject;
    end if;
  end loop;

  -- 2. Every set is linked to an exercise.
  select count(*) into v_count from public.workout_sets where exercise_id is null;
  if v_count <> 0 then
    raise exception 'REHEARSAL FAILED: % sets have no exercise', v_count;
  end if;

  -- 3. Library names matched whatever the case or spacing.
  for v_case in
    select * from (values
      ('barbell squat', 'Barbell Squat'),
      ('Barbell Squat', 'Barbell Squat'),
      ('BARBELL DEADLIFT ', 'Barbell Deadlift'),
      ('Running, Treadmill', 'Running, Treadmill'),
      ('Pushups', 'Pushups')
    ) as t(logged, library)
  loop
    if not exists (
      select 1 from public.workout_sets s
      join public.exercises e on e.id = s.exercise_id
      where s.exercise_name = v_case.logged and e.user_id is null and e.name = v_case.library
    ) then
      raise exception 'REHEARSAL FAILED: "%" was not mapped to the library exercise "%"',
        v_case.logged, v_case.library;
    end if;
  end loop;

  -- 4. Exactly the unknown names became custom exercises, per hunter:
  --    A: Squat (also " squat") and Bench Press; B: its own Squat.
  if (select array_agg(name order by name) from public.exercises where user_id = v_a)
       is distinct from array['Bench Press', 'Squat']
     or (select array_agg(name order by name) from public.exercises where user_id = v_b)
       is distinct from array['Squat'] then
    raise exception 'REHEARSAL FAILED: unexpected custom exercises: %',
      (select array_agg(coalesce(user_id::text, '') || ':' || name) from public.exercises where user_id is not null);
  end if;
  if (select count(distinct exercise_id) from public.workout_sets
      where user_id = v_a and lower(btrim(exercise_name)) = 'squat') <> 1 then
    raise exception 'REHEARSAL FAILED: "Squat" and " squat" must share one custom exercise';
  end if;

  -- 5. Baselines, hand-computed (centi-kg, Epley half up), all without XP.
  for v_case in
    select * from (values
      (v_a, 'Barbell Squat', true, 'e1rm', 12250),        -- 105 x 5
      (v_a, 'Barbell Squat', true, 'max_weight', 11000),  -- 110 x 2
      (v_a, 'Squat', false, 'e1rm', 8167),                -- 70 x 5
      (v_a, 'Squat', false, 'max_weight', 7000),
      (v_a, 'Barbell Deadlift', true, 'e1rm', 15400),     -- 140 x 3
      (v_a, 'Barbell Deadlift', true, 'max_weight', 14000),
      (v_a, 'Bench Press', false, 'e1rm', 10133),         -- 80 x 8; 85 x 13 has no e1RM
      (v_a, 'Bench Press', false, 'max_weight', 8500),    -- ...but is the heaviest
      (v_b, 'Squat', false, 'e1rm', 5333),                -- 40 x 10
      (v_b, 'Squat', false, 'max_weight', 4000),
      (v_b, 'Barbell Squat', true, 'e1rm', 6667),         -- 50 x 10
      (v_b, 'Barbell Squat', true, 'max_weight', 5000)
    ) as t(hunter, exercise, library, pr_kind, value_centi)
  loop
    if not exists (
      select 1 from public.personal_records p
      join public.exercises e on e.id = p.exercise_id
      where p.user_id = v_case.hunter and e.name = v_case.exercise
        and (e.user_id is null) = v_case.library
        and p.pr_kind = v_case.pr_kind and p.value_centi = v_case.value_centi
        and p.baseline and p.xp_event_id is null and p.reversed_at is null
    ) then
      raise exception 'REHEARSAL FAILED: missing baseline % % = %',
        v_case.exercise, v_case.pr_kind, v_case.value_centi;
    end if;
  end loop;

  select count(*) into v_count from public.personal_records;
  if v_count <> 12 then
    raise exception 'REHEARSAL FAILED: expected 12 baselines (none for cardio or bodyweight), got %', v_count;
  end if;

  raise notice '----------------------------------------';
  raise notice 'GYM REHEARSAL PASSED: sets mapped, 3 custom exercises, 12 baselines, ledger unchanged';
  raise notice '----------------------------------------';
end;
$check$;

drop schema rehearsal cascade;
