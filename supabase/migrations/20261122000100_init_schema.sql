-- THE SYSTEM - Phase 1 schema (brief section 6.1)
--
-- Conventions used throughout:
--   * every hunter-owned table carries user_id -> auth.users, cascading on delete
--   * enum-like columns are text + check constraints (G11), never Postgres enums,
--     because Phase 2 adds values and altering an enum inside a migration is painful
--   * all game dates are `date` columns computed server-side (ADR-6, C5)

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- hunters
-- ---------------------------------------------------------------------------
create table public.hunters (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hunter_name text not null,
  timezone text not null default 'Europe/Berlin',
  kcal_min integer not null,
  kcal_max integer not null,
  protein_target_g numeric(6, 1) not null,
  -- First game day. Day close backfills from here when last_closed_on is null.
  created_on date not null,
  last_closed_on date,
  created_at timestamptz not null default now(),
  constraint hunters_name_length check (char_length(btrim(hunter_name)) between 1 and 40),
  constraint hunters_timezone_present check (char_length(btrim(timezone)) > 0),
  constraint hunters_kcal_positive check (kcal_min > 0 and kcal_max > 0),
  constraint hunters_kcal_range check (kcal_max >= kcal_min),
  constraint hunters_protein_positive check (protein_target_g > 0)
);

comment on table public.hunters is
  'One row per account. Holds the current profile; diet targets are versioned in hunter_target_history.';
comment on column public.hunters.last_closed_on is
  'Last game day processed by close_days(). Null means nothing has been closed yet.';

-- ---------------------------------------------------------------------------
-- hunter_target_history (C8)
-- Diet targets are versioned so editing them never re-judges a day already
-- lived. Evaluations for day d read the latest row with effective_on <= d.
-- ---------------------------------------------------------------------------
create table public.hunter_target_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_on date not null,
  kcal_min integer not null,
  kcal_max integer not null,
  protein_target_g numeric(6, 1) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, effective_on),
  constraint hth_kcal_positive check (kcal_min > 0 and kcal_max > 0),
  constraint hth_kcal_range check (kcal_max >= kcal_min),
  constraint hth_protein_positive check (protein_target_g > 0)
);

-- ---------------------------------------------------------------------------
-- quests
-- ---------------------------------------------------------------------------
create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  type text not null,
  category text not null,
  tracking text not null default 'manual',
  goal_type text not null,
  target_value numeric,
  unit text,
  stat_tags text[] not null,
  difficulty text not null,
  is_core boolean not null default false,
  -- ISO weekday numbers 1-7; daily quests only.
  schedule_days smallint[],
  -- one_time quests only.
  due_on date,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),

  constraint quests_title_length check (char_length(btrim(title)) between 1 and 80),
  constraint quests_type_valid check (type in ('daily', 'one_time')),
  constraint quests_category_valid check (category in ('fitness', 'diet', 'life')),
  constraint quests_tracking_valid
    check (tracking in ('manual', 'auto_workout', 'auto_kcal_range', 'auto_protein_min')),
  constraint quests_goal_type_valid check (goal_type in ('boolean', 'count', 'duration', 'numeric')),
  constraint quests_difficulty_valid check (difficulty in ('E', 'D', 'C', 'B', 'A', 'S')),

  -- stat_tags: 1-2 entries, known stats only, no duplicates (G11)
  constraint quests_stat_tags_count check (array_length(stat_tags, 1) between 1 and 2),
  constraint quests_stat_tags_known
    check (stat_tags <@ array['STR', 'AGI', 'VIT', 'INT', 'SENSE']::text[]),
  constraint quests_stat_tags_distinct
    check (array_length(stat_tags, 1) = 1 or stat_tags[1] <> stat_tags[2]),

  -- daily quests are scheduled by weekday; one_time quests use due_on
  constraint quests_schedule_shape check (
    (
      type = 'daily'
      and due_on is null
      and schedule_days is not null
      and array_length(schedule_days, 1) between 1 and 7
      and schedule_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    )
    or (type = 'one_time' and schedule_days is null)
  ),
  -- G10: an undated one-time quest can never be core, because no day owns it
  constraint quests_core_needs_a_day check (type = 'daily' or due_on is not null or is_core = false),
  -- auto tracking only makes sense for a recurring daily quest
  constraint quests_auto_is_daily check (tracking = 'manual' or type = 'daily'),
  -- C3: auto quests take their target from the hunter profile, so target_value
  -- stays null for them; manual non-boolean quests must carry their own target
  constraint quests_manual_target
    check (tracking <> 'manual' or goal_type = 'boolean' or target_value is not null),
  constraint quests_auto_has_no_target check (tracking = 'manual' or target_value is null)
);

create index quests_user_active_idx on public.quests (user_id, archived_at, sort_order);
create index quests_user_tracking_idx on public.quests (user_id, tracking) where archived_at is null;
create index quests_user_due_idx on public.quests (user_id, due_on) where type = 'one_time';

