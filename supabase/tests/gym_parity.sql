-- GENERATED FILE - DO NOT EDIT BY HAND.
-- Source: src/game/game-config.json (+ src/game/testdata/game-date-vectors.json)
-- Regenerate: npm run gen:sql

-- Gym parity. Generated from src/game/testdata/gym-vectors.json, the same
-- file gym.test.ts runs against the engine.

do $$
declare
  v_count integer := 0;
  v_actual integer;
  v_json jsonb;
  v_set_xp record;
begin
  -- e1RM (Epley, centi-kg, half up)
  v_count := 0;
  -- 100 kg x 5
  v_count := v_count + 1;
  v_actual := public.e1rm_centi(10000, 5);
  if v_actual is distinct from 11667 then
    raise exception 'e1rm_centi mismatch (%): got %', '100 kg x 5', v_actual;
  end if;

  -- 60 kg x 8, exact
  v_count := v_count + 1;
  v_actual := public.e1rm_centi(6000, 8);
  if v_actual is distinct from 7600 then
    raise exception 'e1rm_centi mismatch (%): got %', '60 kg x 8, exact', v_actual;
  end if;

  -- 80 kg x 1
  v_count := v_count + 1;
  v_actual := public.e1rm_centi(8000, 1);
  if v_actual is distinct from 8267 then
    raise exception 'e1rm_centi mismatch (%): got %', '80 kg x 1', v_actual;
  end if;

  -- the top of the rep range
  v_count := v_count + 1;
  v_actual := public.e1rm_centi(5000, 12);
  if v_actual is distinct from 7000 then
    raise exception 'e1rm_centi mismatch (%): got %', 'the top of the rep range', v_actual;
  end if;

  -- above the rep range
  v_count := v_count + 1;
  v_actual := public.e1rm_centi(5000, 13);
  if v_actual is distinct from null then
    raise exception 'e1rm_centi mismatch (%): got %', 'above the rep range', v_actual;
  end if;

  -- zero reps
  v_count := v_count + 1;
  v_actual := public.e1rm_centi(5000, 0);
  if v_actual is distinct from null then
    raise exception 'e1rm_centi mismatch (%): got %', 'zero reps', v_actual;
  end if;

  -- exactly half a centi-kg rounds up
  v_count := v_count + 1;
  v_actual := public.e1rm_centi(15, 3);
  if v_actual is distinct from 17 then
    raise exception 'e1rm_centi mismatch (%): got %', 'exactly half a centi-kg rounds up', v_actual;
  end if;

  -- no weight
  v_count := v_count + 1;
  v_actual := public.e1rm_centi(0, 5);
  if v_actual is distinct from null then
    raise exception 'e1rm_centi mismatch (%): got %', 'no weight', v_actual;
  end if;

  -- the toast example, 77.5 kg x 6
  v_count := v_count + 1;
  v_actual := public.e1rm_centi(7750, 6);
  if v_actual is distinct from 9300 then
    raise exception 'e1rm_centi mismatch (%): got %', 'the toast example, 77.5 kg x 6', v_actual;
  end if;
  raise notice 'e1RM parity: % vectors passed', v_count;

  -- PR detection
  v_count := 0;
  -- first time ever: both kinds are baselines, no bonus
  v_count := v_count + 1;
  v_json := public.detect_prs('strength', null, null,
    '[{"set_type":"working","reps":5,"weight_kg":100},{"set_type":"working","reps":8,"weight_kg":80}]'::jsonb);
  if v_json is distinct from '{"records":[{"pr_kind":"e1rm","value_centi":11667,"set_index":0,"baseline":true},{"pr_kind":"max_weight","value_centi":10000,"set_index":0,"baseline":true}],"bonus_set_indexes":[]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', 'first time ever: both kinds are baselines, no bonus', v_json;
  end if;

  -- one set breaks both records: one bonus; warmups ignored
  v_count := v_count + 1;
  v_json := public.detect_prs('strength', 11000, 9500,
    '[{"set_type":"warmup","reps":3,"weight_kg":120},{"set_type":"working","reps":5,"weight_kg":100}]'::jsonb);
  if v_json is distinct from '{"records":[{"pr_kind":"e1rm","value_centi":11667,"set_index":1,"baseline":false},{"pr_kind":"max_weight","value_centi":10000,"set_index":1,"baseline":false}],"bonus_set_indexes":[1]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', 'one set breaks both records: one bonus; warmups ignored', v_json;
  end if;

  -- e1RM record only
  v_count := v_count + 1;
  v_json := public.detect_prs('strength', 11000, 12000,
    '[{"set_type":"working","reps":5,"weight_kg":100}]'::jsonb);
  if v_json is distinct from '{"records":[{"pr_kind":"e1rm","value_centi":11667,"set_index":0,"baseline":false}],"bonus_set_indexes":[0]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', 'e1RM record only', v_json;
  end if;

  -- two different sets break the two records: two bonuses
  v_count := v_count + 1;
  v_json := public.detect_prs('strength', 12000, 10000,
    '[{"set_type":"working","reps":1,"weight_kg":105},{"set_type":"working","reps":10,"weight_kg":95}]'::jsonb);
  if v_json is distinct from '{"records":[{"pr_kind":"e1rm","value_centi":12667,"set_index":1,"baseline":false},{"pr_kind":"max_weight","value_centi":10500,"set_index":0,"baseline":false}],"bonus_set_indexes":[0,1]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', 'two different sets break the two records: two bonuses', v_json;
  end if;

  -- matching a record is not a record
  v_count := v_count + 1;
  v_json := public.detect_prs('strength', 11667, 10000,
    '[{"set_type":"working","reps":5,"weight_kg":100}]'::jsonb);
  if v_json is distinct from '{"records":[],"bonus_set_indexes":[]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', 'matching a record is not a record', v_json;
  end if;

  -- cardio never has records
  v_count := v_count + 1;
  v_json := public.detect_prs('cardio', null, null,
    '[{"set_type":"working","reps":5,"weight_kg":20}]'::jsonb);
  if v_json is distinct from '{"records":[],"bonus_set_indexes":[]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', 'cardio never has records', v_json;
  end if;

  -- mobility never has records
  v_count := v_count + 1;
  v_json := public.detect_prs('mobility', null, null,
    '[{"set_type":"working","reps":5,"weight_kg":20}]'::jsonb);
  if v_json is distinct from '{"records":[],"bonus_set_indexes":[]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', 'mobility never has records', v_json;
  end if;

  -- 13 reps has no e1RM but can still be the heaviest
  v_count := v_count + 1;
  v_json := public.detect_prs('strength', 5000, 6000,
    '[{"set_type":"working","reps":13,"weight_kg":70}]'::jsonb);
  if v_json is distinct from '{"records":[{"pr_kind":"max_weight","value_centi":7000,"set_index":0,"baseline":false}],"bonus_set_indexes":[0]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', '13 reps has no e1RM but can still be the heaviest', v_json;
  end if;

  -- ties inside a workout go to the earliest set
  v_count := v_count + 1;
  v_json := public.detect_prs('strength', null, null,
    '[{"set_type":"working","reps":5,"weight_kg":100},{"set_type":"working","reps":5,"weight_kg":100}]'::jsonb);
  if v_json is distinct from '{"records":[{"pr_kind":"e1rm","value_centi":11667,"set_index":0,"baseline":true},{"pr_kind":"max_weight","value_centi":10000,"set_index":0,"baseline":true}],"bonus_set_indexes":[]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', 'ties inside a workout go to the earliest set', v_json;
  end if;

  -- bodyweight sets set no records
  v_count := v_count + 1;
  v_json := public.detect_prs('strength', null, null,
    '[{"set_type":"working","reps":10,"weight_kg":null},{"set_type":"working","reps":10,"weight_kg":0}]'::jsonb);
  if v_json is distinct from '{"records":[],"bonus_set_indexes":[]}'::jsonb then
    raise exception 'detect_prs mismatch (%): got %', 'bodyweight sets set no records', v_json;
  end if;
  raise notice 'PR detection parity: % vectors passed', v_count;

  -- PR bonuses payable today (max per game day)
  v_count := 0;
  v_count := v_count + 1;
  v_actual := public.payable_pr_bonuses(2, 0);
  if v_actual is distinct from 2 then
    raise exception 'payable_pr_bonuses(2, 0) mismatch: got %', v_actual;
  end if;

  v_count := v_count + 1;
  v_actual := public.payable_pr_bonuses(3, 0);
  if v_actual is distinct from 2 then
    raise exception 'payable_pr_bonuses(3, 0) mismatch: got %', v_actual;
  end if;

  v_count := v_count + 1;
  v_actual := public.payable_pr_bonuses(1, 1);
  if v_actual is distinct from 1 then
    raise exception 'payable_pr_bonuses(1, 1) mismatch: got %', v_actual;
  end if;

  v_count := v_count + 1;
  v_actual := public.payable_pr_bonuses(2, 1);
  if v_actual is distinct from 1 then
    raise exception 'payable_pr_bonuses(2, 1) mismatch: got %', v_actual;
  end if;

  v_count := v_count + 1;
  v_actual := public.payable_pr_bonuses(1, 2);
  if v_actual is distinct from 0 then
    raise exception 'payable_pr_bonuses(1, 2) mismatch: got %', v_actual;
  end if;
  raise notice 'PR bonus limit parity: % vectors passed', v_count;

  -- Set XP
  v_count := 0;
  -- 8 working strength sets and 2 warmups
  v_count := v_count + 1;
  select * into v_set_xp from public.workout_set_xp('[{"kind":"strength","set_type":"warmup"},{"kind":"strength","set_type":"warmup"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"}]'::jsonb, 0);
  if v_set_xp.counted_sets is distinct from 8
     or v_set_xp.full_xp is distinct from 16
     or v_set_xp.stats is distinct from '[{"stat":"STR","weight":8}]'::jsonb then
    raise exception 'workout_set_xp mismatch (%): got %', '8 working strength sets and 2 warmups', v_set_xp;
  end if;

  -- only the first 5 working sets fit under the daily 20
  v_count := v_count + 1;
  select * into v_set_xp from public.workout_set_xp('[{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"cardio","set_type":"working"},{"kind":"cardio","set_type":"working"},{"kind":"cardio","set_type":"working"},{"kind":"mobility","set_type":"working"},{"kind":"mobility","set_type":"working"}]'::jsonb, 15);
  if v_set_xp.counted_sets is distinct from 5
     or v_set_xp.full_xp is distinct from 10
     or v_set_xp.stats is distinct from '[{"stat":"STR","weight":5}]'::jsonb then
    raise exception 'workout_set_xp mismatch (%): got %', 'only the first 5 working sets fit under the daily 20', v_set_xp;
  end if;

  -- mixed kinds weigh their own stats, in kind order
  v_count := v_count + 1;
  select * into v_set_xp from public.workout_set_xp('[{"kind":"cardio","set_type":"working"},{"kind":"strength","set_type":"working"},{"kind":"mobility","set_type":"working"},{"kind":"strength","set_type":"working"}]'::jsonb, 0);
  if v_set_xp.counted_sets is distinct from 4
     or v_set_xp.full_xp is distinct from 8
     or v_set_xp.stats is distinct from '[{"stat":"STR","weight":2},{"stat":"AGI","weight":1},{"stat":"VIT","weight":1}]'::jsonb then
    raise exception 'workout_set_xp mismatch (%): got %', 'mixed kinds weigh their own stats, in kind order', v_set_xp;
  end if;

  -- the daily allowance already used
  v_count := v_count + 1;
  select * into v_set_xp from public.workout_set_xp('[{"kind":"strength","set_type":"working"},{"kind":"strength","set_type":"working"}]'::jsonb, 20);
  if v_set_xp.counted_sets is distinct from 0
     or v_set_xp.full_xp is distinct from 0
     or v_set_xp.stats is distinct from '[]'::jsonb then
    raise exception 'workout_set_xp mismatch (%): got %', 'the daily allowance already used', v_set_xp;
  end if;
  raise notice 'set XP parity: % vectors passed', v_count;

  -- Boss defeats
  v_count := 0;
  -- weight and reps both met
  v_count := v_count + 1;
  if public.defeats_boss('strength', 100, 1,
       'working', 1, 100)
     is distinct from true then
    raise exception 'defeats_boss mismatch (%)', 'weight and reps both met';
  end if;

  -- heavier but too few reps
  v_count := v_count + 1;
  if public.defeats_boss('strength', 100, 3,
       'working', 2, 110)
     is distinct from false then
    raise exception 'defeats_boss mismatch (%)', 'heavier but too few reps';
  end if;

  -- a warmup never defeats a boss
  v_count := v_count + 1;
  if public.defeats_boss('strength', 60, 1,
       'warmup', 5, 100)
     is distinct from false then
    raise exception 'defeats_boss mismatch (%)', 'a warmup never defeats a boss';
  end if;

  -- 2.5 kg short
  v_count := v_count + 1;
  if public.defeats_boss('strength', 100, 1,
       'working', 5, 97.5)
     is distinct from false then
    raise exception 'defeats_boss mismatch (%)', '2.5 kg short';
  end if;
  raise notice 'boss parity: % vectors passed', v_count;
end;
$$;
