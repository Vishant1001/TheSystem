-- Phase 2, Step 2.2: Safe Zones - functions (brief 3.1, 3.6 - 3.9).
--
-- The pure helpers here are SQL twins of src/game/dayStatus.ts, streak.ts and
-- safeZones.ts. supabase/tests/safe_zone_parity.sql is generated from the
-- same JSON vectors as the engine tests, so the two cannot drift.
--
-- C1: every function revokes execute from public, anon AND authenticated
-- (Supabase grants authenticated by name), and only the three new RPCs are
-- granted back.

-- ---------------------------------------------------------------------------
-- Rules for a game day (C8 history, extended): penalty mode and rest days.
-- ---------------------------------------------------------------------------
create or replace function public.effective_rules(
  p_user uuid,
  p_day date,
  out penalty_mode text,
  out rest_days smallint[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select t.penalty_mode, t.rest_days
    into penalty_mode, rest_days
  from public.hunter_target_history t
  where t.user_id = p_user
    and t.effective_on <= p_day
  order by t.effective_on desc
  limit 1;

  if penalty_mode is null then
    penalty_mode := public.game_config_value('penalty') ->> 'defaultMode';
    rest_days := '{}'::smallint[];
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Day outcome (3.7 - 3.9). Twin of countsTowardCoreTally / evaluateDay.
-- p_rest_day must already be false for days before rules_from.
-- ---------------------------------------------------------------------------
create or replace function public.counts_toward_core_tally(
  p_is_core boolean,
  p_on_rest_days boolean,
  p_scheduled boolean,
  p_rest_day boolean
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_is_core and p_scheduled and (not p_rest_day or p_on_rest_days);
$$;

create or replace function public.day_outcome(
  p_phase2 boolean,
  p_rest_day boolean,
  p_safe boolean,
  p_core_total integer,
  p_core_done integer,
  out status text,
  out free_points integer,
  out creates_penalty boolean,
  out streak_effect text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_per_clear integer := public.game_config_int('free_points_per_daily_clear');
  v_all_done boolean := p_core_done >= p_core_total;
begin
  creates_penalty := false;
  free_points := 0;
  streak_effect := 'neutral';

  -- Before the rules epoch: Phase 1 exactly (G6 included).
  if not p_phase2 then
    status := case when v_all_done then 'cleared' else 'failed' end;
    free_points := case when v_all_done and p_core_total > 0 then v_per_clear else 0 end;
    return;
  end if;

  -- Precedence: safe > rest > cleared/failed (3.9).
  if p_safe then
    status := 'safe';
    return;
  end if;

  if p_rest_day then
    if p_core_total > 0 and v_all_done then
      status := 'cleared';
      free_points := v_per_clear;
      streak_effect := 'extend';
    else
      status := 'rest';
    end if;
    return;
  end if;

  if not v_all_done then
    status := 'failed';
    creates_penalty := true;
    streak_effect := 'reset';
    return;
  end if;

  status := 'cleared';
  if p_core_total > 0 then
    free_points := v_per_clear;
    streak_effect := 'extend';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Streak and stones (3.6). Twins of nextStreak / earnsStone.
-- ---------------------------------------------------------------------------
create or replace function public.next_streak(p_previous integer, p_effect text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_effect
           when 'reset' then 0
           when 'extend' then p_previous + 1
           else p_previous
         end;
$$;

create or replace function public.earns_stone(
  p_streak_before integer,
  p_streak_after integer,
  p_held integer,
  p_mode text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_stones jsonb := public.game_config_value('stones');
begin
  return p_mode <> 'hardcore'
     and p_streak_after > p_streak_before
     and p_streak_after % (v_stones ->> 'streakInterval')::integer = 0
     and p_held < (v_stones ->> 'maxHeld')::integer;
end;
$$;

create or replace function public.stones_held(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::integer
  from public.redemption_stone_events
  where user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- Safe periods (3.8). Twins of effectiveEnd / safePeriodStart / checkSafePeriod.
-- ---------------------------------------------------------------------------
create or replace function public.safe_effective_end(p_end_on date, p_ended_early_on date)
returns date
language sql
immutable
set search_path = public
as $$
  select case
           when p_ended_early_on is null then p_end_on
           else least(p_end_on, p_ended_early_on - 1)
         end;
$$;

create or replace function public.is_safe_on(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.safe_periods s
    where s.user_id = p_user
      and p_day >= s.start_on
      and p_day <= public.safe_effective_end(s.end_on, s.ended_early_on)
  );
$$;

-- Starts today only when activated before today's warning time, judged by the
-- mode in effect today (step 0, G-l); otherwise tomorrow.
create or replace function public.safe_period_start(
  p_now timestamptz,
  p_timezone text,
  p_mode text
)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.game_date_at(p_now, p_timezone);
  v_hour integer := (public.game_config_value('penalty') -> 'warningStartHour' ->> p_mode)::integer;
  v_warning timestamptz;
begin
  if v_hour is null then
    raise exception 'INVALID_PENALTY_MODE: %', p_mode;
  end if;
  v_warning := (v_today::timestamp + make_interval(hours => v_hour)) at time zone p_timezone;
  return case when p_now < v_warning then v_today else v_today + 1 end;
end;
$$;

-- Null when the period may be booked, otherwise the refusal token. Existing
-- periods arrive as three parallel arrays so the function stays pure and the
-- parity test can feed it the same vectors as the engine.
create or replace function public.safe_period_refusal(
  p_starts date[],
  p_ends date[],
  p_ended_early date[],
  p_start_on date,
  p_days integer
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_zones jsonb := public.game_config_value('safe_zones');
  v_min integer := (v_zones ->> 'minPeriodDays')::integer;
  v_max integer := (v_zones ->> 'maxPeriodDays')::integer;
  v_quota integer := (v_zones ->> 'quotaDays')::integer;
  v_window integer := (v_zones ->> 'quotaWindowDays')::integer;
  v_end_on date;
  v_window_end date;
  v_window_start date;
  v_count integer;
begin
  if p_days is null or p_days < v_min or p_days > v_max then
    return 'SAFE_PERIOD_LENGTH';
  end if;
  v_end_on := p_start_on + p_days - 1;

  if exists (
    select 1
    from unnest(p_starts, p_ends, p_ended_early) as e(start_on, end_on, ended_early_on)
    where e.start_on <= v_end_on
      and public.safe_effective_end(e.end_on, e.ended_early_on) >= p_start_on
  ) then
    return 'SAFE_PERIOD_OVERLAP';
  end if;

  -- Every rolling window that would contain a new day must stay in quota.
  v_window_end := p_start_on;
  while v_window_end <= v_end_on + v_window - 1 loop
    v_window_start := v_window_end - (v_window - 1);

    select coalesce(sum(greatest(
             0,
             least(public.safe_effective_end(e.end_on, e.ended_early_on), v_window_end)
               - greatest(e.start_on, v_window_start) + 1
           )), 0)::integer
    into v_count
    from unnest(
      p_starts || p_start_on,
      p_ends || v_end_on,
      p_ended_early || null::date
    ) as e(start_on, end_on, ended_early_on);

    if v_count > v_quota then
      return 'SAFE_QUOTA_EXCEEDED';
    end if;
    v_window_end := v_window_end + 1;
  end loop;

  return null;
end;
$$;

-- The same check against the caller's stored periods.
create or replace function public.safe_period_refusal_for(
  p_user uuid,
  p_start_on date,
  p_days integer
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.safe_period_refusal(
    coalesce(array_agg(s.start_on order by s.start_on), '{}'::date[]),
    coalesce(array_agg(s.end_on order by s.start_on), '{}'::date[]),
    coalesce(array_agg(s.ended_early_on order by s.start_on), '{}'::date[]),
    p_start_on,
    p_days
  )
  from public.safe_periods s
  where s.user_id = p_user;
$$;

create or replace function public.safe_days_bookable(p_user uuid, p_start_on date)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_zones jsonb := public.game_config_value('safe_zones');
  v_days integer := (v_zones ->> 'maxPeriodDays')::integer;
begin
  while v_days >= (v_zones ->> 'minPeriodDays')::integer loop
    if public.safe_period_refusal_for(p_user, p_start_on, v_days) is null then
      return v_days;
    end if;
    v_days := v_days - 1;
  end loop;
  return 0;
end;
$$;

-- The game day a Sick/Travel period activated right now would start on: never
-- before the rules epoch, where it could not protect anything.
create or replace function public.safe_start_for(p_user uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
           public.safe_period_start(now(), h.timezone,
             (public.effective_rules(p_user, public.game_today_for(p_user))).penalty_mode),
           public.game_today_for(p_user),
           h.rules_from
         )
  from public.hunters h
  where h.user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- RPC: start_safe_period(kind, days)
-- ---------------------------------------------------------------------------
create or replace function public.start_safe_period(p_kind text, p_days integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_start_on date;
  v_refusal text;
  v_id uuid;
begin
  -- Serialise against close_days() and a double tap.
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  if p_kind is null or p_kind not in ('sick', 'travel') then
    raise exception 'INVALID_SAFE_KIND';
  end if;

  v_start_on := public.safe_start_for(v_user);
  v_refusal := public.safe_period_refusal_for(v_user, v_start_on, p_days);
  if v_refusal is not null then
    raise exception '%', v_refusal;
  end if;

  insert into public.safe_periods (user_id, kind, start_on, end_on)
  values (v_user, p_kind, v_start_on, v_start_on + p_days - 1)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'kind', p_kind,
    'start_on', v_start_on,
    'end_on', v_start_on + p_days - 1
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: end_safe_period(id). Takes effect from the next game day; a period
-- that has not started yet is cancelled outright.
-- ---------------------------------------------------------------------------
create or replace function public.end_safe_period(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_period public.safe_periods;
  v_ended_on date;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  select * into v_period
  from public.safe_periods
  where id = p_id and user_id = v_user
  for update;
  if not found then
    raise exception 'SAFE_PERIOD_NOT_FOUND';
  end if;

  v_ended_on := greatest(public.game_today_for(v_user) + 1, v_period.start_on);

  -- Nothing left to end: every remaining safe day is already behind today.
  if public.safe_effective_end(v_period.end_on, v_period.ended_early_on) < v_ended_on then
    raise exception 'SAFE_PERIOD_NOT_ACTIVE';
  end if;

  update public.safe_periods set ended_early_on = v_ended_on where id = v_period.id;

  return jsonb_build_object('id', v_period.id, 'ended_early_on', v_ended_on);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: update_hunter_rules(penalty_mode, rest_days). Versioned like the diet
-- targets (C8): takes effect from the next game day, so a failing day cannot
-- be dodged by switching modes at 02:50.
-- ---------------------------------------------------------------------------
create or replace function public.update_hunter_rules(
  p_penalty_mode text,
  p_rest_days smallint[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_effective_on date;
  v_targets record;
  v_max_rest integer := (public.game_config_value('safe_zones') ->> 'maxRestDays')::integer;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  if p_penalty_mode is null or p_penalty_mode not in ('lenient', 'standard', 'hardcore') then
    raise exception 'INVALID_PENALTY_MODE';
  end if;

  if p_rest_days is null
     or cardinality(p_rest_days) > v_max_rest
     or not (p_rest_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
     or not public.weekdays_are_distinct(p_rest_days) then
    raise exception 'INVALID_REST_DAYS';
  end if;

  v_effective_on := public.game_today_for(v_user) + 1;
  select * into v_targets from public.effective_targets(v_user, v_effective_on);

  -- Carry the diet targets forward unchanged; only the rules move.
  insert into public.hunter_target_history (
    user_id, effective_on, kcal_min, kcal_max, protein_target_g, penalty_mode, rest_days
  )
  values (
    v_user, v_effective_on, v_targets.kcal_min, v_targets.kcal_max, v_targets.protein_target_g,
    p_penalty_mode, (select coalesce(array_agg(d order by d), '{}') from unnest(p_rest_days) d)
  )
  on conflict (user_id, effective_on) do update
    set penalty_mode = excluded.penalty_mode,
        rest_days = excluded.rest_days,
        created_at = now();

  return public.hunter_snapshot();
end;
$$;

-- ---------------------------------------------------------------------------
-- update_hunter_profile: unchanged behaviour, but a new target version now
-- carries the rules in force for that day forward (step 0, rules history).
-- ---------------------------------------------------------------------------
create or replace function public.update_hunter_profile(
  p_hunter_name text,
  p_timezone text,
  p_kcal_min integer,
  p_kcal_max integer,
  p_protein_target_g numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_hunter public.hunters;
  v_effective_on date;
  v_rules record;
begin
  select * into v_hunter from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  if not public.is_valid_timezone(p_timezone) then
    raise exception 'INVALID_TIMEZONE: %', p_timezone;
  end if;

  if p_kcal_min is null or p_kcal_max is null or p_kcal_max < p_kcal_min then
    raise exception 'INVALID_KCAL_RANGE';
  end if;

  -- Computed with the timezone in force right now, before any change to it.
  v_effective_on := public.game_today_for(v_user) + 1;
  select * into v_rules from public.effective_rules(v_user, v_effective_on);

  update public.hunters
  set hunter_name = btrim(p_hunter_name),
      timezone = p_timezone,
      kcal_min = p_kcal_min,
      kcal_max = p_kcal_max,
      protein_target_g = p_protein_target_g
  where user_id = v_user;

  insert into public.hunter_target_history (
    user_id, effective_on, kcal_min, kcal_max, protein_target_g, penalty_mode, rest_days
  )
  values (
    v_user, v_effective_on, p_kcal_min, p_kcal_max, p_protein_target_g,
    v_rules.penalty_mode, v_rules.rest_days
  )
  on conflict (user_id, effective_on) do update
    set kcal_min = excluded.kcal_min,
        kcal_max = excluded.kcal_max,
        protein_target_g = excluded.protein_target_g,
        created_at = now();

  return public.hunter_snapshot();
end;
$$;

-- ---------------------------------------------------------------------------
-- onboard_hunter: unchanged, plus the default rules on the first history row
-- and rules_from = the first game day (a new hunter is all Phase 2).
-- ---------------------------------------------------------------------------
create or replace function public.onboard_hunter(
  p_hunter_name text,
  p_timezone text,
  p_kcal_min integer,
  p_kcal_max integer,
  p_protein_target_g numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_created_on date;
begin
  if exists (select 1 from public.hunters where user_id = v_user) then
    raise exception 'ALREADY_ONBOARDED';
  end if;

  if not public.is_valid_timezone(p_timezone) then
    raise exception 'INVALID_TIMEZONE: %', p_timezone;
  end if;

  if p_kcal_min is null or p_kcal_max is null or p_kcal_max < p_kcal_min then
    raise exception 'INVALID_KCAL_RANGE';
  end if;

  v_created_on := public.game_date_at(now(), p_timezone);

  insert into public.hunters (
    user_id, hunter_name, timezone, kcal_min, kcal_max, protein_target_g, created_on, rules_from
  )
  values (
    v_user, btrim(p_hunter_name), p_timezone, p_kcal_min, p_kcal_max, p_protein_target_g,
    v_created_on, v_created_on
  );

  insert into public.hunter_target_history (
    user_id, effective_on, kcal_min, kcal_max, protein_target_g, penalty_mode, rest_days
  )
  values (
    v_user, v_created_on, p_kcal_min, p_kcal_max, p_protein_target_g,
    public.game_config_value('penalty') ->> 'defaultMode', '{}'::smallint[]
  );

  insert into public.quests (
    user_id, title, type, category, tracking, goal_type, target_value, unit,
    stat_tags, difficulty, is_core, schedule_days, sort_order
  )
  values
    (v_user, 'Train', 'daily', 'fitness', 'auto_workout', 'boolean', null, null,
     array['STR', 'VIT'], 'C', true, array[1, 2, 3, 4, 5, 6, 7]::smallint[], 10),
    (v_user, 'Calories in range', 'daily', 'diet', 'auto_kcal_range', 'numeric', null, 'kcal',
     array['VIT'], 'C', true, array[1, 2, 3, 4, 5, 6, 7]::smallint[], 20),
    (v_user, 'Hit protein', 'daily', 'diet', 'auto_protein_min', 'numeric', null, 'g',
     array['VIT', 'STR'], 'D', true, array[1, 2, 3, 4, 5, 6, 7]::smallint[], 30),
    (v_user, 'Study', 'daily', 'life', 'manual', 'duration', 30, 'min',
     array['INT'], 'C', true, array[1, 2, 3, 4, 5, 6, 7]::smallint[], 40);

  return public.hunter_snapshot();
end;
$$;

-- ---------------------------------------------------------------------------
-- close_days(): Phase 1 steps unchanged, plus rest/safe statuses, the streak
-- and stone earning. Step 5 stays the Penalty Zone hook until 2.3.
-- ---------------------------------------------------------------------------
create or replace function public.close_days()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_hunter public.hunters;
  v_today date;
  v_from date;
  v_to date;
  v_max_days integer := public.game_config_int('close_days_max_backfill');
  v_day date;
  v_processed integer := 0;
  v_more boolean := false;
  v_rules record;
  v_phase2 boolean;
  v_rest boolean;
  v_safe boolean;
  v_core_total integer;
  v_core_done integer;
  v_outcome record;
  v_streak_before integer;
  v_streak integer;
  v_stone boolean;
  v_free_points integer;
  v_day_xp integer;
  v_days jsonb := '[]'::jsonb;
begin
  -- 6.4: lock the hunter row so two concurrent calls cannot close the same day.
  select * into v_hunter from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  v_today := public.game_today_for(v_user);
  v_from := coalesce(v_hunter.last_closed_on + 1, v_hunter.created_on);
  v_to := v_today - 1;
  v_day := v_from;

  select coalesce(
    (select d.streak from public.daily_logs d where d.user_id = v_user and d.log_date = v_from - 1),
    0
  ) into v_streak_before;

  while v_day <= v_to loop
    -- G8: bounded work per call; the client calls again while more_pending.
    if v_processed >= v_max_days then
      v_more := true;
      exit;
    end if;

    -- 1. Deferred quests: the calorie window is only judged once the day is over.
    perform public.evaluate_auto_kcal_range(v_user, v_day);

    -- 2. The rules that day was lived under (versioned, C8), and whether it
    --    was a rest or safe day. Neither exists before the rules epoch.
    select * into v_rules from public.effective_rules(v_user, v_day);
    v_phase2 := v_day >= v_hunter.rules_from;
    v_rest := v_phase2 and extract(isodow from v_day)::smallint = any (v_rules.rest_days);
    v_safe := v_phase2 and public.is_safe_on(v_user, v_day);

    --    Tally the core quests through the shared predicates (the same rules
    --    src/game/schedule.ts and dayStatus.ts apply).
    select
      count(*),
      count(*) filter (where public.active_completion_id(q.id, v_day) is not null)
    into v_core_total, v_core_done
    from public.quests q
    where q.user_id = v_user
      and q.is_core
      and public.counts_toward_core_tally(
            q.is_core, q.on_rest_days, public.quest_on_board(q, v_day, v_hunter.timezone), v_rest);

    select * into v_outcome
    from public.day_outcome(v_phase2, v_rest, v_safe, v_core_total, v_core_done);

    v_streak := public.next_streak(v_streak_before, v_outcome.streak_effect);

    -- 3. Write the day log.
    insert into public.daily_logs (user_id, log_date, status, core_total, core_done, streak)
    values (v_user, v_day, v_outcome.status, v_core_total, v_core_done, v_streak)
    on conflict (user_id, log_date) do update
      set status = excluded.status,
          core_total = excluded.core_total,
          core_done = excluded.core_done,
          streak = excluded.streak,
          closed_at = now();

    -- 4. Award the daily clear. Never twice for the same day.
    v_free_points := 0;
    if v_outcome.free_points > 0 then
      if not exists (
        select 1 from public.xp_events
        where user_id = v_user and occurred_on = v_day and source_type = 'daily_clear'
      ) then
        insert into public.xp_events (user_id, occurred_on, source_type, free_points)
        values (v_user, v_day, 'daily_clear', v_outcome.free_points);
        v_free_points := v_outcome.free_points;
      end if;
    end if;

    -- 4b. Redemption Stones (3.6): a close that lands the streak on a
    --     multiple of 7 earns one, below the cap, outside Hardcore.
    v_stone := v_phase2 and public.earns_stone(
      v_streak_before, v_streak, public.stones_held(v_user), v_rules.penalty_mode);
    if v_stone then
      insert into public.redemption_stone_events (user_id, occurred_on, delta, reason, log_date)
      values (v_user, v_day, 1, 'earned', v_day)
      on conflict do nothing;
    end if;

    -- 5. ---------------------------------------------------------------
    --    PENALTY ZONE HOOK - filled in by Step 2.3.
    --    v_outcome.creates_penalty is true exactly for a failed day under
    --    Phase 2 rules; the penalty step goes here, after the day log
    --    exists and before last_closed_on advances.
    --    ---------------------------------------------------------------

    -- 6. Advance the watermark.
    update public.hunters set last_closed_on = v_day where user_id = v_user;

    select coalesce(sum(xp), 0) into v_day_xp
    from public.xp_events
    where user_id = v_user and occurred_on = v_day;

    v_days := v_days || jsonb_build_object(
      'log_date', v_day,
      'status', v_outcome.status,
      'core_total', v_core_total,
      'core_done', v_core_done,
      'xp_gained', v_day_xp,
      'free_points_gained', v_free_points,
      'streak', v_streak,
      'stone_earned', v_stone
    );

    v_streak_before := v_streak;
    v_processed := v_processed + 1;
    v_day := v_day + 1;
  end loop;

  return jsonb_build_object(
    'game_today', v_today,
    'count', v_processed,
    'more_pending', v_more,
    'days', v_days
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- pending_report: adds the streak and the stone to each day.
-- ---------------------------------------------------------------------------
create or replace function public.pending_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_days jsonb;
begin
  select coalesce(jsonb_agg(day_row order by day_row ->> 'log_date' desc), '[]'::jsonb)
  into v_days
  from (
    select jsonb_build_object(
      'log_date', d.log_date,
      'status', d.status,
      'core_total', d.core_total,
      'core_done', d.core_done,
      'xp_gained', coalesce(x.xp, 0),
      'free_points_gained', coalesce(x.free_points, 0),
      'streak', d.streak,
      'stone_earned', exists (
        select 1 from public.redemption_stone_events s
        where s.user_id = d.user_id and s.reason = 'earned' and s.log_date = d.log_date
      )
    ) as day_row
    from public.daily_logs d
    left join lateral (
      select sum(e.xp) as xp, sum(e.free_points) as free_points
      from public.xp_events e
      where e.user_id = d.user_id and e.occurred_on = d.log_date
    ) x on true
    where d.user_id = v_user and d.acknowledged_at is null
  ) as report_rows;

  return jsonb_build_object('days', v_days);
end;
$$;

-- ---------------------------------------------------------------------------
-- hunter_snapshot: Phase 1 fields unchanged, plus a `safe_zones` block.
-- ---------------------------------------------------------------------------
create or replace function public.hunter_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_hunter public.hunters;
  v_today date;
  v_result jsonb;
  v_rules_today record;
  v_rules_tomorrow record;
  v_safe_start date;
  v_streak integer;
begin
  select * into v_hunter from public.hunters where user_id = v_user;
  if not found then
    return null;
  end if;

  -- The streak after the most recent close (3.6).
  select coalesce(
    (select d.streak from public.daily_logs d
     where d.user_id = v_user order by d.log_date desc limit 1),
    0
  ) into v_streak;

  v_today := public.game_today_for(v_user);
  select * into v_rules_today from public.effective_rules(v_user, v_today);
  select * into v_rules_tomorrow from public.effective_rules(v_user, v_today + 1);
  v_safe_start := public.safe_start_for(v_user);

  select jsonb_build_object(
    'hunter', jsonb_build_object(
      'user_id', v_hunter.user_id,
      'hunter_name', v_hunter.hunter_name,
      'timezone', v_hunter.timezone,
      'kcal_min', v_hunter.kcal_min,
      'kcal_max', v_hunter.kcal_max,
      'protein_target_g', v_hunter.protein_target_g,
      'created_on', v_hunter.created_on,
      'last_closed_on', v_hunter.last_closed_on
    ),
    'game_today', v_today,
    'total_xp', coalesce(totals.xp, 0),
    'stat_xp', jsonb_build_object(
      'STR', coalesce(totals.str_xp, 0),
      'AGI', coalesce(totals.agi_xp, 0),
      'VIT', coalesce(totals.vit_xp, 0),
      'INT', coalesce(totals.int_xp, 0),
      'SENSE', coalesce(totals.sense_xp, 0)
    ),
    'free_points_from_events', coalesce(totals.free_points, 0),
    'allocated_points', jsonb_build_object(
      'STR', coalesce(alloc.str_points, 0),
      'AGI', coalesce(alloc.agi_points, 0),
      'VIT', coalesce(alloc.vit_points, 0),
      'INT', coalesce(alloc.int_points, 0),
      'SENSE', coalesce(alloc.sense_points, 0)
    ),
    'today_xp_by_category', jsonb_build_object(
      'fitness', coalesce(today_cat.fitness, 0),
      'diet', coalesce(today_cat.diet, 0),
      'life', coalesce(today_cat.life, 0)
    ),
    'effective_targets_today', jsonb_build_object(
      'kcal_min', targets.kcal_min,
      'kcal_max', targets.kcal_max,
      'protein_target_g', targets.protein_target_g
    ),
    'daily_caps', public.game_config_value('daily_caps'),
    'unacknowledged_days', coalesce(report.pending, 0),
    'safe_zones', jsonb_build_object(
      'rules_from', v_hunter.rules_from,
      'rules_today', jsonb_build_object(
        'penalty_mode', v_rules_today.penalty_mode,
        'rest_days', to_jsonb(v_rules_today.rest_days)
      ),
      'rules_tomorrow', jsonb_build_object(
        'penalty_mode', v_rules_tomorrow.penalty_mode,
        'rest_days', to_jsonb(v_rules_tomorrow.rest_days)
      ),
      'is_rest_day_today', v_today >= v_hunter.rules_from
        and extract(isodow from v_today)::smallint = any (v_rules_today.rest_days),
      'is_safe_today', v_today >= v_hunter.rules_from and public.is_safe_on(v_user, v_today),
      'streak', v_streak,
      'stones_held', public.stones_held(v_user),
      'safe_start_on', v_safe_start,
      'safe_days_bookable', public.safe_days_bookable(v_user, v_safe_start),
      'safe_periods', coalesce(periods.list, '[]'::jsonb)
    )
  )
  into v_result
  from
    (
      select
        sum(xp) as xp,
        sum(str_xp) as str_xp,
        sum(agi_xp) as agi_xp,
        sum(vit_xp) as vit_xp,
        sum(int_xp) as int_xp,
        sum(sense_xp) as sense_xp,
        sum(free_points) as free_points
      from public.xp_events
      where user_id = v_user
    ) as totals,
    (
      select
        sum(points) filter (where stat = 'STR') as str_points,
        sum(points) filter (where stat = 'AGI') as agi_points,
        sum(points) filter (where stat = 'VIT') as vit_points,
        sum(points) filter (where stat = 'INT') as int_points,
        sum(points) filter (where stat = 'SENSE') as sense_points
      from public.stat_allocations
      where user_id = v_user
    ) as alloc,
    (
      select
        sum(xp) filter (where category = 'fitness') as fitness,
        sum(xp) filter (where category = 'diet') as diet,
        sum(xp) filter (where category = 'life') as life
      from public.xp_events
      where user_id = v_user and occurred_on = v_today
    ) as today_cat,
    (
      select count(*) as pending
      from public.daily_logs
      where user_id = v_user and acknowledged_at is null
    ) as report,
    (
      -- Current and upcoming periods only; finished ones are history.
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'kind', s.kind,
               'start_on', s.start_on,
               'end_on', s.end_on,
               'ended_early_on', s.ended_early_on,
               'last_safe_on', public.safe_effective_end(s.end_on, s.ended_early_on)
             ) order by s.start_on) as list
      from public.safe_periods s
      where s.user_id = v_user
        and public.safe_effective_end(s.end_on, s.ended_early_on) >= v_today
    ) as periods,
    public.effective_targets(v_user, v_today) as targets;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution privileges (C1).
-- ---------------------------------------------------------------------------
revoke execute on function public.effective_rules(uuid, date) from public, anon, authenticated;
revoke execute on function public.counts_toward_core_tally(boolean, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke execute on function public.day_outcome(boolean, boolean, boolean, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.next_streak(integer, text) from public, anon, authenticated;
revoke execute on function public.earns_stone(integer, integer, integer, text)
  from public, anon, authenticated;
revoke execute on function public.stones_held(uuid) from public, anon, authenticated;
revoke execute on function public.safe_effective_end(date, date) from public, anon, authenticated;
revoke execute on function public.is_safe_on(uuid, date) from public, anon, authenticated;
revoke execute on function public.safe_period_start(timestamptz, text, text)
  from public, anon, authenticated;
revoke execute on function public.safe_period_refusal(date[], date[], date[], date, integer)
  from public, anon, authenticated;
revoke execute on function public.safe_period_refusal_for(uuid, date, integer)
  from public, anon, authenticated;
revoke execute on function public.safe_days_bookable(uuid, date) from public, anon, authenticated;
revoke execute on function public.safe_start_for(uuid) from public, anon, authenticated;
revoke execute on function public.start_safe_period(text, integer) from public, anon, authenticated;
revoke execute on function public.end_safe_period(uuid) from public, anon, authenticated;
revoke execute on function public.update_hunter_rules(text, smallint[])
  from public, anon, authenticated;

-- Re-created functions keep their existing grants, but state them again so
-- this file alone shows the full client surface it touches.
revoke execute on function public.close_days() from public, anon, authenticated;
revoke execute on function public.pending_report() from public, anon, authenticated;
revoke execute on function public.hunter_snapshot() from public, anon, authenticated;
revoke execute on function public.onboard_hunter(text, text, integer, integer, numeric)
  from public, anon, authenticated;
revoke execute on function public.update_hunter_profile(text, text, integer, integer, numeric)
  from public, anon, authenticated;

grant execute on function public.start_safe_period(text, integer) to authenticated;
grant execute on function public.end_safe_period(uuid) to authenticated;
grant execute on function public.update_hunter_rules(text, smallint[]) to authenticated;
grant execute on function public.close_days() to authenticated;
grant execute on function public.pending_report() to authenticated;
grant execute on function public.hunter_snapshot() to authenticated;
grant execute on function public.onboard_hunter(text, text, integer, integer, numeric)
  to authenticated;
grant execute on function public.update_hunter_profile(text, text, integer, integer, numeric)
  to authenticated;
