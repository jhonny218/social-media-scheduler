// The Supabase secret key Ritmo's functions use, by name (security review #40, step 8).
//
// Read only from SUPABASE_SECRET_KEYS, which the platform fills with every secret key of the project,
// keyed by name (Dashboard > Settings > API Keys). Ritmo uses the key named "ritmo".
//
// Fail closed: no fallback to the platform's legacy service-role variable or to any other key name. If the
// named key is missing, misnamed or not an sb_secret_ key, this throws and the function answers 500
// without touching the database. The thrown message is generic (some handlers return error.message to the
// caller); the function log gets the key names present, filtered so a value can never be printed.

export const SECRET_KEY_NAME = 'ritmo';

const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

// Names that look like key names are printed; anything else (for example a value pasted in as a name) is
// only counted.
export function describeNames(names: string[]): string {
  const safe = names.filter((n) => SAFE_NAME.test(n) && !n.startsWith('sb_')).sort();
  const hidden = names.length - safe.length;
  return `Key names present: ${safe.join(', ') || 'none'}${hidden ? ` (+${hidden} not shown)` : ''}`;
}

export function readSecretKey(
  name: string = SECRET_KEY_NAME,
  raw: string | undefined = Deno.env.get('SUPABASE_SECRET_KEYS'),
): string {
  let keys: unknown;
  try {
    keys = raw ? JSON.parse(raw) : undefined;
  } catch {
    keys = undefined;
  }
  const isObject = keys !== null && typeof keys === 'object' && !Array.isArray(keys);
  const value = isObject && Object.hasOwn(keys as object, name)
    ? (keys as Record<string, unknown>)[name]
    : undefined;
  if (typeof value === 'string' && value.startsWith('sb_secret_')) return value;

  console.error(
    `Supabase secret key "${name}" not found. ` +
      (isObject ? describeNames(Object.keys(keys as object)) : 'SUPABASE_SECRET_KEYS unreadable'),
  );
  throw new Error('Server not configured');
}
