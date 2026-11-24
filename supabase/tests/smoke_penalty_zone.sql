-- End-to-end proof of the Penalty Zone (Phase 2, Step 2.3).
--
-- FOR A LOCAL / TEST DATABASE. Creates throwaway auth users and ends in
-- ROLLBACK, so nothing persists. Run with:  npm run db:verify
--
-- Every check raises on failure; a clean run ends with "PENALTY ZONE PASSED".
-- Each scenario uses its own hunter, wound back N days by pg_temp.make_hunter
-- so close_days() has real failed days to judge.

begin;

-- ---------------------------------------------------------------------------
-- Test helpers (session-temporary, gone with the transaction).
-- ---------------------------------------------------------------------------
create function pg_temp.act_as(p_user uuid) returns void language sql as $f$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$f$;

-- A hunter whose only core quests are p_core, living under p_mode since
-- p_days_back days ago, with nothing closed yet.
create function pg_temp.make_hunter(
  p_user uuid, p_name text, p_days_back integer, p_mode text, p_core text[]
) returns void language plpgsql as $f$
declare
  v_today date;
begin
  insert into auth.users (id, email) values (p_user, lower(p_name) || '@test.local');
  perform pg_temp.act_as(p_user);
  perform public.onboard_hunter(p_name, 'Europe/Berlin', 1700, 1900, 120);
  v_today := public.game_today();
  update public.quests set is_core = (title = any (p_core)) where user_id = p_user;
  execute 'alter table public.quests disable trigger quests_guard_immutable';
  update public.quests set created_at = now() - interval '30 days' where user_id = p_user;
  execute 'alter table public.quests enable trigger quests_guard_immutable';
  update public.hunters
  set created_on = v_today - p_days_back, rules_from = v_today - p_days_back, last_closed_on = null
  where user_id = p_user;
  update public.hunter_target_history
  set effective_on = v_today - p_days_back, penalty_mode = p_mode
  where user_id = p_user;
end;
$f$;

-- A one-time manual quest due today, to award XP on demand.
create function pg_temp.add_errand(
  p_user uuid, p_title text, p_difficulty text, p_tags text[]
) returns uuid language plpgsql as $f$
declare
  v_id uuid;
begin
  insert into public.quests (
    user_id, title, type, category, tracking, goal_type, stat_tags, difficulty, due_on
  )
  values (p_user, p_title, 'one_time', 'life', 'manual', 'boolean', p_tags, p_difficulty,
          public.game_today_for(p_user))
  returning id into v_id;
  return v_id;
end;
$f$;

create function pg_temp.give_stone(p_user uuid, p_day date) returns void language sql as $f$
  insert into public.redemption_stone_events (user_id, occurred_on, delta, reason, log_date)
  values (p_user, p_day, 1, 'earned', p_day);
$f$;

-- Runs p_sql and requires it to fail with a message starting p_token.
create function pg_temp.expect_error(p_sql text, p_token text) returns void language plpgsql as $f$
declare
  v_error text;
begin
  begin
    execute p_sql;
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null or v_error not like p_token || '%' then
    raise exception 'expected % from [%], got %', p_token, p_sql, coalesce(v_error, 'success');
  end if;
end;
$f$;

-- ===========================================================================
-- N1. Standard -> Survival Trial (fitness), completed: cleared, +20 XP,
--     cap-exempt, final.
-- ===========================================================================
do $$
declare
  v_user uuid := 'a0000000-0000-0000-0000-000000000001';
  v_snapshot jsonb;
  v_penalty public.penalties;
  v_trial public.quests;
  v_event public.xp_events;
