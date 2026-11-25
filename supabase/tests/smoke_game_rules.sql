-- End-to-end proof of the Phase 1 game rules against a real database.
--
-- FOR A LOCAL / TEST DATABASE. Creates one throwaway auth user and ends in
-- ROLLBACK, so nothing persists.
--
--   npx supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/smoke_game_rules.sql
--
-- This runs the RPCs as their owner with auth.uid() set from the JWT claim, so
-- it tests game behaviour. Access control is proved separately in rls_proof.sql.
-- Every check raises on failure; a clean run ends with "SMOKE TEST PASSED".

begin;

-- The test hunters' time zone. Europe/Berlin (with its DST) by default;
-- scripts/verify-clock.mjs reruns this file once per whole-hour UTC offset
-- (--set test.utc_offset=N -> Etc/GMT-N), so every local hour of the day -
-- the warning windows, 00:00-03:00 before the rollover - gets exercised.
create function pg_temp.test_tz() returns text language sql stable as $tz$
  select case
    when nullif(current_setting('test.utc_offset', true), '') is null then 'Europe/Berlin'
    when current_setting('test.utc_offset')::integer = 0 then 'Etc/GMT'
    when current_setting('test.utc_offset')::integer > 0
      then 'Etc/GMT-' || current_setting('test.utc_offset')
    else 'Etc/GMT+' || abs(current_setting('test.utc_offset')::integer)::text
  end;
$tz$;

insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'smoke@test.local');

