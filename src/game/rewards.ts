import { GAME_CONFIG, type Category, type Difficulty, type StatId } from './config';
import { emptyStatRecord } from './stats';

const { xpByDifficulty, statXpDivisor, minStatXpPerTag, maxStatTags } = GAME_CONFIG.rewards;

/** Brief 5.5: XP is derived from difficulty, never trusted from the client. */
export function questXp(difficulty: Difficulty): number {
  return xpByDifficulty[difficulty];
}

export function dailyCap(category: Category): number {
  return GAME_CONFIG.dailyCaps[category];
}

/** Brief 5.5: stat XP = floor(XP / 2). */
export function baseStatXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / statXpDivisor);
}

function assertValidTags(tags: readonly StatId[]): void {
  if (tags.length < 1 || tags.length > maxStatTags) {
    throw new RangeError(`stat tags: expected 1-${maxStatTags} tags, received ${tags.length}`);
  }
  if (new Set(tags).size !== tags.length) {
    throw new RangeError(`stat tags: duplicate tags are not allowed (${tags.join(', ')})`);
  }
}

/**
 * Splits stat XP across a quest's tags.
 *
 * G1: floor the even split, then give the remainder to the first tag, so no
 * stat XP is lost.
 * G2: the "minimum 1 per tag" floor applies to full awards only; a capped award
 * may legitimately grant 0.
 */
export function splitStatXp(
  total: number,
  tags: readonly StatId[],
  options: { applyMinimum: boolean },
): Record<StatId, number> {
  assertValidTags(tags);
  const split = emptyStatRecord();
  const safeTotal = Math.max(0, Math.floor(total));
  const perTag = Math.floor(safeTotal / tags.length);
  const remainder = safeTotal - perTag * tags.length;

  tags.forEach((tag, index) => {
    const amount = perTag + (index === 0 ? remainder : 0);
    split[tag] = options.applyMinimum ? Math.max(amount, minStatXpPerTag) : amount;
  });

  return split;
}

export interface QuestAwardInput {
  difficulty: Difficulty;
  category: Category;
  statTags: readonly StatId[];
  /** XP already awarded in this category on this game day (reversals included). */
  categoryXpToday: number;
}

export interface QuestAward {
  /** XP actually awarded after the daily cap. */
  xp: number;
  /** XP the quest is worth before the cap. */
  fullXp: number;
  statXp: Record<StatId, number>;
  capped: boolean;
  /** Cap room that was available before this award. */
  capRemainingBefore: number;
}

/**
 * Brief 5.6: award only the remaining cap room, scale stat XP by the same ratio
 * (floored), and flag the event as capped. A 0-XP award is still a real event so
 * the UI can say "Daily limit reached".
 */
export function computeQuestAward({
  difficulty,
  category,
  statTags,
  categoryXpToday,
}: QuestAwardInput): QuestAward {
  assertValidTags(statTags);

  const fullXp = questXp(difficulty);
  const cap = dailyCap(category);
  const capRemainingBefore = Math.max(0, cap - Math.max(0, Math.floor(categoryXpToday)));
  const xp = Math.min(fullXp, capRemainingBefore);
  const capped = xp < fullXp;

  const fullStatXp = baseStatXp(fullXp);
  const statXpTotal =
    fullXp === 0 ? 0 : capped ? Math.floor((fullStatXp * xp) / fullXp) : fullStatXp;

  return {
    xp,
    fullXp,
    statXp: splitStatXp(statXpTotal, statTags, { applyMinimum: !capped }),
    capped,
    capRemainingBefore,
  };
}