begin
  perform pg_temp.make_hunter(v_user, 'Trialist', 1, 'standard', array['Train']);
  perform public.close_days();

  v_snapshot := public.hunter_snapshot();
  if not (v_snapshot -> 'attention' ->> 'penalty_needs_choice')::boolean then
    raise exception 'N1: a failed Standard day must pend a choice: %', v_snapshot -> 'penalty';
  end if;
  if v_snapshot -> 'penalty' -> 'missed_quests' -> 0 ->> 'title' <> 'Train'
     or v_snapshot -> 'penalty' ->> 'trigger_day' <> (public.game_today() - 1)::text then
    raise exception 'N1: penalty must record the day and the missed quests: %', v_snapshot -> 'penalty';
  end if;
  -- The choice screen preview: the concrete consequence of each option.
  if v_snapshot -> 'penalty_options' -> 'trial' ->> 'category' <> 'fitness'
     or (v_snapshot -> 'penalty_options' -> 'debt' ->> 'amount')::integer <> 12
     or v_snapshot -> 'penalty_options' -> 'weakened' ->> 'stat' <> 'STR' then
    raise exception 'N1: wrong option preview: %', v_snapshot -> 'penalty_options';
  end if;

  perform public.choose_penalty('trial');
  v_penalty := public.open_penalty(v_user);
  select * into v_trial from public.quests where id = v_penalty.trial_quest_id;
  if v_penalty.state <> 'trial_active' or v_trial.title <> 'Survival circuit'
     or v_trial.target_value <> 15 or v_trial.stat_tags <> array['STR', 'AGI']
     or v_trial.type <> 'trial' or v_trial.is_core then
    raise exception 'N1: trial not built from the fitness template: % / %', v_penalty, v_trial;
  end if;
  if v_penalty.trial_deadline - v_penalty.chosen_at <> interval '24 hours' then
    raise exception 'N1: deadline must be choice + 24 h';
  end if;

  perform pg_temp.expect_error(format('select public.complete_quest(%L, 10)', v_trial.id), 'GOAL_NOT_MET');
  perform public.complete_quest(v_trial.id, 15);

  select * into v_penalty from public.penalties where id = v_penalty.id;
  if v_penalty.state <> 'cleared' then
    raise exception 'N1: completing the trial must clear the penalty, got %', v_penalty.state;
  end if;
  select * into v_event from public.xp_events where user_id = v_user and source_type = 'trial';
  if v_event.xp <> 20 or v_event.str_xp <> 5 or v_event.agi_xp <> 5 or v_event.penalty_id <> v_penalty.id then
    raise exception 'N1: trial event must be 20 XP, STR 5 / AGI 5: %', v_event;
  end if;
  if public.capped_xp_on(v_user, public.game_today(), 'fitness') <> 0 then
    raise exception 'N1: trial XP must not use fitness cap room';
  end if;
  perform pg_temp.expect_error(
    format('select public.undo_completion(%L)',
      (select id from public.quest_completions where quest_id = v_trial.id)),
    'TRIAL_IS_FINAL');

  raise notice 'N1. trial: built from template, 24 h deadline, cleared on completion, +20 XP cap-exempt, final';
end;
$$;

-- ===========================================================================
-- N2. Standard -> XP Debt: repayment until cleared, a reversal reopens it, a
--     redeemed debt never reopens, and choosing debt subtracts nothing.
-- ===========================================================================
do $$
declare
  v_user uuid := 'a0000000-0000-0000-0000-000000000002';
  v_penalty public.penalties;
  v_total_before bigint;
  v_big uuid;
  v_small uuid;
  v_result jsonb;
  v_completion uuid;
