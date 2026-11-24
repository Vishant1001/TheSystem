-- Phase 2, Step 2.3: Penalty Zone - functions (brief 3.3 - 3.6, section 6).
--
-- Pure twins of src/game (parity-tested by supabase/tests/penalty_parity.sql):
--   xp_to_next, level_from_total_xp     <- levels.ts (ADR-4 as amended)
--   debt_amount, debt_repayment          <- penalty.ts
--   trial_category, weakened_stat_for    <- penalty.ts
--   failed_day_action, penalty_transition_allowed <- penalty.ts
--   compute_award                        <- award.ts
--
-- Section 6: every XP-granting path goes through apply_award(), and every
-- reversal through reverse_award(). Nothing else inserts into xp_events.
--
-- Step 2.2 review: every RPC that can award or reverse XP first closes any
-- pending game days (catch_up_days), so an award can never land on a new day
-- before the previous day's penalty exists.

-- ===========================================================================
-- Level curve (ADR-4 amended: SQL may read it; TS stays the reference).
-- ===========================================================================
create or replace function public.xp_to_next(p_level integer)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_curve jsonb := public.game_config_value('level_curve');
  v_round integer := (v_curve ->> 'roundTo')::integer;
begin
  if p_level is null
     or p_level < (v_curve ->> 'startLevel')::integer
     or p_level >= (v_curve ->> 'maxLevel')::integer then
    raise exception 'LEVEL_OUT_OF_RANGE: %', p_level;
  end if;
  -- numeric round() is half away from zero; the value is positive, so this is
  -- half up (G5), exactly like Math.round in levels.ts.
  return (round(
    ((v_curve ->> 'base')::numeric
      + (v_curve ->> 'coefficient')::numeric * power(p_level::numeric, (v_curve ->> 'exponent')::numeric))
    / v_round
  ) * v_round)::integer;
end;
$$;

create or replace function public.level_from_total_xp(p_total_xp bigint)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_curve jsonb := public.game_config_value('level_curve');
  v_level integer := (v_curve ->> 'startLevel')::integer;
  v_max integer := (v_curve ->> 'maxLevel')::integer;
  v_remaining bigint := greatest(0, coalesce(p_total_xp, 0));
  v_needed integer;
begin
  while v_level < v_max loop
    v_needed := public.xp_to_next(v_level);
    exit when v_remaining < v_needed;
    v_remaining := v_remaining - v_needed;
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;

