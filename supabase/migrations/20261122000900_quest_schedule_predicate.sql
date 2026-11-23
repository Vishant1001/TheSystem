-- The quest scheduling predicate, extracted so there is exactly one copy in
-- SQL, shared by close_days() and by the parity test.
--
-- The TypeScript mirror is src/game/schedule.ts. Both are driven by the same
-- vectors in src/game/testdata/schedule-vectors.json: supabase/tests/
-- quest_schedule_parity.sql is generated from that file, and the engine suite
-- reads it directly, so the two implementations cannot drift.

-- ---------------------------------------------------------------------------
-- Field-level form: easy to call with literals, which is what the parity test
-- does. Timestamps are converted to game dates with the hunter's own rollover
-- hour (C5, G7).
-- ---------------------------------------------------------------------------
create or replace function public.quest_scheduled_on(
  p_type text,
  p_schedule_days smallint[],
  p_due_on date,
  p_created_at timestamptz,
  p_archived_at timestamptz,
  p_day date,
  p_timezone text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_created_on date := public.game_date_at(p_created_at, p_timezone);
  v_archived_on date := case
    when p_archived_at is null then null
    else public.game_date_at(p_archived_at, p_timezone)
  end;
begin
  -- The quest has to have existed on that day, and not yet been archived.
  if v_created_on > p_day then
    return false;
  end if;
  if v_archived_on is not null and v_archived_on <= p_day then
    return false;
  end if;

  if p_type = 'daily' then
    if p_schedule_days is null or array_length(p_schedule_days, 1) is null then
      return false;
    end if;
    return extract(isodow from p_day)::smallint = any (p_schedule_days);
  end if;

  -- G10: a one-time quest counts only on its due day. An undated one never
  -- counts, which is why such a quest can never be core.
  return p_due_on is not null and p_due_on = p_day;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level form, for call sites that already hold a quest row.
-- ---------------------------------------------------------------------------
create or replace function public.quest_on_board(
  p_quest public.quests,
  p_day date,
  p_timezone text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.quest_scheduled_on(
    p_quest.type,
    p_quest.schedule_days,
    p_quest.due_on,
    p_quest.created_at,
    p_quest.archived_at,
    p_day,
    p_timezone
  );
$$;

-- ---------------------------------------------------------------------------
-- The overdue rule, kept beside its sibling so both sides of the parity test
-- have something to compare. Phase 1 only renders this on the client; the
-- Penalty Zone in Phase 2 is the likely first server-side caller.
-- ---------------------------------------------------------------------------
create or replace function public.quest_overdue_on(
  p_type text,
  p_due_on date,
  p_day date,
  p_is_done boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_type = 'one_time'
     and not coalesce(p_is_done, false)
     and p_due_on is not null
     and p_due_on < p_day;
$$;

revoke execute on function
  public.quest_scheduled_on(text, smallint[], date, timestamptz, timestamptz, date, text)
  from public, anon, authenticated;
revoke execute on function public.quest_overdue_on(text, date, date, boolean)
  from public, anon, authenticated;
revoke execute on function public.quest_on_board(public.quests, date, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- close_days() now tallies through the shared predicate instead of repeating
-- it inline. Everything else about the function is unchanged.
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
  v_clear_points integer := public.game_config_int('free_points_per_daily_clear');
  v_day date;
  v_processed integer := 0;
  v_more boolean := false;
  v_core_total integer;
  v_core_done integer;
  v_status text;
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

  while v_day <= v_to loop
    -- G8: bounded work per call; the client calls again while more_pending.
    if v_processed >= v_max_days then
      v_more := true;
      exit;
    end if;

    -- 1. Deferred quests: the calorie window is only judged once the day is over.
    perform public.evaluate_auto_kcal_range(v_user, v_day);

    -- 2. Tally the core quests that were scheduled for this day, through the
    --    shared predicate (the same rule src/game/schedule.ts applies).
    select
      count(*),
      count(*) filter (where public.active_completion_id(q.id, v_day) is not null)
    into v_core_total, v_core_done
    from public.quests q
    where q.user_id = v_user
      and q.is_core
      and public.quest_on_board(q, v_day, v_hunter.timezone);

    -- G6: a day with no core quests scheduled counts as cleared, but it pays
    -- no free point - otherwise archiving every core quest would farm points.
    v_status := case when v_core_done >= v_core_total then 'cleared' else 'failed' end;

    -- 3. Write the day log.
    insert into public.daily_logs (user_id, log_date, status, core_total, core_done)
    values (v_user, v_day, v_status, v_core_total, v_core_done)
    on conflict (user_id, log_date) do update
      set status = excluded.status,
          core_total = excluded.core_total,
          core_done = excluded.core_done,
          closed_at = now();

    -- 4. Award the daily clear. Never twice for the same day.
    v_free_points := 0;
    if v_status = 'cleared' and v_core_total > 0 then
      if not exists (
        select 1 from public.xp_events
        where user_id = v_user and occurred_on = v_day and source_type = 'daily_clear'
      ) then
        insert into public.xp_events (user_id, occurred_on, source_type, free_points)
        values (v_user, v_day, 'daily_clear', v_clear_points);
        v_free_points := v_clear_points;
      end if;
    end if;

    -- 5. ---------------------------------------------------------------
    --    PENALTY ZONE HOOK - Phase 2.
    --    A failed day will raise a penalty here (XP debt, Weakened debuff,
    --    Redemption Stones). Deliberately a no-op in Phase 1: insert the
    --    penalty step at this point, after the day log exists and before
    --    last_closed_on advances, and nothing above needs rewriting.
    --    ---------------------------------------------------------------

    -- 6. Advance the watermark.
    update public.hunters set last_closed_on = v_day where user_id = v_user;

    select coalesce(sum(xp), 0) into v_day_xp
    from public.xp_events
    where user_id = v_user and occurred_on = v_day;

    v_days := v_days || jsonb_build_object(
      'log_date', v_day,
      'status', v_status,
      'core_total', v_core_total,
      'core_done', v_core_done,
      'xp_gained', v_day_xp,
      'free_points_gained', v_free_points
    );

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
-- auto_quest_for() uses the same predicate, so a quest that is off the board
-- on a given day is never auto-evaluated for it either.
-- ---------------------------------------------------------------------------
create or replace function public.auto_quest_for(
  p_user uuid,
  p_tracking text,
  p_day date
)
returns public.quests
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quest public.quests;
  v_timezone text;
begin
  select timezone into v_timezone from public.hunters where user_id = p_user;
  if v_timezone is null then
    return v_quest;
  end if;

  select q.* into v_quest
  from public.quests q
  where q.user_id = p_user
    and q.tracking = p_tracking
    and public.quest_on_board(q, p_day, v_timezone)
  limit 1;

  return v_quest;
end;
$$;
