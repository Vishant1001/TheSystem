-- Phase 2, Step 2.3: Penalty Zone - schema (brief 3.3 - 3.6, section 5, 6).
--
-- Forward-only and non-destructive: new table, new nullable columns, and
-- check constraints swapped for wider ones. Every existing row satisfies the
-- new constraints unchanged; no xp_events row is edited.

-- ---------------------------------------------------------------------------
-- penalties. One row per penalty; its state machine is enforced by a trigger
-- below and documented in supabase/README.md.
-- ---------------------------------------------------------------------------
create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The failed game day that created it, and the mode in force that day.
  trigger_day date not null,
  mode text not null,
  state text not null,
  -- The penalty's current form; null while a choice is pending.
  choice text,
  escalated boolean not null default false,
  -- Snapshot of the missed core quests: [{quest_id, title, category, stat_tags}].
  missed_quests jsonb not null,
  -- Survival Trial
  trial_category text,
  trial_quest_id uuid references public.quests (id),
  chosen_at timestamptz,
  trial_deadline timestamptz,
  -- XP Debt: the amount is fixed at creation; what is left is derived (ADR-1).
  debt_rate_percent integer,
  debt_level integer,
  debt_amount integer,
  -- Weakened
  weakened_stat text,
  weakened_from date,
  weakened_until date,
  -- The hunter has seen the current state (Lenient debt, Hardcore trial,
  -- escalation). A pending choice is acknowledged by choosing.
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint penalties_mode_valid check (mode in ('lenient', 'standard', 'hardcore')),
  constraint penalties_state_valid check (
    state in ('pending_choice', 'trial_active', 'debt_active', 'weakened_active', 'cleared', 'redeemed')
  ),
  constraint penalties_choice_valid check (choice is null or choice in ('trial', 'debt', 'weakened')),
  -- A pending penalty has no form yet; every other state has one, except a
  -- pending penalty redeemed before anything was chosen.
  constraint penalties_pending_has_no_choice check (
    (state <> 'pending_choice' or choice is null)
    and (choice is not null or state in ('pending_choice', 'redeemed'))
  ),
  constraint penalties_trial_shape check (
    choice is distinct from 'trial'
    or (trial_category in ('fitness', 'diet', 'life') and trial_quest_id is not null
        and chosen_at is not null and trial_deadline is not null)
  ),
  constraint penalties_debt_shape check (
    choice is distinct from 'debt'
    or (debt_rate_percent between 0 and 100 and debt_level >= 1 and debt_amount >= 0)
  ),
  constraint penalties_weakened_shape check (
    choice is distinct from 'weakened'
    or (weakened_stat in ('STR', 'AGI', 'VIT', 'INT', 'SENSE')
        and weakened_from is not null and weakened_until >= weakened_from)
  ),
  constraint penalties_missed_is_array check (jsonb_typeof(missed_quests) = 'array')
);

-- Brief 3.3: one open penalty at most, enforced by the database itself.
create unique index penalties_one_open_uidx
  on public.penalties (user_id)
  where state in ('pending_choice', 'trial_active', 'debt_active', 'weakened_active');

create index penalties_user_day_idx on public.penalties (user_id, trigger_day);

-- ---------------------------------------------------------------------------
-- xp_events: the Phase 2 sources and the links the award pipeline writes.
-- ---------------------------------------------------------------------------
alter table public.xp_events drop constraint xp_events_source_valid;
alter table public.xp_events
  add constraint xp_events_source_valid check (
    source_type in (
      'quest', 'daily_clear', 'reversal',
      'trial', 'debt_repayment', 'workout', 'pr', 'boss'
    )
  );

-- A repayment points at the award it was diverted from (brief 3.4).
alter table public.xp_events add column related_event_id uuid references public.xp_events (id);
alter table public.xp_events add column penalty_id uuid references public.penalties (id);
-- The award's stat XP for the Weakened stat was zeroed (brief 3.4).
alter table public.xp_events add column weakened boolean not null default false;

alter table public.xp_events
  add constraint xp_events_repayment_shape check (
    source_type <> 'debt_repayment'
    or (related_event_id is not null and penalty_id is not null and xp <= 0 and category is null)
  );

-- One repayment per award at most.
create unique index xp_events_single_repayment_uidx
  on public.xp_events (related_event_id)
  where source_type = 'debt_repayment';

create index xp_events_penalty_idx on public.xp_events (penalty_id) where penalty_id is not null;

-- ---------------------------------------------------------------------------
-- quests: Survival Trials (brief 3.4, step 0 X3).
-- ---------------------------------------------------------------------------
alter table public.quests add column penalty_id uuid references public.penalties (id);

alter table public.quests drop constraint quests_type_valid;
alter table public.quests
  add constraint quests_type_valid check (type in ('daily', 'one_time', 'trial'));

alter table public.quests drop constraint quests_tracking_valid;
alter table public.quests
  add constraint quests_tracking_valid check (
    tracking in ('manual', 'auto_workout', 'auto_kcal_range', 'auto_protein_min', 'auto_food_count')
  );

alter table public.quests drop constraint quests_schedule_shape;
alter table public.quests
  add constraint quests_schedule_shape check (
    (
      type = 'daily'
      and due_on is null
      and schedule_days is not null
      and array_length(schedule_days, 1) between 1 and 7
      and schedule_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    )
    or (type = 'one_time' and schedule_days is null)
    -- A trial belongs to no day: its deadline is an instant on the penalty.
    or (type = 'trial' and schedule_days is null and due_on is null)
  );

alter table public.quests drop constraint quests_auto_is_daily;
alter table public.quests
  add constraint quests_auto_is_daily check (tracking = 'manual' or type in ('daily', 'trial'));

-- Only the diet trial is food-count tracked, and it carries its own target.
alter table public.quests
  add constraint quests_food_count_is_trial check (tracking <> 'auto_food_count' or type = 'trial');

alter table public.quests drop constraint quests_auto_has_no_target;
alter table public.quests
  add constraint quests_auto_has_no_target
    check (tracking = 'manual' or type = 'trial' or target_value is null);

alter table public.quests
  add constraint quests_trial_shape check (
    (type = 'trial') = (penalty_id is not null)
    and (type <> 'trial' or (is_core = false and on_rest_days = false))
  );

-- Clients may still insert their own manual quests - never a trial.
drop policy quests_insert_own_manual on public.quests;
create policy quests_insert_own_manual on public.quests
  for insert to authenticated
  with check (auth.uid() = user_id and tracking = 'manual' and type <> 'trial' and penalty_id is null);

-- ---------------------------------------------------------------------------
-- Stones spent on a penalty point at it.
-- ---------------------------------------------------------------------------
alter table public.redemption_stone_events
  add constraint redemption_stone_events_penalty_fk
    foreign key (penalty_id) references public.penalties (id);

alter table public.redemption_stone_events
  drop constraint stone_events_shape;
alter table public.redemption_stone_events
  add constraint stone_events_shape check (
    (reason = 'earned' and delta = 1 and log_date is not null and penalty_id is null)
    or (reason = 'spent' and delta = -1 and log_date is null and penalty_id is not null)
  );

-- ---------------------------------------------------------------------------
-- RLS: penalties are read-only to their owner; every write is an RPC.
-- ---------------------------------------------------------------------------
alter table public.penalties enable row level security;
revoke all on public.penalties from anon, authenticated;
grant select on public.penalties to authenticated;

create policy penalties_select_own on public.penalties
  for select to authenticated
  using (auth.uid() = user_id);
