-- Onboarding and Hunter Settings (brief 5.7, 7.2; C4, C8).

-- ---------------------------------------------------------------------------
-- onboard_hunter: creates the hunter row, the first diet-target version (C8)
-- and the four default quests (5.7) in one transaction.
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

  -- G12: the timezone must be one Postgres actually knows, or every game date
  -- after this point would be wrong.
  if not public.is_valid_timezone(p_timezone) then
    raise exception 'INVALID_TIMEZONE: %', p_timezone;
  end if;

  if p_kcal_min is null or p_kcal_max is null or p_kcal_max < p_kcal_min then
    raise exception 'INVALID_KCAL_RANGE';
  end if;

  v_created_on := public.game_date_at(now(), p_timezone);

  insert into public.hunters (
    user_id, hunter_name, timezone, kcal_min, kcal_max, protein_target_g, created_on
  )
  values (
    v_user, btrim(p_hunter_name), p_timezone, p_kcal_min, p_kcal_max, p_protein_target_g,
    v_created_on
  );

  -- C8: the first target version is effective from the hunter's first game day,
  -- so day one is judged against the numbers chosen at onboarding.
  insert into public.hunter_target_history (
    user_id, effective_on, kcal_min, kcal_max, protein_target_g
  )
  values (v_user, v_created_on, p_kcal_min, p_kcal_max, p_protein_target_g);

  -- Default quests (5.7). All editable; the three auto ones read their targets
  -- from the hunter profile, so they carry no target_value (C3).
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
-- update_hunter_profile: the Hunter Settings screen (C4).
--
-- Name and timezone apply immediately. Diet targets are versioned to take
-- effect from the next game day, so the day you are currently living is never
-- re-judged against numbers you changed inside it (C8). Already-closed days
-- are never revisited.
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

  update public.hunters
  set hunter_name = btrim(p_hunter_name),
      timezone = p_timezone,
      kcal_min = p_kcal_min,
      kcal_max = p_kcal_max,
      protein_target_g = p_protein_target_g
  where user_id = v_user;

  -- One row per effective day: editing twice before the rollover collapses.
  insert into public.hunter_target_history (
    user_id, effective_on, kcal_min, kcal_max, protein_target_g
  )
  values (v_user, v_effective_on, p_kcal_min, p_kcal_max, p_protein_target_g)
  on conflict (user_id, effective_on) do update
    set kcal_min = excluded.kcal_min,
        kcal_max = excluded.kcal_max,
        protein_target_g = excluded.protein_target_g,
        created_at = now();

  return public.hunter_snapshot();
end;
$$;

revoke execute on function
  public.onboard_hunter(text, text, integer, integer, numeric) from public, anon, authenticated;
revoke execute on function
  public.update_hunter_profile(text, text, integer, integer, numeric) from public, anon, authenticated;

grant execute on function
  public.onboard_hunter(text, text, integer, integer, numeric) to authenticated;
grant execute on function
  public.update_hunter_profile(text, text, integer, integer, numeric) to authenticated;
