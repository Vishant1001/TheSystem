#!/usr/bin/env node
/**
 * Clock-dependence sweep (Step 2.8). The SQL suites read the real clock
 * (now() is frozen per transaction, but its value is whatever time you run
 * at), and what the rules care about is the hunter's LOCAL time of day. This
 * reruns the RLS proof and every smoke suite with the test hunters placed in
 * each of the 24 whole-hour UTC offsets, so at the instant you run it every
 * local hour of the day - including the warning windows and 00:00-03:00
 * before the rollover - is exercised. Local stack only (via local-sql.mjs).
 *
 *   npm run db:verify:clock
 */
import { spawnSync } from 'node:child_process';

const files = [
  'supabase/tests/rls_proof.sql',
  'supabase/tests/smoke_game_rules.sql',
  'supabase/tests/smoke_safe_zones.sql',
  'supabase/tests/smoke_penalty_zone.sql',
  'supabase/tests/smoke_gym.sql',
];
const offsets = Array.from({ length: 24 }, (_, index) => index - 11); // -11 .. +12

const failures = [];
const utcHour = new Date().getUTCHours();
const utcMinute = String(new Date().getUTCMinutes()).padStart(2, '0');

for (const offset of offsets) {
  const localHour = (((utcHour + offset) % 24) + 24) % 24;
  const label = `UTC${offset >= 0 ? '+' : ''}${String(offset)} (local ${String(localHour).padStart(2, '0')}:${utcMinute})`;
  const result = spawnSync(
    process.execPath,
    ['scripts/local-sql.mjs', ...files, '--set', `test.utc_offset=${String(offset)}`],
    { encoding: 'utf8' },
  );
  const output = `${result.stdout}${result.stderr}`;
  const passed = (output.match(/PASSED/g) ?? []).length;
  if (result.status === 0 && passed >= files.length) {
    console.log(`PASS  ${label}  ${String(passed)} suites`);
  } else {
    const error = /ERROR:\s+(.*)/.exec(output)?.[1] ?? `exit ${String(result.status)}`;
    console.log(`FAIL  ${label}  ${error}`);
    failures.push(label);
  }
}

if (failures.length > 0) {
  console.error(`\nclock sweep: ${String(failures.length)} of 24 local hours failed`);
  process.exit(1);
}
console.log('\nclock sweep: all 24 local hours pass');
