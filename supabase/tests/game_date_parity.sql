-- GENERATED FILE - DO NOT EDIT BY HAND.
-- Source: src/game/game-config.json (+ src/game/testdata/game-date-vectors.json)
-- Regenerate: npm run gen:sql

-- C5 parity: these are the same vectors the TypeScript engine is tested against
-- in src/game/gameDate.test.ts. If SQL and the engine ever disagree about which
-- game day an instant belongs to, one of these two suites fails.
--
-- Run against a database that already has the migrations applied:
--   psql "$DATABASE_URL" -f supabase/tests/game_date_parity.sql

do $$
declare
  v_actual date;
  v_count integer := 0;
begin
  -- before the rollover hour, still the previous game day
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T00:30:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-01-14' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T00:30:00Z', 'Europe/Berlin', 3, v_actual, date '2026-01-14';
  end if;

  -- exactly on the rollover hour, the new game day starts
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T02:00:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-01-15' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T02:00:00Z', 'Europe/Berlin', 3, v_actual, date '2026-01-15';
  end if;

  -- one second before the rollover
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T01:59:59Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-01-14' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T01:59:59Z', 'Europe/Berlin', 3, v_actual, date '2026-01-14';
  end if;

  -- local midnight belongs to the day before
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-14T23:00:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-01-14' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-14T23:00:00Z', 'Europe/Berlin', 3, v_actual, date '2026-01-14';
  end if;

  -- late evening is the same game day
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T22:00:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-01-15' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T22:00:00Z', 'Europe/Berlin', 3, v_actual, date '2026-01-15';
  end if;

  -- DST spring forward, before the jump
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-03-29T00:30:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-03-28' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-03-29T00:30:00Z', 'Europe/Berlin', 3, v_actual, date '2026-03-28';
  end if;

  -- DST spring forward, after the jump the clock is already past 03:00
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-03-29T01:30:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-03-29' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-03-29T01:30:00Z', 'Europe/Berlin', 3, v_actual, date '2026-03-29';
  end if;

  -- DST fall back, first pass through 02:30
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-10-25T00:30:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-10-24' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-10-25T00:30:00Z', 'Europe/Berlin', 3, v_actual, date '2026-10-24';
  end if;

  -- DST fall back, repeated 02:30 maps to the same game day
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-10-25T01:30:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-10-24' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-10-25T01:30:00Z', 'Europe/Berlin', 3, v_actual, date '2026-10-24';
  end if;

  -- DST fall back, past the rollover
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-10-25T02:30:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-10-25' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-10-25T02:30:00Z', 'Europe/Berlin', 3, v_actual, date '2026-10-25';
  end if;

  -- western timezone before rollover
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T10:00:00Z', 'America/Los_Angeles', 3);
  if v_actual <> date '2026-01-14' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T10:00:00Z', 'America/Los_Angeles', 3, v_actual, date '2026-01-14';
  end if;

  -- western timezone on rollover
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T11:00:00Z', 'America/Los_Angeles', 3);
  if v_actual <> date '2026-01-15' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T11:00:00Z', 'America/Los_Angeles', 3, v_actual, date '2026-01-15';
  end if;

  -- far eastern timezone, already tomorrow locally but before rollover
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T13:00:00Z', 'Pacific/Auckland', 3);
  if v_actual <> date '2026-01-15' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T13:00:00Z', 'Pacific/Auckland', 3, v_actual, date '2026-01-15';
  end if;

  -- far eastern timezone on rollover
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T14:00:00Z', 'Pacific/Auckland', 3);
  if v_actual <> date '2026-01-16' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T14:00:00Z', 'Pacific/Auckland', 3, v_actual, date '2026-01-16';
  end if;

  -- UTC just before rollover
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-06-01T02:59:00Z', 'UTC', 3);
  if v_actual <> date '2026-05-31' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-06-01T02:59:00Z', 'UTC', 3, v_actual, date '2026-05-31';
  end if;

  -- UTC on rollover
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-06-01T03:00:00Z', 'UTC', 3);
  if v_actual <> date '2026-06-01' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-06-01T03:00:00Z', 'UTC', 3, v_actual, date '2026-06-01';
  end if;

  -- startHour 0 means the game day is the calendar day
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T00:30:00Z', 'Europe/Berlin', 0);
  if v_actual <> date '2026-01-15' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T00:30:00Z', 'Europe/Berlin', 0, v_actual, date '2026-01-15';
  end if;

  -- startHour 0 at local midnight
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-14T23:00:00Z', 'Europe/Berlin', 0);
  if v_actual <> date '2026-01-15' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-14T23:00:00Z', 'Europe/Berlin', 0, v_actual, date '2026-01-15';
  end if;

  -- a late rollover hour pushes most of the day backwards
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2026-01-15T20:00:00Z', 'Europe/Berlin', 23);
  if v_actual <> date '2026-01-14' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2026-01-15T20:00:00Z', 'Europe/Berlin', 23, v_actual, date '2026-01-14';
  end if;

  -- year boundary before rollover
  v_count := v_count + 1;
  v_actual := public.game_date_at(timestamptz '2027-01-01T01:00:00Z', 'Europe/Berlin', 3);
  if v_actual <> date '2026-12-31' then
    raise exception 'game_date_at(%, %, %) returned %, expected %',
      '2027-01-01T01:00:00Z', 'Europe/Berlin', 3, v_actual, date '2026-12-31';
  end if;

  raise notice 'game_date parity: % vectors passed', v_count;
end;
$$;
