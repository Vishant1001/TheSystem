-- End-to-end proof of the Safe Zone rules (Phase 2, Step 2.2).
--
-- FOR A LOCAL / TEST DATABASE. Creates throwaway auth users and ends in
-- ROLLBACK, so nothing persists. Run with:  npm run db:verify
--
-- Like smoke_game_rules.sql it runs the RPCs as their owner with auth.uid()
-- set from the JWT claim; access control is proved in rls_proof.sql.
-- Every check raises on failure; a clean run ends with "SAFE ZONES PASSED".

begin;

insert into auth.users (id, email)
values
  ('44444444-4444-4444-4444-444444444444', 'safe-sim@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'safe-rpc@test.local');

-- ===========================================================================
-- K. Simulated weeks: rest, safe, cleared and failed days, the streak and
--    the stones, Phase 1 rules before the epoch, and a rules change that
--    applies only from its effective day.
--
--    45 days D1..D45, D45 = yesterday. 36 cleared days (45 - 2 failed - 3 safe - 4 rest). Study is the only everyday core quest;
--    Stretch is a core quest scheduled on the rest weekday that still counts
--    on rest days. Plan:
--      D1-D3   before rules_from: Phase 1 rules (D1 missed, D2-D3 lived)
--      D6      missed -> failed, streak resets
--      D10-D12 Sick period, nothing done -> safe
--      rest weekday = weekday of D8: D8 D15 D22 D29 D36 rest
--        (D22: Stretch done -> cleared on a rest day; the others: rest)
--      D38     rest days removed (versioned row): D43 is a normal day again
--      everything else lived
-- ===========================================================================
do $$
declare
  v_user uuid := '44444444-4444-4444-4444-444444444444';
  v_today date;
  v_base date;
  v_rest_dow smallint;
  v_study public.quests;
  v_stretch public.quests;
  v_i integer;
  v_day date;
  v_result jsonb;
  v_log public.daily_logs;
  v_expected_status text[];
  v_expected_streak integer[] := array[
    0, 0, 0, 1, 2, 0, 1, 1, 2, 2, 2, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    13, 14, 15, 16, 17, 17, 18, 19, 20, 21, 22, 23, 23, 24, 25, 26, 27, 28,
    29, 30, 31, 32
  ];
  v_stone_days date[];
  v_count integer;
  v_clears integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  perform public.onboard_hunter('Safe Sim', 'Europe/Berlin', 1700, 1900, 120);
  v_today := public.game_today();
  v_base := v_today - 46;
  v_rest_dow := extract(isodow from v_base + 8)::smallint;

  -- A new hunter is judged by Phase 2 rules from day one.
  if (select rules_from from public.hunters where user_id = v_user) <> v_today then
    raise exception 'K: a new hunter must have rules_from = created_on';
  end if;

  -- Only Study stays core; add Stretch for the rest weekday.
  update public.quests set is_core = false where user_id = v_user and title <> 'Study';
  insert into public.quests (
    user_id, title, type, category, tracking, goal_type, stat_tags, difficulty,
    is_core, on_rest_days, schedule_days, sort_order
  )
  values (
    v_user, 'Stretch', 'daily', 'fitness', 'manual', 'boolean', array['AGI'], 'E',
    true, true, array[v_rest_dow], 50
  );

  execute 'alter table public.quests disable trigger quests_guard_immutable';
  update public.quests set created_at = now() - interval '60 days' where user_id = v_user;
  execute 'alter table public.quests enable trigger quests_guard_immutable';

  select * into v_study from public.quests where user_id = v_user and title = 'Study';
  select * into v_stretch from public.quests where user_id = v_user and title = 'Stretch';

  -- Wind the hunter back: first day D1, Phase 2 rules from D4.
  update public.hunters
  set created_on = v_base + 1, rules_from = v_base + 4, last_closed_on = null
  where user_id = v_user;

  -- Versioned rules: the rest weekday from D1, removed from D38.
  update public.hunter_target_history
  set effective_on = v_base + 1, rest_days = array[v_rest_dow]
  where user_id = v_user;
  insert into public.hunter_target_history (
    user_id, effective_on, kcal_min, kcal_max, protein_target_g, penalty_mode, rest_days
  )
  values (v_user, v_base + 38, 1700, 1900, 120, 'standard', '{}');

  insert into public.safe_periods (user_id, kind, start_on, end_on)
  values (v_user, 'sick', v_base + 10, v_base + 12);

  -- Live the days.
  for v_i in 1 .. 45 loop
    v_day := v_base + v_i;
    continue when v_i in (1, 6, 10, 11, 12, 8, 15, 29, 36);
    if v_i = 22 then
      perform public.award_quest_completion(v_user, v_stretch, v_day, null);
      continue;
    end if;
    perform public.award_quest_completion(v_user, v_study, v_day, 45);
    if v_i = 43 then
      perform public.award_quest_completion(v_user, v_stretch, v_day, null);
    end if;
  end loop;

  -- Close everything (two calls: at most 30 days per call, G8).
  v_result := public.close_days();
  if not (v_result ->> 'more_pending')::boolean then
    raise exception 'K: expected a second batch after 30 days';
  end if;
  v_result := public.close_days();
  if (v_result ->> 'more_pending')::boolean or (v_result ->> 'count')::integer <> 15 then
    raise exception 'K: expected the remaining 15 days, got %', v_result ->> 'count';
  end if;

  v_expected_status := array_fill('cleared'::text, array[45]);
  v_expected_status[1] := 'failed';
  v_expected_status[6] := 'failed';
  v_expected_status[10] := 'safe';
  v_expected_status[11] := 'safe';
  v_expected_status[12] := 'safe';
  v_expected_status[8] := 'rest';
  v_expected_status[15] := 'rest';
  v_expected_status[29] := 'rest';
  v_expected_status[36] := 'rest';

  for v_i in 1 .. 45 loop
    select * into v_log from public.daily_logs
    where user_id = v_user and log_date = v_base + v_i;
    if v_log.status is distinct from v_expected_status[v_i]
       or v_log.streak is distinct from v_expected_streak[v_i] then
      raise exception 'K: D% (%) expected % / streak %, got % / streak %',
        v_i, v_base + v_i, v_expected_status[v_i], v_expected_streak[v_i],
        v_log.status, v_log.streak;
    end if;
  end loop;

  -- Before the epoch, the rest weekday meant nothing: D1 tallied both quests.
  select * into v_log from public.daily_logs where user_id = v_user and log_date = v_base + 1;
  if v_log.core_total <> 2 then
    raise exception 'K: D1 is Phase 1, rest days ignored: expected 2 core, got %', v_log.core_total;
  end if;

  -- A rest day counts only rest-day quests; D22 cleared on Stretch alone.
  select * into v_log from public.daily_logs where user_id = v_user and log_date = v_base + 22;
  if v_log.core_total <> 1 or v_log.core_done <> 1 then
    raise exception 'K: D22 should tally Stretch only, got % of %', v_log.core_done, v_log.core_total;
  end if;

  -- After the rules change, the old rest weekday is a normal day (D43: 2 core).
  select * into v_log from public.daily_logs where user_id = v_user and log_date = v_base + 43;
  if v_log.core_total <> 2 then
    raise exception 'K: D43 is no longer a rest day: expected 2 core, got %', v_log.core_total;
  end if;

  -- Stones at streak 7, 14 and 21 (D18, D25, D33); none at 28 (cap of 3).
  select array_agg(log_date order by log_date) into v_stone_days
  from public.redemption_stone_events where user_id = v_user and reason = 'earned';
  if v_stone_days is distinct from array[v_base + 18, v_base + 25, v_base + 33] then
    raise exception 'K: stones expected on D18, D25, D33, got %', v_stone_days;
  end if;
  if public.stones_held(v_user) <> 3 then
    raise exception 'K: expected 3 stones held';
  end if;

  -- Free points: exactly one per cleared day with core quests, nothing else.
  select count(*) into v_clears from public.daily_logs
  where user_id = v_user and status = 'cleared' and core_total > 0;
  select count(*) into v_count from public.xp_events
  where user_id = v_user and source_type = 'daily_clear';
  if v_count <> v_clears or v_count <> 36 then
    raise exception 'K: expected 36 daily clears, got % events for % cleared days', v_count, v_clears;
  end if;
  if exists (
    select 1 from public.xp_events e
    join public.daily_logs d on d.user_id = e.user_id and d.log_date = e.occurred_on
    where e.user_id = v_user and e.source_type = 'daily_clear' and d.status <> 'cleared'
  ) then
    raise exception 'K: a rest, safe or failed day paid a free point';
  end if;

  -- The report and snapshot carry it.
  v_result := public.pending_report();
  if (v_result -> 'days' -> 0 ->> 'streak')::integer <> 32 then
    raise exception 'K: report should show streak 32 on the newest day, got %', v_result -> 'days' -> 0;
  end if;
  if (select count(*) from jsonb_array_elements(v_result -> 'days') d
      where (d ->> 'stone_earned')::boolean) <> 3 then
    raise exception 'K: report should flag the 3 stone days';
  end if;
  v_result := public.hunter_snapshot();
  if (v_result -> 'safe_zones' ->> 'streak')::integer <> 32
     or (v_result -> 'safe_zones' ->> 'stones_held')::integer <> 3 then
    raise exception 'K: snapshot streak/stones wrong: %', v_result -> 'safe_zones';
  end if;

  -- Idempotent.
  v_result := public.close_days();
  if (v_result ->> 'count')::integer <> 0 then
    raise exception 'K: close_days must be idempotent';
  end if;

  raise notice 'K. simulated weeks: rest/safe/cleared/failed, streak 32, stones at 7/14/21, none past 3';
end;
$$;

-- ===========================================================================
-- L. Versioned rules: a change applies from the next game day only, and the
--    diet targets and rules carry each other forward.
-- M. Safe period RPCs: start, refusals, quota, end early.
-- ===========================================================================
do $$
declare
  v_user uuid := '55555555-5555-5555-5555-555555555555';
  v_today date;
  v_snapshot jsonb;
  v_row public.hunter_target_history;
  v_period jsonb;
  v_second jsonb;
  v_start date;
  v_error text;
  v_statement text;
  v_expected text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  perform public.onboard_hunter('Safe Rpc', 'Europe/Berlin', 1700, 1900, 120);
  v_today := public.game_today();

  -- ---- L --------------------------------------------------------------------
  v_snapshot := public.update_hunter_rules('lenient', array[7, 6]::smallint[]);

  if v_snapshot -> 'safe_zones' -> 'rules_today' ->> 'penalty_mode' <> 'standard'
     or v_snapshot -> 'safe_zones' -> 'rules_today' -> 'rest_days' <> '[]'::jsonb then
    raise exception 'L: a rules change must not touch today: %', v_snapshot -> 'safe_zones';
  end if;
  if v_snapshot -> 'safe_zones' -> 'rules_tomorrow' ->> 'penalty_mode' <> 'lenient'
     or v_snapshot -> 'safe_zones' -> 'rules_tomorrow' -> 'rest_days' <> '[6, 7]'::jsonb then
    raise exception 'L: the change must apply tomorrow, sorted: %', v_snapshot -> 'safe_zones';
  end if;

  -- The rules row carried today's diet targets forward.
  select * into v_row from public.hunter_target_history
  where user_id = v_user and effective_on = v_today + 1;
  if v_row.kcal_min <> 1700 or v_row.kcal_max <> 1900 or v_row.protein_target_g <> 120 then
    raise exception 'L: diet targets not carried forward: %', v_row;
  end if;

  -- A diet change on the same day keeps the new rules on that row.
  perform public.update_hunter_profile('Safe Rpc', 'Europe/Berlin', 1800, 2000, 130);
  select * into v_row from public.hunter_target_history
  where user_id = v_user and effective_on = v_today + 1;
  if v_row.penalty_mode <> 'lenient' or v_row.rest_days <> array[6, 7]::smallint[]
     or v_row.kcal_min <> 1800 then
    raise exception 'L: profile edit lost the rules or the targets: %', v_row;
  end if;

  -- And a rules change after it keeps the new targets.
  perform public.update_hunter_rules('hardcore', '{}'::smallint[]);
  select * into v_row from public.hunter_target_history
  where user_id = v_user and effective_on = v_today + 1;
  if v_row.penalty_mode <> 'hardcore' or v_row.kcal_min <> 1800 or v_row.protein_target_g <> 130 then
    raise exception 'L: rules edit lost the targets: %', v_row;
  end if;
  if (select penalty_mode from public.effective_rules(v_user, v_today)) <> 'standard' then
    raise exception 'L: today must still be judged as standard';
  end if;

  foreach v_statement in array array[
    'select public.update_hunter_rules(''lenient'', array[1, 6, 7]::smallint[])|INVALID_REST_DAYS',
    'select public.update_hunter_rules(''lenient'', array[6, 6]::smallint[])|INVALID_REST_DAYS',
    'select public.update_hunter_rules(''lenient'', array[0]::smallint[])|INVALID_REST_DAYS',
    'select public.update_hunter_rules(''lenient'', null)|INVALID_REST_DAYS',
    'select public.update_hunter_rules(''easy'', ''{}''::smallint[])|INVALID_PENALTY_MODE'
  ]
  loop
    v_expected := split_part(v_statement, '|', 2);
    v_error := null;
    begin
      execute split_part(v_statement, '|', 1);
    exception when others then
      v_error := sqlerrm;
    end;
    if v_error is null or v_error not like v_expected || '%' then
      raise exception 'L: expected % from %, got %', v_expected, split_part(v_statement, '|', 1), v_error;
    end if;
  end loop;

  raise notice 'L. rules: versioned to tomorrow, targets and rules carry forward, validated';

  -- ---- M --------------------------------------------------------------------
  -- Start: today if before today's warning time (standard: 23:00), else
  -- tomorrow; never before rules_from (= today for a new hunter).
  v_start := greatest(public.safe_period_start(now(), 'Europe/Berlin', 'standard'), v_today);
  v_period := public.start_safe_period('sick', 3);
  if (v_period ->> 'start_on')::date <> v_start
     or (v_period ->> 'end_on')::date <> v_start + 2 then
    raise exception 'M: expected a period % .. %, got %', v_start, v_start + 2, v_period;
  end if;
  if public.is_safe_on(v_user, v_start) is not true
     or public.is_safe_on(v_user, v_start + 3) then
    raise exception 'M: safe days do not match the period';
  end if;

  foreach v_statement in array array[
    'select public.start_safe_period(''sick'', 1)|SAFE_PERIOD_OVERLAP',
    'select public.start_safe_period(''travel'', 8)|SAFE_PERIOD_LENGTH',
    'select public.start_safe_period(''travel'', 0)|SAFE_PERIOD_LENGTH',
    'select public.start_safe_period(''holiday'', 2)|INVALID_SAFE_KIND'
  ]
  loop
    v_expected := split_part(v_statement, '|', 2);
    v_error := null;
    begin
      execute split_part(v_statement, '|', 1);
    exception when others then
      v_error := sqlerrm;
    end;
    if v_error is null or v_error not like v_expected || '%' then
      raise exception 'M: expected % from %, got %', v_expected, split_part(v_statement, '|', 1), v_error;
    end if;
  end loop;

  -- Quota: 3 booked + 7 more = 10 in the window; the 11th is refused.
  insert into public.safe_periods (user_id, kind, start_on, end_on)
  values (v_user, 'travel', v_start + 5, v_start + 11);
  if (public.hunter_snapshot() -> 'safe_zones' ->> 'safe_days_bookable')::integer <> 0 then
    raise exception 'M: no safe days should be bookable at the quota';
  end if;
  v_error := null;
  begin
    perform public.safe_period_refusal_for(v_user, v_start + 20, 1);
    if public.safe_period_refusal_for(v_user, v_start + 20, 1) is distinct from 'SAFE_QUOTA_EXCEEDED' then
      raise exception 'quota not enforced';
    end if;
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is not null then
    raise exception 'M: %', v_error;
  end if;

  -- End early: from tomorrow, or a not-yet-started period is cancelled. The
  -- unused days return to the quota.
  v_second := public.end_safe_period((v_period ->> 'id')::uuid);
  if (v_second ->> 'ended_early_on')::date <> greatest(v_today + 1, v_start) then
    raise exception 'M: ended early on the wrong day: %', v_second;
  end if;
  if public.is_safe_on(v_user, v_today + 1) then
    raise exception 'M: tomorrow must no longer be safe after ending early';
  end if;
  -- Checked on a free date so the result does not depend on the time of day
  -- (before the warning hour the period started today and keeps today safe).
  if public.safe_period_refusal_for(v_user, v_start + 20, 2) is not null then
    raise exception 'M: ending early should hand days back to the quota (2 more days at +20): %',
      public.safe_period_refusal_for(v_user, v_start + 20, 2);
  end if;

  v_error := null;
  begin
    perform public.end_safe_period((v_period ->> 'id')::uuid);
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null or v_error not like 'SAFE_PERIOD_NOT_ACTIVE%' then
    raise exception 'M: ending twice should be refused, got %', v_error;
  end if;

  raise notice 'M. safe periods: start rule, overlap, length, kind, quota, end early';
  raise notice '-------------------------------';
  raise notice 'SAFE ZONES PASSED';
  raise notice '-------------------------------';
end;
$$;

rollback;
