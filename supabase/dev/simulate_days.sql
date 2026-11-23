-- DEV ONLY. Backdates a hunter so there are real days for close_days() to
-- settle, and lives some of them so the System Report has something to say.
--
-- This is a tool for your local stack. It is never imported by app code, it is
-- not a migration, and it does NOT roll back - it deliberately leaves state
-- behind for you to look at. It refuses to run anywhere but the local stack:
-- see the isolation guard at the top of the block.
--
--   npm run sim:days
--
-- Then open the app: the day close runs on load and the report appears.
--
-- With the defaults the hunter ends up looking like this, relative to today:
--   -4  lived fully   -> cleared, +1 free point
--   -3  nothing       -> failed
--   -2  lived fully   -> cleared, +1 free point
--   -1  food only     -> failed (no workout, Study not done)
--
-- Scenario overrides are plain session settings:
--   npm run sim:days -- --set sim.days_back=9 --set sim.lived={9,8,7}
--
--   sim.days_back   integer    how far back the hunter is wound
--   sim.lived       int array  day offsets lived in full
--   sim.food_only   int array  day offsets with food but nothing else

do $sim$
declare
  c_days_back constant integer := coalesce(current_setting('sim.days_back', true)::integer, 4);
  c_lived constant integer[] :=
    coalesce(nullif(current_setting('sim.lived', true), '')::integer[], array[4, 2]);
  c_food_only constant integer[] :=
    coalesce(nullif(current_setting('sim.food_only', true), '')::integer[], array[1]);

  v_user uuid;
  v_timezone text;
  v_today date;
  v_day date;
  v_offset integer;
  v_study public.quests;
  v_targets record;
begin
  -- -------------------------------------------------------------------------
  -- ISOLATION GUARD. This script rewrites history, so it must never touch the
  -- hosted project. Two independent checks, and both must pass; if a future
  -- CLI drops either signal the script refuses even locally, which is the
  -- safe way to fail.
  --
  -- 1. Connection: only the local container's unix socket. A unix-socket
  --    session has no client address; every network session does, and the
  --    hosted project is reachable only over the network. Run it with
  --    `npm run sim:days`, which pipes it into the local container.
  if inet_client_addr() is not null then
    raise exception
      'simulate_days.sql refused: it only runs over the local stack''s unix socket, and this session came from %. Use: npm run sim:days',
      inet_client_addr();
  end if;

  -- 2. Identity: the Supabase CLI's local stack sets app.settings.jwt_secret
  --    to its public demo value, the same on every machine and never used by a
  --    hosted project. Compared by hash so the literal is not committed here.
  if md5(coalesce(current_setting('app.settings.jwt_secret', true), ''))
       <> '2a60121f68a3f2b1fb7de7040cb89646' then
    raise exception
      'simulate_days.sql refused: this database does not carry the local stack''s demo secret, so it is not the local Supabase stack.';
  end if;
  -- -------------------------------------------------------------------------

  select user_id, timezone into v_user, v_timezone
  from public.hunters
  order by created_at
  limit 1;

  if v_user is null then
    raise exception 'No hunter found. Sign up and finish onboarding first.';
  end if;

  v_today := public.game_date_at(now(), v_timezone);
  select * into v_study from public.quests where user_id = v_user and title = 'Study';

  -- Wind the hunter back and clear the watermark so close_days() has work.
  update public.hunters
  set created_on = v_today - c_days_back,
      last_closed_on = null
  where user_id = v_user;

  -- The quests have to have existed on those days too. The immutability
  -- trigger exists to stop the client doing this; a dev script may.
  execute 'alter table public.quests disable trigger quests_guard_immutable';
  update public.quests
  set created_at = (v_today - c_days_back - 1)::timestamptz
  where user_id = v_user;
  execute 'alter table public.quests enable trigger quests_guard_immutable';

  -- Start the simulated window from a genuinely clean slate. The ledger rows
  -- have to go too: leaving a previous run's daily_clear event behind makes a
  -- re-closed day report as failed while still showing the free point it was
  -- paid the first time. Only a dev script may do this - the app never erases
  -- ledger history (ADR-1), it appends reversals.
  delete from public.xp_events
  where user_id = v_user and occurred_on >= v_today - c_days_back and occurred_on < v_today;
  delete from public.quest_completions
  where user_id = v_user and occurred_on >= v_today - c_days_back and occurred_on < v_today;
  delete from public.daily_logs
  where user_id = v_user and log_date >= v_today - c_days_back and log_date < v_today;
  delete from public.food_entries
  where user_id = v_user and occurred_on >= v_today - c_days_back and occurred_on < v_today;
  delete from public.workouts
  where user_id = v_user and occurred_on >= v_today - c_days_back and occurred_on < v_today;

  foreach v_offset in array c_lived loop
    v_day := v_today - v_offset;
    select * into v_targets from public.effective_targets(v_user, v_day);

    insert into public.food_entries (user_id, occurred_on, name, kcal, protein_g)
    values
      (v_user, v_day, 'Simulated breakfast', (v_targets.kcal_min / 2)::integer,
       (v_targets.protein_target_g / 2)::numeric),
      (v_user, v_day, 'Simulated dinner', (v_targets.kcal_min / 2 + 50)::integer,
       (v_targets.protein_target_g / 2 + 10)::numeric);

    insert into public.workouts (user_id, occurred_on, title)
    values (v_user, v_day, 'Simulated session');

    -- What live logging would have done on the day itself.
    perform public.evaluate_auto_workout(v_user, v_day);
    perform public.evaluate_auto_protein(v_user, v_day);

    if v_study.id is not null and public.active_completion_id(v_study.id, v_day) is null then
      perform public.award_quest_completion(v_user, v_study, v_day, v_study.target_value);
    end if;

    raise notice 'lived %: food, workout and Study', v_day;
  end loop;

  foreach v_offset in array c_food_only loop
    v_day := v_today - v_offset;

    insert into public.food_entries (user_id, occurred_on, name, kcal, protein_g)
    values (v_user, v_day, 'Simulated snack', 400, 20);

    perform public.evaluate_auto_protein(v_user, v_day);
    raise notice 'partially lived %: food only', v_day;
  end loop;

  raise notice '----------------------------------------';
  raise notice 'Hunter wound back to %. Open the app: close_days() settles % days.',
    v_today - c_days_back, c_days_back;
  raise notice '----------------------------------------';
end;
$sim$;
