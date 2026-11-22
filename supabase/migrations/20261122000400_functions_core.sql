-- Core functions: config readers, game dates, award maths, ledger writers.
--
-- C1 security model:
--   * anything that writes the ledger is SECURITY DEFINER, so it can insert
--     into xp_events, which no client role may write
--   * every definer function fixes search_path, asserts auth.uid() and scopes
--     every statement to that uid - a caller-supplied user id is never trusted
--   * execute is revoked from public and anon, then granted to authenticated
--     for the RPCs the client is meant to call; internal helpers get no grant

-- ---------------------------------------------------------------------------
-- Config readers (ADR-4). game_config is seeded from src/game/game-config.json.
-- ---------------------------------------------------------------------------
create or replace function public.game_config_value(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.game_config where key = p_key;
$$;

create or replace function public.game_config_int(p_key text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value jsonb := public.game_config_value(p_key);
begin
  if v_value is null then
    raise exception 'CONFIG_MISSING: %', p_key;
  end if;
  return (v_value #>> '{}')::integer;
end;
$$;

create or replace function public.quest_xp_for(p_difficulty text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_xp integer := (public.game_config_value('quest_xp_by_difficulty') ->> p_difficulty)::integer;
begin
  if v_xp is null then
    raise exception 'CONFIG_MISSING: quest xp for difficulty %', p_difficulty;
  end if;
  return v_xp;
end;
$$;

create or replace function public.daily_cap_for(p_category text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cap integer := (public.game_config_value('daily_caps') ->> p_category)::integer;
begin
  if v_cap is null then
    raise exception 'CONFIG_MISSING: daily cap for category %', p_category;
  end if;
  return v_cap;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth guard
-- ---------------------------------------------------------------------------
create or replace function public.assert_authenticated()
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  return v_user;
end;
$$;

create or replace function public.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (select 1 from pg_timezone_names where name = p_timezone);
$$;

-- ---------------------------------------------------------------------------
-- Game dates (ADR-6, C5, C7)
--
-- A game day starts at game_day_start_hour wall-clock time in the hunter's own
-- timezone. Subtracting whole hours from an already-localised timestamp can
-- only shift the date by one day, which is what makes this DST-safe and an
-- exact mirror of gameDateAt() in src/game/gameDate.ts.
-- ---------------------------------------------------------------------------
create or replace function public.game_date_at(
  p_instant timestamptz,
  p_timezone text,
  p_start_hour integer default null
)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select ((p_instant at time zone p_timezone)
          - make_interval(hours => coalesce(p_start_hour, public.game_config_int('game_day_start_hour'))))::date;
$$;

-- C7: a westward timezone change must never move "today" back into a sealed
-- day, so the current game date is clamped to last_closed_on + 1.
create or replace function public.game_today_for(p_user uuid)
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select greatest(
           public.game_date_at(now(), h.timezone),
           coalesce(h.last_closed_on + 1, date '-infinity')
         )
  from public.hunters h
  where h.user_id = p_user;
$$;

-- Definer so that game_today_for and the config readers can stay revoked from
-- every client role: this function is the only way in, and it is pinned to
-- auth.uid().
create or replace function public.game_today()
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Takes no user id and refuses an unauthenticated caller outright, rather
  -- than quietly returning null (C1 as amended).
  return public.game_today_for(public.assert_authenticated());
end;
$$;

-- ---------------------------------------------------------------------------
-- C8: diet targets effective for a given game day.
-- ---------------------------------------------------------------------------
create or replace function public.effective_targets(
  p_user uuid,
  p_day date,
  out kcal_min integer,
  out kcal_max integer,
  out protein_target_g numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select t.kcal_min, t.kcal_max, t.protein_target_g
    into kcal_min, kcal_max, protein_target_g
  from public.hunter_target_history t
  where t.user_id = p_user
    and t.effective_on <= p_day
  order by t.effective_on desc
  limit 1;

  -- Safety net: a hunter with no history row yet falls back to the profile.
  if kcal_min is null then
    select h.kcal_min, h.kcal_max, h.protein_target_g
      into kcal_min, kcal_max, protein_target_g
    from public.hunters h
    where h.user_id = p_user;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Award maths. Mirrors src/game/rewards.ts exactly:
--   * award only the remaining cap room (5.6)
--   * scale stat XP by the same ratio, floored (5.6)
--   * split with floor, remainder to the first tag (G1)
--   * minimum 1 per tag on full awards only (G2)
-- ---------------------------------------------------------------------------
create or replace function public.compute_quest_award(
  p_difficulty text,
  p_category text,
  p_stat_tags text[],
  p_category_xp_today integer,
  out xp integer,
  out full_xp integer,
  out capped boolean,
  out str_xp integer,
  out agi_xp integer,
  out vit_xp integer,
  out int_xp integer,
  out sense_xp integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_remaining integer;
  v_divisor integer := public.game_config_int('stat_xp_divisor');
  v_min_per_tag integer := public.game_config_int('min_stat_xp_per_tag');
  v_full_stat integer;
  v_stat_total integer;
  v_tag_count integer;
  v_per_tag integer;
  v_remainder integer;
  v_amount integer;
  v_tag text;
  v_index integer := 0;
begin
  full_xp := public.quest_xp_for(p_difficulty);
  v_cap := public.daily_cap_for(p_category);

  v_remaining := greatest(0, v_cap - greatest(0, coalesce(p_category_xp_today, 0)));
  xp := least(full_xp, v_remaining);
  capped := xp < full_xp;

  v_full_stat := full_xp / v_divisor;
  if full_xp = 0 then
    v_stat_total := 0;
  elsif capped then
    v_stat_total := (v_full_stat * xp) / full_xp;
  else
    v_stat_total := v_full_stat;
  end if;

  str_xp := 0;
  agi_xp := 0;
  vit_xp := 0;
  int_xp := 0;
  sense_xp := 0;

  v_tag_count := coalesce(array_length(p_stat_tags, 1), 0);
  if v_tag_count = 0 then
    raise exception 'QUEST_HAS_NO_STAT_TAGS';
  end if;

  v_per_tag := v_stat_total / v_tag_count;
  v_remainder := v_stat_total - v_per_tag * v_tag_count;

  foreach v_tag in array p_stat_tags loop
    v_index := v_index + 1;
    v_amount := v_per_tag + case when v_index = 1 then v_remainder else 0 end;
    if not capped then
      v_amount := greatest(v_amount, v_min_per_tag);
    end if;

    case v_tag
      when 'STR' then str_xp := v_amount;
      when 'AGI' then agi_xp := v_amount;
      when 'VIT' then vit_xp := v_amount;
      when 'INT' then int_xp := v_amount;
      when 'SENSE' then sense_xp := v_amount;
      else raise exception 'UNKNOWN_STAT_TAG: %', v_tag;
    end case;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The one place a completion and its XP event are written. Manual completion,
-- auto-quest evaluation and day close all come through here, so the cap and
-- split rules exist exactly once.
-- ---------------------------------------------------------------------------
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
  v_category_xp_today integer;
  v_award record;
  v_completion_id uuid;
  v_event_id uuid;
begin
  select coalesce(sum(e.xp), 0)
    into v_category_xp_today
  from public.xp_events e
  where e.user_id = p_user
    and e.occurred_on = p_day
    and e.category = p_quest.category;

  select *
    into v_award
  from public.compute_quest_award(
    p_quest.difficulty,
    p_quest.category,
    p_quest.stat_tags,
    v_category_xp_today
  );

  insert into public.quest_completions (user_id, quest_id, occurred_on, value)
  values (p_user, p_quest.id, p_day, p_value)
  returning id into v_completion_id;

  insert into public.xp_events (
    user_id, occurred_on, source_type, source_id, category,
    xp, str_xp, agi_xp, vit_xp, int_xp, sense_xp, capped
  )
  values (
    p_user, p_day, 'quest', v_completion_id, p_quest.category,
    v_award.xp, v_award.str_xp, v_award.agi_xp, v_award.vit_xp,
    v_award.int_xp, v_award.sense_xp, v_award.capped
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'completion_id', v_completion_id,
    'event_id', v_event_id,
    'quest_id', p_quest.id,
    'quest_title', p_quest.title,
    'occurred_on', p_day,
    'category', p_quest.category,
    'xp', v_award.xp,
    'full_xp', v_award.full_xp,
    'capped', v_award.capped,
    'stat_xp', jsonb_build_object(
      'STR', v_award.str_xp,
      'AGI', v_award.agi_xp,
      'VIT', v_award.vit_xp,
      'INT', v_award.int_xp,
      'SENSE', v_award.sense_xp
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The one place a completion is reversed (ADR-1: never delete, always negate).
-- G3: the reversal copies the original category so cap room is a plain sum.
-- ---------------------------------------------------------------------------
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
  v_event public.xp_events;
  v_reversal_id uuid;
begin
  select * into v_completion
  from public.quest_completions
  where id = p_completion_id
    and user_id = p_user
    and reversed_at is null
  for update;

  if not found then
    raise exception 'COMPLETION_NOT_FOUND';
  end if;

  update public.quest_completions
  set reversed_at = now()
  where id = v_completion.id;

  select * into v_event
  from public.xp_events
  where user_id = p_user
    and source_type = 'quest'
    and source_id = v_completion.id;

  if found and not exists (
    select 1 from public.xp_events where reverses_event_id = v_event.id
  ) then
    insert into public.xp_events (
      user_id, occurred_on, source_type, source_id, category,
      xp, str_xp, agi_xp, vit_xp, int_xp, sense_xp, free_points,
      capped, reverses_event_id
    )
    values (
      p_user, v_event.occurred_on, 'reversal', v_completion.id, v_event.category,
      -v_event.xp, -v_event.str_xp, -v_event.agi_xp, -v_event.vit_xp,
      -v_event.int_xp, -v_event.sense_xp, -v_event.free_points,
      false, v_event.id
    )
    returning id into v_reversal_id;
  end if;

  return jsonb_build_object(
    'completion_id', v_completion.id,
    'quest_id', v_completion.quest_id,
    'occurred_on', v_completion.occurred_on,
    'reversal_event_id', v_reversal_id,
    'xp_removed', coalesce(v_event.xp, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- hunter_snapshot (brief 6.3, G13): one round-trip for the Status screen.
-- The client engine derives level, rank, stat values and free points from this.
-- ---------------------------------------------------------------------------
-- Definer for the same reason as game_today(): it keeps the config and target
-- helpers unreachable from client roles. Every statement below is scoped to
-- auth.uid(), and the function reads nothing else.
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
begin
  select * into v_hunter from public.hunters where user_id = v_user;
  if not found then
    return null;
  end if;

  v_today := public.game_today_for(v_user);

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
    -- C8: what today is actually judged against. hunter.* above is the latest
    -- profile the user saved, which may only take effect tomorrow.
    'effective_targets_today', jsonb_build_object(
      'kcal_min', targets.kcal_min,
      'kcal_max', targets.kcal_max,
      'protein_target_g', targets.protein_target_g
    ),
    'daily_caps', public.game_config_value('daily_caps'),
    'unacknowledged_days', coalesce(report.pending, 0)
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
    public.effective_targets(v_user, v_today) as targets;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution privileges (C1). Internal helpers stay unreachable from the client.
-- ---------------------------------------------------------------------------
revoke execute on function public.game_config_value(text) from public, anon, authenticated;
revoke execute on function public.game_config_int(text) from public, anon, authenticated;
revoke execute on function public.quest_xp_for(text) from public, anon, authenticated;
revoke execute on function public.daily_cap_for(text) from public, anon, authenticated;
revoke execute on function public.assert_authenticated() from public, anon, authenticated;
revoke execute on function public.is_valid_timezone(text) from public, anon, authenticated;
revoke execute on function public.game_date_at(timestamptz, text, integer) from public, anon, authenticated;
revoke execute on function public.game_today_for(uuid) from public, anon, authenticated;
revoke execute on function public.game_today() from public, anon, authenticated;
revoke execute on function public.effective_targets(uuid, date) from public, anon, authenticated;
revoke execute on function public.compute_quest_award(text, text, text[], integer) from public, anon, authenticated;
revoke execute on function public.award_quest_completion(uuid, public.quests, date, numeric)
  from public, anon, authenticated;
revoke execute on function public.reverse_quest_completion(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.hunter_snapshot() from public, anon, authenticated;

grant execute on function public.game_today() to authenticated;
grant execute on function public.hunter_snapshot() to authenticated;
