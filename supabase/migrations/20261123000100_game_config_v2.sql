-- GENERATED FILE - DO NOT EDIT BY HAND.
-- Source: src/game/game-config.json (+ src/game/testdata/game-date-vectors.json)
-- Regenerate: npm run gen:sql

-- Seed of public.game_config (ADR-4, amended in Phase 2). SQL owns awards and
-- caps; TypeScript is the reference for the curves, which SQL may read (the
-- level curve sizes XP Debt). Both read these same numbers.
--
-- Forward-only: this re-seeds every key with an upsert, so it supersedes the
-- Phase 1 seed (20261122000300_game_config.sql) without editing it.

insert into public.game_config (key, value)
values
  ('version', '2'::jsonb),
  ('game_day_start_hour', '3'::jsonb),
  ('quest_xp_by_difficulty', '{"E":10,"D":20,"C":35,"B":50,"A":75,"S":100}'::jsonb),
  ('daily_caps', '{"fitness":150,"diet":100,"life":150}'::jsonb),
  ('stat_xp_divisor', '2'::jsonb),
  ('min_stat_xp_per_tag', '1'::jsonb),
  ('free_points_per_daily_clear', '1'::jsonb),
  ('close_days_max_backfill', '30'::jsonb),
  ('level_curve', '{"base":50,"coefficient":6,"exponent":1.7,"roundTo":10,"startLevel":1,"maxLevel":999}'::jsonb),
  ('stat_order', '["STR","AGI","VIT","INT","SENSE"]'::jsonb),
  ('award_sources', '{"quest":{"capped":true,"repaysDebt":true},"workout":{"capped":true,"repaysDebt":true},"pr":{"capped":false,"repaysDebt":true},"boss":{"capped":false,"repaysDebt":false},"trial":{"capped":false,"repaysDebt":false},"daily_clear":{"capped":false,"repaysDebt":false}}'::jsonb),
  ('penalty', '{"modes":["lenient","standard","hardcore"],"defaultMode":"standard","warningStartHour":{"lenient":21,"standard":23,"hardcore":23},"debtRatePercent":{"lenient":10,"standard":20,"escalated":30},"debtRepaymentDivisor":2,"categoryOrder":["fitness","diet","life"],"weakenedDays":2,"trial":{"xp":20,"deadlineHours":24,"maxTarget":{"duration":60,"count":5},"templates":{"fitness":{"title":"Survival circuit","goalType":"duration","target":15,"statTags":["STR","AGI"],"tracking":"manual"},"diet":{"title":"Log every meal","goalType":"count","target":3,"statTags":["VIT"],"tracking":"auto_food_count"},"life":{"title":"Focus trial","goalType":"duration","target":45,"statTags":["INT"],"tracking":"manual"}}}}'::jsonb),
  ('stones', '{"streakInterval":7,"maxHeld":3}'::jsonb),
  ('safe_zones', '{"maxRestDays":2,"minPeriodDays":1,"maxPeriodDays":7,"quotaDays":10,"quotaWindowDays":30}'::jsonb),
  ('gym', '{"kinds":{"strength":"STR","cardio":"AGI","mobility":"VIT"},"libraryCategoryKinds":{"strength":"strength","powerlifting":"strength","olympic weightlifting":"strength","strongman":"strength","cardio":"cardio","plyometrics":"cardio","stretching":"mobility"},"setXp":2,"maxWorkingSetsPerDay":20,"pr":{"xp":25,"statXp":10,"maxBonusesPerDay":2,"e1rmMinReps":1,"e1rmMaxReps":12,"e1rmRepsDivisor":30,"kinds":["strength"]},"boss":{"xpMultiplier":2,"freePoints":1,"maxActive":5,"defaultTargetReps":1,"kinds":["strength"]},"restTimer":{"defaultSeconds":90,"stepSeconds":15,"minSeconds":15,"maxSeconds":600}}'::jsonb)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
