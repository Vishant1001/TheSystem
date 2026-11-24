import { systemCopy } from '../copy/system';

/**
 * Brief 7.4: errors speak in the System's voice, never raw exception text.
 *
 * RPCs raise short stable tokens ("SEALED_DAY", "GOAL_NOT_MET", ...) which are
 * mapped here. Anything unrecognised falls back to a generic line, and the
 * original is logged to the console for us rather than shown to the hunter.
 */
export function systemMessage(
  error: unknown,
  fallback: string = systemCopy.errors.generic,
): string {
  const raw = extractMessage(error);
  if (raw === null) return fallback;

  // Tokens may arrive with detail appended, e.g. "INVALID_TIMEZONE: Mars/Base".
  const token = raw.split(':')[0]?.trim() ?? '';
  const mapped = systemCopy.errorsByToken[token];
  if (mapped !== undefined) return mapped;

  const lower = raw.toLowerCase();
  if (lower.includes('exercises_custom_name_uidx')) return systemCopy.errors.duplicateExercise;
  if (lower.includes('invalid login credentials')) return systemCopy.authErrors.invalidCredentials;
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return systemCopy.authErrors.userExists;
  }
  if (lower.includes('password')) return systemCopy.authErrors.weakPassword;
  if (lower.includes('email not confirmed')) return systemCopy.authErrors.emailNotConfirmed;
  if (lower.includes('rate limit') || lower.includes('too many'))
    return systemCopy.authErrors.rateLimited;
  if (lower.includes('failed to fetch') || lower.includes('networkerror'))
    return systemCopy.errors.offline;

  if (import.meta.env.DEV) {
    console.warn('[system] unmapped error:', raw);
  }
  return fallback;
}

/** The stable token an RPC raised (e.g. "TRIAL_EXPIRED"), or null. */
export function errorToken(error: unknown): string | null {
  const raw = extractMessage(error);
  if (raw === null) return null;
  const token = raw.split(':')[0]?.trim() ?? '';
  return /^[A-Z][A-Z_]+$/.test(token) ? token : null;
}

function extractMessage(error: unknown): string | null {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string') return message;
  }
  return null;
}