begin
  perform pg_temp.make_hunter(v_user, 'Debtor', 1, 'standard', array['Study']);
  perform public.close_days();

  select coalesce(sum(xp), 0) into v_total_before from public.xp_events where user_id = v_user;
  perform public.choose_penalty('debt');
  v_penalty := public.open_penalty(v_user);
  if v_penalty.state <> 'debt_active' or v_penalty.debt_amount <> 12 or v_penalty.debt_rate_percent <> 20 then
    raise exception 'N2: Standard debt at level 1 must be 20%% of 60 = 12: %', v_penalty;
  end if;
  if (select coalesce(sum(xp), 0) from public.xp_events where user_id = v_user) <> v_total_before then
    raise exception 'N2: creating a debt must never subtract XP';
  end if;

  -- 50 XP repays floor(50/2) capped at the 12 left: cleared.
  v_big := pg_temp.add_errand(v_user, 'Errand B', 'B', array['INT']);
  v_result := public.complete_quest(v_big, null);
  if (v_result ->> 'xp')::integer <> 50 or (v_result ->> 'debt_repayment')::integer <> 12
     or not (v_result ->> 'debt_cleared')::boolean then
    raise exception 'N2: expected 50 XP with 12 repaid and the debt cleared: %', v_result;
  end if;
  if not exists (
    select 1 from public.xp_events
    where user_id = v_user and source_type = 'debt_repayment' and xp = -12
      and related_event_id = (v_result ->> 'event_id')::uuid and penalty_id = v_penalty.id
  ) then
    raise exception 'N2: the repayment must link to the award and the penalty';
  end if;
  if (select state from public.penalties where id = v_penalty.id) <> 'cleared' then
    raise exception 'N2: debt should be cleared';
  end if;

  -- Undo the award: its repayment is reversed and the debt reopens.
  v_result := public.undo_completion((v_result ->> 'completion_id')::uuid);
  if not (v_result ->> 'debt_reopened')::boolean
     or (select state from public.penalties where id = v_penalty.id) <> 'debt_active'
     or public.penalty_debt_remaining(v_penalty.id) <> 12 then
    raise exception 'N2: a reversal must reopen a cleared debt with 12 left: %', v_result;
  end if;

  -- Partly repay, redeem with a stone, then undo: it stays redeemed.
  v_small := pg_temp.add_errand(v_user, 'Errand E', 'E', array['INT']);
  v_result := public.complete_quest(v_small, null);
  v_completion := (v_result ->> 'completion_id')::uuid;
  if (v_result ->> 'debt_repayment')::integer <> 5 or public.penalty_debt_remaining(v_penalty.id) <> 7 then
    raise exception 'N2: 10 XP should repay 5, leaving 7: %', v_result;
  end if;
  perform pg_temp.give_stone(v_user, public.game_today() - 3);
  perform public.redeem_penalty(v_penalty.id);
  perform public.undo_completion(v_completion);
  if (select state from public.penalties where id = v_penalty.id) <> 'redeemed' then
    raise exception 'N2: a redeemed debt must never reopen';
  end if;
  if exists (
    select 1 from public.xp_events r
    where r.user_id = v_user and r.source_type = 'debt_repayment'
      and not exists (select 1 from public.xp_events x where x.reverses_event_id = r.id)
  ) then
    raise exception 'N2: every reversed award must take its repayment with it';
  end if;

  raise notice 'N2. debt: 20%% sized, nothing subtracted, repaid to cleared, reopened by a reversal, redeemed stays redeemed';
end;
$$;

-- ===========================================================================
-- N3. Standard -> Weakened: only that stat, only for 2 game days, cleared at
--     the close of the second day.
-- ===========================================================================
do $$
declare
  v_user uuid := 'a0000000-0000-0000-0000-000000000003';
  v_today date;
  v_penalty public.penalties;
  v_result jsonb;
  v_vit uuid;
begin
  perform pg_temp.make_hunter(v_user, 'Weakling', 1, 'standard', array['Study']);
  perform public.close_days();
  v_today := public.game_today();

  perform public.choose_penalty('weakened');
  v_penalty := public.open_penalty(v_user);
  if v_penalty.weakened_stat <> 'INT' or v_penalty.weakened_from <> v_today
     or v_penalty.weakened_until <> v_today + 1 then
    raise exception 'N3: Weakened INT for today and tomorrow expected: %', v_penalty;
  end if;
  if public.weakened_stat_on(v_user, v_today + 1) <> 'INT' or public.weakened_stat_on(v_user, v_today + 2) is not null then
    raise exception 'N3: Weakened must cover exactly 2 game days';
  end if;

  v_result := public.complete_quest(
    (select id from public.quests where user_id = v_user and title = 'Study'), 30);
  if (v_result ->> 'xp')::integer <> 35 or (v_result -> 'stat_xp' ->> 'INT')::integer <> 0
     or not (v_result ->> 'weakened')::boolean then
    raise exception 'N3: INT stat XP must be zeroed, XP untouched: %', v_result;
  end if;
  v_vit := pg_temp.add_errand(v_user, 'Walk', 'D', array['VIT']);
  v_result := public.complete_quest(v_vit, null);
  if (v_result -> 'stat_xp' ->> 'VIT')::integer <> 10 or (v_result ->> 'weakened')::boolean then
    raise exception 'N3: other stats are unaffected: %', v_result;
  end if;

  -- Expiry: shift the window into the past and close its last day again.
  update public.penalties set weakened_from = v_today - 2, weakened_until = v_today - 1
  where id = v_penalty.id;
  update public.hunters set last_closed_on = v_today - 2 where user_id = v_user;
  perform public.close_days();
  if (select state from public.penalties where id = v_penalty.id) <> 'cleared' then
    raise exception 'N3: Weakened must clear at the close of its last day';
  end if;
  if public.weakened_stat_on(v_user, v_today) is not null then
    raise exception 'N3: no stat is weakened after expiry';
  end if;

  raise notice 'N3. weakened: INT zeroed for 2 days, other stats and XP untouched, cleared after';