create or replace function public.hunter_level(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.level_from_total_xp(coalesce(sum(xp), 0))
  from public.xp_events
  where user_id = p_user;
$$;

-- ===========================================================================
-- Debt (brief 3.4).
-- ===========================================================================
create or replace function public.debt_amount(p_rate_percent integer, p_level integer)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max integer := (public.game_config_value('level_curve') ->> 'maxLevel')::integer;
  v_step integer;
begin
  if p_rate_percent is null or p_rate_percent < 0 or p_rate_percent > 100 then
    raise exception 'INVALID_DEBT_RATE: %', p_rate_percent;
  end if;
  -- At the max level there is no next level: the last real step is used.
  v_step := public.xp_to_next(least(p_level, v_max - 1));
  -- round(rate x step / 100), half up, in exact integer arithmetic.
  return (2 * p_rate_percent * v_step + 100) / 200;
end;
$$;

create or replace function public.debt_repayment(p_award_xp integer, p_debt_remaining integer)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(p_award_xp, 0) <= 0 or coalesce(p_debt_remaining, 0) <= 0 then
    return 0;
  end if;
  return least(
    p_award_xp / (public.game_config_value('penalty') ->> 'debtRepaymentDivisor')::integer,
    p_debt_remaining
  );
end;
$$;

-- ===========================================================================
-- Penalty selection and state machine (brief 3.3, 3.4, section 5).
-- ===========================================================================
create or replace function public.trial_category(p_categories text[])
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order jsonb := public.game_config_value('penalty') -> 'categoryOrder';
  v_best text;
begin
  -- Most common; ties broken by the configured order (fitness, diet, life).
  select c.value into v_best
  from jsonb_array_elements_text(v_order) with ordinality as c(value, ord)
  where (select count(*) from unnest(p_categories) m where m = c.value) > 0
  order by (select count(*) from unnest(p_categories) m where m = c.value) desc, c.ord
  limit 1;
  if v_best is null then
    raise exception 'NO_MISSED_QUESTS';
  end if;
  return v_best;
end;
$$;

create or replace function public.weakened_stat_for(p_tags text[])
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_best text;
begin
  -- Every tag counts; ties broken by stat order (STR, AGI, VIT, INT, SENSE).
  select s.value into v_best
  from jsonb_array_elements_text(public.game_config_value('stat_order')) with ordinality as s(value, ord)
  where (select count(*) from unnest(p_tags) t where t = s.value) > 0
  order by (select count(*) from unnest(p_tags) t where t = s.value) desc, s.ord
  limit 1;
  if v_best is null then
    raise exception 'NO_MISSED_QUESTS';
  end if;
  return v_best;
end;
$$;

create or replace function public.failed_day_action(
  p_open_state text,
  p_open_escalated boolean,
  p_mode text,
  out action text,
  out state text,
  out debt_rate_percent integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rates jsonb := public.game_config_value('penalty') -> 'debtRatePercent';
begin
  if p_open_state is null
     or p_open_state not in ('pending_choice', 'trial_active', 'debt_active', 'weakened_active') then
    action := 'create';
    state := case p_mode
               when 'lenient' then 'debt_active'
               when 'hardcore' then 'trial_active'
               else 'pending_choice'
             end;
    debt_rate_percent := case when p_mode = 'lenient' then (v_rates ->> 'lenient')::integer end;
  elsif not p_open_escalated and p_open_state in ('pending_choice', 'trial_active') then
    action := 'escalate';
    state := 'debt_active';
    debt_rate_percent := (v_rates ->> 'escalated')::integer;
  else
    action := 'none';
  end if;
end;
$$;

create or replace function public.penalty_transition_allowed(
  p_from text,
  p_to text,
  p_choice text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_from
           when 'pending_choice' then p_to in ('trial_active', 'debt_active', 'weakened_active', 'redeemed')
           when 'trial_active' then p_to in ('cleared', 'debt_active', 'redeemed')
           when 'debt_active' then p_to in ('cleared', 'redeemed')
           when 'weakened_active' then p_to in ('cleared', 'redeemed')
           -- Only a debt reopens, when a reversal takes back a repayment.
           -- A redeemed penalty never reopens.
           when 'cleared' then p_to = 'debt_active' and p_choice = 'debt'
           else false
         end;
$$;

create or replace function public.penalties_guard_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.trigger_day is distinct from old.trigger_day
     or new.missed_quests is distinct from old.missed_quests then
    raise exception 'PENALTY_IMMUTABLE';
  end if;
  if new.state is distinct from old.state
     and not public.penalty_transition_allowed(old.state, new.state, old.choice) then
    raise exception 'INVALID_PENALTY_TRANSITION: % -> %', old.state, new.state;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger penalties_guard_transition
  before update on public.penalties
  for each row
  execute function public.penalties_guard_transition();

-- ===========================================================================
-- Quests: trials are fully immutable to clients (step 0, X3).
-- current_user is the caller for this invoker trigger: a client session
-- runs as authenticated, the RPCs run as the function owner.
-- ===========================================================================
create or replace function public.quests_guard_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'QUEST_OWNER_IMMUTABLE';
  end if;
  if new.tracking is distinct from old.tracking then
    raise exception 'QUEST_TRACKING_IMMUTABLE';
  end if;
  if new.type is distinct from old.type then
    raise exception 'QUEST_TYPE_IMMUTABLE';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'QUEST_CREATED_AT_IMMUTABLE';
  end if;
  if new.penalty_id is distinct from old.penalty_id then
    raise exception 'QUEST_PENALTY_IMMUTABLE';
  end if;
  if current_user in ('authenticated', 'anon') and old.type = 'trial' then
    raise exception 'TRIAL_IMMUTABLE';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- The award pipeline (brief section 6). compute_award is the pure twin of
-- computeAward in src/game/award.ts.
-- ===========================================================================
create or replace function public.split_by_weight(
  p_total integer,
  p_stats jsonb,
  p_minimum integer default 0
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_split jsonb := '{"STR":0,"AGI":0,"VIT":0,"INT":0,"SENSE":0}'::jsonb;
  v_total integer := greatest(0, coalesce(p_total, 0));
  v_weight_sum integer;
  v_given integer := 0;
  v_share integer;
  v_first text;
  v_entry jsonb;
begin
  if p_stats is null or jsonb_array_length(p_stats) = 0 then
    return v_split;
  end if;
  select sum((e ->> 'weight')::integer) into v_weight_sum from jsonb_array_elements(p_stats) e;
  v_first := p_stats -> 0 ->> 'stat';

  for v_entry in select * from jsonb_array_elements(p_stats) loop
    v_share := (v_total * (v_entry ->> 'weight')::integer) / v_weight_sum;
    v_split := jsonb_set(v_split, array[v_entry ->> 'stat'], to_jsonb(v_share));
    v_given := v_given + v_share;
  end loop;
  v_split := jsonb_set(v_split, array[v_first],
    to_jsonb((v_split ->> v_first)::integer + v_total - v_given));

  if p_minimum > 0 then
    for v_entry in select * from jsonb_array_elements(p_stats) loop
      v_split := jsonb_set(v_split, array[v_entry ->> 'stat'],
        to_jsonb(greatest((v_split ->> (v_entry ->> 'stat'))::integer, p_minimum)));
    end loop;
  end if;
  return v_split;
end;
$$;

create or replace function public.compute_award(
  p_source text,
  p_full_xp integer,
  p_cap_room integer,
  p_stats jsonb,
  p_weakened_stat text,
  p_debt_remaining integer,
  out xp integer,
  out capped boolean,
  out stat_xp jsonb,
  out weakened boolean,
  out repayment integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rule jsonb := public.game_config_value('award_sources') -> p_source;
  v_divisor integer := public.game_config_int('stat_xp_divisor');
  v_even jsonb;
  v_full_stat integer;
  v_total integer;
begin
  if v_rule is null then
    raise exception 'UNKNOWN_AWARD_SOURCE: %', p_source;
  end if;
  if p_full_xp is null or p_full_xp < 0 then
    raise exception 'INVALID_AWARD_XP: %', p_full_xp;
  end if;

  -- 2. Category cap.
  xp := case when (v_rule ->> 'capped')::boolean
             then least(p_full_xp, greatest(0, coalesce(p_cap_room, 0)))
             else p_full_xp end;
  capped := xp < p_full_xp;

  -- Stat XP per source (award.ts statXpFor).
  if p_source in ('quest', 'trial') then
    select coalesce(jsonb_agg(jsonb_build_object('stat', e ->> 'stat', 'weight', 1)), '[]'::jsonb)
      into v_even
    from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) e;
    v_full_stat := p_full_xp / v_divisor;
    v_total := case when p_full_xp = 0 then 0
                    when capped then (v_full_stat * xp) / p_full_xp
                    else v_full_stat end;
    stat_xp := public.split_by_weight(v_total, v_even,
      case when capped then 0 else public.game_config_int('min_stat_xp_per_tag') end);
  elsif p_source in ('workout', 'boss') then
    stat_xp := public.split_by_weight(xp / v_divisor, p_stats);
  elsif p_source = 'pr' then
    stat_xp := public.split_by_weight(
      case when xp > 0 then (public.game_config_value('gym') -> 'pr' ->> 'statXp')::integer else 0 end,
      p_stats);
  else
    stat_xp := public.split_by_weight(0, '[]'::jsonb);
  end if;

  -- 3. Weakened.
  weakened := false;
  if p_weakened_stat is not null and (stat_xp ->> p_weakened_stat)::integer > 0 then
    stat_xp := jsonb_set(stat_xp, array[p_weakened_stat], '0'::jsonb);
    weakened := true;
  end if;

  -- 4. Debt repayment.
  repayment := case when (v_rule ->> 'repaysDebt')::boolean
                    then public.debt_repayment(xp, p_debt_remaining) else 0 end;
end;
$$;

-- Cap room counts only capped sources (step 0, X2): quest and workout awards
-- and their reversals. PR, boss, trial and repayment events never use it.
create or replace function public.capped_xp_on(p_user uuid, p_day date, p_category text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(e.xp), 0)::integer
  from public.xp_events e
  left join public.xp_events original on original.id = e.reverses_event_id
  where e.user_id = p_user
    and e.occurred_on = p_day
    and e.category = p_category
    and (e.source_type in ('quest', 'workout')
         or (e.source_type = 'reversal' and original.source_type in ('quest', 'workout')));
$$;

-- The newest open penalty. The unique index allows one; "newest" is the
-- defensive guard agreed at step 2.2 review.
create or replace function public.open_penalty(p_user uuid)
returns public.penalties
language sql
stable
security definer
set search_path = public
as $$
  select * from public.penalties
  where user_id = p_user
    and state in ('pending_choice', 'trial_active', 'debt_active', 'weakened_active')
  order by created_at desc
  limit 1;
$$;

-- Derived, never stored (ADR-1): amount + repayments (negative) + their
-- reversals (positive).
create or replace function public.penalty_debt_remaining(p_penalty_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, least(p.debt_amount, p.debt_amount + coalesce((
    select sum(e.xp)
    from public.xp_events e
    left join public.xp_events original on original.id = e.reverses_event_id
    where e.penalty_id = p.id
      and (e.source_type = 'debt_repayment'
           or (e.source_type = 'reversal' and original.source_type = 'debt_repayment'))
  ), 0)))::integer
  from public.penalties p
  where p.id = p_penalty_id;
$$;

create or replace function public.weakened_stat_on(p_user uuid, p_day date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select weakened_stat from public.penalties
  where user_id = p_user
    and state = 'weakened_active'
    and p_day between weakened_from and weakened_until
  order by created_at desc
  limit 1;
$$;

-- The single award path. Writes the award event and, while debt remains, its
-- linked repayment; clears the debt when it reaches zero.
create or replace function public.apply_award(
  p_user uuid,
  p_day date,
  p_source text,
  p_source_id uuid,
  p_category text,
  p_full_xp integer,
  p_stats jsonb,
  p_free_points integer default 0,
  p_penalty_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rule jsonb := public.game_config_value('award_sources') -> p_source;
  v_cap_room integer := 0;
  v_open public.penalties;
  v_debt_remaining integer := 0;
  v_award record;
  v_event_id uuid;
  v_repayment_id uuid;
  v_debt_cleared boolean := false;
begin
  if (v_rule ->> 'capped')::boolean then
    v_cap_room := public.daily_cap_for(p_category) - public.capped_xp_on(p_user, p_day, p_category);
  end if;

  v_open := public.open_penalty(p_user);
  if v_open.state = 'debt_active' then
    v_debt_remaining := public.penalty_debt_remaining(v_open.id);
  end if;

  select * into v_award
  from public.compute_award(
    p_source, p_full_xp, v_cap_room, p_stats,
    public.weakened_stat_on(p_user, p_day), v_debt_remaining);

  insert into public.xp_events (
    user_id, occurred_on, source_type, source_id, category,
    xp, str_xp, agi_xp, vit_xp, int_xp, sense_xp, free_points,
    capped, weakened, penalty_id
  )
  values (
    p_user, p_day, p_source, p_source_id, p_category,
    v_award.xp,
    (v_award.stat_xp ->> 'STR')::integer, (v_award.stat_xp ->> 'AGI')::integer,
    (v_award.stat_xp ->> 'VIT')::integer, (v_award.stat_xp ->> 'INT')::integer,
    (v_award.stat_xp ->> 'SENSE')::integer,
    coalesce(p_free_points, 0), v_award.capped, v_award.weakened, p_penalty_id
  )
  returning id into v_event_id;

  if v_award.repayment > 0 then
    insert into public.xp_events (
      user_id, occurred_on, source_type, source_id, xp, related_event_id, penalty_id
    )
    values (p_user, p_day, 'debt_repayment', p_source_id, -v_award.repayment, v_event_id, v_open.id)
    returning id into v_repayment_id;

    if public.penalty_debt_remaining(v_open.id) = 0 then
      update public.penalties
      set state = 'cleared', resolved_at = now()
      where id = v_open.id;
      v_debt_cleared := true;
    end if;
  end if;

  return jsonb_build_object(
    'event_id', v_event_id,
    'source', p_source,
    'xp', v_award.xp,
    'full_xp', p_full_xp,
    'capped', v_award.capped,
    'stat_xp', v_award.stat_xp,
    'weakened', v_award.weakened,
    'free_points', coalesce(p_free_points, 0),
    'debt_repayment', v_award.repayment,
    'repayment_event_id', v_repayment_id,
    'debt_cleared', v_debt_cleared
  );
end;
$$;

-- The single reversal path: negates the award and every repayment linked to
-- it. A cleared debt that gets a repayment back reopens; a redeemed one never
-- does (step 2.2 review).
create or replace function public.reverse_award(p_user uuid, p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_event public.xp_events;
  v_repayment public.xp_events;
  v_penalty public.penalties;
  v_reversal_id uuid;
  v_reopened boolean := false;
begin
  select * into v_event from public.xp_events
  where id = p_event_id and user_id = p_user;
  if not found or exists (select 1 from public.xp_events where reverses_event_id = p_event_id) then
    return jsonb_build_object('reversal_event_id', null, 'xp_removed', 0);
  end if;

  insert into public.xp_events (
    user_id, occurred_on, source_type, source_id, category,
    xp, str_xp, agi_xp, vit_xp, int_xp, sense_xp, free_points,
    capped, reverses_event_id, penalty_id
  )
  values (
    p_user, v_event.occurred_on, 'reversal', v_event.source_id, v_event.category,
    -v_event.xp, -v_event.str_xp, -v_event.agi_xp, -v_event.vit_xp,
    -v_event.int_xp, -v_event.sense_xp, -v_event.free_points,
    false, v_event.id, v_event.penalty_id
  )
  returning id into v_reversal_id;

  for v_repayment in
    select r.* from public.xp_events r
    where r.related_event_id = v_event.id
      and r.source_type = 'debt_repayment'
      and not exists (select 1 from public.xp_events x where x.reverses_event_id = r.id)
  loop
    insert into public.xp_events (
      user_id, occurred_on, source_type, source_id, xp, reverses_event_id, penalty_id
    )
    values (
      p_user, v_repayment.occurred_on, 'reversal', v_repayment.source_id,
      -v_repayment.xp, v_repayment.id, v_repayment.penalty_id
    );

    select * into v_penalty from public.penalties where id = v_repayment.penalty_id for update;
    if v_penalty.state = 'cleared' and v_penalty.choice = 'debt'
       and public.penalty_debt_remaining(v_penalty.id) > 0 then
      update public.penalties
      set state = 'debt_active', resolved_at = null
      where id = v_penalty.id;
      v_reopened := true;
    end if;
  end loop;

  return jsonb_build_object(
    'reversal_event_id', v_reversal_id,
    'xp_removed', v_event.xp,
    'debt_reopened', v_reopened
  );
end;
$$;

-- ===========================================================================
-- Quest awards now run through the pipeline. Same signatures and replies as
-- Phase 1, plus the pipeline's fields.
-- ===========================================================================
create or replace function public.award_quest_completion(
  p_user uuid,
  p_quest public.quests,
  p_day date,
  p_value numeric default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_completion_id uuid;
  v_source text := case when p_quest.type = 'trial' then 'trial' else 'quest' end;
  v_full_xp integer;
  v_stats jsonb;
  v_award jsonb;
begin
  v_full_xp := case
    when v_source = 'trial' then (public.game_config_value('penalty') -> 'trial' ->> 'xp')::integer
    else public.quest_xp_for(p_quest.difficulty)
  end;
  select jsonb_agg(jsonb_build_object('stat', tag, 'weight', 1) order by ord)
    into v_stats
  from unnest(p_quest.stat_tags) with ordinality as t(tag, ord);

  insert into public.quest_completions (user_id, quest_id, occurred_on, value)
  values (p_user, p_quest.id, p_day, p_value)
  returning id into v_completion_id;

  v_award := public.apply_award(
    p_user, p_day, v_source, v_completion_id, p_quest.category, v_full_xp, v_stats,
    0, p_quest.penalty_id);

  return v_award || jsonb_build_object(
    'completion_id', v_completion_id,
    'quest_id', p_quest.id,
    'quest_title', p_quest.title,
    'occurred_on', p_day,
    'category', p_quest.category
  );
end;
$$;

create or replace function public.reverse_quest_completion(
  p_user uuid,
  p_completion_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_completion public.quest_completions;
  v_event_id uuid;
  v_result jsonb := '{}'::jsonb;
begin
  select * into v_completion
  from public.quest_completions
  where id = p_completion_id and user_id = p_user and reversed_at is null
  for update;
  if not found then
    raise exception 'COMPLETION_NOT_FOUND';
  end if;

  update public.quest_completions set reversed_at = now() where id = v_completion.id;

  select id into v_event_id
  from public.xp_events
  where user_id = p_user and source_type in ('quest', 'trial') and source_id = v_completion.id;

  if v_event_id is not null then
    v_result := public.reverse_award(p_user, v_event_id);
  end if;

  return jsonb_build_object(
    'completion_id', v_completion.id,
    'quest_id', v_completion.quest_id,
    'occurred_on', v_completion.occurred_on,
    'reversal_event_id', v_result -> 'reversal_event_id',
    'xp_removed', coalesce((v_result ->> 'xp_removed')::integer, 0),
    'debt_reopened', coalesce((v_result ->> 'debt_reopened')::boolean, false)
  );
end;
$$;

-- ===========================================================================
-- Penalty lifecycle helpers (all internal).
-- ===========================================================================
create or replace function public.start_trial(p_penalty_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_penalty public.penalties;
  v_category text;
  v_template jsonb;
  v_quest_id uuid;
begin
  select * into v_penalty from public.penalties where id = p_penalty_id for update;
  v_category := public.trial_category(array(
    select q ->> 'category' from jsonb_array_elements(v_penalty.missed_quests) q));
  v_template := public.game_config_value('penalty') -> 'trial' -> 'templates' -> v_category;

  insert into public.quests (
    user_id, title, type, category, tracking, goal_type, target_value, unit,
    stat_tags, difficulty, is_core, sort_order, penalty_id
  )
  values (
    v_penalty.user_id,
    v_template ->> 'title',
    'trial',
    v_category,
    v_template ->> 'tracking',
    v_template ->> 'goalType',
    (v_template ->> 'target')::numeric,
    case v_template ->> 'goalType' when 'duration' then 'min' else 'entries' end,
    array(select jsonb_array_elements_text(v_template -> 'statTags')),
    -- Unused: trial XP comes from config, never from difficulty.
    'E',
    false,
    -1,
    v_penalty.id
  )
  returning id into v_quest_id;

  update public.penalties
  set state = 'trial_active',
      choice = 'trial',
      trial_category = v_category,
      trial_quest_id = v_quest_id,
      chosen_at = now(),
      trial_deadline = now() + make_interval(
        hours => (public.game_config_value('penalty') -> 'trial' ->> 'deadlineHours')::integer)
  where id = v_penalty.id;
end;
$$;

create or replace function public.start_debt(p_penalty_id uuid, p_rate_percent integer, p_escalated boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_penalty public.penalties;
  v_level integer;
begin
  select * into v_penalty from public.penalties where id = p_penalty_id for update;
  -- Debt is sized from the level at this moment and never subtracts XP
  -- itself, so no level can be lost (brief 3.4).
  v_level := public.hunter_level(v_penalty.user_id);

  if v_penalty.trial_quest_id is not null then
    update public.quests set archived_at = now()
    where id = v_penalty.trial_quest_id and archived_at is null;
  end if;

  update public.penalties
  set state = 'debt_active',
      choice = 'debt',
      escalated = escalated or p_escalated,
      chosen_at = coalesce(chosen_at, now()),
      debt_rate_percent = p_rate_percent,
      debt_level = v_level,
      debt_amount = public.debt_amount(p_rate_percent, v_level),
      -- Escalation is news: the hunter must see it.
      acknowledged_at = case when p_escalated then null else acknowledged_at end
  where id = v_penalty.id;
end;
$$;

-- close_days step 5 (brief 3.3).
create or replace function public.penalty_on_failed_day(
  p_user uuid,
  p_day date,
  p_mode text,
  p_missed jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_open public.penalties := public.open_penalty(p_user);
  v_action record;
  v_id uuid;
begin
  select * into v_action from public.failed_day_action(v_open.state, v_open.escalated, p_mode);

  if v_action.action = 'create' then
    insert into public.penalties (user_id, trigger_day, mode, state, missed_quests)
    values (p_user, p_day, p_mode, 'pending_choice', p_missed)
    returning id into v_id;

    if v_action.state = 'debt_active' then
      perform public.start_debt(v_id, v_action.debt_rate_percent, false);
    elsif v_action.state = 'trial_active' then
      perform public.start_trial(v_id);
    end if;
    return jsonb_build_object('action', 'create', 'penalty_id', v_id);
  elsif v_action.action = 'escalate' then
    perform public.start_debt(v_open.id, v_action.debt_rate_percent, true);
    return jsonb_build_object('action', 'escalate', 'penalty_id', v_open.id);
  end if;
  return jsonb_build_object('action', 'none', 'penalty_id', v_open.id);
end;
$$;

-- Lazy trial deadline (brief 3.4, ADR-7): an expired trial escalates.
create or replace function public.expire_trials(p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_penalty public.penalties;
  v_count integer := 0;
begin
  for v_penalty in
    select * from public.penalties
    where user_id = p_user and state = 'trial_active' and trial_deadline <= now()
  loop
    perform public.start_debt(
      v_penalty.id,
      (public.game_config_value('penalty') -> 'debtRatePercent' ->> 'escalated')::integer,
      true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ===========================================================================
-- close_days: the Phase 2 day close, as an internal function so the award
-- RPCs can run it too.
-- ===========================================================================
create or replace function public.close_days_for(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
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
  v_missed jsonb;
  v_outcome record;
  v_streak_before integer;
  v_streak integer;
  v_stone boolean;
  v_free_points integer;
  v_penalty jsonb;
  v_day_xp integer;
  v_days jsonb := '[]'::jsonb;
begin
  -- 6.4: lock the hunter row so two concurrent calls cannot close the same day.
  select * into v_hunter from public.hunters where user_id = p_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  -- Lazy deadline check before anything else (ADR-7).
  perform public.expire_trials(p_user);

  v_today := public.game_today_for(p_user);
  v_from := coalesce(v_hunter.last_closed_on + 1, v_hunter.created_on);
  v_to := v_today - 1;
  v_day := v_from;

  select coalesce(
    (select d.streak from public.daily_logs d where d.user_id = p_user and d.log_date = v_from - 1),
    0
  ) into v_streak_before;

  while v_day <= v_to loop
    if v_processed >= v_max_days then
      v_more := true;
      exit;
    end if;

    -- 1. Deferred quests.
    perform public.evaluate_auto_kcal_range(p_user, v_day);

    -- 2. Rules, rest and safe for that day; the tally.
    select * into v_rules from public.effective_rules(p_user, v_day);
    v_phase2 := v_day >= v_hunter.rules_from;
    v_rest := v_phase2 and extract(isodow from v_day)::smallint = any (v_rules.rest_days);
    v_safe := v_phase2 and public.is_safe_on(p_user, v_day);

    select
      count(*),
      count(*) filter (where public.active_completion_id(q.id, v_day) is not null),
      coalesce(jsonb_agg(jsonb_build_object(
          'quest_id', q.id, 'title', q.title, 'category', q.category, 'stat_tags', to_jsonb(q.stat_tags)
        ) order by q.sort_order, q.created_at)
        filter (where public.active_completion_id(q.id, v_day) is null), '[]'::jsonb)
    into v_core_total, v_core_done, v_missed
    from public.quests q
    where q.user_id = p_user
      and q.is_core
      and public.counts_toward_core_tally(
            q.is_core, q.on_rest_days, public.quest_on_board(q, v_day, v_hunter.timezone), v_rest);

    select * into v_outcome
    from public.day_outcome(v_phase2, v_rest, v_safe, v_core_total, v_core_done);
    v_streak := public.next_streak(v_streak_before, v_outcome.streak_effect);

    -- 3. Day log.
    insert into public.daily_logs (user_id, log_date, status, core_total, core_done, streak)
    values (p_user, v_day, v_outcome.status, v_core_total, v_core_done, v_streak)
    on conflict (user_id, log_date) do update
      set status = excluded.status,
          core_total = excluded.core_total,
          core_done = excluded.core_done,
          streak = excluded.streak,
          closed_at = now();

    -- 4. Daily clear, through the award pipeline (section 6).
    v_free_points := 0;
    if v_outcome.free_points > 0 and not exists (
      select 1 from public.xp_events
      where user_id = p_user and occurred_on = v_day and source_type = 'daily_clear'
    ) then
      perform public.apply_award(
        p_user, v_day, 'daily_clear', null, null, 0, '[]'::jsonb, v_outcome.free_points);
      v_free_points := v_outcome.free_points;
    end if;

    -- 4b. Redemption Stones.
    v_stone := v_phase2 and public.earns_stone(
      v_streak_before, v_streak, public.stones_held(p_user), v_rules.penalty_mode);
    if v_stone then
      insert into public.redemption_stone_events (user_id, occurred_on, delta, reason, log_date)
      values (p_user, v_day, 1, 'earned', v_day)
      on conflict do nothing;
    end if;

    -- 5. PENALTY ZONE (brief 3.3): a failed Phase 2 day creates or
    --    escalates the one open penalty.
    v_penalty := null;
    if v_outcome.creates_penalty then
      v_penalty := public.penalty_on_failed_day(p_user, v_day, v_rules.penalty_mode, v_missed);
    end if;

    -- 5b. Weakened lasts through its last day, then clears.
    update public.penalties
    set state = 'cleared', resolved_at = now()
    where user_id = p_user and state = 'weakened_active' and weakened_until <= v_day;

    -- 6. Advance the watermark.
    update public.hunters set last_closed_on = v_day where user_id = p_user;

    select coalesce(sum(xp), 0) into v_day_xp
    from public.xp_events
    where user_id = p_user and occurred_on = v_day;

    v_days := v_days || jsonb_build_object(
      'log_date', v_day,
      'status', v_outcome.status,
      'core_total', v_core_total,
      'core_done', v_core_done,
      'xp_gained', v_day_xp,
      'free_points_gained', v_free_points,
      'streak', v_streak,
      'stone_earned', v_stone,
      'penalty', v_penalty
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

-- Every pending day, however many (used before any award).
create or replace function public.catch_up_days(p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_total integer := 0;
begin
  loop
    v_result := public.close_days_for(p_user);
    v_total := v_total + (v_result ->> 'count')::integer;
    exit when not (v_result ->> 'more_pending')::boolean;
  end loop;
  return v_total;
end;
$$;

create or replace function public.close_days()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return public.close_days_for(public.assert_authenticated());
end;
$$;

-- ===========================================================================
-- Penalty JSON for the snapshot and the RPC replies.
-- ===========================================================================
create or replace function public.penalty_json(p_penalty public.penalties)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p_penalty.id is null then null else jsonb_build_object(
    'id', p_penalty.id,
    'state', p_penalty.state,
    'choice', p_penalty.choice,
    'mode', p_penalty.mode,
    'escalated', p_penalty.escalated,
    'trigger_day', p_penalty.trigger_day,
    'missed_quests', p_penalty.missed_quests,
    'needs_choice', p_penalty.state = 'pending_choice',
    'needs_acknowledgement', p_penalty.state <> 'pending_choice' and p_penalty.acknowledged_at is null,
    'created_at', p_penalty.created_at,
    'trial', case when p_penalty.choice = 'trial' or p_penalty.trial_quest_id is not null then
      jsonb_build_object(
        'category', p_penalty.trial_category,
        'quest_id', p_penalty.trial_quest_id,
        'chosen_at', p_penalty.chosen_at,
        'deadline', p_penalty.trial_deadline
      ) end,
    'debt', case when p_penalty.choice = 'debt' then
      jsonb_build_object(
        'rate_percent', p_penalty.debt_rate_percent,
        'level', p_penalty.debt_level,
        'amount', p_penalty.debt_amount,
        'remaining', public.penalty_debt_remaining(p_penalty.id)
      ) end,
    'weakened', case when p_penalty.choice = 'weakened' then
      jsonb_build_object(
        'stat', p_penalty.weakened_stat,
        'from', p_penalty.weakened_from,
        'until', p_penalty.weakened_until
      ) end
  ) end;
$$;

-- What the choice screen previews (brief 3.5): each option's concrete
-- consequence, computed by the same rules that will apply it.
create or replace function public.penalty_options(p_penalty public.penalties)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_category text;
  v_level integer;
  v_cfg jsonb := public.game_config_value('penalty');
begin
  if p_penalty.id is null or p_penalty.state <> 'pending_choice' then
    return null;
  end if;
  v_category := public.trial_category(array(
    select q ->> 'category' from jsonb_array_elements(p_penalty.missed_quests) q));
  v_level := public.hunter_level(p_penalty.user_id);
  return jsonb_build_object(
    'trial', jsonb_build_object(
      'category', v_category,
      'template', v_cfg -> 'trial' -> 'templates' -> v_category,
      'xp', (v_cfg -> 'trial' ->> 'xp')::integer,
      'deadline_hours', (v_cfg -> 'trial' ->> 'deadlineHours')::integer
    ),
    'debt', jsonb_build_object(
      'rate_percent', (v_cfg -> 'debtRatePercent' ->> 'standard')::integer,
      'amount', public.debt_amount((v_cfg -> 'debtRatePercent' ->> 'standard')::integer, v_level)
    ),
    'weakened', jsonb_build_object(
      'stat', public.weakened_stat_for(array(
        select t from jsonb_array_elements(p_penalty.missed_quests) q,
             jsonb_array_elements_text(q -> 'stat_tags') t)),
      'days', (v_cfg ->> 'weakenedDays')::integer
    )
  );
end;
$$;

-- ===========================================================================
-- RPC: choose_penalty(choice) - Standard's choice screen (brief 3.5).
-- ===========================================================================
create or replace function public.choose_penalty(p_choice text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_penalty public.penalties;
  v_today date;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  v_penalty := public.open_penalty(v_user);
  if v_penalty.id is null or v_penalty.state <> 'pending_choice' then
    raise exception 'NO_PENDING_CHOICE';
  end if;
  if p_choice is null or p_choice not in ('trial', 'debt', 'weakened') or v_penalty.mode <> 'standard' then
    raise exception 'INVALID_PENALTY_CHOICE';
  end if;

  v_today := public.game_today_for(v_user);

  if p_choice = 'trial' then
    perform public.start_trial(v_penalty.id);
  elsif p_choice = 'debt' then
    perform public.start_debt(
      v_penalty.id,
      (public.game_config_value('penalty') -> 'debtRatePercent' ->> 'standard')::integer,
      false);
  else
    update public.penalties
    set state = 'weakened_active',
        choice = 'weakened',
        chosen_at = now(),
        weakened_stat = public.weakened_stat_for(array(
          select t from jsonb_array_elements(missed_quests) q,
               jsonb_array_elements_text(q -> 'stat_tags') t)),
        weakened_from = v_today,
        weakened_until = v_today + (public.game_config_value('penalty') ->> 'weakenedDays')::integer - 1
    where id = v_penalty.id;
  end if;

  update public.penalties set acknowledged_at = now() where id = v_penalty.id;

  select * into v_penalty from public.penalties where id = v_penalty.id;
  return public.penalty_json(v_penalty);
end;
$$;

-- ===========================================================================
-- RPC: acknowledge_penalty() - Lenient's notice, Hardcore's trial and any
-- escalation are acknowledged rather than chosen.
-- ===========================================================================
create or replace function public.acknowledge_penalty()
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
  update public.penalties
  set acknowledged_at = now()
  where user_id = v_user and acknowledged_at is null and state <> 'pending_choice';
  get diagnostics v_count = row_count;
  return jsonb_build_object('acknowledged', v_count);
end;
$$;

-- ===========================================================================
-- RPC: redeem_penalty(id) - spend a Redemption Stone (brief 3.6).
-- ===========================================================================
create or replace function public.redeem_penalty(p_penalty_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_penalty public.penalties;
  v_mode text;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  select * into v_penalty from public.penalties
  where id = p_penalty_id and user_id = v_user
  for update;
  if not found then
    raise exception 'PENALTY_NOT_FOUND';
  end if;
  if v_penalty.state not in ('pending_choice', 'trial_active', 'debt_active', 'weakened_active') then
    raise exception 'PENALTY_NOT_OPEN';
  end if;

  -- Hardcore freezes held stones (step 0, G-j): judged by today's mode.
  v_mode := (public.effective_rules(v_user, public.game_today_for(v_user))).penalty_mode;
  if v_mode = 'hardcore' then
    raise exception 'STONES_FROZEN';
  end if;
  if public.stones_held(v_user) < 1 then
    raise exception 'NO_STONES';
  end if;

  insert into public.redemption_stone_events (user_id, occurred_on, delta, reason, penalty_id)
  values (v_user, public.game_today_for(v_user), -1, 'spent', v_penalty.id);

  if v_penalty.trial_quest_id is not null then
    update public.quests set archived_at = now()
    where id = v_penalty.trial_quest_id and archived_at is null;
  end if;

  update public.penalties
  set state = 'redeemed', resolved_at = now(), acknowledged_at = now()
  where id = v_penalty.id;

  select * into v_penalty from public.penalties where id = v_penalty.id;
  return public.penalty_json(v_penalty) || jsonb_build_object('stones_held', public.stones_held(v_user));
end;
$$;

-- ===========================================================================
-- Trial completion: clears the penalty. A trial completion is final - it is
-- never undone, and the diet trial never un-completes (step 2.3 decision).
-- ===========================================================================
create or replace function public.clear_trial(p_user uuid, p_quest public.quests, p_value numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_award jsonb;
begin
  v_award := public.award_quest_completion(p_user, p_quest, public.game_today_for(p_user), p_value);
  update public.penalties
  set state = 'cleared', resolved_at = now()
  where id = p_quest.penalty_id and state = 'trial_active';
  return v_award || jsonb_build_object('penalty_cleared', true);
end;
$$;

-- The diet trial: >= target food entries logged inside the trial window.
create or replace function public.evaluate_food_trial(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_penalty public.penalties := public.open_penalty(p_user);
  v_quest public.quests;
  v_count integer;
begin
  if v_penalty.state is distinct from 'trial_active' or now() >= v_penalty.trial_deadline then
    return null;
  end if;
  select * into v_quest from public.quests
  where id = v_penalty.trial_quest_id and tracking = 'auto_food_count' and archived_at is null;
  if not found or exists (
    select 1 from public.quest_completions where quest_id = v_quest.id and reversed_at is null
  ) then
    return null;
  end if;

  select count(*) into v_count
  from public.food_entries
  where user_id = p_user
    and created_at >= v_penalty.chosen_at
    and created_at < v_penalty.trial_deadline;

  if v_count >= v_quest.target_value then
    return public.clear_trial(p_user, v_quest, v_count);
  end if;
  return jsonb_build_object('entries', v_count, 'target', v_quest.target_value);
end;
$$;

-- ===========================================================================
-- RPCs that award or reverse: each first catches up pending days.
-- ===========================================================================
create or replace function public.complete_quest(
  p_quest_id uuid,
  p_value numeric default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_quest public.quests;
  v_penalty public.penalties;
  v_today date;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  select * into v_quest from public.quests where id = p_quest_id and user_id = v_user;
  if not found then
    raise exception 'QUEST_NOT_FOUND';
  end if;

  if v_quest.type = 'trial' then
    select * into v_penalty from public.penalties where id = v_quest.penalty_id;
    if v_penalty.state <> 'trial_active' or now() >= v_penalty.trial_deadline then
      raise exception 'TRIAL_EXPIRED';
    end if;
  end if;

  if v_quest.archived_at is not null then
    raise exception 'QUEST_ARCHIVED';
  end if;
  if v_quest.tracking <> 'manual' then
    raise exception 'QUEST_IS_AUTO';
  end if;

  v_today := public.game_today_for(v_user);

  if v_quest.type = 'daily' then
    if not (extract(isodow from v_today)::smallint = any (v_quest.schedule_days)) then
      raise exception 'QUEST_NOT_SCHEDULED_TODAY';
    end if;
  else
    if v_quest.type = 'one_time' and v_quest.due_on is not null and v_quest.due_on > v_today then
      raise exception 'QUEST_NOT_DUE_YET';
    end if;
    if exists (
      select 1 from public.quest_completions
      where quest_id = v_quest.id and reversed_at is null
    ) then
      raise exception 'ALREADY_COMPLETED';
    end if;
  end if;

  if v_quest.goal_type <> 'boolean' then
    if p_value is null then
      raise exception 'VALUE_REQUIRED';
    end if;
    if v_quest.target_value is not null and p_value < v_quest.target_value then
      raise exception 'GOAL_NOT_MET';
    end if;
  end if;

  begin
    if v_quest.type = 'trial' then
      return public.clear_trial(v_user, v_quest, p_value);
    end if;
    return public.award_quest_completion(v_user, v_quest, v_today, p_value);
  exception
    when unique_violation then
      raise exception 'ALREADY_COMPLETED';
  end;
end;
$$;

create or replace function public.undo_completion(p_completion_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_completion public.quest_completions;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  select * into v_completion
  from public.quest_completions
  where id = p_completion_id and user_id = v_user and reversed_at is null;
  if not found then
    raise exception 'COMPLETION_NOT_FOUND';
  end if;

  if exists (select 1 from public.quests where id = v_completion.quest_id and type = 'trial') then
    raise exception 'TRIAL_IS_FINAL';
  end if;

  if v_completion.occurred_on <> public.game_today_for(v_user) then
    raise exception 'SEALED_DAY';
  end if;

  return public.reverse_quest_completion(v_user, v_completion.id);
end;
$$;

create or replace function public.log_food(
  p_name text,
  p_kcal integer,
  p_protein_g numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_today date;
  v_id uuid;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  v_today := public.game_today_for(v_user);

  insert into public.food_entries (user_id, occurred_on, name, kcal, protein_g)
  values (v_user, v_today, btrim(p_name), p_kcal, p_protein_g)
  returning id into v_id;

  return jsonb_build_object(
    'entry_id', v_id,
    'occurred_on', v_today,
    'auto_protein', public.evaluate_auto_protein(v_user, v_today),
    'trial', public.evaluate_food_trial(v_user)
  );
end;
$$;

create or replace function public.delete_food(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_entry public.food_entries;
  v_today date;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  select * into v_entry from public.food_entries where id = p_id and user_id = v_user;
  if not found then
    raise exception 'ENTRY_NOT_FOUND';
  end if;

  v_today := public.game_today_for(v_user);
  if v_entry.occurred_on <> v_today then
    raise exception 'SEALED_DAY';
  end if;

  delete from public.food_entries where id = v_entry.id;

  return jsonb_build_object(
    'entry_id', v_entry.id,
    'occurred_on', v_today,
    'auto_protein', public.evaluate_auto_protein(v_user, v_today)
  );
end;
$$;

create or replace function public.log_workout(
  p_title text,
  p_notes text,
  p_sets jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_today date;
  v_workout_id uuid;
  v_set_count integer := 0;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  if p_sets is not null and jsonb_typeof(p_sets) <> 'array' then
    raise exception 'INVALID_SETS';
  end if;

  v_today := public.game_today_for(v_user);

  insert into public.workouts (user_id, occurred_on, title, notes)
  values (v_user, v_today, btrim(p_title), nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_workout_id;

  if p_sets is not null then
    insert into public.workout_sets (user_id, workout_id, exercise_name, set_index, reps, weight_kg)
    select
      v_user,
      v_workout_id,
      btrim(t.item ->> 'exercise_name'),
      t.set_no::integer,
      (t.item ->> 'reps')::integer,
      nullif(t.item ->> 'weight_kg', '')::numeric
    from jsonb_array_elements(p_sets) with ordinality as t (item, set_no);
    get diagnostics v_set_count = row_count;
  end if;

  return jsonb_build_object(
    'workout_id', v_workout_id,
    'occurred_on', v_today,
    'set_count', v_set_count,
    'auto_workout', public.evaluate_auto_workout(v_user, v_today)
  );
end;
$$;

create or replace function public.delete_workout(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_workout public.workouts;
  v_today date;
begin
  perform 1 from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;
  perform public.catch_up_days(v_user);

  select * into v_workout from public.workouts where id = p_id and user_id = v_user;
  if not found then
    raise exception 'WORKOUT_NOT_FOUND';
  end if;

  v_today := public.game_today_for(v_user);
  if v_workout.occurred_on <> v_today then
    raise exception 'SEALED_DAY';
  end if;

  delete from public.workouts where id = v_workout.id;

  return jsonb_build_object(
    'workout_id', v_workout.id,
    'occurred_on', v_today,
    'auto_workout', public.evaluate_auto_workout(v_user, v_today)
  );
end;
$$;
