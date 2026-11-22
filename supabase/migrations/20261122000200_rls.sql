-- Row level security (brief section 6, ADR-3, C1)
--
-- The model in one sentence: an authenticated hunter may READ their own rows
-- and may write only their own quests; everything that touches the ledger goes
-- through a SECURITY DEFINER RPC.
--
-- Table privileges are revoked first so that a future accidental policy cannot
-- open a write path on its own - a policy without a grant still denies.

alter table public.hunters enable row level security;
alter table public.hunter_target_history enable row level security;
alter table public.quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.food_entries enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.xp_events enable row level security;
alter table public.stat_allocations enable row level security;
alter table public.daily_logs enable row level security;
alter table public.game_config enable row level security;

revoke all on public.hunters from anon, authenticated;
revoke all on public.hunter_target_history from anon, authenticated;
revoke all on public.quests from anon, authenticated;
revoke all on public.quest_completions from anon, authenticated;
revoke all on public.food_entries from anon, authenticated;
revoke all on public.workouts from anon, authenticated;
revoke all on public.workout_sets from anon, authenticated;
revoke all on public.xp_events from anon, authenticated;
revoke all on public.stat_allocations from anon, authenticated;
revoke all on public.daily_logs from anon, authenticated;
revoke all on public.game_config from anon, authenticated;

grant select on public.hunters to authenticated;
grant select on public.hunter_target_history to authenticated;
grant select, insert, update on public.quests to authenticated;
grant select on public.quest_completions to authenticated;
grant select on public.food_entries to authenticated;
grant select on public.workouts to authenticated;
grant select on public.workout_sets to authenticated;
grant select on public.xp_events to authenticated;
grant select on public.stat_allocations to authenticated;
grant select on public.daily_logs to authenticated;
grant select on public.game_config to authenticated;

-- ---------------------------------------------------------------------------
-- hunters: read-only to the client. Onboarding and profile edits run through
-- RPCs because they must also write hunter_target_history (C8).
-- ---------------------------------------------------------------------------
create policy hunters_select_own on public.hunters
  for select to authenticated
  using (auth.uid() = user_id);

create policy hunter_target_history_select_own on public.hunter_target_history
  for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- quests: full client CRUD except delete (archive instead, brief 7.2).
-- Custom quests are manual only in Phase 1; the auto quests are seeded by the
-- onboarding RPC, which runs as definer and is not subject to this check.
-- ---------------------------------------------------------------------------
create policy quests_select_own on public.quests
  for select to authenticated
  using (auth.uid() = user_id);

create policy quests_insert_own_manual on public.quests
  for insert to authenticated
  with check (auth.uid() = user_id and tracking = 'manual');

create policy quests_update_own on public.quests
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Everything below is written only by RPCs. The client reads and nothing more.
-- ---------------------------------------------------------------------------
create policy quest_completions_select_own on public.quest_completions
  for select to authenticated
  using (auth.uid() = user_id);

create policy food_entries_select_own on public.food_entries
  for select to authenticated
  using (auth.uid() = user_id);

create policy workouts_select_own on public.workouts
  for select to authenticated
  using (auth.uid() = user_id);

create policy workout_sets_select_own on public.workout_sets
  for select to authenticated
  using (auth.uid() = user_id);

-- ADR-1: the ledger is append-only and the client can never write to it.
-- There is deliberately no insert, update or delete policy here.
create policy xp_events_select_own on public.xp_events
  for select to authenticated
  using (auth.uid() = user_id);

create policy stat_allocations_select_own on public.stat_allocations
  for select to authenticated
  using (auth.uid() = user_id);

create policy daily_logs_select_own on public.daily_logs
  for select to authenticated
  using (auth.uid() = user_id);

-- Reference data: readable by any signed-in hunter, written only by migrations.
create policy game_config_select_all on public.game_config
  for select to authenticated
  using (true);