end;
$$;

-- ===========================================================================
-- O. Trial expired -> escalated to a 30% debt (lazy check, ADR-7).
-- ===========================================================================
do $$
declare
  v_user uuid := 'a0000000-0000-0000-0000-000000000004';
  v_penalty public.penalties;
begin
  perform pg_temp.make_hunter(v_user, 'Laggard', 1, 'standard', array['Study']);
  perform public.close_days();
  perform public.choose_penalty('trial');
  v_penalty := public.open_penalty(v_user);
  if (select title from public.quests where id = v_penalty.trial_quest_id) <> 'Focus trial' then
    raise exception 'O: a missed life quest gives the Focus trial';
  end if;

  update public.penalties
  set chosen_at = now() - interval '25 hours', trial_deadline = now() - interval '1 hour'
  where id = v_penalty.id;

  -- Completing after the deadline is refused. The refusal rolls back the
  -- call, its catch-up included, so the escalation lands on the next close
  -- (app load / foreground), which is idempotent.
  perform pg_temp.expect_error(
    format('select public.complete_quest(%L, 45)', v_penalty.trial_quest_id), 'TRIAL_EXPIRED');
  perform public.close_days();

  select * into v_penalty from public.penalties where id = v_penalty.id;
  if v_penalty.state <> 'debt_active' or not v_penalty.escalated or v_penalty.debt_rate_percent <> 30
     or v_penalty.debt_amount <> 18 or v_penalty.acknowledged_at is not null then
    raise exception 'O: expired trial must become an unacknowledged 30%% debt of 18: %', v_penalty;
  end if;
  if (select archived_at from public.quests where id = v_penalty.trial_quest_id) is null then
    raise exception 'O: the expired trial quest must be archived';
  end if;
  if not (public.hunter_snapshot() -> 'attention' ->> 'penalty_needs_acknowledgement')::boolean then
    raise exception 'O: an escalation must surface for acknowledgement';
  end if;
  perform public.acknowledge_penalty();
  if (public.hunter_snapshot() -> 'attention' ->> 'penalty_needs_acknowledgement')::boolean then
    raise exception 'O: acknowledgement did not stick';
  end if;

  raise notice 'O. trial expired: refused, escalated to a 30%% debt, archived, surfaced';
end;
$$;

-- ===========================================================================
-- P. The reopened-debt race (step 2.2 review), both ways. Neither can leave
--    two open penalties.
-- ===========================================================================
do $$
declare
  v_user uuid := 'a0000000-0000-0000-0000-000000000005';
  v_user2 uuid := 'a0000000-0000-0000-0000-000000000006';
  v_today date;
  v_debt public.penalties;
  v_errand uuid;
  v_result jsonb;
  v_completion uuid;