-- Auto-quest evaluation assumes a single live quest per tracking type.
create unique index quests_one_active_auto_per_type_uidx
  on public.quests (user_id, tracking)
  where tracking <> 'manual' and archived_at is null;

-- ---------------------------------------------------------------------------
-- quest_completions
-- ---------------------------------------------------------------------------
create table public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quest_id uuid not null references public.quests (id) on delete cascade,
  occurred_on date not null,
  value numeric,
  completed_at timestamptz not null default now(),
  reversed_at timestamptz
);

-- One live completion per quest per game day (brief 6.1).
create unique index quest_completions_active_uidx
  on public.quest_completions (quest_id, occurred_on)
  where reversed_at is null;
create index quest_completions_user_day_idx on public.quest_completions (user_id, occurred_on);

-- ---------------------------------------------------------------------------
-- food and workouts
-- ---------------------------------------------------------------------------
create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null,
  name text not null,
  kcal integer not null,
  protein_g numeric(6, 1) not null,
  created_at timestamptz not null default now(),
  constraint food_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint food_kcal_sane check (kcal >= 0 and kcal <= 20000),
  constraint food_protein_sane check (protein_g >= 0 and protein_g <= 2000)
);

create index food_entries_user_day_idx on public.food_entries (user_id, occurred_on);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null,
  title text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint workout_title_length check (char_length(btrim(title)) between 1 and 80)
);

create index workouts_user_day_idx on public.workouts (user_id, occurred_on);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_name text not null,
  set_index integer not null,
  reps integer not null,
  weight_kg numeric(6, 2),
  constraint set_name_length check (char_length(btrim(exercise_name)) between 1 and 60),
  constraint set_index_positive check (set_index >= 1),
  constraint set_reps_sane check (reps >= 1 and reps <= 1000),
  constraint set_weight_sane check (weight_kg is null or (weight_kg >= 0 and weight_kg <= 1000))
);

create unique index workout_sets_order_uidx on public.workout_sets (workout_id, set_index);
create index workout_sets_workout_idx on public.workout_sets (workout_id);

-- ---------------------------------------------------------------------------
-- xp_events: the append-only ledger (ADR-1)
-- Nothing updates or deletes a row here. Undo inserts a negating reversal that
-- points back at the original event.
-- ---------------------------------------------------------------------------
create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null,
  created_at timestamptz not null default now(),
  source_type text not null,
  source_id uuid,
  category text,
  xp integer not null default 0,
  str_xp integer not null default 0,
  agi_xp integer not null default 0,
  vit_xp integer not null default 0,
  int_xp integer not null default 0,
  sense_xp integer not null default 0,
  free_points integer not null default 0,
  capped boolean not null default false,
  reverses_event_id uuid references public.xp_events (id),

  constraint xp_events_source_valid check (source_type in ('quest', 'daily_clear', 'reversal')),
  constraint xp_events_category_valid
    check (category is null or category in ('fitness', 'diet', 'life')),
  -- a reversal always points at what it reverses, and nothing else does (G3)
  constraint xp_events_reversal_shape
    check ((source_type = 'reversal') = (reverses_event_id is not null))
);

create index xp_events_user_day_idx on public.xp_events (user_id, occurred_on);
create index xp_events_user_category_day_idx
  on public.xp_events (user_id, occurred_on, category)
  where category is not null;
create index xp_events_source_idx on public.xp_events (user_id, source_type, source_id);
-- An event can be reversed at most once.
create unique index xp_events_single_reversal_uidx
  on public.xp_events (reverses_event_id)
  where reverses_event_id is not null;

-- ---------------------------------------------------------------------------
-- stat_allocations
-- ---------------------------------------------------------------------------
create table public.stat_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stat text not null,
  points integer not null,
  created_at timestamptz not null default now(),
  constraint stat_allocations_stat_valid check (stat in ('STR', 'AGI', 'VIT', 'INT', 'SENSE')),
  constraint stat_allocations_points_positive check (points > 0)
);

create index stat_allocations_user_idx on public.stat_allocations (user_id);

-- ---------------------------------------------------------------------------
-- daily_logs
-- ---------------------------------------------------------------------------
create table public.daily_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  status text not null,
  core_total integer not null default 0,
  core_done integer not null default 0,
  closed_at timestamptz not null default now(),
  -- G9: the System Report stays available until the hunter acknowledges it.
  acknowledged_at timestamptz,
  primary key (user_id, log_date),
  constraint daily_logs_status_valid check (status in ('cleared', 'failed')),
  constraint daily_logs_counts_sane check (core_done >= 0 and core_total >= core_done)
);

create index daily_logs_unacknowledged_idx
  on public.daily_logs (user_id, log_date)
  where acknowledged_at is null;

-- ---------------------------------------------------------------------------
-- game_config (ADR-4)
-- Seeded by a generated migration; src/game/game-config.json is the source of
-- truth and a Vitest test fails if the two drift.
-- ---------------------------------------------------------------------------
create table public.game_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.game_config is
  'Generated from src/game/game-config.json. Do not edit by hand.';
