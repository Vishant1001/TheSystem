-- Phase 2, Step 2.7: what the workout logger v2 needs from the database
-- (brief 4.6, 5; the 2.5 review's search ordering).
--
-- Forward-only and non-destructive: one nullable column, two RPCs.

-- ---------------------------------------------------------------------------
-- hunters.rest_timer_s: the hunter's rest timer default (brief 5: "the hunter
-- settings (rest_timer_s)"). Null means the config default; it applies at
-- once, nothing is judged on it. The bounds live in game-config.json and are
-- enforced by set_rest_timer; the check below is only a sanity floor.
-- ---------------------------------------------------------------------------
alter table public.hunters add column rest_timer_s integer;
alter table public.hunters
  add constraint hunters_rest_timer_sane check (rest_timer_s is null or rest_timer_s between 1 and 3600);

create or replace function public.set_rest_timer(p_seconds integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := public.assert_authenticated();
  v_timer jsonb := public.game_config_value('gym') -> 'restTimer';
begin
  if p_seconds is not null and (
       p_seconds < (v_timer ->> 'minSeconds')::integer
       or p_seconds > (v_timer ->> 'maxSeconds')::integer) then
    raise exception 'INVALID_REST_TIMER';
  end if;

  update public.hunters set rest_timer_s = p_seconds where user_id = v_user;
  if not found then
    raise exception 'HUNTER_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'rest_timer_s', coalesce(p_seconds, (v_timer ->> 'defaultSeconds')::integer),
    'is_default', p_seconds is null);
end;
$$;

-- ---------------------------------------------------------------------------
-- exercise_summaries(): per exercise the caller has logged, how many sets and
-- when last. The logger ranks exercises with history first and the merge
-- confirmation says how many sets will move. Caller's rows only.
-- ---------------------------------------------------------------------------
create or replace function public.exercise_summaries()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'exercise_id', t.exercise_id, 'set_count', t.set_count, 'last_on', t.last_on)
         order by t.last_on desc, t.exercise_id), '[]'::jsonb)
  from (
    select s.exercise_id, count(*)::integer as set_count, max(w.occurred_on) as last_on
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    where s.user_id = public.assert_authenticated() and s.exercise_id is not null
    group by s.exercise_id
  ) t;
$$;

revoke execute on function public.set_rest_timer(integer) from public, anon, authenticated;
revoke execute on function public.exercise_summaries() from public, anon, authenticated;
grant execute on function public.set_rest_timer(integer) to authenticated;
grant execute on function public.exercise_summaries() to authenticated;
