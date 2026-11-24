-- Phase 2, Step 2.5: gym depth - e1RM in SQL, legacy set mapping and PR
-- baselines (brief 4.2, 4.4).
--
-- Non-destructive and XP-free: Phase 1 sets keep exercise_name as it is; this
-- only fills the new exercise_id link, adds custom exercises for names the
-- library does not know, and records baselines with no XP. No xp_events row
-- is written or touched.

-- ---------------------------------------------------------------------------
-- Weights in centi-kilograms and the Epley e1RM. Twins of toCentiKg and
-- e1rmCentiKg in src/game/gym.ts; supabase/tests/gym_parity.sql runs the
-- same vectors through both.
-- ---------------------------------------------------------------------------
create or replace function public.to_centi(p_kg numeric)
returns integer
language sql
immutable
set search_path = public
as $$
  select round(p_kg * 100)::integer;
$$;

create or replace function public.e1rm_centi(p_weight_centi integer, p_reps integer)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pr jsonb := public.game_config_value('gym') -> 'pr';
  v_divisor integer := (v_pr ->> 'e1rmRepsDivisor')::integer;
begin
  if p_reps is null
     or p_reps < (v_pr ->> 'e1rmMinReps')::integer
     or p_reps > (v_pr ->> 'e1rmMaxReps')::integer
     or p_weight_centi is null
     or p_weight_centi <= 0 then
    return null;
  end if;
  -- weight x (1 + reps / 30), half up, in exact integer arithmetic.
  return (2 * p_weight_centi * (v_divisor + p_reps) + v_divisor) / (2 * v_divisor);
end;
$$;

-- Exercise kinds that can hold personal records (strength only, config).
create or replace function public.pr_kind_allowed(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_kind in (
    select jsonb_array_elements_text(public.game_config_value('gym') -> 'pr' -> 'kinds')
  );
$$;

revoke execute on function public.to_centi(numeric) from public, anon, authenticated;
revoke execute on function public.e1rm_centi(integer, integer) from public, anon, authenticated;
revoke execute on function public.pr_kind_allowed(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Legacy sets that name a library exercise exactly (case-insensitive).
-- ---------------------------------------------------------------------------
update public.workout_sets s
set exercise_id = e.id
from public.exercises e
where s.exercise_id is null
  and e.user_id is null
  and lower(e.name) = lower(btrim(s.exercise_name));

-- ---------------------------------------------------------------------------
-- 2. Every other name becomes a custom exercise of its hunter, spelled the
--    way it was first logged. Phase 1 sets were reps and weight, so these
--    are strength exercises.
-- ---------------------------------------------------------------------------
insert into public.exercises (user_id, name, kind)
select distinct on (s.user_id, lower(btrim(s.exercise_name)))
  s.user_id, btrim(s.exercise_name), 'strength'
from public.workout_sets s
join public.workouts w on w.id = s.workout_id
where s.exercise_id is null
  and not exists (
    select 1 from public.exercises e
    where e.user_id = s.user_id
      and e.archived_at is null
      and lower(btrim(e.name)) = lower(btrim(s.exercise_name))
  )
order by s.user_id, lower(btrim(s.exercise_name)), w.occurred_on, w.created_at, s.set_index;

update public.workout_sets s
set exercise_id = e.id
from public.exercises e
where s.exercise_id is null
  and e.user_id = s.user_id
  and e.archived_at is null
  and lower(btrim(e.name)) = lower(btrim(s.exercise_name));

-- ---------------------------------------------------------------------------
-- 3. PR baselines from Phase 1 bests (brief 4.2): one per exercise and kind,
--    the best working set (earliest on a tie), no XP. Only kinds that can
--    hold records, and only where no record exists yet.
-- ---------------------------------------------------------------------------
insert into public.personal_records (
  user_id, exercise_id, pr_kind, value_centi, occurred_on, workout_id, set_id, baseline
)
select distinct on (s.user_id, s.exercise_id)
  s.user_id, s.exercise_id, 'e1rm',
  public.e1rm_centi(public.to_centi(s.weight_kg), s.reps),
  w.occurred_on, w.id, s.id, true
from public.workout_sets s
join public.workouts w on w.id = s.workout_id
join public.exercises e on e.id = s.exercise_id
where s.set_type = 'working'
  and public.pr_kind_allowed(e.kind)
  and public.e1rm_centi(public.to_centi(s.weight_kg), s.reps) is not null
  and not exists (
    select 1 from public.personal_records p
    where p.user_id = s.user_id and p.exercise_id = s.exercise_id and p.pr_kind = 'e1rm'
  )
order by s.user_id, s.exercise_id,
  public.e1rm_centi(public.to_centi(s.weight_kg), s.reps) desc,
  w.occurred_on, w.created_at, s.set_index;

insert into public.personal_records (
  user_id, exercise_id, pr_kind, value_centi, occurred_on, workout_id, set_id, baseline
)
select distinct on (s.user_id, s.exercise_id)
  s.user_id, s.exercise_id, 'max_weight',
  public.to_centi(s.weight_kg),
  w.occurred_on, w.id, s.id, true
from public.workout_sets s
join public.workouts w on w.id = s.workout_id
join public.exercises e on e.id = s.exercise_id
where s.set_type = 'working'
  and public.pr_kind_allowed(e.kind)
  and s.reps >= 1
  and s.weight_kg > 0
  and not exists (
    select 1 from public.personal_records p
    where p.user_id = s.user_id and p.exercise_id = s.exercise_id and p.pr_kind = 'max_weight'
  )
order by s.user_id, s.exercise_id, s.weight_kg desc, w.occurred_on, w.created_at, s.set_index;
