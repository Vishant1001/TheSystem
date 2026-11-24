-- GENERATED FILE - DO NOT EDIT BY HAND.
-- Source: src/game/game-config.json (+ src/game/testdata/game-date-vectors.json)
-- Regenerate: npm run gen:sql

-- Safe Zone parity (Phase 2, Step 2.2). Generated from
--   src/game/testdata/day-status-vectors.json  -> day_outcome, counts_toward_core_tally
--   src/game/testdata/streak-vectors.json      -> next_streak, earns_stone
--   src/game/testdata/safe-zone-vectors.json   -> safe_period_start, safe_period_refusal
-- The same files drive dayStatus.test.ts and safeZones.test.ts.

do $$
declare
  v_count integer := 0;
  v_rest boolean;
  v_total integer;
  v_done integer;
  v_outcome record;
begin
  -- normal day, both core quests done
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-07')::smallint = any (array[6, 7]::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, false, true, true), (true, false, true, true)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, false, v_total, v_done);
  if v_outcome.status is distinct from 'cleared'
     or v_total <> 2 or v_done <> 2
     or v_outcome.free_points <> 1
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'extend' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'normal day, both core quests done', v_outcome, v_done, v_total;
  end if;

  -- normal day, one core quest missed
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-07')::smallint = any (array[6, 7]::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, false, true, true), (true, false, true, false)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, false, v_total, v_done);
  if v_outcome.status is distinct from 'failed'
     or v_total <> 2 or v_done <> 1
     or v_outcome.free_points <> 0
     or v_outcome.creates_penalty is distinct from true
     or v_outcome.streak_effect is distinct from 'reset' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'normal day, one core quest missed', v_outcome, v_done, v_total;
  end if;

  -- normal day with no core quests (G6): cleared, neutral, no point
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-07')::smallint = any ('{}'::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (false, false, true, false)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, false, v_total, v_done);
  if v_outcome.status is distinct from 'cleared'
     or v_total <> 0 or v_done <> 0
     or v_outcome.free_points <> 0
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'neutral' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'normal day with no core quests (G6): cleared, neutral, no point', v_outcome, v_done, v_total;
  end if;

  -- rest day (Saturday) with no rest-day quests: rest, never a penalty
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-12')::smallint = any (array[6, 7]::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, false, true, false)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, false, v_total, v_done);
  if v_outcome.status is distinct from 'rest'
     or v_total <> 0 or v_done <> 0
     or v_outcome.free_points <> 0
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'neutral' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'rest day (Saturday) with no rest-day quests: rest, never a penalty', v_outcome, v_done, v_total;
  end if;

  -- rest day (Sunday) with its rest-day quest done: cleared and a point
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-13')::smallint = any (array[6, 7]::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, true, true, true), (true, false, true, false)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, false, v_total, v_done);
  if v_outcome.status is distinct from 'cleared'
     or v_total <> 1 or v_done <> 1
     or v_outcome.free_points <> 1
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'extend' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'rest day (Sunday) with its rest-day quest done: cleared and a point', v_outcome, v_done, v_total;
  end if;

  -- rest day with its rest-day quest missed: still rest
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-13')::smallint = any (array[7]::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, true, true, false)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, false, v_total, v_done);
  if v_outcome.status is distinct from 'rest'
     or v_total <> 1 or v_done <> 0
     or v_outcome.free_points <> 0
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'neutral' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'rest day with its rest-day quest missed: still rest', v_outcome, v_done, v_total;
  end if;

  -- a Monday is not a weekend rest day
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-07')::smallint = any (array[6, 7]::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, true, true, false)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, false, v_total, v_done);
  if v_outcome.status is distinct from 'failed'
     or v_total <> 1 or v_done <> 0
     or v_outcome.free_points <> 0
     or v_outcome.creates_penalty is distinct from true
     or v_outcome.streak_effect is distinct from 'reset' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'a Monday is not a weekend rest day', v_outcome, v_done, v_total;
  end if;

  -- safe day with everything missed
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-07')::smallint = any ('{}'::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, false, true, false), (true, false, true, false)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, true, v_total, v_done);
  if v_outcome.status is distinct from 'safe'
     or v_total <> 2 or v_done <> 0
     or v_outcome.free_points <> 0
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'neutral' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'safe day with everything missed', v_outcome, v_done, v_total;
  end if;

  -- safe beats rest on the same day
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-12')::smallint = any (array[6]::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, true, true, true)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, true, v_total, v_done);
  if v_outcome.status is distinct from 'safe'
     or v_total <> 1 or v_done <> 1
     or v_outcome.free_points <> 0
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'neutral' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'safe beats rest on the same day', v_outcome, v_done, v_total;
  end if;

  -- safe day with everything done: still safe, no point
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-08')::smallint = any ('{}'::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, false, true, true)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, true, v_total, v_done);
  if v_outcome.status is distinct from 'safe'
     or v_total <> 1 or v_done <> 1
     or v_outcome.free_points <> 0
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'neutral' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'safe day with everything done: still safe, no point', v_outcome, v_done, v_total;
  end if;

  -- before the rules epoch a failed day stays Phase 1: no penalty, rest and safe ignored
  v_count := v_count + 1;
  v_rest := false
    and extract(isodow from date '2026-12-12')::smallint = any (array[6]::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, false, true, false), (true, false, true, true)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(false, v_rest, true, v_total, v_done);
  if v_outcome.status is distinct from 'failed'
     or v_total <> 2 or v_done <> 1
     or v_outcome.free_points <> 0
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'neutral' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'before the rules epoch a failed day stays Phase 1: no penalty, rest and safe ignored', v_outcome, v_done, v_total;
  end if;

  -- before the rules epoch a cleared day pays its point but leaves the streak alone
  v_count := v_count + 1;
  v_rest := false
    and extract(isodow from date '2026-12-07')::smallint = any ('{}'::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, false, true, true)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(false, v_rest, false, v_total, v_done);
  if v_outcome.status is distinct from 'cleared'
     or v_total <> 1 or v_done <> 1
     or v_outcome.free_points <> 1
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'neutral' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'before the rules epoch a cleared day pays its point but leaves the streak alone', v_outcome, v_done, v_total;
  end if;

  -- an unscheduled core quest is not tallied
  v_count := v_count + 1;
  v_rest := true
    and extract(isodow from date '2026-12-07')::smallint = any ('{}'::smallint[]);
  select count(*) filter (where public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)),
         count(*) filter (where q.done and public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest))
    into v_total, v_done
    from (values (true, false, false, false), (true, false, true, true)) as q(is_core, on_rest, scheduled, done);
  select * into v_outcome
    from public.day_outcome(true, v_rest, false, v_total, v_done);
  if v_outcome.status is distinct from 'cleared'
     or v_total <> 1 or v_done <> 1
     or v_outcome.free_points <> 1
     or v_outcome.creates_penalty is distinct from false
     or v_outcome.streak_effect is distinct from 'extend' then
    raise exception 'day_outcome mismatch (%): got % (% of %)',
      'an unscheduled core quest is not tallied', v_outcome, v_done, v_total;
  end if;

  raise notice 'day outcome parity: % vectors passed', v_count;
