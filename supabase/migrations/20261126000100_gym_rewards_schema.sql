-- Phase 2, Step 2.6: gym rewards - schema (brief 4.3, 4.5; merge addition).
--
-- Forward-only and non-destructive: one new table (bosses), one defaulted
-- column on workouts, one nullable column on exercises. Phase 1 workouts get
-- counted_sets = 0: no retroactive set XP.

-- ---------------------------------------------------------------------------
-- workouts.counted_sets: how many of this workout's working sets earned set
-- XP (brief 4.3). The daily allowance of 20 is shared by every live workout
-- of the game day, so a later workout needs what earlier ones already used.
-- ---------------------------------------------------------------------------
alter table public.workouts
  add column counted_sets integer not null default 0;
alter table public.workouts
  add constraint workouts_counted_sets_sane check (counted_sets >= 0);

-- ---------------------------------------------------------------------------
-- exercises.merged_into_id: set when a custom exercise was merged into
-- another (merge_exercise). The merged row is archived; its sets now point at
-- the target, and a set logged by the merged name follows the link.
-- ---------------------------------------------------------------------------
alter table public.exercises
  add column merged_into_id uuid references public.exercises (id);
alter table public.exercises
  add constraint exercises_merged_is_archived
    check (merged_into_id is null or (archived_at is not null and user_id is not null));
alter table public.exercises
  add constraint exercises_not_merged_into_self check (merged_into_id is distinct from id);

-- A set copies its exercise's name into workout_sets.exercise_name (1-60
-- characters since Phase 1), so exercise names follow the same limit. Every
-- existing row fits: library names are at most 58 characters and the legacy
-- custom rows came from exercise_name itself.
alter table public.exercises drop constraint exercises_name_length;
alter table public.exercises
  add constraint exercises_name_length check (char_length(btrim(name)) between 1 and 60);

-- A merge is final, and may only point at an exercise the owner can use of
-- the same kind. Checked here so it holds however the row is written.
create or replace function public.exercises_guard_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target public.exercises;
begin
  if new.user_id is distinct from old.user_id
     or new.source_id is distinct from old.source_id
     or new.kind is distinct from old.kind
     or new.created_at is distinct from old.created_at
     or (old.merged_into_id is not null and new.merged_into_id is distinct from old.merged_into_id) then
    raise exception 'EXERCISE_IMMUTABLE';
  end if;
  if new.merged_into_id is not null and old.merged_into_id is null then
    select * into v_target from public.exercises where id = new.merged_into_id;
    if not found
       or v_target.kind <> new.kind
       or not (v_target.user_id is null or v_target.user_id = new.user_id) then
      raise exception 'EXERCISE_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.exercises_guard_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- bosses (brief 4.5): a hunter-defined lift target on a strength exercise.
-- Defeated automatically by log_workout; a defeated boss is a trophy. Every
-- write goes through an RPC, so the defeat columns are never client-written.
-- ---------------------------------------------------------------------------
create table public.bosses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  name text,
  target_weight_kg numeric(6, 2) not null,
  target_reps integer not null,
  difficulty text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  -- Set by log_workout on defeat, cleared again if that workout is deleted.
  defeated_on date,
  defeated_workout_id uuid references public.workouts (id) on delete set null,
  defeated_set_id uuid references public.workout_sets (id) on delete set null,
  xp_event_id uuid references public.xp_events (id),

  constraint bosses_name_length check (name is null or char_length(btrim(name)) between 1 and 60),
  constraint bosses_weight_positive check (target_weight_kg > 0),
  constraint bosses_reps_sane check (target_reps between 1 and 1000),
  constraint bosses_difficulty_valid check (difficulty in ('E', 'D', 'C', 'B', 'A', 'S')),
  constraint bosses_defeat_complete check ((defeated_on is null) = (xp_event_id is null)),
  -- A trophy stays a trophy.
  constraint bosses_defeated_not_archived check (defeated_on is null or archived_at is null)
);

create index bosses_user_idx on public.bosses (user_id, created_at);
create index bosses_active_idx on public.bosses (user_id, exercise_id)
  where archived_at is null and defeated_on is null;

alter table public.bosses enable row level security;
revoke all on public.bosses from anon, authenticated;
grant select on public.bosses to authenticated;

create policy bosses_select_own on public.bosses
  for select to authenticated
  using (auth.uid() = user_id);
