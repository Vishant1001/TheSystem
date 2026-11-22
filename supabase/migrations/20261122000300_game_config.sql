-- GENERATED FILE - DO NOT EDIT BY HAND.
-- Source: src/game/game-config.json (+ src/game/testdata/game-date-vectors.json)
-- Regenerate: npm run gen:sql

-- Seed of public.game_config (ADR-4). SQL owns awards and caps; the TypeScript
-- engine owns the curves. Both read these same numbers.

insert into public.game_config (key, value)
values
  ('version', '1'::jsonb),
  ('game_day_start_hour', '3'::jsonb),
  ('quest_xp_by_difficulty', '{"E":10,"D":20,"C":35,"B":50,"A":75,"S":100}'::jsonb),
  ('daily_caps', '{"fitness":150,"diet":100,"life":150}'::jsonb),
  ('stat_xp_divisor', '2'::jsonb),
  ('min_stat_xp_per_tag', '1'::jsonb),
  ('free_points_per_daily_clear', '1'::jsonb),
  ('close_days_max_backfill', '30'::jsonb)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
