/**
 * How sets, weights and sessions read on screen (brief 4.6). Pure, so the
 * "Last time" line and the history rows are unit-tested.
 */

export interface SetMeasures {
  set_type: string;
  reps: number | null;
  weight_kg: number | null;
  duration_s: number | null;
  distance_m: number | null;
}

/**
 * Step 2.7 review: while a workout draft is unfinished, the Train quest (and
 * the penalty warning) say so - but only while Train is still open.
 */
export function unfinishedWorkoutNote(input: {
  tracking: string;
  trainCompleted: boolean;
  hasDraft: boolean;
  note: string;
}): string | null {
  if (!input.hasDraft || input.trainCompleted) return null;
  return input.tracking === 'auto_workout' ? input.note : null;
}

/** 60 -> "60", 92.5 -> "92.5", 77.25 -> "77.25". */
export function formatKg(kg: number): string {
  return String(Math.round(kg * 100) / 100);
}

export function formatCentiKg(centi: number): string {
  return formatKg(centi / 100);
}

/** 95 -> "1:35", 3725 -> "1:02:05". */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h)}:${String(m).padStart(2, '0')}:${ss}` : `${String(m)}:${ss}`;
}

/** 3000 -> "3 km", 2500 -> "2.5 km", 400 -> "400 m". */
export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${formatKg(meters / 1000)} km` : `${formatKg(meters)} m`;
}

function cardioPart(set: SetMeasures): string {
  return [
    set.duration_s === null ? null : formatDuration(set.duration_s),
    set.distance_m === null ? null : formatDistance(set.distance_m),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** One set: "8 × 60 kg", "12 reps", "20:00 · 3 km". */
export function setLabel(set: SetMeasures): string {
  if (set.reps === null) return cardioPart(set);
  const strength =
    set.weight_kg === null || set.weight_kg === 0
      ? `${String(set.reps)} reps`
      : `${String(set.reps)} × ${formatKg(set.weight_kg)} kg`;
  const cardio = cardioPart(set);
  return cardio === '' ? strength : `${strength} · ${cardio}`;
}

function sameMeasures(a: SetMeasures, b: SetMeasures): boolean {
  return (
    a.reps === b.reps &&
    a.weight_kg === b.weight_kg &&
    a.duration_s === b.duration_s &&
    a.distance_m === b.distance_m
  );
}

function groupLabel(set: SetMeasures, count: number): string {
  const times = `${String(count)} × `;
  if (set.reps === null) return count > 1 ? `${times}${cardioPart(set)}` : cardioPart(set);
  if (set.weight_kg === null || set.weight_kg === 0) return `${times}${String(set.reps)}`;
  return `${times}${String(set.reps)} @ ${formatKg(set.weight_kg)} kg`;
}

/**
 * A session in one line, working sets only (all sets if none were working):
 * consecutive identical sets are grouped, e.g. "3 × 8 @ 60 kg, 1 × 6 @ 65 kg".
 */
export function sessionSummary(sets: readonly SetMeasures[]): string {
  const working = sets.filter((set) => set.set_type === 'working');
  const shown = working.length > 0 ? working : sets;
  const groups: { set: SetMeasures; count: number }[] = [];
  for (const set of shown) {
    const last = groups.at(-1);
    if (last !== undefined && sameMeasures(last.set, set)) last.count += 1;
    else groups.push({ set, count: 1 });
  }
  return groups.map((group) => groupLabel(group.set, group.count)).join(', ');
}
