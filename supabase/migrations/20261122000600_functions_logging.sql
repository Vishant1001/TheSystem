-- Logging RPCs and auto-quest evaluation (brief 5.8, 6.2; C5).
--
-- C5: logs are only ever written or removed for the current game day. A sealed
-- day has already been tallied and may have paid out a free point, so the
-- ledger for it is final.

-- ---------------------------------------------------------------------------
-- The live auto quest of a given tracking type for a given day. Respects the
-- quest's own lifetime in game dates (G7) and its weekday schedule.
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
    and q.type = 'daily'
    and public.game_date_at(q.created_at, v_timezone) <= p_day
    and (q.archived_at is null or public.game_date_at(q.archived_at, v_timezone) > p_day)
    and extract(isodow from p_day)::smallint = any (q.schedule_days)
  limit 1;

  return v_quest;
end;
$$;

create or replace function public.active_completion_id(p_quest_id uuid, p_day date)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.quest_completions
  where quest_id = p_quest_id and occurred_on = p_day and reversed_at is null
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- auto_workout: completes as soon as a workout exists for the day, reverses
-- when the last one is deleted (5.8).
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_auto_workout(p_user uuid, p_day date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quest public.quests;
  v_count integer;
  v_completion_id uuid;
begin
  v_quest := public.auto_quest_for(p_user, 'auto_workout', p_day);
  if v_quest.id is null then
    return jsonb_build_object('evaluated', false);
  end if;

  select count(*) into v_count
  from public.workouts
  where user_id = p_user and occurred_on = p_day;

  v_completion_id := public.active_completion_id(v_quest.id, p_day);

  if v_count > 0 and v_completion_id is null then
    return jsonb_build_object(
      'evaluated', true,
      'action', 'completed',
      'result', public.award_quest_completion(p_user, v_quest, p_day, v_count)
    );
  elsif v_count = 0 and v_completion_id is not null then
    return jsonb_build_object(
      'evaluated', true,
      'action', 'reversed',
      'result', public.reverse_quest_completion(p_user, v_completion_id)
    );
  end if;

  return jsonb_build_object('evaluated', true, 'action', 'unchanged');
end;
$$;

-- ---------------------------------------------------------------------------
-- auto_protein_min: completes when the day's protein reaches the target that
-- was effective for that day (C8), reverses if a deletion drops it below.
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_auto_protein(p_user uuid, p_day date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quest public.quests;
  v_targets record;
  v_total numeric;
  v_completion_id uuid;
begin
  v_quest := public.auto_quest_for(p_user, 'auto_protein_min', p_day);
  if v_quest.id is null then
    return jsonb_build_object('evaluated', false);
  end if;

  select * into v_targets from public.effective_targets(p_user, p_day);

  select coalesce(sum(protein_g), 0) into v_total
  from public.food_entries
  where user_id = p_user and occurred_on = p_day;

  v_completion_id := public.active_completion_id(v_quest.id, p_day);

  if v_total >= v_targets.protein_target_g and v_completion_id is null then
    return jsonb_build_object(
      'evaluated', true,
      'action', 'completed',
      'protein_g', v_total,
      'target_g', v_targets.protein_target_g,
      'result', public.award_quest_completion(p_user, v_quest, p_day, v_total)
    );
  elsif v_total < v_targets.protein_target_g and v_completion_id is not null then
    return jsonb_build_object(
      'evaluated', true,
      'action', 'reversed',
      'protein_g', v_total,
      'target_g', v_targets.protein_target_g,
      'result', public.reverse_quest_completion(p_user, v_completion_id)
    );
  end if;

  return jsonb_build_object(
    'evaluated', true,
    'action', 'unchanged',
    'protein_g', v_total,
    'target_g', v_targets.protein_target_g
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- auto_kcal_range: deliberately NOT evaluated during the day (5.8). close_days
-- calls this once the day is over, so a later meal can still take you out of
-- range.
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_auto_kcal_range(p_user uuid, p_day date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quest public.quests;
  v_targets record;
  v_total integer;
  v_in_range boolean;
  v_completion_id uuid;
begin
  v_quest := public.auto_quest_for(p_user, 'auto_kcal_range', p_day);
  if v_quest.id is null then
    return jsonb_build_object('evaluated', false);
  end if;

  select * into v_targets from public.effective_targets(p_user, p_day);

  select coalesce(sum(kcal), 0) into v_total
  from public.food_entries
  where user_id = p_user and occurred_on = p_day;

  -- A day with nothing logged is not "in range", it is simply not done.
  v_in_range := v_total > 0
    and v_total >= v_targets.kcal_min
    and v_total <= v_targets.kcal_max;

  v_completion_id := public.active_completion_id(v_quest.id, p_day);

  if v_in_range and v_completion_id is null then
    return jsonb_build_object(
      'evaluated', true,
      'action', 'completed',
      'kcal', v_total,
      'result', public.award_quest_completion(p_user, v_quest, p_day, v_total)
    );
  elsif not v_in_range and v_completion_id is not null then
    return jsonb_build_object(
      'evaluated', true,
      'action', 'reversed',
      'kcal', v_total,
      'result', public.reverse_quest_completion(p_user, v_completion_id)
    );
  end if;

  return jsonb_build_object('evaluated', true, 'action', 'unchanged', 'kcal', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Food logging
-- ---------------------------------------------------------------------------
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
  v_hunter public.hunters;
  v_today date;
  v_id uuid;
begin
  select * into v_hunter from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  v_today := public.game_today_for(v_user);

  insert into public.food_entries (user_id, occurred_on, name, kcal, protein_g)
  values (v_user, v_today, btrim(p_name), p_kcal, p_protein_g)
  returning id into v_id;

  return jsonb_build_object(
    'entry_id', v_id,
    'occurred_on', v_today,
    'auto_protein', public.evaluate_auto_protein(v_user, v_today)
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
  v_hunter public.hunters;
  v_entry public.food_entries;
  v_today date;
begin
  select * into v_hunter from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

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

-- ---------------------------------------------------------------------------
-- Workout logging. p_sets is a json array of
--   { "exercise_name": text, "reps": integer, "weight_kg": numeric | null }
-- ordered as entered; set_index is assigned from that order.
-- ---------------------------------------------------------------------------
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
  v_hunter public.hunters;
  v_today date;
  v_workout_id uuid;
  v_set_count integer := 0;
begin
  select * into v_hunter from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

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
  v_hunter public.hunters;
  v_workout public.workouts;
  v_today date;
begin
  select * into v_hunter from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  select * into v_workout from public.workouts where id = p_id and user_id = v_user;
  if not found then
    raise exception 'WORKOUT_NOT_FOUND';
  end if;

  v_today := public.game_today_for(v_user);
  if v_workout.occurred_on <> v_today then
    raise exception 'SEALED_DAY';
  end if;

  -- workout_sets cascade with the workout.
  delete from public.workouts where id = v_workout.id;

  return jsonb_build_object(
    'workout_id', v_workout.id,
    'occurred_on', v_today,
    'auto_workout', public.evaluate_auto_workout(v_user, v_today)
  );
end;
$$;

revoke execute on function public.auto_quest_for(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.active_completion_id(uuid, date) from public, anon, authenticated;
revoke execute on function public.evaluate_auto_workout(uuid, date) from public, anon, authenticated;
revoke execute on function public.evaluate_auto_protein(uuid, date) from public, anon, authenticated;
revoke execute on function public.evaluate_auto_kcal_range(uuid, date) from public, anon, authenticated;
revoke execute on function public.log_food(text, integer, numeric) from public, anon, authenticated;
revoke execute on function public.delete_food(uuid) from public, anon, authenticated;
revoke execute on function public.log_workout(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.delete_workout(uuid) from public, anon, authenticated;

grant execute on function public.log_food(text, integer, numeric) to authenticated;
grant execute on function public.delete_food(uuid) to authenticated;
grant execute on function public.log_workout(text, text, jsonb) to authenticated;
grant execute on function public.delete_workout(uuid) to authenticated;
