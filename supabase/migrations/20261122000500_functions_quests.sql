-- Quest RPCs: manual completion and undo (brief 6.2).

-- ---------------------------------------------------------------------------
-- Quests are client-writable, so pin down the columns the game logic trusts.
-- created_at in particular decides which days a quest counted for (G7), and
-- tracking decides whether the client may complete it at all.
-- ---------------------------------------------------------------------------
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
  return new;
end;
$$;

create trigger quests_guard_immutable
  before update on public.quests
  for each row
  execute function public.quests_guard_immutable();

-- ---------------------------------------------------------------------------
-- complete_quest: manual quests only (5.8). Validates the goal, then writes
-- the completion and its capped XP event in one transaction (ADR-3).
-- ---------------------------------------------------------------------------
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
  v_hunter public.hunters;
  v_quest public.quests;
  v_today date;
begin
  -- Serialise this hunter's ledger writes so two quests cannot both believe
  -- they have the last of the daily cap room.
  select * into v_hunter from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  select * into v_quest from public.quests where id = p_quest_id and user_id = v_user;
  if not found then
    raise exception 'QUEST_NOT_FOUND';
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
    -- G10: a dated one-time quest can be completed late, and scores on the day
    -- it is completed. It can never be completed early.
    if v_quest.due_on is not null and v_quest.due_on > v_today then
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
    return public.award_quest_completion(v_user, v_quest, v_today, p_value);
  exception
    when unique_violation then
      raise exception 'ALREADY_COMPLETED';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- undo_completion: same game day only (brief 6.2). Inserts a reversal; the
-- original completion and event are never deleted (ADR-1).
-- ---------------------------------------------------------------------------
create or replace function public.undo_completion(p_completion_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_hunter public.hunters;
  v_completion public.quest_completions;
  v_today date;
begin
  select * into v_hunter from public.hunters where user_id = v_user for update;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  select * into v_completion
  from public.quest_completions
  where id = p_completion_id and user_id = v_user and reversed_at is null;

  if not found then
    raise exception 'COMPLETION_NOT_FOUND';
  end if;

  v_today := public.game_today_for(v_user);

  if v_completion.occurred_on <> v_today then
    raise exception 'SEALED_DAY';
  end if;

  return public.reverse_quest_completion(v_user, v_completion.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- allocate_points (brief 6.2, ADR-5)
-- Availability is validated client-side by the engine; the database only
-- enforces ownership and a positive whole number. Documented trade-off: if a
-- competitive feature ever lands, this check moves server-side.
-- ---------------------------------------------------------------------------
create or replace function public.allocate_points(p_stat text, p_points integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_id uuid;
begin
  if p_stat not in ('STR', 'AGI', 'VIT', 'INT', 'SENSE') then
    raise exception 'UNKNOWN_STAT_TAG: %', p_stat;
  end if;
  if p_points is null or p_points <= 0 then
    raise exception 'POINTS_MUST_BE_POSITIVE';
  end if;
  if not exists (select 1 from public.hunters where user_id = v_user) then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  insert into public.stat_allocations (user_id, stat, points)
  values (v_user, p_stat, p_points)
  returning id into v_id;

  return jsonb_build_object('allocation_id', v_id, 'stat', p_stat, 'points', p_points);
end;
$$;

revoke execute on function public.complete_quest(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.undo_completion(uuid) from public, anon, authenticated;
revoke execute on function public.allocate_points(text, integer) from public, anon, authenticated;

grant execute on function public.complete_quest(uuid, numeric) to authenticated;
grant execute on function public.undo_completion(uuid) to authenticated;
grant execute on function public.allocate_points(text, integer) to authenticated;