begin
  -- (a) An award on a new day before the previous day is closed. The award
  --     RPC closes it first, so the failure meets the still-open debt and
  --     records nothing; the award then clears the debt; undo reopens it.
  perform pg_temp.make_hunter(v_user, 'Racer', 1, 'standard', array['Study']);
  perform public.close_days();
  perform public.choose_penalty('debt');
  v_debt := public.open_penalty(v_user);
  v_today := public.game_today();
  -- The app stayed open across the rollover: yesterday is not closed yet.
  update public.hunters set last_closed_on = v_today - 2 where user_id = v_user;
  delete from public.daily_logs where user_id = v_user and log_date = v_today - 1;

  v_errand := pg_temp.add_errand(v_user, 'Errand A', 'A', array['INT']);
  v_result := public.complete_quest(v_errand, null);

  if (select last_closed_on from public.hunters where user_id = v_user) <> v_today - 1 then
    raise exception 'P(a): the award RPC must close yesterday before awarding';
  end if;
  if (select count(*) from public.penalties where user_id = v_user) <> 1 then
    raise exception 'P(a): the closed failure met an open debt, so no new penalty may exist';
  end if;
  if not (v_result ->> 'debt_cleared')::boolean then
    raise exception 'P(a): the award should clear the debt: %', v_result;
  end if;
  perform public.undo_completion((v_result ->> 'completion_id')::uuid);
  if (select count(*) from public.penalties where user_id = v_user
      and state in ('pending_choice', 'trial_active', 'debt_active', 'weakened_active')) <> 1
     or (select state from public.penalties where id = v_debt.id) <> 'debt_active' then
    raise exception 'P(a): exactly one open penalty - the reopened debt';
  end if;

  -- (b) The debt is cleared by an award on a day that then closes failed:
  --     a new penalty is created, but the clearing award is now on a sealed
  --     day and can never be reversed, so the old debt can never reopen.
  -- Two failed days: pending, then escalated to an 18 XP debt. Then rewind
  -- one day so the debt is open while yesterday is still unclosed.
  perform pg_temp.make_hunter(v_user2, 'Racer Two', 2, 'standard', array['Study']);
  perform public.close_days();
  update public.hunters set last_closed_on = public.game_today() - 2 where user_id = v_user2;
  delete from public.daily_logs where user_id = v_user2 and log_date = public.game_today() - 1;
  v_debt := public.open_penalty(v_user2);
  if v_debt.state <> 'debt_active' then
    raise exception 'P(b): setup expected an escalated debt, got %', v_debt.state;
  end if;

  -- An award lands on yesterday (a session that began before the rollover)
  -- and clears the debt.
  v_errand := pg_temp.add_errand(v_user2, 'Errand S', 'S', array['INT']);
  update public.quests set due_on = public.game_today() - 1 where id = v_errand;
  v_result := public.award_quest_completion(
    v_user2, (select q from public.quests q where q.id = v_errand), public.game_today() - 1, null);
  v_completion := (v_result ->> 'completion_id')::uuid;
  -- 100 XP would repay 50; only 18 is owed: cleared.
  if (select state from public.penalties where id = v_debt.id) <> 'cleared' then
    raise exception 'P(b): the award should clear the debt';
  end if;

  -- Yesterday closes failed (Study missed): a new penalty, legitimately.
  perform public.close_days();
  if (select count(*) from public.penalties where user_id = v_user2
      and state in ('pending_choice', 'trial_active', 'debt_active', 'weakened_active')) <> 1 then
    raise exception 'P(b): one open penalty expected after the close';
  end if;

  -- The clearing award is sealed: it cannot be undone, the old debt stays cleared.
  perform pg_temp.expect_error(format('select public.undo_completion(%L)', v_completion), 'SEALED_DAY');
  if (select state from public.penalties where id = v_debt.id) <> 'cleared' then
    raise exception 'P(b): the sealed debt must stay cleared';
  end if;

  raise notice 'P. reopened-debt race: impossible both ways (catch-up before awards, sealed days)';
end;
$$;

-- ===========================================================================
-- Q. The one-open rule under 5 consecutive failures, in all three modes.
-- ===========================================================================
do $$
declare
  v_mode text;
  v_user uuid;
  v_index integer := 0;
  v_penalty public.penalties;
begin
  foreach v_mode in array array['standard', 'lenient', 'hardcore'] loop
    v_index := v_index + 1;
    v_user := ('b0000000-0000-0000-0000-00000000000' || v_index)::uuid;
    perform pg_temp.make_hunter(v_user, 'Streak ' || v_mode, 5, v_mode, array['Study']);
    perform public.close_days();

    if (select count(*) from public.penalties where user_id = v_user) <> 1 then
      raise exception 'Q(%): 5 failures must leave exactly one penalty, got %', v_mode,
        (select count(*) from public.penalties where user_id = v_user);
    end if;
    v_penalty := public.open_penalty(v_user);
    if v_mode = 'lenient' then
      -- Lenient starts as a 10% debt: already a debt, never escalated.
      if v_penalty.state <> 'debt_active' or v_penalty.escalated or v_penalty.debt_rate_percent <> 10 then
        raise exception 'Q(lenient): expected an unescalated 10%% debt: %', v_penalty;
      end if;
    else
      if v_penalty.state <> 'debt_active' or not v_penalty.escalated or v_penalty.debt_rate_percent <> 30 then
        raise exception 'Q(%): expected one escalation to a 30%% debt: %', v_mode, v_penalty;
      end if;
    end if;
    if v_penalty.trigger_day <> public.game_today() - 5 then
      raise exception 'Q(%): the penalty belongs to the first failed day', v_mode;
    end if;
  end loop;

  raise notice 'Q. one open penalty: 5 failures in each mode -> one penalty, escalated at most once';