end;
$$;

do $$
declare
  v_count integer := 0;
  v_streak integer;
  v_next integer;
  v_held integer;
  v_i integer;
  v_effects text[];
  v_modes text[];
  v_spent integer[];
  v_stone_days integer[];
begin
  -- two weeks of clears earn a stone at day 7 and day 14
  v_count := v_count + 1;
  v_streak := 0;
  v_held := 0;
  v_stone_days := '{}';
  v_effects := array['extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend'];
  v_modes := array['standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard'];
  v_spent := array[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for v_i in 1 .. cardinality(v_effects) loop
    v_next := public.next_streak(v_streak, v_effects[v_i]);
    if public.earns_stone(v_streak, v_next, v_held, v_modes[v_i]) then
      v_held := v_held + 1;
      v_stone_days := v_stone_days || v_i;
    end if;
    v_streak := v_next;
    v_held := v_held - v_spent[v_i];
  end loop;
  if v_streak <> 14 or v_held <> 2
     or v_stone_days <> array[7, 14]::integer[] then
    raise exception 'streak mismatch (%): streak %, held %, stone days %',
      'two weeks of clears earn a stone at day 7 and day 14', v_streak, v_held, v_stone_days;
  end if;

  -- no stone beyond three held
  v_count := v_count + 1;
  v_streak := 0;
  v_held := 0;
  v_stone_days := '{}';
  v_effects := array['extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend'];
  v_modes := array['standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard'];
  v_spent := array[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for v_i in 1 .. cardinality(v_effects) loop
    v_next := public.next_streak(v_streak, v_effects[v_i]);
    if public.earns_stone(v_streak, v_next, v_held, v_modes[v_i]) then
      v_held := v_held + 1;
      v_stone_days := v_stone_days || v_i;
    end if;
    v_streak := v_next;
    v_held := v_held - v_spent[v_i];
  end loop;
  if v_streak <> 28 or v_held <> 3
     or v_stone_days <> array[7, 14, 21]::integer[] then
    raise exception 'streak mismatch (%): streak %, held %, stone days %',
      'no stone beyond three held', v_streak, v_held, v_stone_days;
  end if;

  -- spending one below the cap lets the next multiple earn again
  v_count := v_count + 1;
  v_streak := 0;
  v_held := 0;
  v_stone_days := '{}';
  v_effects := array['extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend'];
  v_modes := array['standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard'];
  v_spent := array[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
  for v_i in 1 .. cardinality(v_effects) loop
    v_next := public.next_streak(v_streak, v_effects[v_i]);
    if public.earns_stone(v_streak, v_next, v_held, v_modes[v_i]) then
      v_held := v_held + 1;
      v_stone_days := v_stone_days || v_i;
    end if;
    v_streak := v_next;
    v_held := v_held - v_spent[v_i];
  end loop;
  if v_streak <> 28 or v_held <> 3
     or v_stone_days <> array[7, 14, 21, 28]::integer[] then
    raise exception 'streak mismatch (%): streak %, held %, stone days %',
      'spending one below the cap lets the next multiple earn again', v_streak, v_held, v_stone_days;
  end if;

  -- a failed day resets the streak
  v_count := v_count + 1;
  v_streak := 0;
  v_held := 0;
  v_stone_days := '{}';
  v_effects := array['extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'reset', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend'];
  v_modes := array['standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard'];
  v_spent := array[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for v_i in 1 .. cardinality(v_effects) loop
    v_next := public.next_streak(v_streak, v_effects[v_i]);
    if public.earns_stone(v_streak, v_next, v_held, v_modes[v_i]) then
      v_held := v_held + 1;
      v_stone_days := v_stone_days || v_i;
    end if;
    v_streak := v_next;
    v_held := v_held - v_spent[v_i];
  end loop;
  if v_streak <> 7 or v_held <> 1
     or v_stone_days <> array[14]::integer[] then
    raise exception 'streak mismatch (%): streak %, held %, stone days %',
      'a failed day resets the streak', v_streak, v_held, v_stone_days;
  end if;

  -- rest and safe days neither break nor extend
  v_count := v_count + 1;
  v_streak := 0;
  v_held := 0;
  v_stone_days := '{}';
  v_effects := array['extend', 'extend', 'extend', 'neutral', 'neutral', 'extend', 'extend', 'extend', 'extend'];
  v_modes := array['standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard'];
  v_spent := array[0, 0, 0, 0, 0, 0, 0, 0, 0];
  for v_i in 1 .. cardinality(v_effects) loop
    v_next := public.next_streak(v_streak, v_effects[v_i]);
    if public.earns_stone(v_streak, v_next, v_held, v_modes[v_i]) then
      v_held := v_held + 1;
      v_stone_days := v_stone_days || v_i;
    end if;
    v_streak := v_next;
    v_held := v_held - v_spent[v_i];
  end loop;
  if v_streak <> 7 or v_held <> 1
     or v_stone_days <> array[9]::integer[] then
    raise exception 'streak mismatch (%): streak %, held %, stone days %',
      'rest and safe days neither break nor extend', v_streak, v_held, v_stone_days;
  end if;

  -- Hardcore earns nothing, and a multiple reached in Hardcore is not paid later
  v_count := v_count + 1;
  v_streak := 0;
  v_held := 0;
  v_stone_days := '{}';
  v_effects := array['extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend'];
  v_modes := array['lenient', 'lenient', 'lenient', 'lenient', 'lenient', 'lenient', 'hardcore', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard'];
  v_spent := array[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for v_i in 1 .. cardinality(v_effects) loop
    v_next := public.next_streak(v_streak, v_effects[v_i]);
    if public.earns_stone(v_streak, v_next, v_held, v_modes[v_i]) then
      v_held := v_held + 1;
      v_stone_days := v_stone_days || v_i;
    end if;
    v_streak := v_next;
    v_held := v_held - v_spent[v_i];
  end loop;
  if v_streak <> 14 or v_held <> 1
     or v_stone_days <> array[14]::integer[] then
    raise exception 'streak mismatch (%): streak %, held %, stone days %',
      'Hardcore earns nothing, and a multiple reached in Hardcore is not paid later', v_streak, v_held, v_stone_days;
  end if;

  -- Lenient earns like Standard
  v_count := v_count + 1;
  v_streak := 0;
  v_held := 0;
  v_stone_days := '{}';
  v_effects := array['extend', 'extend', 'extend', 'extend', 'extend', 'extend', 'extend'];
  v_modes := array['lenient', 'lenient', 'lenient', 'lenient', 'lenient', 'lenient', 'lenient'];
  v_spent := array[0, 0, 0, 0, 0, 0, 0];
  for v_i in 1 .. cardinality(v_effects) loop
    v_next := public.next_streak(v_streak, v_effects[v_i]);
    if public.earns_stone(v_streak, v_next, v_held, v_modes[v_i]) then
      v_held := v_held + 1;
      v_stone_days := v_stone_days || v_i;
    end if;
    v_streak := v_next;
    v_held := v_held - v_spent[v_i];
  end loop;
  if v_streak <> 7 or v_held <> 1
     or v_stone_days <> array[7]::integer[] then
    raise exception 'streak mismatch (%): streak %, held %, stone days %',
      'Lenient earns like Standard', v_streak, v_held, v_stone_days;
  end if;

  raise notice 'streak and stone parity: % vectors passed', v_count;
end;
$$;

do $$
declare
  v_count integer := 0;
  v_date date;
  v_refusal text;
begin
  -- Standard, one second before 23:00 Berlin: starts today
  v_count := v_count + 1;
  v_date := public.safe_period_start(timestamptz '2026-12-07T21:59:59Z', 'Europe/Berlin', 'standard');
  if v_date <> date '2026-12-07' then
    raise exception 'safe_period_start mismatch (%): got %', 'Standard, one second before 23:00 Berlin: starts today', v_date;
  end if;

  -- Standard, at 23:00 Berlin: starts tomorrow
  v_count := v_count + 1;
  v_date := public.safe_period_start(timestamptz '2026-12-07T22:00:00Z', 'Europe/Berlin', 'standard');
  if v_date <> date '2026-12-08' then
    raise exception 'safe_period_start mismatch (%): got %', 'Standard, at 23:00 Berlin: starts tomorrow', v_date;
  end if;

  -- 02:30 is still the previous game day, after its warning: tomorrow
  v_count := v_count + 1;
  v_date := public.safe_period_start(timestamptz '2026-12-08T01:30:00Z', 'Europe/Berlin', 'standard');
  if v_date <> date '2026-12-08' then
    raise exception 'safe_period_start mismatch (%): got %', '02:30 is still the previous game day, after its warning: tomorrow', v_date;
  end if;

  -- Lenient warns at 21:00, so 20:59 still starts today
  v_count := v_count + 1;
  v_date := public.safe_period_start(timestamptz '2026-12-07T19:59:00Z', 'Europe/Berlin', 'lenient');
  if v_date <> date '2026-12-07' then
    raise exception 'safe_period_start mismatch (%): got %', 'Lenient warns at 21:00, so 20:59 still starts today', v_date;
  end if;

  -- Lenient at 21:00: tomorrow
  v_count := v_count + 1;
  v_date := public.safe_period_start(timestamptz '2026-12-07T20:00:00Z', 'Europe/Berlin', 'lenient');
  if v_date <> date '2026-12-08' then
    raise exception 'safe_period_start mismatch (%): got %', 'Lenient at 21:00: tomorrow', v_date;
  end if;

  -- just after the rollover: a fresh day, starts today
  v_count := v_count + 1;
  v_date := public.safe_period_start(timestamptz '2026-12-07T02:30:00Z', 'Europe/Berlin', 'hardcore');
  if v_date <> date '2026-12-07' then
    raise exception 'safe_period_start mismatch (%): got %', 'just after the rollover: a fresh day, starts today', v_date;
  end if;

  -- India, no DST: 22:59 IST starts today
  v_count := v_count + 1;
  v_date := public.safe_period_start(timestamptz '2026-12-07T17:29:00Z', 'Asia/Kolkata', 'standard');
  if v_date <> date '2026-12-07' then
    raise exception 'safe_period_start mismatch (%): got %', 'India, no DST: 22:59 IST starts today', v_date;
  end if;

  -- an empty history allows a full week
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    '{}'::date[], '{}'::date[], '{}'::date[], date '2026-12-07', 7);
  if v_refusal is distinct from null then
    raise exception 'safe_period_refusal mismatch (%): got %', 'an empty history allows a full week', v_refusal;
  end if;

  -- 7 booked plus 3 is exactly the quota
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    array[date '2026-12-01']::date[], array[date '2026-12-07']::date[], array[null]::date[], date '2026-12-10', 3);
  if v_refusal is distinct from null then
    raise exception 'safe_period_refusal mismatch (%): got %', '7 booked plus 3 is exactly the quota', v_refusal;
  end if;

  -- 7 booked plus 4 is over
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    array[date '2026-12-01']::date[], array[date '2026-12-07']::date[], array[null]::date[], date '2026-12-10', 4);
  if v_refusal is distinct from 'SAFE_QUOTA_EXCEEDED' then
    raise exception 'safe_period_refusal mismatch (%): got %', '7 booked plus 4 is over', v_refusal;
  end if;

  -- an early end gives the unused days back
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    array[date '2026-12-01']::date[], array[date '2026-12-07']::date[], array[date '2026-12-04']::date[], date '2026-12-10', 7);
  if v_refusal is distinct from null then
    raise exception 'safe_period_refusal mismatch (%): got %', 'an early end gives the unused days back', v_refusal;
  end if;

  -- periods may not overlap
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    array[date '2026-12-05']::date[], array[date '2026-12-09']::date[], array[null]::date[], date '2026-12-08', 2);
  if v_refusal is distinct from 'SAFE_PERIOD_OVERLAP' then
    raise exception 'safe_period_refusal mismatch (%): got %', 'periods may not overlap', v_refusal;
  end if;

  -- zero days is not a period
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    '{}'::date[], '{}'::date[], '{}'::date[], date '2026-12-08', 0);
  if v_refusal is distinct from 'SAFE_PERIOD_LENGTH' then
    raise exception 'safe_period_refusal mismatch (%): got %', 'zero days is not a period', v_refusal;
  end if;

  -- eight days is too long
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    '{}'::date[], '{}'::date[], '{}'::date[], date '2026-12-08', 8);
  if v_refusal is distinct from 'SAFE_PERIOD_LENGTH' then
    raise exception 'safe_period_refusal mismatch (%): got %', 'eight days is too long', v_refusal;
  end if;

  -- the oldest booked day has left the 30-day window
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    array[date '2026-12-01', date '2026-12-20']::date[], array[date '2026-12-07', date '2026-12-22']::date[], array[null, null]::date[], date '2026-12-31', 1);
  if v_refusal is distinct from null then
    raise exception 'safe_period_refusal mismatch (%): got %', 'the oldest booked day has left the 30-day window', v_refusal;
  end if;

  -- one day earlier, all 11 days share a window
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    array[date '2026-12-01', date '2026-12-20']::date[], array[date '2026-12-07', date '2026-12-22']::date[], array[null, null]::date[], date '2026-12-30', 1);
  if v_refusal is distinct from 'SAFE_QUOTA_EXCEEDED' then
    raise exception 'safe_period_refusal mismatch (%): got %', 'one day earlier, all 11 days share a window', v_refusal;
  end if;

  -- a future booking counts against an earlier new period
  v_count := v_count + 1;
  v_refusal := public.safe_period_refusal(
    array[date '2026-12-20']::date[], array[date '2026-12-26']::date[], array[null]::date[], date '2026-12-10', 4);
  if v_refusal is distinct from 'SAFE_QUOTA_EXCEEDED' then
    raise exception 'safe_period_refusal mismatch (%): got %', 'a future booking counts against an earlier new period', v_refusal;
  end if;

  raise notice 'safe period parity: % vectors passed', v_count;
end;
$$;
