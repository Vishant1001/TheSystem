-- Phase 2, Step 2.6: gym rewards - set XP, personal records, bosses, the
-- exercise merge (brief 4.3, 4.4, 4.5; merge addition at the 2.5 review).
--
-- Every XP change goes through apply_award / reverse_award. The pure rules
-- (workout_set_xp, detect_prs, payable_pr_bonuses, defeats_boss) are twins of
-- src/game/gym.ts; supabase/tests/gym_parity.sql runs the engine's vectors
-- through them.

-- ===========================================================================
-- Pure rules (internal).
-- ===========================================================================

-- The stat an exercise kind trains (config gym.kinds).
create or replace function public.stat_for_kind(p_kind text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_stat text := public.game_config_value('gym') -> 'kinds' ->> p_kind;
begin
  if v_stat is null then
    raise exception 'UNKNOWN_EXERCISE_KIND: %', p_kind;
  end if;
  return v_stat;
end;
$$;

-- Brief 4.3 (gym.ts workoutSetXp): 2 XP per working set, warmups 0, at most
-- 20 working sets per game day. p_sets is [{kind, set_type}] in log order;
-- p_counted_today is what earlier workouts today already counted. Stats are
-- counted sets per kind, merged per stat, in kind order.
create or replace function public.workout_set_xp(
  p_sets jsonb,
  p_counted_today integer,
  out counted_sets integer,
  out full_xp integer,
  out stats jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gym jsonb := public.game_config_value('gym');
  v_allowance integer := greatest(0, (v_gym ->> 'maxWorkingSetsPerDay')::integer - coalesce(p_counted_today, 0));
  v_per_kind jsonb := '{}'::jsonb;
  v_set jsonb;
  v_kind text;
  v_stat text;
  v_index integer;
  v_found boolean;
begin
  counted_sets := 0;
  stats := '[]'::jsonb;

  for v_set in
    select t.item from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) with ordinality as t(item, n)
    order by t.n
  loop
    v_kind := v_set ->> 'kind';
    perform public.stat_for_kind(v_kind);
    if v_set ->> 'set_type' <> 'working' or v_allowance = 0 then
      continue;
    end if;
    v_per_kind := jsonb_set(v_per_kind, array[v_kind],
      to_jsonb(coalesce((v_per_kind ->> v_kind)::integer, 0) + 1));
    counted_sets := counted_sets + 1;
    v_allowance := v_allowance - 1;
  end loop;

  -- Kind order mirrors EXERCISE_KINDS in config.ts (and exercises_kind_valid).
  foreach v_kind in array array['strength', 'cardio', 'mobility'] loop
    if coalesce((v_per_kind ->> v_kind)::integer, 0) = 0 then
      continue;
    end if;
    v_stat := public.stat_for_kind(v_kind);
    v_found := false;
    for v_index in 0 .. jsonb_array_length(stats) - 1 loop
      if stats -> v_index ->> 'stat' = v_stat then
        stats := jsonb_set(stats, array[v_index::text, 'weight'],
          to_jsonb((stats -> v_index ->> 'weight')::integer + (v_per_kind ->> v_kind)::integer));
        v_found := true;
      end if;
    end loop;
    if not v_found then
      stats := stats || jsonb_build_array(
        jsonb_build_object('stat', v_stat, 'weight', (v_per_kind ->> v_kind)::integer));
    end if;
  end loop;

  full_xp := counted_sets * (v_gym ->> 'setXp')::integer;
end;
$$;

-- Brief 4.4 (gym.ts detectPrs): working sets only, PR kinds only, the best set
-- per record kind (earliest on a tie), strictly better than the prior best; no
-- prior record -> a baseline. p_sets is [{set_type, reps, weight_kg}] for one
-- exercise in log order; set_index in the reply is the 0-based position.
create or replace function public.detect_prs(
  p_kind text,
  p_prior_e1rm integer,
  p_prior_max_weight integer,
  p_sets jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_set jsonb;
  v_index integer;
  v_reps integer;
  v_weight integer;
  v_e1rm integer;
  v_best_e1rm integer;
  v_best_e1rm_index integer;
  v_best_max integer;
  v_best_max_index integer;
  v_records jsonb := '[]'::jsonb;
  v_bonus jsonb;
begin
  if not public.pr_kind_allowed(p_kind) then
    return jsonb_build_object('records', '[]'::jsonb, 'bonus_set_indexes', '[]'::jsonb);
  end if;

  for v_set, v_index in
    select t.item, (t.n - 1)::integer
    from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) with ordinality as t(item, n)
    order by t.n
  loop
    v_reps := (v_set ->> 'reps')::integer;
    if v_set ->> 'set_type' <> 'working' or v_reps is null or v_reps < 1 then
      continue;
    end if;
    if (v_set ->> 'weight_kg') is null or (v_set ->> 'weight_kg')::numeric <= 0 then
      continue;
    end if;
    v_weight := public.to_centi((v_set ->> 'weight_kg')::numeric);
    v_e1rm := public.e1rm_centi(v_weight, v_reps);
    if v_e1rm is not null and (v_best_e1rm is null or v_e1rm > v_best_e1rm) then
      v_best_e1rm := v_e1rm;
      v_best_e1rm_index := v_index;
    end if;
    if v_best_max is null or v_weight > v_best_max then
      v_best_max := v_weight;
      v_best_max_index := v_index;
    end if;
  end loop;

  if v_best_e1rm is not null and (p_prior_e1rm is null or v_best_e1rm > p_prior_e1rm) then
    v_records := v_records || jsonb_build_array(jsonb_build_object(
      'pr_kind', 'e1rm', 'value_centi', v_best_e1rm, 'set_index', v_best_e1rm_index,
      'baseline', p_prior_e1rm is null));
  end if;
  if v_best_max is not null and (p_prior_max_weight is null or v_best_max > p_prior_max_weight) then
    v_records := v_records || jsonb_build_array(jsonb_build_object(
      'pr_kind', 'max_weight', 'value_centi', v_best_max, 'set_index', v_best_max_index,
      'baseline', p_prior_max_weight is null));
  end if;

  select coalesce(jsonb_agg(distinct (r ->> 'set_index')::integer order by (r ->> 'set_index')::integer), '[]'::jsonb)
    into v_bonus
  from jsonb_array_elements(v_records) r
  where not (r ->> 'baseline')::boolean;

  return jsonb_build_object('records', v_records, 'bonus_set_indexes', v_bonus);
end;
$$;

-- gym.ts payablePrBonuses: max 2 PR bonuses per game day.
create or replace function public.payable_pr_bonuses(p_candidates integer, p_paid_today integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select least(
    greatest(0, coalesce(p_candidates, 0)),
    greatest(0, (public.game_config_value('gym') -> 'pr' ->> 'maxBonusesPerDay')::integer
                - coalesce(p_paid_today, 0)));
$$;

-- gym.ts defeatsBoss: a working set with weight >= target and reps >= target.
create or replace function public.defeats_boss(
  p_boss_kind text,
  p_target_weight_kg numeric,
  p_target_reps integer,
  p_set_type text,
  p_reps integer,
  p_weight_kg numeric
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_boss_kind in (
           select jsonb_array_elements_text(public.game_config_value('gym') -> 'boss' -> 'kinds'))
     and p_set_type = 'working'
     and p_reps is not null
     and p_weight_kg is not null
     and p_reps >= p_target_reps
     and public.to_centi(p_weight_kg) >= public.to_centi(p_target_weight_kg);
$$;

-- ===========================================================================
-- Derived state (internal).
-- ===========================================================================

-- The current best is derived: the max over live records (brief 4.4).
create or replace function public.pr_best(p_user uuid, p_exercise_id uuid, p_pr_kind text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select max(value_centi) from public.personal_records
  where user_id = p_user and exercise_id = p_exercise_id and pr_kind = p_pr_kind
    and reversed_at is null;
$$;

-- PR bonuses that still stand today (reversed ones free their slot).
create or replace function public.pr_bonuses_paid_on(p_user uuid, p_day date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.xp_events e
  where e.user_id = p_user and e.occurred_on = p_day and e.source_type = 'pr'
    and not exists (select 1 from public.xp_events r where r.reverses_event_id = e.id);
$$;

-- Follows merge links to the exercise a merged custom exercise now lives in.
create or replace function public.exercise_after_merges(p_exercise public.exercises)
returns public.exercises
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exercise public.exercises := p_exercise;
  v_hops integer := 0;
begin
  while v_exercise.merged_into_id is not null loop
    v_hops := v_hops + 1;
    if v_hops > 50 then
      raise exception 'EXERCISE_NOT_FOUND';
    end if;
    select * into v_exercise from public.exercises where id = v_exercise.merged_into_id;
  end loop;
  return v_exercise;
end;
$$;

-- The exercise a logged set belongs to: by id (library or own, live), or by
-- name the way the legacy mapping did it - library first (case-insensitive
-- exact), then the hunter's own custom exercise (following merges), else a new
-- custom strength exercise spelled as logged.
create or replace function public.resolve_exercise(p_user uuid, p_exercise_id uuid, p_name text)
returns public.exercises
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_exercise public.exercises;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if p_exercise_id is not null then
    select * into v_exercise from public.exercises
    where id = p_exercise_id and (user_id is null or user_id = p_user);
    if not found then
      raise exception 'EXERCISE_NOT_FOUND';
    end if;
    v_exercise := public.exercise_after_merges(v_exercise);
    if v_exercise.archived_at is not null then
      raise exception 'EXERCISE_ARCHIVED';
    end if;
    return v_exercise;
  end if;

  if v_name = '' then
    raise exception 'INVALID_SETS';
  end if;

  select * into v_exercise from public.exercises
  where user_id is null and lower(name) = lower(v_name)
  order by source_id
  limit 1;
  if found then
    return v_exercise;
  end if;

  select * into v_exercise from public.exercises
  where user_id = p_user and lower(btrim(name)) = lower(v_name)
    and (archived_at is null or merged_into_id is not null)
  order by (archived_at is null) desc, archived_at desc
  limit 1;
  if found then
    v_exercise := public.exercise_after_merges(v_exercise);
    if v_exercise.archived_at is null then
      return v_exercise;
    end if;
  end if;

  insert into public.exercises (user_id, name, kind)
  values (p_user, v_name, 'strength')
  returning * into v_exercise;
  return v_exercise;
end;
$$;

-- Restores the derived best of an exercise to what its remaining history
-- shows: when the best live record of a kind is below the best surviving
-- working set (after a merge, or after a deleted workout took its records
-- with it), that set becomes a baseline - stored, never rewarded.
create or replace function public.rebase_pr_baselines(p_user uuid, p_exercise_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_pr_kind text;
  v_best record;
  v_current integer;
  v_added integer := 0;
begin
  select kind into v_kind from public.exercises where id = p_exercise_id;
  if v_kind is null or not public.pr_kind_allowed(v_kind) then
    return 0;
  end if;

  foreach v_pr_kind in array array['e1rm', 'max_weight'] loop
    select s.id as set_id, w.id as workout_id, w.occurred_on,
           case when v_pr_kind = 'e1rm'
                then public.e1rm_centi(public.to_centi(s.weight_kg), s.reps)
                else public.to_centi(s.weight_kg) end as value
      into v_best
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    where s.user_id = p_user and s.exercise_id = p_exercise_id
      and s.set_type = 'working' and s.reps >= 1 and s.weight_kg > 0
      and (v_pr_kind <> 'e1rm' or public.e1rm_centi(public.to_centi(s.weight_kg), s.reps) is not null)
    order by 4 desc, w.occurred_on, w.created_at, s.set_index
    limit 1;

    if not found or v_best.value is null then
      continue;
    end if;
    v_current := public.pr_best(p_user, p_exercise_id, v_pr_kind);
    if v_current is null or v_best.value > v_current then
      insert into public.personal_records (
        user_id, exercise_id, pr_kind, value_centi, occurred_on, workout_id, set_id, baseline
      )
      values (p_user, p_exercise_id, v_pr_kind, v_best.value, v_best.occurred_on,
              v_best.workout_id, v_best.set_id, true);
      v_added := v_added + 1;
    end if;
  end loop;
  return v_added;
end;
$$;

-- ===========================================================================
-- Awards for one logged workout (internal): set XP, records, bosses.
-- ===========================================================================
create or replace function public.award_workout(p_user uuid, p_workout public.workouts)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_gym jsonb := public.game_config_value('gym');
  v_day date := p_workout.occurred_on;
  v_counted_today integer;
  v_set_xp record;
  v_workout_award jsonb;
  v_exercise record;
  v_detection jsonb;
  v_record jsonb;
  v_record_id uuid;
  v_index integer;
  v_records jsonb := '[]'::jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_candidate jsonb;
  v_payable integer;
  v_award jsonb;
  v_bonuses jsonb := '[]'::jsonb;
  v_boss record;
  v_set public.workout_sets;
  v_bosses jsonb := '[]'::jsonb;
  v_n integer := 0;
begin
  -- 1. Set XP: one workout event, fitness cap, debt repayment (brief 4.3).
  select coalesce(sum(counted_sets), 0) into v_counted_today
  from public.workouts
  where user_id = p_user and occurred_on = v_day and id <> p_workout.id;

  select * into v_set_xp
  from public.workout_set_xp(
    (select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'set_type', s.set_type)
                               order by s.set_index), '[]'::jsonb)
     from public.workout_sets s join public.exercises e on e.id = s.exercise_id
     where s.workout_id = p_workout.id),
    v_counted_today);

  update public.workouts set counted_sets = v_set_xp.counted_sets where id = p_workout.id;

  if v_set_xp.full_xp > 0 then
    v_workout_award := public.apply_award(
      p_user, v_day, 'workout', p_workout.id, 'fitness', v_set_xp.full_xp, v_set_xp.stats);
  end if;

  -- 2. Personal records, per exercise in the order it was first logged.
  for v_exercise in
    select s.exercise_id, e.kind, e.name,
           jsonb_agg(jsonb_build_object('set_type', s.set_type, 'reps', s.reps, 'weight_kg', s.weight_kg)
                     order by s.set_index) as sets,
           array_agg(s.id order by s.set_index) as set_ids
    from public.workout_sets s join public.exercises e on e.id = s.exercise_id
    where s.workout_id = p_workout.id
    group by s.exercise_id, e.kind, e.name
    order by min(s.set_index)
  loop
    if not public.pr_kind_allowed(v_exercise.kind) then
      continue;
    end if;
    v_detection := public.detect_prs(
      v_exercise.kind,
      public.pr_best(p_user, v_exercise.exercise_id, 'e1rm'),
      public.pr_best(p_user, v_exercise.exercise_id, 'max_weight'),
      v_exercise.sets);

    for v_record in select * from jsonb_array_elements(v_detection -> 'records') loop
      insert into public.personal_records (
        user_id, exercise_id, pr_kind, value_centi, occurred_on, workout_id, set_id, baseline
      )
      values (
        p_user, v_exercise.exercise_id, v_record ->> 'pr_kind', (v_record ->> 'value_centi')::integer,
        v_day, p_workout.id, v_exercise.set_ids[(v_record ->> 'set_index')::integer + 1],
        (v_record ->> 'baseline')::boolean
      )
      returning id into v_record_id;
      v_records := v_records || jsonb_build_array(jsonb_build_object(
        'record_id', v_record_id,
        'exercise_id', v_exercise.exercise_id,
        'exercise_name', v_exercise.name,
        'pr_kind', v_record ->> 'pr_kind',
        'value_centi', (v_record ->> 'value_centi')::integer,
        'baseline', (v_record ->> 'baseline')::boolean,
        'set_id', v_exercise.set_ids[(v_record ->> 'set_index')::integer + 1]));
    end loop;

    for v_index in select (x)::integer from jsonb_array_elements_text(v_detection -> 'bonus_set_indexes') x loop
      v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
        'set_id', v_exercise.set_ids[v_index + 1],
        'exercise_id', v_exercise.exercise_id,
        'exercise_name', v_exercise.name,
        'kind', v_exercise.kind));
    end loop;
  end loop;

  -- One bonus per record-breaking set, max 2 per game day (step 0, G-g).
  v_payable := public.payable_pr_bonuses(jsonb_array_length(v_candidates),
                                         public.pr_bonuses_paid_on(p_user, v_day));
  for v_candidate in select * from jsonb_array_elements(v_candidates) loop
    v_n := v_n + 1;
    exit when v_n > v_payable;
    v_award := public.apply_award(
      p_user, v_day, 'pr', (v_candidate ->> 'set_id')::uuid, 'fitness',
      (v_gym -> 'pr' ->> 'xp')::integer,
      jsonb_build_array(jsonb_build_object('stat', public.stat_for_kind(v_candidate ->> 'kind'), 'weight', 1)));
    update public.personal_records
    set xp_event_id = (v_award ->> 'event_id')::uuid
    where set_id = (v_candidate ->> 'set_id')::uuid and not baseline and xp_event_id is null;
    v_bonuses := v_bonuses || jsonb_build_array(v_award || jsonb_build_object(
      'set_id', v_candidate ->> 'set_id',
      'exercise_id', v_candidate ->> 'exercise_id',
      'exercise_name', v_candidate ->> 'exercise_name'));
  end loop;

  select coalesce(jsonb_agg(r || jsonb_build_object('bonus_event_id', p.xp_event_id) order by ord), '[]'::jsonb)
    into v_records
  from jsonb_array_elements(v_records) with ordinality as t(r, ord)
  join public.personal_records p on p.id = (r ->> 'record_id')::uuid;

  -- 3. Bosses on the exercises of this workout, oldest first (brief 4.5).
  for v_boss in
    select b.*, e.kind as exercise_kind, e.name as exercise_name
    from public.bosses b join public.exercises e on e.id = b.exercise_id
    where b.user_id = p_user and b.archived_at is null and b.defeated_on is null
      and b.exercise_id in (select exercise_id from public.workout_sets where workout_id = p_workout.id)
    order by b.created_at, b.id
  loop
    select * into v_set from public.workout_sets s
    where s.workout_id = p_workout.id and s.exercise_id = v_boss.exercise_id
      and public.defeats_boss(v_boss.exercise_kind, v_boss.target_weight_kg, v_boss.target_reps,
                              s.set_type, s.reps, s.weight_kg)
    order by s.set_index
    limit 1;
    if not found then
      continue;
    end if;

    v_award := public.apply_award(
      p_user, v_day, 'boss', v_boss.id, 'fitness',
      (v_gym -> 'boss' ->> 'xpMultiplier')::integer * public.quest_xp_for(v_boss.difficulty),
      jsonb_build_array(jsonb_build_object('stat', public.stat_for_kind(v_boss.exercise_kind), 'weight', 1)),
      (v_gym -> 'boss' ->> 'freePoints')::integer);
    update public.bosses
    set defeated_on = v_day, defeated_workout_id = p_workout.id, defeated_set_id = v_set.id,
        xp_event_id = (v_award ->> 'event_id')::uuid
    where id = v_boss.id;
    v_bosses := v_bosses || jsonb_build_array(v_award || jsonb_build_object(
      'boss_id', v_boss.id,
      'boss_name', coalesce(v_boss.name, v_boss.exercise_name),
      'exercise_name', v_boss.exercise_name));
  end loop;

  return jsonb_build_object(
    'counted_sets', v_set_xp.counted_sets,
    'workout_award', v_workout_award,
    'records', v_records,
    'pr_bonuses', v_bonuses,
    'bosses_defeated', v_bosses
  );
end;
$$;

-- Undoes everything award_workout did for a workout (internal). Runs before
-- the workout row is deleted.
create or replace function public.reverse_workout_awards(p_user uuid, p_workout_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_result jsonb;
  v_removed integer := 0;
  v_reopened boolean := false;
  v_bosses integer := 0;
  v_records integer := 0;
begin
  -- Bosses: the reward is reversed and the boss is undefeated again.
  for v_event_id in
    select xp_event_id from public.bosses
    where user_id = p_user and defeated_workout_id = p_workout_id
    for update
  loop
    v_result := public.reverse_award(p_user, v_event_id);
    v_removed := v_removed + coalesce((v_result ->> 'xp_removed')::integer, 0);
    v_reopened := v_reopened or coalesce((v_result ->> 'debt_reopened')::boolean, false);
    v_bosses := v_bosses + 1;
  end loop;
  update public.bosses
  set defeated_on = null, defeated_workout_id = null, defeated_set_id = null, xp_event_id = null
  where user_id = p_user and defeated_workout_id = p_workout_id;

  -- Records: every bonus they paid (even when a merge already retired the
  -- record), then the records themselves.
  for v_event_id in
    select distinct xp_event_id from public.personal_records
    where user_id = p_user and workout_id = p_workout_id and xp_event_id is not null
  loop
    v_result := public.reverse_award(p_user, v_event_id);
    v_removed := v_removed + coalesce((v_result ->> 'xp_removed')::integer, 0);
    v_reopened := v_reopened or coalesce((v_result ->> 'debt_reopened')::boolean, false);
  end loop;
  update public.personal_records
  set reversed_at = now()
  where user_id = p_user and workout_id = p_workout_id and reversed_at is null;
  get diagnostics v_records = row_count;

  -- The set XP event.
  for v_event_id in
    select id from public.xp_events
    where user_id = p_user and source_type = 'workout' and source_id = p_workout_id
  loop
    v_result := public.reverse_award(p_user, v_event_id);
    v_removed := v_removed + coalesce((v_result ->> 'xp_removed')::integer, 0);
    v_reopened := v_reopened or coalesce((v_result ->> 'debt_reopened')::boolean, false);
  end loop;

  return jsonb_build_object(
    'xp_removed', v_removed,
    'debt_reopened', v_reopened,
    'bosses_undefeated', v_bosses,
    'records_reversed', v_records
  );
end;
$$;

-- ===========================================================================
-- Client RPCs: logging (same signatures as Phase 1).
-- ===========================================================================

-- p_sets items: {exercise_id?, exercise_name?, set_type?, reps?, weight_kg?,
-- duration_s?, distance_m?}. The Phase 1 shape {exercise_name, reps,
-- weight_kg} still works: those sets are working sets, linked by name.
create or replace function public.log_workout(
  p_title text,
  p_notes text,
  p_sets jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_today date;
  v_workout public.workouts;
  v_item jsonb;
  v_set_no integer;
  v_exercise public.exercises;
  v_set_type text;
  v_set_count integer := 0;
  v_auto jsonb;
  v_awards jsonb;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  if p_sets is not null and jsonb_typeof(p_sets) <> 'array' then
    raise exception 'INVALID_SETS';
  end if;

  v_today := public.game_today_for(v_user);

  insert into public.workouts (user_id, occurred_on, title, notes)
  values (v_user, v_today, btrim(p_title), nullif(btrim(coalesce(p_notes, '')), ''))
  returning * into v_workout;

  for v_item, v_set_no in
    select t.item, t.n::integer
    from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) with ordinality as t(item, n)
    order by t.n
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'INVALID_SETS';
    end if;
    v_set_type := coalesce(v_item ->> 'set_type', 'working');
    if v_set_type not in ('warmup', 'working')
       or coalesce(v_item ->> 'reps', v_item ->> 'duration_s', v_item ->> 'distance_m') is null then
      raise exception 'INVALID_SETS';
    end if;
    v_exercise := public.resolve_exercise(
      v_user, (v_item ->> 'exercise_id')::uuid, v_item ->> 'exercise_name');

    insert into public.workout_sets (
      user_id, workout_id, exercise_id, exercise_name, set_index, set_type,
      reps, weight_kg, duration_s, distance_m
    )
    values (
      v_user, v_workout.id, v_exercise.id,
      case when v_item ->> 'exercise_id' is null then btrim(v_item ->> 'exercise_name')
           else v_exercise.name end,
      v_set_no, v_set_type,
      (v_item ->> 'reps')::integer,
      nullif(v_item ->> 'weight_kg', '')::numeric,
      (v_item ->> 'duration_s')::integer,
      nullif(v_item ->> 'distance_m', '')::numeric
    );
    v_set_count := v_set_count + 1;
  end loop;

  -- The Train quest first, exactly as in Phase 1 (brief 4.3: unchanged), then
  -- what is new: set XP, records, bosses.
  v_auto := public.evaluate_auto_workout(v_user, v_today);
  v_awards := public.award_workout(v_user, v_workout);

  return jsonb_build_object(
    'workout_id', v_workout.id,
    'occurred_on', v_today,
    'set_count', v_set_count,
    'auto_workout', v_auto
  ) || v_awards;
end;
$$;

create or replace function public.delete_workout(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_workout public.workouts;
  v_today date;
  v_exercises uuid[];
  v_exercise uuid;
  v_reversal jsonb;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  select * into v_workout from public.workouts where id = p_id and user_id = v_user;
  if not found then
    raise exception 'WORKOUT_NOT_FOUND';
  end if;

  v_today := public.game_today_for(v_user);
  if v_workout.occurred_on <> v_today then
    raise exception 'SEALED_DAY';
  end if;

  select array_agg(distinct exercise_id) into v_exercises
  from public.workout_sets where workout_id = v_workout.id and exercise_id is not null;

  v_reversal := public.reverse_workout_awards(v_user, v_workout.id);
  delete from public.workouts where id = v_workout.id;

  -- The records that went with it may have hidden an older best.
  foreach v_exercise in array coalesce(v_exercises, '{}'::uuid[]) loop
    perform public.rebase_pr_baselines(v_user, v_exercise);
  end loop;

  return jsonb_build_object(
    'workout_id', v_workout.id,
    'occurred_on', v_today,
    'auto_workout', public.evaluate_auto_workout(v_user, v_today)
  ) || v_reversal;
end;
$$;

-- ===========================================================================
-- Client RPCs: bosses (brief 4.5).
-- ===========================================================================
create or replace function public.boss_json(p_boss public.bosses)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(p_boss) || jsonb_build_object(
    'exercise_name', (select name from public.exercises where id = p_boss.exercise_id),
    'reward_xp', (public.game_config_value('gym') -> 'boss' ->> 'xpMultiplier')::integer
                 * public.quest_xp_for(p_boss.difficulty),
    'reward_free_points', (public.game_config_value('gym') -> 'boss' ->> 'freePoints')::integer);
$$;

-- Shared validation for create_boss and update_boss.
create or replace function public.assert_boss_fields(
  p_target_weight_kg numeric,
  p_target_reps integer,
  p_difficulty text,
  p_name text
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_target_weight_kg is null or p_target_weight_kg <= 0 or p_target_weight_kg > 1000
     or p_target_weight_kg <> round(p_target_weight_kg, 2)
     or p_target_reps is null or p_target_reps < 1 or p_target_reps > 1000
     or p_difficulty is null or p_difficulty not in ('E', 'D', 'C', 'B', 'A', 'S')
     or (p_name is not null and char_length(btrim(p_name)) > 60) then
    raise exception 'INVALID_BOSS';
  end if;
end;
$$;

create or replace function public.create_boss(
  p_exercise_id uuid,
  p_target_weight_kg numeric,
  p_target_reps integer,
  p_difficulty text,
  p_name text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_boss_rules jsonb := public.game_config_value('gym') -> 'boss';
  v_exercise public.exercises;
  v_reps integer := coalesce(p_target_reps, (v_boss_rules ->> 'defaultTargetReps')::integer);
  v_boss public.bosses;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  select * into v_exercise from public.exercises
  where id = p_exercise_id and (user_id is null or user_id = v_user) and archived_at is null;
  if not found then
    raise exception 'EXERCISE_NOT_FOUND';
  end if;
  if not (v_exercise.kind in (select jsonb_array_elements_text(v_boss_rules -> 'kinds'))) then
    raise exception 'BOSS_KIND_NOT_ALLOWED';
  end if;
  perform public.assert_boss_fields(p_target_weight_kg, v_reps, p_difficulty, p_name);

  if (select count(*) from public.bosses
      where user_id = v_user and archived_at is null and defeated_on is null)
     >= (v_boss_rules ->> 'maxActive')::integer then
    raise exception 'BOSS_LIMIT';
  end if;

  insert into public.bosses (user_id, exercise_id, name, target_weight_kg, target_reps, difficulty)
  values (v_user, v_exercise.id, nullif(btrim(coalesce(p_name, '')), ''),
          p_target_weight_kg, v_reps, p_difficulty)
  returning * into v_boss;

  return public.boss_json(v_boss);
end;
$$;

-- Edits an undefeated boss. A defeated boss is a trophy and stays as it was.
create or replace function public.update_boss(
  p_boss_id uuid,
  p_target_weight_kg numeric,
  p_target_reps integer,
  p_difficulty text,
  p_name text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_boss public.bosses;
begin
  select * into v_boss from public.bosses
  where id = p_boss_id and user_id = v_user and archived_at is null
  for update;
  if not found then
    raise exception 'BOSS_NOT_FOUND';
  end if;
  if v_boss.defeated_on is not null then
    raise exception 'BOSS_DEFEATED';
  end if;
  perform public.assert_boss_fields(p_target_weight_kg, p_target_reps, p_difficulty, p_name);

  update public.bosses
  set target_weight_kg = p_target_weight_kg,
      target_reps = p_target_reps,
      difficulty = p_difficulty,
      name = nullif(btrim(coalesce(p_name, '')), '')
  where id = v_boss.id
  returning * into v_boss;

  return public.boss_json(v_boss);
end;
$$;

-- Retires an undefeated boss (archived, never deleted).
create or replace function public.archive_boss(p_boss_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_boss public.bosses;
begin
  select * into v_boss from public.bosses
  where id = p_boss_id and user_id = v_user and archived_at is null
  for update;
  if not found then
    raise exception 'BOSS_NOT_FOUND';
  end if;
  if v_boss.defeated_on is not null then
    raise exception 'BOSS_DEFEATED';
  end if;

  update public.bosses set archived_at = now() where id = v_boss.id
  returning * into v_boss;
  return public.boss_json(v_boss);
end;
$$;

-- ===========================================================================
-- Client RPC: merge a custom exercise into another (2.5 review addition).
-- Moves the owner's sets and bosses, retires the source's records, re-derives
-- the target's baselines from the combined history, archives the source.
-- Metadata only: allowed on sealed days, writes no xp_events row.
-- ===========================================================================
create or replace function public.merge_exercise(p_from_custom_id uuid, p_into_exercise_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_from public.exercises;
  v_into public.exercises;
  v_sets integer;
  v_bosses integer;
  v_records integer;
  v_baselines integer;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  -- Only the caller's own custom exercise can be merged away...
  select * into v_from from public.exercises
  where id = p_from_custom_id and user_id = v_user
  for update;
  if not found then
    raise exception 'EXERCISE_NOT_FOUND';
  end if;
  -- ...into a library exercise or another of the caller's own.
  select * into v_into from public.exercises
  where id = p_into_exercise_id and (user_id is null or user_id = v_user);
  if not found then
    raise exception 'EXERCISE_NOT_FOUND';
  end if;

  -- Repeating a merge that already happened is a no-op.
  if v_from.merged_into_id is not null then
    if v_from.merged_into_id = v_into.id then
      return jsonb_build_object(
        'from_id', v_from.id, 'into_id', v_into.id, 'into_name', v_into.name,
        'already_merged', true, 'sets_moved', 0, 'bosses_moved', 0,
        'records_retired', 0, 'baselines_added', 0);
    end if;
    raise exception 'EXERCISE_ARCHIVED';
  end if;
  if v_from.id = v_into.id then
    raise exception 'MERGE_INTO_SELF';
  end if;
  if v_from.archived_at is not null or v_into.archived_at is not null then
    raise exception 'EXERCISE_ARCHIVED';
  end if;
  if v_from.kind <> v_into.kind then
    raise exception 'MERGE_KIND_MISMATCH';
  end if;

  update public.workout_sets set exercise_id = v_into.id
  where user_id = v_user and exercise_id = v_from.id;
  get diagnostics v_sets = row_count;

  update public.bosses set exercise_id = v_into.id
  where user_id = v_user and exercise_id = v_from.id;
  get diagnostics v_bosses = row_count;

  update public.personal_records set reversed_at = now()
  where user_id = v_user and exercise_id = v_from.id and reversed_at is null;
  get diagnostics v_records = row_count;

  v_baselines := public.rebase_pr_baselines(v_user, v_into.id);

  update public.exercises
  set archived_at = now(), merged_into_id = v_into.id
  where id = v_from.id;

  return jsonb_build_object(
    'from_id', v_from.id, 'into_id', v_into.id, 'into_name', v_into.name,
    'already_merged', false, 'sets_moved', v_sets, 'bosses_moved', v_bosses,
    'records_retired', v_records, 'baselines_added', v_baselines);
end;
$$;

-- ===========================================================================
-- Privileges: internal helpers are revoked from every client role; the new
-- client RPCs are granted to authenticated only (C1).
-- ===========================================================================
revoke execute on function public.stat_for_kind(text) from public, anon, authenticated;
revoke execute on function public.workout_set_xp(jsonb, integer) from public, anon, authenticated;
revoke execute on function public.detect_prs(text, integer, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.payable_pr_bonuses(integer, integer) from public, anon, authenticated;
revoke execute on function public.defeats_boss(text, numeric, integer, text, integer, numeric) from public, anon, authenticated;
revoke execute on function public.pr_best(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.pr_bonuses_paid_on(uuid, date) from public, anon, authenticated;
revoke execute on function public.exercise_after_merges(public.exercises) from public, anon, authenticated;
revoke execute on function public.resolve_exercise(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.rebase_pr_baselines(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.award_workout(uuid, public.workouts) from public, anon, authenticated;
revoke execute on function public.reverse_workout_awards(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.boss_json(public.bosses) from public, anon, authenticated;
revoke execute on function public.assert_boss_fields(numeric, integer, text, text) from public, anon, authenticated;

revoke execute on function public.log_workout(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.delete_workout(uuid) from public, anon, authenticated;
revoke execute on function public.create_boss(uuid, numeric, integer, text, text) from public, anon, authenticated;
revoke execute on function public.update_boss(uuid, numeric, integer, text, text) from public, anon, authenticated;
revoke execute on function public.archive_boss(uuid) from public, anon, authenticated;
revoke execute on function public.merge_exercise(uuid, uuid) from public, anon, authenticated;

grant execute on function public.log_workout(text, text, jsonb) to authenticated;
grant execute on function public.delete_workout(uuid) to authenticated;
grant execute on function public.create_boss(uuid, numeric, integer, text, text) to authenticated;
grant execute on function public.update_boss(uuid, numeric, integer, text, text) to authenticated;
grant execute on function public.archive_boss(uuid) to authenticated;
grant execute on function public.merge_exercise(uuid, uuid) to authenticated;
