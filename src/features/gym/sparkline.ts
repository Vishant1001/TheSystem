import { e1rmCentiKg, toCentiKg } from '../../game';
import type { SetMeasures } from './gymText';

/**
 * Exercise history (brief 4.6): the best e1RM of each session, drawn as a
 * hand-built SVG sparkline - no chart library.
 */

export interface SessionPoint {
  day: string;
  valueCentiKg: number;
}

/** Best working-set e1RM per session, oldest first; sessions without one are skipped. */
export function bestE1rmPerSession(
  sessions: readonly { occurred_on: string; sets: readonly SetMeasures[] }[],
): SessionPoint[] {
  const points: SessionPoint[] = [];
  for (const session of sessions) {
    let best: number | null = null;
    for (const set of session.sets) {
      if (set.set_type !== 'working' || set.reps === null || set.weight_kg === null) continue;
      const value = e1rmCentiKg(toCentiKg(set.weight_kg), set.reps);
      if (value !== null && (best === null || value > best)) best = value;
    }
    if (best !== null) points.push({ day: session.occurred_on, valueCentiKg: best });
  }
  return points.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

export interface Point {
  x: number;
  y: number;
}

/** Values scaled into a width x height box with `pad` on every side. */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  pad: number,
): Point[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  return values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : pad + (innerW * index) / (values.length - 1),
    // Higher is better, so it is drawn higher; a flat line sits in the middle.
    y: max === min ? height / 2 : pad + innerH * (1 - (value - min) / (max - min)),
  }));
}

export function sparklinePath(points: readonly Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
}
