import { timingSafeEqual } from 'https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts';

// Who may start the cron-only functions (scheduled-publisher, refresh-all-tokens).
//
// pg_cron sends the header below with a value it reads from Supabase Vault (`ritmo_cron_secret`); the same
// value is the edge secret CRON_SECRET. Nothing else calls these functions. The gateway's JWT check stays on
// (supabase/config.toml), but the project's public key is enough to pass it and that key ships in Ritmo's
// web app, so this check is what actually keeps strangers out (security review #40, #48).
//
// Fail closed: no CRON_SECRET (or one too short to be the generated 64-hex value) answers 500 and does
// nothing. Both sides are hashed with SHA-256 and the two 32-byte digests compared in constant time, so
// neither the value nor its length leaks through timing. The header is never logged or echoed.

export const CRON_SECRET_HEADER = 'x-cron-secret';
export const MIN_SECRET_LENGTH = 32;

export type CronCheck = 'ok' | 'unconfigured' | 'unauthorized';

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export async function checkCronSecret(
  provided: string | null | undefined,
  expected: string | null | undefined
): Promise<CronCheck> {
  if (!expected || expected.length < MIN_SECRET_LENGTH) return 'unconfigured';
  if (!provided) return 'unauthorized';
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  return timingSafeEqual(a, b) ? 'ok' : 'unauthorized';
}

// null = carry on; a Response = answer with it and stop. Call it first, before any other work.
export async function requireCronSecret(
  req: Request,
  expected: string | undefined = Deno.env.get('CRON_SECRET')
): Promise<Response | null> {
  const result = await checkCronSecret(req.headers.get(CRON_SECRET_HEADER), expected);
  if (result === 'ok') return null;
  if (result === 'unconfigured') {
    console.error('CRON_SECRET is not set (or too short); refusing to run');
    return new Response(JSON.stringify({ error: 'Not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
