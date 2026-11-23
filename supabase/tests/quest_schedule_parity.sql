-- GENERATED FILE - DO NOT EDIT BY HAND.
-- Source: src/game/game-config.json (+ src/game/testdata/game-date-vectors.json)
-- Regenerate: npm run gen:sql

-- Quest scheduling parity: the same vectors drive src/game/schedule.test.ts and
-- this file, so the predicate the client renders from and the one close_days()
-- tallies with cannot drift. Expected values are written by hand in the JSON,
-- not taken from either implementation.
--
--   psql "$DATABASE_URL" -f supabase/tests/quest_schedule_parity.sql

do $$
declare
  v_actual boolean;
  v_count integer := 0;
begin
  -- weekday-only quest on a Friday
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5]::smallint[], null,
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-09', 'Europe/Berlin');
  if v_actual is distinct from true then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'weekday-only quest on a Friday', v_actual, true;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-09', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'weekday-only quest on a Friday', v_actual, false;
  end if;

  -- weekday-only quest on a Saturday
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5]::smallint[], null,
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-10', 'Europe/Berlin');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'weekday-only quest on a Saturday', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-10', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'weekday-only quest on a Saturday', v_actual, false;
  end if;

  -- every-day quest on a Sunday
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5, 6, 7]::smallint[], null,
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-11', 'Europe/Berlin');
  if v_actual is distinct from true then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'every-day quest on a Sunday', v_actual, true;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-11', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'every-day quest on a Sunday', v_actual, false;
  end if;

  -- a daily quest scheduled for no days at all
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[]::smallint[], null,
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-09', 'Europe/Berlin');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'a daily quest scheduled for no days at all', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-09', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'a daily quest scheduled for no days at all', v_actual, false;
  end if;

  -- created at 01:30 Berlin: before the rollover, so it belongs to the previous game day
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5, 6, 7]::smallint[], null,
    timestamptz '2026-01-09T00:30:00Z',
    null,
    date '2026-01-08', 'Europe/Berlin');
  if v_actual is distinct from true then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'created at 01:30 Berlin: before the rollover, so it belongs to the previous game day', v_actual, true;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-08', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'created at 01:30 Berlin: before the rollover, so it belongs to the previous game day', v_actual, false;
  end if;

  -- the same quest did not exist the game day before that
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5, 6, 7]::smallint[], null,
    timestamptz '2026-01-09T00:30:00Z',
    null,
    date '2026-01-07', 'Europe/Berlin');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'the same quest did not exist the game day before that', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-07', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'the same quest did not exist the game day before that', v_actual, false;
  end if;

  -- created at 04:30 Berlin: past the rollover, so it starts the new game day
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5, 6, 7]::smallint[], null,
    timestamptz '2026-01-09T03:30:00Z',
    null,
    date '2026-01-08', 'Europe/Berlin');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'created at 04:30 Berlin: past the rollover, so it starts the new game day', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-08', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'created at 04:30 Berlin: past the rollover, so it starts the new game day', v_actual, false;
  end if;

  -- archived at 02:00 Berlin: counts as archived on the previous game day
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5, 6, 7]::smallint[], null,
    timestamptz '2026-01-01T08:00:00Z',
    timestamptz '2026-01-10T01:00:00Z',
    date '2026-01-09', 'Europe/Berlin');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'archived at 02:00 Berlin: counts as archived on the previous game day', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-09', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'archived at 02:00 Berlin: counts as archived on the previous game day', v_actual, false;
  end if;

  -- the same quest was still live the game day before it was archived
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5, 6, 7]::smallint[], null,
    timestamptz '2026-01-01T08:00:00Z',
    timestamptz '2026-01-10T01:00:00Z',
    date '2026-01-08', 'Europe/Berlin');
  if v_actual is distinct from true then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'the same quest was still live the game day before it was archived', v_actual, true;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-08', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'the same quest was still live the game day before it was archived', v_actual, false;
  end if;

  -- one-time quest on its due day
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'one_time', null, date '2026-01-10',
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-10', 'Europe/Berlin');
  if v_actual is distinct from true then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'one-time quest on its due day', v_actual, true;
  end if;

  v_actual := public.quest_overdue_on(
    'one_time', date '2026-01-10', date '2026-01-10', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'one-time quest on its due day', v_actual, false;
  end if;

  -- one-time quest the day before it is due
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'one_time', null, date '2026-01-10',
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-09', 'Europe/Berlin');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'one-time quest the day before it is due', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'one_time', date '2026-01-10', date '2026-01-09', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'one-time quest the day before it is due', v_actual, false;
  end if;

  -- one-time quest left undone after its due day is overdue, but counts for no day
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'one_time', null, date '2026-01-10',
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-11', 'Europe/Berlin');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'one-time quest left undone after its due day is overdue, but counts for no day', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'one_time', date '2026-01-10', date '2026-01-11', false);
  if v_actual is distinct from true then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'one-time quest left undone after its due day is overdue, but counts for no day', v_actual, true;
  end if;

  -- the same quest once completed is no longer overdue
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'one_time', null, date '2026-01-10',
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-11', 'Europe/Berlin');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'the same quest once completed is no longer overdue', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'one_time', date '2026-01-10', date '2026-01-11', true);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'the same quest once completed is no longer overdue', v_actual, false;
  end if;

  -- an undated one-time quest never counts for a day and is never overdue
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'one_time', null, null,
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-11', 'Europe/Berlin');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'an undated one-time quest never counts for a day and is never overdue', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'one_time', null, date '2026-01-11', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'an undated one-time quest never counts for a day and is never overdue', v_actual, false;
  end if;

  -- a daily quest is never overdue
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5, 6, 7]::smallint[], null,
    timestamptz '2026-01-01T08:00:00Z',
    null,
    date '2026-01-11', 'Europe/Berlin');
  if v_actual is distinct from true then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'a daily quest is never overdue', v_actual, true;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-11', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'a daily quest is never overdue', v_actual, false;
  end if;

  -- western timezone: created 02:00 local, so the previous game day owns it
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5, 6, 7]::smallint[], null,
    timestamptz '2026-01-09T10:00:00Z',
    null,
    date '2026-01-08', 'America/Los_Angeles');
  if v_actual is distinct from true then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'western timezone: created 02:00 local, so the previous game day owns it', v_actual, true;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-08', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'western timezone: created 02:00 local, so the previous game day owns it', v_actual, false;
  end if;

  -- western timezone: created 03:00 local, so the new game day owns it
  v_count := v_count + 1;
  v_actual := public.quest_scheduled_on(
    'daily', array[1, 2, 3, 4, 5, 6, 7]::smallint[], null,
    timestamptz '2026-01-09T11:00:00Z',
    null,
    date '2026-01-08', 'America/Los_Angeles');
  if v_actual is distinct from false then
    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',
      'western timezone: created 03:00 local, so the new game day owns it', v_actual, false;
  end if;

  v_actual := public.quest_overdue_on(
    'daily', null, date '2026-01-08', false);
  if v_actual is distinct from false then
    raise exception 'quest_overdue_on mismatch (%): got %, expected %',
      'western timezone: created 03:00 local, so the new game day owns it', v_actual, false;
  end if;

  raise notice 'quest schedule parity: % vectors passed', v_count;
end;
$$;