end;
$$;

-- ===========================================================================
-- R. Lenient and Hardcore: no choice screen, acknowledgement instead;
--    Hardcore freezes stones.
-- ===========================================================================
do $$
declare
  v_lenient uuid := 'a0000000-0000-0000-0000-000000000007';
  v_hardcore uuid := 'a0000000-0000-0000-0000-000000000008';
  v_snapshot jsonb;
  v_penalty public.penalties;
begin
  perform pg_temp.make_hunter(v_lenient, 'Lenient', 1, 'lenient', array['Study']);
  perform public.close_days();
  v_snapshot := public.hunter_snapshot();
  if (v_snapshot -> 'attention' ->> 'penalty_needs_choice')::boolean
     or not (v_snapshot -> 'attention' ->> 'penalty_needs_acknowledgement')::boolean
     or (v_snapshot -> 'penalty' -> 'debt' ->> 'amount')::integer <> 6 then
    raise exception 'R: Lenient is a 10%% debt (6) to acknowledge, no choice: %', v_snapshot -> 'penalty';
  end if;
  perform pg_temp.expect_error('select public.choose_penalty(''trial'')', 'NO_PENDING_CHOICE');
  perform public.acknowledge_penalty();

  perform pg_temp.make_hunter(v_hardcore, 'Hardcore', 1, 'hardcore', array['Study']);
  perform public.close_days();
  v_penalty := public.open_penalty(v_hardcore);
  if v_penalty.state <> 'trial_active' or v_penalty.acknowledged_at is not null then
    raise exception 'R: Hardcore goes straight to an unacknowledged trial: %', v_penalty;
  end if;
  perform pg_temp.expect_error('select public.choose_penalty(''debt'')', 'NO_PENDING_CHOICE');
  perform pg_temp.give_stone(v_hardcore, public.game_today() - 3);
  perform pg_temp.expect_error(format('select public.redeem_penalty(%L)', v_penalty.id), 'STONES_FROZEN');

  raise notice 'R. Lenient: auto 10%% debt + acknowledgement; Hardcore: trial only, stones frozen';
end;
$$;

-- ===========================================================================
-- S. Stone redemption in every open state; the refusals.
-- ===========================================================================
do $$
declare
  v_choice text;
  v_user uuid;
  v_index integer := 0;
  v_penalty public.penalties;
begin
  foreach v_choice in array array['pending', 'trial', 'weakened'] loop
    v_index := v_index + 1;
    v_user := ('c0000000-0000-0000-0000-00000000000' || v_index)::uuid;
    perform pg_temp.make_hunter(v_user, 'Redeemer ' || v_choice, 1, 'standard', array['Study']);
    perform public.close_days();
    if v_choice <> 'pending' then
      perform public.choose_penalty(v_choice);
    end if;
    v_penalty := public.open_penalty(v_user);

    perform pg_temp.expect_error(format('select public.redeem_penalty(%L)', v_penalty.id), 'NO_STONES');
    perform pg_temp.give_stone(v_user, public.game_today() - 3);
    perform public.redeem_penalty(v_penalty.id);

    select * into v_penalty from public.penalties where id = v_penalty.id;
    if v_penalty.state <> 'redeemed' or public.stones_held(v_user) <> 0 then
      raise exception 'S(%): redeemed with the stone spent expected: %', v_choice, v_penalty;
    end if;
    if v_choice = 'trial'
       and (select archived_at from public.quests where id = v_penalty.trial_quest_id) is null then
      raise exception 'S(trial): the trial quest must be removed';
    end if;
    if v_choice = 'weakened' and public.weakened_stat_on(v_user, public.game_today()) is not null then
      raise exception 'S(weakened): Weakened must end immediately';
    end if;
    perform pg_temp.expect_error(format('select public.redeem_penalty(%L)', v_penalty.id), 'PENALTY_NOT_OPEN');
  end loop;
  -- The debt state is redeemed in N2.

  raise notice 'S. stones: redeem pending, trial, weakened (debt in N2); refusals for no stones and closed';
end;
$$;

-- ===========================================================================
-- T. The diet trial: logging-only, auto-tracked, final.
-- ===========================================================================
do $$
declare
  v_user uuid := 'a0000000-0000-0000-0000-000000000009';
  v_penalty public.penalties;
  v_trial public.quests;
  v_result jsonb;
