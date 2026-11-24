-- GENERATED FILE - DO NOT EDIT BY HAND.
-- Source: src/game/game-config.json (+ src/game/testdata/game-date-vectors.json)
-- Regenerate: npm run gen:sql

-- Gym parity. Generated from src/game/testdata/gym-vectors.json, the same
-- file gym.test.ts runs against the engine.

do $$
declare
  v_count integer := 0;
  v_actual integer;
begin
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
end;
$$;