do $$
declare
  v_user uuid := '33333333-3333-3333-3333-333333333333';
  v_today date;
  v_study public.quests;
  v_train public.quests;
  v_protein public.quests;
  v_kcal public.quests;
  v_one_time public.quests;
  v_result jsonb;
  v_snapshot jsonb;
  v_completion_id uuid;
  v_quest_id uuid;
  v_total integer;
  v_count integer;
  v_day date;
  v_days jsonb;
  v_last_closed date;
  v_event_id uuid;
  v_timezone text;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  -- =========================================================================
  -- A. Onboarding (acceptance 1.4)
  -- =========================================================================
  v_snapshot := public.onboard_hunter('Smoke Hunter', pg_temp.test_tz(), 1700, 1900, 120);
  v_today := public.game_today();

  select count(*) into v_count from public.quests where user_id = v_user;
  if v_count <> 4 then
    raise exception 'A: expected 4 seeded quests, got %', v_count;
  end if;

  if (v_snapshot -> 'total_xp')::integer <> 0 then
    raise exception 'A: a new hunter must start at 0 XP, got %', v_snapshot -> 'total_xp';
  end if;

  if (v_snapshot -> 'stat_xp' ->> 'STR')::integer <> 0
     or (v_snapshot -> 'free_points_from_events')::integer <> 0 then
    raise exception 'A: a new hunter must start with no stat XP and no free points';
  end if;

  -- C8: onboarding writes the first target version, effective from day one.
  select count(*) into v_count
  from public.hunter_target_history
  where user_id = v_user and effective_on = (v_snapshot -> 'hunter' ->> 'created_on')::date;
  if v_count <> 1 then
    raise exception 'A: onboarding did not write the initial target history row';
  end if;

  select * into v_study from public.quests where user_id = v_user and title = 'Study';
  select * into v_train from public.quests where user_id = v_user and title = 'Train';
  select * into v_protein from public.quests where user_id = v_user and title = 'Hit protein';
  select * into v_kcal from public.quests where user_id = v_user and title = 'Calories in range';

  raise notice 'A. onboarding: 4 quests seeded, hunter starts empty';

  -- =========================================================================
  -- B. Manual completion and undo (acceptance 1.5)
  -- =========================================================================
  v_result := public.complete_quest(v_study.id, 30);
  if (v_result ->> 'xp')::integer <> 35 then
    raise exception 'B: Study should award 35 XP, got %', v_result ->> 'xp';
  end if;
  if (v_result -> 'stat_xp' ->> 'INT')::integer <> 17 then
    raise exception 'B: Study should award 17 INT stat XP, got %', v_result -> 'stat_xp' ->> 'INT';
  end if;
  if (v_result ->> 'capped')::boolean then
    raise exception 'B: the first quest of the day must not be capped';
  end if;

  -- The goal must actually be met.
  begin
    perform public.complete_quest(v_study.id, 10);
    raise exception 'B: a value below the target must be rejected';
  exception when others then
    if sqlerrm not in ('GOAL_NOT_MET', 'ALREADY_COMPLETED') then
      raise exception 'B: unexpected error for an unmet goal: %', sqlerrm;
    end if;
  end;

  v_completion_id := (v_result ->> 'completion_id')::uuid;
  perform public.undo_completion(v_completion_id);

  select coalesce(sum(xp), 0) into v_total from public.xp_events where user_id = v_user;
  if v_total <> 0 then
    raise exception 'B: undo should return total XP to 0, got %', v_total;
  end if;

  -- ADR-1: nothing was deleted, the reversal was appended.
  select count(*) into v_count from public.xp_events where user_id = v_user;
  if v_count <> 2 then
    raise exception 'B: expected the original event plus a reversal, got % rows', v_count;
  end if;

  raise notice 'B. manual quest: +35 XP, INT +17, undo reverses without deleting';

  -- =========================================================================
  -- C. Auto workout quest (acceptance 1.6)
  -- =========================================================================
  v_result := public.log_workout('Push day', null,
    '[{"exercise_name":"Bench","reps":5,"weight_kg":80},{"exercise_name":"Dip","reps":10}]'::jsonb);

  if (v_result ->> 'set_count')::integer <> 2 then
    raise exception 'C: expected 2 sets, got %', v_result ->> 'set_count';
  end if;
  if v_result -> 'auto_workout' ->> 'action' <> 'completed' then
    raise exception 'C: logging a workout should complete Train, got %',
      v_result -> 'auto_workout' ->> 'action';
  end if;

  -- G1: 35 XP -> 17 stat XP -> STR 9 / VIT 8, remainder on the first tag.
  if (v_result -> 'auto_workout' -> 'result' -> 'stat_xp' ->> 'STR')::integer <> 9
     or (v_result -> 'auto_workout' -> 'result' -> 'stat_xp' ->> 'VIT')::integer <> 8 then
    raise exception 'C: Train should split 17 stat XP as STR 9 / VIT 8, got %',
      v_result -> 'auto_workout' -> 'result' -> 'stat_xp';
  end if;

  -- Auto quests cannot be completed by hand (5.8).
  begin
    perform public.complete_quest(v_train.id, null);
    raise exception 'C: an auto quest must not be manually completable';
  exception when others then
    if sqlerrm <> 'QUEST_IS_AUTO' then
      raise exception 'C: unexpected error completing an auto quest: %', sqlerrm;
    end if;
  end;

  v_result := public.delete_workout(
    (select id from public.workouts where user_id = v_user limit 1)
  );
  if v_result -> 'auto_workout' ->> 'action' <> 'reversed' then
    raise exception 'C: deleting the last workout should reverse Train, got %',
      v_result -> 'auto_workout' ->> 'action';
  end if;

  raise notice 'C. auto workout: completes on log, reverses on delete';

  -- =========================================================================
  -- D. Auto protein quest (acceptance 1.6)
  -- =========================================================================
  v_result := public.log_food('Chicken', 400, 60);
  if v_result -> 'auto_protein' ->> 'action' <> 'unchanged' then
    raise exception 'D: 60g of 120g should not complete the protein quest, got %',
      v_result -> 'auto_protein' ->> 'action';
  end if;

  v_result := public.log_food('Shake', 200, 60);
  if v_result -> 'auto_protein' ->> 'action' <> 'completed' then
    raise exception 'D: crossing the protein target should complete the quest, got %',
      v_result -> 'auto_protein' ->> 'action';
  end if;
  -- D difficulty: 20 XP -> 10 stat XP -> VIT 5 / STR 5
  if (v_result -> 'auto_protein' -> 'result' ->> 'xp')::integer <> 20 then
    raise exception 'D: Hit protein should award 20 XP, got %',
      v_result -> 'auto_protein' -> 'result' ->> 'xp';
  end if;
  v_event_id := (v_result -> 'auto_protein' -> 'result' ->> 'event_id')::uuid;

  select coalesce(sum(xp), 0) into v_total
  from public.xp_events
  where user_id = v_user and occurred_on = v_today and category = 'diet';
  if v_total <> 20 then
    raise exception 'D: the diet ledger should read 20 after the award, got %', v_total;
  end if;

  v_result := public.delete_food(
    (select id from public.food_entries where user_id = v_user and name = 'Shake')
  );
  if v_result -> 'auto_protein' ->> 'action' <> 'reversed' then
    raise exception 'D: dropping below the target should reverse the quest, got %',
      v_result -> 'auto_protein' ->> 'action';
  end if;

  -- 5.8: the quest is withdrawn, and the ledger says so.
  if public.active_completion_id(v_protein.id, v_today) is not null then
    raise exception 'D: Hit protein should have no live completion after the reversal';
  end if;

  if not exists (
    select 1 from public.xp_events
    where user_id = v_user
      and source_type = 'reversal'
      and reverses_event_id = v_event_id
      and xp = -20
      and vit_xp = -5
      and str_xp = -5
  ) then
    raise exception 'D: expected a negating reversal event against the original award';
  end if;

  -- ADR-1: nothing was deleted, so both events remain and net to zero.
  select coalesce(sum(xp), 0) into v_total
  from public.xp_events
  where user_id = v_user and occurred_on = v_today and category = 'diet';
  if v_total <> 0 then
    raise exception 'D: diet XP should return to 0 after the reversal, got %', v_total;
  end if;

  select count(*) into v_count
  from public.xp_events
  where user_id = v_user and occurred_on = v_today and category = 'diet';
  if v_count <> 2 then
    raise exception 'D: expected the award and its reversal to both remain, got % rows', v_count;
  end if;

  -- Crossing the target again re-awards it, so cap room came back too.
  v_result := public.log_food('Second shake', 200, 60);
  if v_result -> 'auto_protein' ->> 'action' <> 'completed' then
    raise exception 'D: crossing the target again should complete the quest, got %',
      v_result -> 'auto_protein' ->> 'action';
  end if;
  if (v_result -> 'auto_protein' -> 'result' ->> 'xp')::integer <> 20 then
    raise exception 'D: the re-award should pay full XP, got %',
      v_result -> 'auto_protein' -> 'result' ->> 'xp';
  end if;

  -- Leave the day as section E expects to find it.
  perform public.delete_food(
    (select id from public.food_entries where user_id = v_user and name = 'Second shake')
  );

  raise notice 'D. auto protein: completes, reverses into the ledger, and re-awards';

  -- =========================================================================
  -- E. Daily caps (acceptance 1.5, rule 5.6)
  -- =========================================================================
  for v_count in 1..5 loop
    insert into public.quests (
      user_id, title, type, category, tracking, goal_type, target_value, unit,
      stat_tags, difficulty, is_core, schedule_days, sort_order
    )
    values (
      v_user, 'Cap test ' || v_count, 'daily', 'life', 'manual', 'duration', 1, 'min',
      array['INT'], 'S', false, array[1, 2, 3, 4, 5, 6, 7]::smallint[], 100 + v_count
    )
    returning id into v_quest_id;

    v_result := public.complete_quest(v_quest_id, 1);
  end loop;

  select coalesce(sum(xp), 0) into v_total
  from public.xp_events
  where user_id = v_user and occurred_on = v_today and category = 'life';

  if v_total <> 150 then
    raise exception 'E: the life cap is 150 XP per day, ledger shows %', v_total;
  end if;

  -- The last completion still exists, as a 0 XP capped event (5.6).
  if not (v_result ->> 'capped')::boolean or (v_result ->> 'xp')::integer <> 0 then
    raise exception 'E: past the cap, a completion must still record a 0 XP capped event, got %',
      v_result;
  end if;
  -- G2: a capped award may legitimately grant no stat XP.
  if (v_result -> 'stat_xp' ->> 'INT')::integer <> 0 then
    raise exception 'E: a 0 XP capped award must not grant stat XP, got %',
      v_result -> 'stat_xp' ->> 'INT';
  end if;

  raise notice 'E. daily cap: life XP stops at 150 and still records the completion';

  -- =========================================================================
  -- F. Late completion of an overdue one-time quest (G10)
  -- =========================================================================
  insert into public.quests (
    user_id, title, type, category, tracking, goal_type, target_value, unit,
    stat_tags, difficulty, is_core, due_on, sort_order
  )
  values (
    v_user, 'Overdue errand', 'one_time', 'fitness', 'manual', 'boolean', null, null,
    array['AGI'], 'D', false, v_today - 2, 200
  )
  returning * into v_one_time;

  v_result := public.complete_quest(v_one_time.id, null);
  if (v_result ->> 'occurred_on')::date <> v_today then
    raise exception 'F: a late one-time quest must score on the day it is completed, got %',
      v_result ->> 'occurred_on';
  end if;
  if (v_result ->> 'xp')::integer <> 20 then
    raise exception 'F: a late one-time quest still pays normal XP, got %', v_result ->> 'xp';
  end if;

  raise notice 'F. overdue one-time quest: completes late, scores today, normal XP';

  -- =========================================================================
  -- G. Sealed days (C5)
  -- =========================================================================
  insert into public.food_entries (user_id, occurred_on, name, kcal, protein_g)
  values (v_user, v_today - 1, 'Yesterday lunch', 800, 50)
  returning id into v_quest_id;

  begin
    perform public.delete_food(v_quest_id);
    raise exception 'G: deleting a log from a past day must be refused';
  exception when others then
    if sqlerrm <> 'SEALED_DAY' then
      raise exception 'G: unexpected error deleting a sealed-day log: %', sqlerrm;
    end if;
  end;

  delete from public.food_entries where id = v_quest_id;

  raise notice 'G. sealed days: logs from past days cannot be removed';

  -- =========================================================================
  -- H. Day close, daily clear and the deferred calorie quest (acceptance 1.7)
  -- =========================================================================
  -- Backdate the hunter and the quests so there are real days to close.
  v_day := v_today - 1;
  update public.hunters
  set created_on = v_today - 2, last_closed_on = null
  where user_id = v_user;

  -- quests_guard_immutable deliberately forbids moving created_at, because the
  -- day-close tally trusts it (G7). Only a test may step around that, and only
  -- for the length of this statement.
  execute 'alter table public.quests disable trigger quests_guard_immutable';
  update public.quests
  set created_at = now() - interval '5 days'
  where user_id = v_user;
  execute 'alter table public.quests enable trigger quests_guard_immutable';

  -- Live a full day on v_day: calories in range, protein met, a workout, Study.
  insert into public.food_entries (user_id, occurred_on, name, kcal, protein_g)
  values (v_user, v_day, 'Day meal', 1800, 130);
  insert into public.workouts (user_id, occurred_on, title)
  values (v_user, v_day, 'Leg day');

  -- Simulate what live logging would have done on that day.
  perform public.evaluate_auto_workout(v_user, v_day);
  perform public.evaluate_auto_protein(v_user, v_day);
  perform public.award_quest_completion(v_user, v_study, v_day, 45);

  v_result := public.close_days();
  v_days := v_result -> 'days';

  if (v_result ->> 'count')::integer <> 2 then
    raise exception 'H: expected 2 closed days, got %', v_result ->> 'count';
  end if;

  -- The older day had the quests but no activity: failed.
  if v_days -> 0 ->> 'status' <> 'failed' then
    raise exception 'H: a day with untouched core quests must fail, got %', v_days -> 0;
  end if;
  if (v_days -> 0 ->> 'free_points_gained')::integer <> 0 then
    raise exception 'H: a failed day must not pay a free point';
  end if;

  -- The lived day: the calorie quest settles at close, all four core done.
  if v_days -> 1 ->> 'status' <> 'cleared' then
    raise exception 'H: the lived day should be cleared, got %', v_days -> 1;
  end if;
  if (v_days -> 1 ->> 'core_done')::integer <> 4
     or (v_days -> 1 ->> 'core_total')::integer <> 4 then
    raise exception 'H: expected 4 of 4 core quests done, got %', v_days -> 1;
  end if;
  if (v_days -> 1 ->> 'free_points_gained')::integer <> 1 then
    raise exception 'H: a cleared day pays exactly one free point, got %', v_days -> 1;
  end if;

  -- The calorie quest was awarded at close, not during the day.
  if not exists (
    select 1 from public.quest_completions
    where user_id = v_user and quest_id = v_kcal.id and occurred_on = v_day and reversed_at is null
  ) then
    raise exception 'H: the calorie quest should have completed at day close';
  end if;

  -- Idempotence: closing again does nothing (ADR-7).
  v_result := public.close_days();
  if (v_result ->> 'count')::integer <> 0 then
    raise exception 'H: close_days must be idempotent, second call closed % days',
      v_result ->> 'count';
  end if;

  select count(*) into v_count
  from public.xp_events
  where user_id = v_user and source_type = 'daily_clear';
  if v_count <> 1 then
    raise exception 'H: exactly one daily clear event expected, got %', v_count;
  end if;

  raise notice 'H. day close: failed day, cleared day with +1 free point, idempotent';

  -- =========================================================================
  -- I. Report and snapshot
  -- =========================================================================
  v_result := public.pending_report();
  if jsonb_array_length(v_result -> 'days') <> 2 then
    raise exception 'I: the report should hold both closed days, got %', v_result;
  end if;

  perform public.acknowledge_report();
  v_result := public.pending_report();
  if jsonb_array_length(v_result -> 'days') <> 0 then
    raise exception 'I: acknowledging should clear the report, got %', v_result;
  end if;

  v_snapshot := public.hunter_snapshot();
  if (v_snapshot -> 'free_points_from_events')::integer <> 1 then
    raise exception 'I: the snapshot should carry the daily clear free point, got %',
      v_snapshot -> 'free_points_from_events';
  end if;
  if (v_snapshot -> 'effective_targets_today' ->> 'protein_target_g')::numeric <> 120 then
    raise exception 'I: effective targets should be the onboarding values, got %',
      v_snapshot -> 'effective_targets_today';
  end if;

  perform public.allocate_points('STR', 1);
  v_snapshot := public.hunter_snapshot();
  if (v_snapshot -> 'allocated_points' ->> 'STR')::integer <> 1 then
    raise exception 'I: allocation should appear in the snapshot, got %',
      v_snapshot -> 'allocated_points';
  end if;

  raise notice 'I. report and snapshot: report clears on acknowledge, allocation lands';

  -- =========================================================================
  -- J. Timezone changes (C4 immediacy, C7 clamp, G12 validation)
  -- =========================================================================
  select last_closed_on into v_last_closed from public.hunters where user_id = v_user;
  if v_last_closed is null then
    raise exception 'J: expected sealed days left over from section H';
  end if;

  -- Moving east applies at once: the profile changes the moment it is saved.
  perform public.update_hunter_profile('Smoke Hunter', 'Pacific/Kiritimati', 1700, 1900, 120);
  select timezone into v_timezone from public.hunters where user_id = v_user;
  if v_timezone <> 'Pacific/Kiritimati' then
    raise exception 'J: the timezone did not apply immediately, hunters still says %', v_timezone;
  end if;
  if public.game_today() <= v_last_closed then
    raise exception 'J: game_today % fell inside sealed history (last closed %)',
      public.game_today(), v_last_closed;
  end if;

  -- Moving west can drag the raw local date backwards; the clamp must hold.
  perform public.update_hunter_profile('Smoke Hunter', 'Pacific/Midway', 1700, 1900, 120);
  if public.game_today() <= v_last_closed then
    raise exception 'J: moving west reopened a sealed day: game_today %, last closed %',
      public.game_today(), v_last_closed;
  end if;
  if public.game_today() < public.game_date_at(now(), 'Pacific/Midway') then
    raise exception 'J: the clamp must never move the game day backwards';
  end if;

  -- Deterministic C7 check: seal days beyond the clock and confirm the pin.
  update public.hunters set last_closed_on = v_today + 2 where user_id = v_user;
  if public.game_today() <> v_today + 3 then
    raise exception 'J: clamp should pin the game day to last_closed_on + 1, got %',
      public.game_today();
  end if;
  update public.hunters set last_closed_on = v_last_closed where user_id = v_user;

  -- G12: a timezone Postgres does not know is refused outright.
  begin
    perform public.update_hunter_profile('Smoke Hunter', 'Mars/Olympus', 1700, 1900, 120);
    raise exception 'J: an unknown timezone must be refused';
  exception when others then
    if sqlerrm not like 'INVALID_TIMEZONE%' then
      raise exception 'J: unexpected error for an unknown timezone: %', sqlerrm;
    end if;
  end;

  perform public.update_hunter_profile('Smoke Hunter', pg_temp.test_tz(), 1700, 1900, 120);

  raise notice 'J. timezone: immediate, clamped out of sealed days, validated';

  raise notice '-------------------------------';
  raise notice 'SMOKE TEST PASSED';
  raise notice '-------------------------------';
end;
$$;

rollback;