begin
  perform pg_temp.make_hunter(v_user, 'Eater', 1, 'standard', array['Hit protein']);
  perform public.close_days();
  perform public.choose_penalty('trial');
  v_penalty := public.open_penalty(v_user);
  select * into v_trial from public.quests where id = v_penalty.trial_quest_id;
  if v_trial.title <> 'Log every meal' or v_trial.tracking <> 'auto_food_count' or v_trial.target_value <> 3 then
    raise exception 'T: the diet trial is the logging trial: %', v_trial;
  end if;
  perform pg_temp.expect_error(format('select public.complete_quest(%L, 3)', v_trial.id), 'QUEST_IS_AUTO');

  perform public.log_food('Breakfast', 400, 20);
  v_result := public.log_food('Lunch', 600, 30);
  if (select state from public.penalties where id = v_penalty.id) <> 'trial_active' then
    raise exception 'T: two entries are not enough';
  end if;
  v_result := public.log_food('Dinner', 700, 40);
  if not (v_result -> 'trial' ->> 'penalty_cleared')::boolean
     or (v_result -> 'trial' -> 'stat_xp' ->> 'VIT')::integer <> 10 then
    raise exception 'T: the third entry clears the trial with VIT 10: %', v_result -> 'trial';
  end if;
  perform public.delete_food((v_result ->> 'entry_id')::uuid);
  if (select state from public.penalties where id = v_penalty.id) <> 'cleared' then
    raise exception 'T: deleting food never reopens a cleared trial';
  end if;

  raise notice 'T. diet trial: 3 entries clear it (VIT 10), no manual completion, final';
end;
$$;

-- ===========================================================================
-- U. The state machine is enforced by the database; trials are immutable to
--    the client; every award source through every modifier.
-- ===========================================================================
do $$
declare
  v_penalty public.penalties;
  v_source text;
  v_rule jsonb;
  v_room integer;
  v_weak text;
  v_debt integer;
  v_award record;
  v_full integer;
  v_count integer := 0;
begin
  select * into v_penalty from public.penalties
  where user_id = 'a0000000-0000-0000-0000-000000000001';
  perform pg_temp.expect_error(
    format('update public.penalties set state = ''trial_active'' where id = %L', v_penalty.id),
    'INVALID_PENALTY_TRANSITION');
  select * into v_penalty from public.penalties
  where user_id = 'a0000000-0000-0000-0000-000000000002';
  perform pg_temp.expect_error(
    format('update public.penalties set state = ''debt_active'' where id = %L', v_penalty.id),
    'INVALID_PENALTY_TRANSITION');
  perform pg_temp.expect_error(
    format('update public.penalties set missed_quests = ''[]'' where id = %L', v_penalty.id),
    'PENALTY_IMMUTABLE');

  foreach v_source in array array['quest', 'workout', 'pr', 'boss', 'trial', 'daily_clear'] loop
    v_rule := public.game_config_value('award_sources') -> v_source;
    v_full := case when v_source = 'daily_clear' then 0 else 40 end;
    foreach v_room in array array[0, 5, 500] loop
      foreach v_weak in array array['STR', 'INT', ''] loop
        foreach v_debt in array array[0, 3, 1000] loop
          v_count := v_count + 1;
          select * into v_award from public.compute_award(
            v_source, v_full, v_room,
            case when v_source = 'daily_clear' then '[]'::jsonb else '[{"stat":"STR","weight":1}]'::jsonb end,
            nullif(v_weak, ''), v_debt);
          if v_award.xp <> (case when (v_rule ->> 'capped')::boolean then least(v_full, v_room) else v_full end) then
            raise exception 'U: % cap rule broken: %', v_source, v_award;
          end if;
          if v_weak = 'STR' and (v_award.stat_xp ->> 'STR')::integer <> 0 then
            raise exception 'U: % Weakened STR not zeroed', v_source;
          end if;
          if v_award.repayment <> (case when (v_rule ->> 'repaysDebt')::boolean
                                       then least(v_award.xp / 2, v_debt) else 0 end) then
            raise exception 'U: % debt rule broken: %', v_source, v_award;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  raise notice 'U. state machine enforced in SQL; % source x modifier combinations follow the rules', v_count;
  raise notice '-------------------------------';
  raise notice 'PENALTY ZONE PASSED';
  raise notice '-------------------------------';
end;
$$;

rollback;
