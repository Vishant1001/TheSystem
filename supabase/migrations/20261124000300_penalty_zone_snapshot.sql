-- Phase 2, Step 2.3: snapshot and privileges for the Penalty Zone.
--
-- hunter_snapshot gains the penalty block and an `attention` block, so the
-- client can raise Report -> Penalty -> Level-up after ANY refresh - including
-- one that follows an award whose catch-up closed days implicitly.

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
  v_penalty public.penalties;
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
  v_penalty := public.open_penalty(v_user);

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
    ),
    -- Phase 2 (2.3): the open penalty, the choice preview while one is
    -- pending, today's Weakened stat, and the gates the client must show in
    -- order after any refresh: Report -> Penalty -> Level-up.
    'penalty', public.penalty_json(v_penalty),
    'penalty_options', public.penalty_options(v_penalty),
    'weakened_stat_today', public.weakened_stat_on(v_user, v_today),
    'attention', jsonb_build_object(
      'report_days', coalesce(report.pending, 0),
      'penalty_needs_choice', coalesce(v_penalty.state = 'pending_choice', false),
      'penalty_needs_acknowledgement',
        coalesce(v_penalty.state <> 'pending_choice' and v_penalty.acknowledged_at is null, false)
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
        public.capped_xp_on(v_user, v_today, 'fitness') as fitness,
        public.capped_xp_on(v_user, v_today, 'diet') as diet,
        public.capped_xp_on(v_user, v_today, 'life') as life
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


-- ===========================================================================
-- Execution privileges (C1). Every new helper is internal; three new RPCs.
-- ===========================================================================
revoke execute on function public.xp_to_next(integer) from public, anon, authenticated;
revoke execute on function public.level_from_total_xp(bigint) from public, anon, authenticated;
revoke execute on function public.hunter_level(uuid) from public, anon, authenticated;
revoke execute on function public.debt_amount(integer, integer) from public, anon, authenticated;
revoke execute on function public.debt_repayment(integer, integer) from public, anon, authenticated;
revoke execute on function public.trial_category(text[]) from public, anon, authenticated;
revoke execute on function public.weakened_stat_for(text[]) from public, anon, authenticated;
revoke execute on function public.failed_day_action(text, boolean, text) from public, anon, authenticated;
revoke execute on function public.penalty_transition_allowed(text, text, text)
  from public, anon, authenticated;
revoke execute on function public.penalties_guard_transition() from public, anon, authenticated;
revoke execute on function public.split_by_weight(integer, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.compute_award(text, integer, integer, jsonb, text, integer)
  from public, anon, authenticated;
revoke execute on function public.capped_xp_on(uuid, date, text) from public, anon, authenticated;
revoke execute on function public.open_penalty(uuid) from public, anon, authenticated;
revoke execute on function public.penalty_debt_remaining(uuid) from public, anon, authenticated;
revoke execute on function public.weakened_stat_on(uuid, date) from public, anon, authenticated;
revoke execute on function public.apply_award(uuid, date, text, uuid, text, integer, jsonb, integer, uuid)
  from public, anon, authenticated;
revoke execute on function public.reverse_award(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.award_quest_completion(uuid, public.quests, date, numeric)
  from public, anon, authenticated;
revoke execute on function public.reverse_quest_completion(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.start_trial(uuid) from public, anon, authenticated;
revoke execute on function public.start_debt(uuid, integer, boolean) from public, anon, authenticated;
revoke execute on function public.penalty_on_failed_day(uuid, date, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.expire_trials(uuid) from public, anon, authenticated;
revoke execute on function public.close_days_for(uuid) from public, anon, authenticated;
revoke execute on function public.catch_up_days(uuid) from public, anon, authenticated;
revoke execute on function public.penalty_json(public.penalties) from public, anon, authenticated;
revoke execute on function public.penalty_options(public.penalties) from public, anon, authenticated;
revoke execute on function public.clear_trial(uuid, public.quests, numeric) from public, anon, authenticated;
revoke execute on function public.evaluate_food_trial(uuid) from public, anon, authenticated;
revoke execute on function public.quests_guard_immutable() from public, anon, authenticated;

revoke execute on function public.choose_penalty(text) from public, anon, authenticated;
revoke execute on function public.acknowledge_penalty() from public, anon, authenticated;
revoke execute on function public.redeem_penalty(uuid) from public, anon, authenticated;
revoke execute on function public.close_days() from public, anon, authenticated;
revoke execute on function public.hunter_snapshot() from public, anon, authenticated;
revoke execute on function public.complete_quest(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.undo_completion(uuid) from public, anon, authenticated;
revoke execute on function public.log_food(text, integer, numeric) from public, anon, authenticated;
revoke execute on function public.delete_food(uuid) from public, anon, authenticated;
revoke execute on function public.log_workout(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.delete_workout(uuid) from public, anon, authenticated;

grant execute on function public.choose_penalty(text) to authenticated;
grant execute on function public.acknowledge_penalty() to authenticated;
grant execute on function public.redeem_penalty(uuid) to authenticated;
grant execute on function public.close_days() to authenticated;
grant execute on function public.hunter_snapshot() to authenticated;
grant execute on function public.complete_quest(uuid, numeric) to authenticated;
grant execute on function public.undo_completion(uuid) to authenticated;
grant execute on function public.log_food(text, integer, numeric) to authenticated;
grant execute on function public.delete_food(uuid) to authenticated;
grant execute on function public.log_workout(text, text, jsonb) to authenticated;
grant execute on function public.delete_workout(uuid) to authenticated;
