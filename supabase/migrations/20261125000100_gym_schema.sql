-- Phase 2, Step 2.5: gym depth - schema (brief 4.1, 4.2, 4.4).
--
-- Forward-only and non-destructive: new tables, new nullable or defaulted
-- columns on workout_sets, and one check constraint widened. Phase 1 columns
-- (exercise_name, reps, weight_kg) are kept exactly as they are.

-- ---------------------------------------------------------------------------
-- exercises: the global library (user_id null, read-only to everyone signed
-- in, seeded from the free-exercise-db snapshot) and each hunter's custom
-- exercises (owner CRUD, archived instead of deleted).
-- ---------------------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  -- free-exercise-db id for library rows; null for custom exercises.
  source_id text,
  name text not null,
  -- Library category as published (strength, stretching, ...); null for custom.
  category text,
  -- What the exercise earns as XP (brief 4.1, step 0 G-i).
  kind text not null,
  equipment text,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  mechanic text,
  force text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),

  constraint exercises_kind_valid check (kind in ('strength', 'cardio', 'mobility')),
  constraint exercises_name_length check (char_length(btrim(name)) between 1 and 80),
  -- A row is either library (no owner, a source id) or custom (owner, none).
  constraint exercises_global_or_custom check ((user_id is null) = (source_id is not null)),
  -- Library rows are never archived; they simply exist for everyone.
  constraint exercises_library_not_archived check (user_id is not null or archived_at is null)
);

create unique index exercises_library_source_uidx
  on public.exercises (source_id)
  where user_id is null;

-- One live custom exercise per name per hunter (case-insensitive).
create unique index exercises_custom_name_uidx
  on public.exercises (user_id, lower(btrim(name)))
  where user_id is not null and archived_at is null;

create index exercises_name_idx on public.exercises (lower(name));
create index exercises_user_idx on public.exercises (user_id) where user_id is not null;

-- Kind decides XP and PR eligibility, and the library link decides what an
-- exercise is: neither may change once a set could have been logged.
create or replace function public.exercises_guard_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.source_id is distinct from old.source_id
     or new.kind is distinct from old.kind
     or new.created_at is distinct from old.created_at then
    raise exception 'EXERCISE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger exercises_guard_immutable
  before update on public.exercises
  for each row
  execute function public.exercises_guard_immutable();

revoke execute on function public.exercises_guard_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- workout_sets (brief 4.2): a link to the exercise, warmup vs working, and
-- cardio measures. reps becomes optional so a cardio entry can carry only a
-- duration or a distance; every existing row already has reps >= 1.
-- ---------------------------------------------------------------------------
alter table public.workout_sets
  add column exercise_id uuid references public.exercises (id);
alter table public.workout_sets
  add column set_type text not null default 'working';
alter table public.workout_sets
  add column duration_s integer;
alter table public.workout_sets
  add column distance_m numeric(9, 2);

alter table public.workout_sets
  add constraint set_type_valid check (set_type in ('warmup', 'working'));
alter table public.workout_sets
  add constraint set_duration_sane check (duration_s is null or duration_s between 1 and 86400);
alter table public.workout_sets
  add constraint set_distance_sane check (distance_m is null or (distance_m > 0 and distance_m <= 1000000));

alter table public.workout_sets alter column reps drop not null;
alter table public.workout_sets drop constraint set_reps_sane;
alter table public.workout_sets
  add constraint set_reps_sane check (reps is null or (reps >= 1 and reps <= 1000));
-- Every set measures something.
alter table public.workout_sets
  add constraint set_has_a_measure
    check (reps is not null or duration_s is not null or distance_m is not null);

create index workout_sets_exercise_idx on public.workout_sets (user_id, exercise_id);

-- ---------------------------------------------------------------------------
-- personal_records (brief 4.4). Append-only facts: a record is reversed (not
-- deleted) when its workout is removed, and the current best is derived as
-- the max over live rows. Values are centi-kilograms, the engine's unit.
-- ---------------------------------------------------------------------------
create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  pr_kind text not null,
  value_centi integer not null,
  occurred_on date not null,
  -- The set that made it. Kept as history if a workout ever disappears.
  workout_id uuid references public.workouts (id) on delete set null,
  set_id uuid references public.workout_sets (id) on delete set null,
  -- First record of its kind for the exercise: stored, never rewarded.
  baseline boolean not null,
  -- The pr bonus event, when this record paid one (2.6).
  xp_event_id uuid references public.xp_events (id),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint personal_records_kind_valid check (pr_kind in ('e1rm', 'max_weight')),
  constraint personal_records_value_positive check (value_centi > 0),
  constraint personal_records_baseline_unpaid check (not baseline or xp_event_id is null)
);

create index personal_records_best_idx
  on public.personal_records (user_id, exercise_id, pr_kind)
  where reversed_at is null;

create index personal_records_user_day_idx on public.personal_records (user_id, occurred_on);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.exercises enable row level security;
alter table public.personal_records enable row level security;

revoke all on public.exercises from anon, authenticated;
revoke all on public.personal_records from anon, authenticated;

grant select, insert, update on public.exercises to authenticated;
grant select on public.personal_records to authenticated;

-- Library rows are readable by every signed-in hunter; custom rows by their owner.
create policy exercises_select_library_or_own on public.exercises
  for select to authenticated
  using (user_id is null or auth.uid() = user_id);

-- Clients create only their own custom exercises - never a library row.
create policy exercises_insert_own_custom on public.exercises
  for insert to authenticated
  with check (auth.uid() = user_id and source_id is null and category is null and archived_at is null);

-- And edit (rename, archive) only their own.
create policy exercises_update_own on public.exercises
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy personal_records_select_own on public.personal_records
  for select to authenticated
  using (auth.uid() = user_id);
