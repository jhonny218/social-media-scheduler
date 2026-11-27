import assert from 'node:assert/strict';
import { describeNames, readSecretKey, SECRET_KEY_NAME } from './secretKey.ts';

// Test values only. None is a real key.
const RITMO = 'sb_secret_test_ritmo_value_0001';
const DEFAULT = 'sb_secret_test_default_value_0002';
const keys = (o: unknown) => JSON.stringify(o);

// Runs fn, captures console.error, and returns [thrown error, logged text].
function capture(fn: () => unknown): [Error | undefined, string] {
  const original = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(' '));
  try {
    fn();
    return [undefined, logged.join('\n')];
  } catch (e) {
    return [e as Error, logged.join('\n')];
  } finally {
    console.error = original;
  }
}

function assertRefused(raw: string | undefined, name = SECRET_KEY_NAME): string {
  const [err, log] = capture(() => readSecretKey(name, raw));
  assert.ok(err, 'expected a refusal');
  assert.equal(err!.message, 'Server not configured');
  for (const v of [RITMO, DEFAULT]) {
    assert.ok(!err!.message.includes(v) && !log.includes(v), 'a refusal never prints a value');
  }
  return log;
}

Deno.test('the key is named "ritmo"', () => {
  assert.equal(SECRET_KEY_NAME, 'ritmo');
});

Deno.test('returns the named key when present', () => {
  assert.equal(readSecretKey('ritmo', keys({ default: DEFAULT, ritmo: RITMO })), RITMO);
});

Deno.test('SUPABASE_SECRET_KEYS unset or empty fails closed', () => {
  assert.match(assertRefused(undefined), /unreadable/);
  assertRefused('');
});

Deno.test('not JSON, or JSON that is not an object, fails closed', () => {
  for (const raw of ['{not json', 'null', '[]', '["ritmo"]', '"sb_secret_x"', '42']) assertRefused(raw);
});

Deno.test('only "default" present: no fallback to it', () => {
  const log = assertRefused(keys({ default: DEFAULT }));
  assert.match(log, /Key names present: default/);
});

Deno.test('the named key must be an sb_secret_ key', () => {
  for (const v of ['eyJhbGciOiJIUzI1NiJ9.test.test', 'sb_publishable_test', 42, null, {}, '']) {
    assertRefused(keys({ ritmo: v }));
  }
});

Deno.test('inherited names are not keys', () => {
  for (const name of ['__proto__', 'toString', 'constructor', 'hasOwnProperty']) {
    assertRefused(keys({ default: DEFAULT }), name);
  }
});

Deno.test('a value pasted in as a name is never printed', () => {
  const log = assertRefused('{"sb_secret_testvalue":"x"}');
  assert.ok(!log.includes('sb_secret_testvalue'));
  assert.match(log, /\+1 not shown/);
});

Deno.test('names with spaces, over 64 characters or starting sb_ are counted, not printed', () => {
  const odd = ['has space', 'x'.repeat(65), 'sb_publishable_abc', 'sb_anything'];
  const text = describeNames(['default', ...odd]);
  assert.equal(text, 'Key names present: default (+4 not shown)');
  for (const n of odd) assert.ok(!text.includes(n));
  assert.equal(describeNames([]), 'Key names present: none');
});

// Reads the real environment when no argument is given: needs --allow-env=SUPABASE_SECRET_KEYS.
const canEnv = Deno.permissions.querySync({ name: 'env', variable: 'SUPABASE_SECRET_KEYS' }).state === 'granted';

Deno.test({
  name: 'reads SUPABASE_SECRET_KEYS from the environment by default',
  ignore: !canEnv,
  fn: () => {
    const before = Deno.env.get('SUPABASE_SECRET_KEYS');
    try {
      Deno.env.set('SUPABASE_SECRET_KEYS', keys({ ritmo: RITMO }));
      assert.equal(readSecretKey(), RITMO);
      Deno.env.delete('SUPABASE_SECRET_KEYS');
      assertRefused(Deno.env.get('SUPABASE_SECRET_KEYS'));
    } finally {
      if (before === undefined) Deno.env.delete('SUPABASE_SECRET_KEYS');
      else Deno.env.set('SUPABASE_SECRET_KEYS', before);
    }
  },
});

// Static checks on the sources: need read access to supabase/functions.
const functionsDir = new URL('../', import.meta.url);
const canRead = Deno.permissions.querySync({ name: 'read', path: functionsDir }).state === 'granted';

function sourceFiles(dir: URL): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(dir)) {
    const url = new URL(e.name + (e.isDirectory ? '/' : ''), dir);
    if (e.isDirectory) out.push(...sourceFiles(url));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(url.pathname);
  }
  return out;
}

Deno.test({
  name: 'no function reads SUPABASE_SERVICE_ROLE_KEY or dumps the environment',
  ignore: !canRead,
  fn: () => {
    const read = /Deno\.env\.get\(\s*['"]SUPABASE_SERVICE_ROLE_KEY['"]/;
    const files = sourceFiles(functionsDir);
    assert.ok(files.length > 19, 'found the function sources');
    for (const file of files) {
      const src = Deno.readTextFileSync(file);
      assert.ok(!read.test(src), `${file} reads SUPABASE_SERVICE_ROLE_KEY`);
      assert.ok(!src.includes('Deno.env.toObject'), `${file} calls Deno.env.toObject`);
    }
  },
});

Deno.test({
  name: 'createSupabaseAdmin uses the named key',
  ignore: !canRead,
  fn: () => {
    const src = Deno.readTextFileSync(new URL('supabase.ts', import.meta.url));
    const admin = src.slice(src.indexOf('export function createSupabaseAdmin'), src.indexOf('export function createSupabaseClient'));
    assert.match(admin, /readSecretKey\(\)/);
  },
});
