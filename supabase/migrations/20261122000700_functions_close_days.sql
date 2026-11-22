-- close_days() and the System Report (brief 6.4, ADR-7, G6, G8, G9).
--
-- Lazy day close: the client calls this on load and it idempotently closes
-- every unclosed game day before today. Safe to call repeatedly.

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

    -- 2. Tally the core quests that were actually scheduled for this day.
    --    Quest lifetimes are compared in game dates (G7), and a one-time quest
    --    counts only on its due day (G10).
    select
      count(*),
      count(*) filter (where public.active_completion_id(q.id, v_day) is not null)
    into v_core_total, v_core_done
    from public.quests q
    where q.user_id = v_user
      and q.is_core
      and public.game_date_at(q.created_at, v_hunter.timezone) <= v_day
      and (q.archived_at is null or public.game_date_at(q.archived_at, v_hunter.timezone) > v_day)
      and (
        (q.type = 'daily' and extract(isodow from v_day)::smallint = any (q.schedule_days))
        or (q.type = 'one_time' and q.due_on = v_day)
      );

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
-- G9: the report survives a refresh. These are the closed days the hunter has
-- not acknowledged yet, newest first.
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
      'free_points_gained', coalesce(x.free_points, 0)
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

create or replace function public.acknowledge_report()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_count integer;
begin
  update public.daily_logs
  set acknowledged_at = now()
  where user_id = v_user and acknowledged_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object('acknowledged', v_count);
end;
$$;

revoke execute on function public.close_days() from public, anon, authenticated;
revoke execute on function public.pending_report() from public, anon, authenticated;
revoke execute on function public.acknowledge_report() from public, anon, authenticated;

grant execute on function public.close_days() to authenticated;
grant execute on function public.pending_report() to authenticated;
grant execute on function public.acknowledge_report() to authenticated;
