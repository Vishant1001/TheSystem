-- Phase 2, Step 2.2: Safe Zones - schema (brief 3.1, 3.6 - 3.9).
--
-- Forward-only and non-destructive (Phase 2 hard rule): this migration only
-- adds tables and columns, backfills the new columns, and swaps one check
-- constraint for a wider one. No existing row is rewritten except to fill a
-- brand-new column, and no xp_events row is touched.

-- ---------------------------------------------------------------------------
-- Rules epoch (step 0, G-a). Phase 2 rules apply from the game day after
-- deploy and never to a day before it, closed or not. Stored per hunter as a
-- game date so a later timezone change cannot move it.
-- ---------------------------------------------------------------------------
alter table public.hunters add column rules_from date;

-- Existing hunters: the day after their current game day at migration time.
update public.hunters set rules_from = public.game_today_for(user_id) + 1;

alter table public.hunters alter column rules_from set not null;

comment on column public.hunters.rules_from is
  'First game day judged by Phase 2 rules (penalties, rest and safe days, streaks). Earlier days keep Phase 1 rules.';

-- ---------------------------------------------------------------------------
-- Versioned rules (3.1, 3.7): penalty mode and rest days ride on the same
-- C8 history as the diet targets, so they take effect from the next game day.
-- ---------------------------------------------------------------------------
alter table public.hunter_target_history add column penalty_mode text;
alter table public.hunter_target_history add column rest_days smallint[];

update public.hunter_target_history
set penalty_mode = public.game_config_value('penalty') ->> 'defaultMode',
    rest_days = '{}'::smallint[];

alter table public.hunter_target_history alter column penalty_mode set not null;
alter table public.hunter_target_history alter column rest_days set not null;

alter table public.hunter_target_history
  add constraint hth_penalty_mode_valid
    check (penalty_mode in ('lenient', 'standard', 'hardcore'));

-- A check constraint cannot hold a subquery, so the duplicate test lives in an
-- immutable helper. Internal only: no client role may execute it.
create or replace function public.weekdays_are_distinct(p_days smallint[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select cardinality(p_days) = (select count(distinct day) from unnest(p_days) as day);
$$;

revoke execute on function public.weekdays_are_distinct(smallint[])
  from public, anon, authenticated;

-- Shape only: ISO weekdays, no duplicates. The maximum count (2) is a game
-- number, so it is enforced from game_config by update_hunter_rules().
alter table public.hunter_target_history
  add constraint hth_rest_days_shape
    check (
      rest_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
      and public.weekdays_are_distinct(rest_days)
    );

-- ---------------------------------------------------------------------------
-- Quests that still count on a rest day (3.7).
-- ---------------------------------------------------------------------------
alter table public.quests add column on_rest_days boolean not null default false;

-- ---------------------------------------------------------------------------
-- Day statuses (3.9): widen the check; existing rows are all valid under it.
-- The streak after each close is a fact of that close, recorded with it.
-- ---------------------------------------------------------------------------
alter table public.daily_logs drop constraint daily_logs_status_valid;
alter table public.daily_logs
  add constraint daily_logs_status_valid
    check (status in ('cleared', 'failed', 'rest', 'safe'));

alter table public.daily_logs add column streak integer not null default 0;
alter table public.daily_logs
  add constraint daily_logs_streak_sane check (streak >= 0);

comment on column public.daily_logs.streak is
  'Clear streak after this day closed (3.6). 0 for days before rules_from.';

-- ---------------------------------------------------------------------------
-- Sick / Travel periods (3.8).
-- ended_early_on is the first game day that is no longer safe; ending early
-- takes effect from the next game day, and an equal start_on cancels it.
-- ---------------------------------------------------------------------------
create table public.safe_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  start_on date not null,
  end_on date not null,
  ended_early_on date,
  created_at timestamptz not null default now(),
  constraint safe_periods_kind_valid check (kind in ('sick', 'travel')),
  constraint safe_periods_range check (end_on >= start_on),
  constraint safe_periods_ended_early_inside
    check (ended_early_on is null or ended_early_on between start_on and end_on)
);

create index safe_periods_user_start_idx on public.safe_periods (user_id, start_on);

-- ---------------------------------------------------------------------------
-- Redemption Stones (3.6): append-only, held = sum(delta).
-- penalty_id is linked to penalties in 2.3, once that table exists.
-- ---------------------------------------------------------------------------
create table public.redemption_stone_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null,
  delta smallint not null,
  reason text not null,
  -- The closed day whose streak earned the stone.
  log_date date,
  penalty_id uuid,
  created_at timestamptz not null default now(),
  constraint stone_events_shape check (
    (reason = 'earned' and delta = 1 and log_date is not null and penalty_id is null)
    or (reason = 'spent' and delta = -1 and log_date is null)
  )
);

-- A day can earn at most one stone, whatever happens to close_days().
create unique index stone_events_one_per_day_uidx
  on public.redemption_stone_events (user_id, log_date)
  where reason = 'earned';

create index stone_events_user_day_idx on public.redemption_stone_events (user_id, occurred_on);

-- ---------------------------------------------------------------------------
-- RLS: read own rows, write only through RPCs (ADR-3).
-- ---------------------------------------------------------------------------
alter table public.safe_periods enable row level security;
alter table public.redemption_stone_events enable row level security;

revoke all on public.safe_periods from anon, authenticated;
revoke all on public.redemption_stone_events from anon, authenticated;

grant select on public.safe_periods to authenticated;
grant select on public.redemption_stone_events to authenticated;

create policy safe_periods_select_own on public.safe_periods
  for select to authenticated
  using (auth.uid() = user_id);

-- Append-only like xp_events: no insert, update or delete policy, ever.
create policy redemption_stone_events_select_own on public.redemption_stone_events
  for select to authenticated
  using (auth.uid() = user_id);
