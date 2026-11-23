#!/usr/bin/env node
/**
 * Runs SQL files against the LOCAL Supabase stack, and nothing else.
 *
 *   node scripts/local-sql.mjs <file.sql> [more.sql ...] [--set sim.key=value ...]
 *
 * There is no connection URL anywhere in here. The files are piped into the
 * local stack's own database container (supabase_db_*) and run by the psql
 * inside it over its unix socket, so this script has no way to reach the
 * hosted project. simulate_days.sql additionally refuses any network session
 * and any database without the local stack's identity, so even a file run by
 * hand against the wrong place stops before writing anything.
 *
 * It also sidesteps PowerShell, which has no `<` input redirection.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`local-sql: ${message}`);
  process.exit(1);
}

const files = [];
const settings = [];
const args = process.argv.slice(2);

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--set') {
    const pair = args[index + 1];
    index += 1;
    if (pair === undefined) fail('--set needs a key=value');
    const [key, ...rest] = pair.split('=');
    const value = rest.join('=');
    // Settings are interpolated into a psql -c, so they are held to a strict
    // shape: sim.* keys, and integer or integer-array values only.
    if (!/^sim\.[a-z_]+$/.test(key)) fail(`refusing setting key "${key}" (only sim.*)`);
    if (!/^[0-9{},\s]*$/.test(value)) fail(`refusing setting value "${value}" (integers only)`);
    settings.push([key, value]);
  } else {
    files.push(arg);
  }
}

if (files.length === 0) fail('give at least one .sql file');
for (const file of files) {
  if (!file.endsWith('.sql')) fail(`not a .sql file: ${file}`);
  if (!existsSync(file)) fail(`no such file: ${file}`);
}

let containers;
try {
  containers = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((name) => name.startsWith('supabase_db_'));
} catch {
  fail('docker is not reachable. Start Docker Desktop, then `npx supabase start`.');
}

if (containers.length === 0) fail('no local stack is running. Run `npx supabase start` first.');
if (containers.length > 1) {
  fail(`more than one local stack is running (${containers.join(', ')}); stop the others first.`);
}

const container = containers[0];
const settingArgs = settings.flatMap(([key, value]) => [
  '-c',
  `select set_config('${key}', '${value}', false)`,
]);

for (const file of files) {
  console.log(`\n>> ${file}  (local stack: ${container})`);
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      ...settingArgs,
      '-f',
      '-',
    ],
    { input: readFileSync(file), stdio: ['pipe', 'inherit', 'inherit'] },
  );

  if (result.status !== 0) {
    fail(`${file} failed (psql exit ${String(result.status)})`);
  }
}
