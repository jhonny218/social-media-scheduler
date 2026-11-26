import assert from 'node:assert/strict';
import { checkCronSecret, CRON_SECRET_HEADER, requireCronSecret } from './cronAuth.ts';

// Test values only; the real one is generated inside Postgres and never written anywhere.
const SECRET = 'a'.repeat(64);
const SAME_LENGTH_WRONG = 'b'.repeat(64);

const request = (header?: string) =>
  new Request('https://example.test/functions/v1/x', {
    method: 'POST',
    headers: header === undefined ? {} : { [CRON_SECRET_HEADER]: header },
  });

Deno.test('no CRON_SECRET, or a short one, fails closed', async () => {
  assert.equal(await checkCronSecret(SECRET, undefined), 'unconfigured');
  assert.equal(await checkCronSecret(SECRET, ''), 'unconfigured');
  assert.equal(await checkCronSecret('short', 'short'), 'unconfigured');
  const res = await requireCronSecret(request(SECRET), undefined);
  assert.equal(res?.status, 500);
});

Deno.test('a missing or empty header is refused', async () => {
  assert.equal(await checkCronSecret(null, SECRET), 'unauthorized');
  assert.equal(await checkCronSecret('', SECRET), 'unauthorized');
  assert.equal((await requireCronSecret(request(), SECRET))?.status, 401);
});

Deno.test('a wrong header is refused, including one of the right length', async () => {
  assert.equal(await checkCronSecret('wrong', SECRET), 'unauthorized');
  assert.equal(await checkCronSecret(SAME_LENGTH_WRONG, SECRET), 'unauthorized');
  assert.equal(await checkCronSecret(SECRET + 'x', SECRET), 'unauthorized');
  assert.equal((await requireCronSecret(request(SAME_LENGTH_WRONG), SECRET))?.status, 401);
});

Deno.test('the right header passes', async () => {
  assert.equal(await checkCronSecret(SECRET, SECRET), 'ok');
  assert.equal(await requireCronSecret(request(SECRET), SECRET), null);
});

Deno.test('a refusal never echoes the header or the secret', async () => {
  for (const [header, expected] of [[SAME_LENGTH_WRONG, SECRET], [SECRET, undefined]] as const) {
    const res = await requireCronSecret(request(header), expected);
    const body = await res!.text();
    assert.ok(!body.includes(SECRET) && !body.includes(SAME_LENGTH_WRONG));
  }
});

// Both functions check the secret before anything else. They read the sources, so they run with read access:
// deno test --allow-read --allow-env=CRON_SECRET supabase/functions/_shared/
const canRead = Deno.permissions.querySync({ name: 'read' }).state === 'granted';
const source = (name: string) => Deno.readTextFileSync(new URL(`../${name}/index.ts`, import.meta.url));

for (const name of ['scheduled-publisher', 'refresh-all-tokens']) {
  Deno.test({
    name: `${name} checks the cron secret first thing in its handler`,
    ignore: !canRead,
    fn: () => {
      const src = source(name);
      const handler = src.slice(src.indexOf('serve(async (req: Request) => {'));
      const check = handler.indexOf('await requireCronSecret(req)');
      assert.ok(check > 0, 'requireCronSecret is called in the handler');
      for (const later of ['handleCors(', 'createSupabaseAdmin(', 'req.json(', 'new Response(']) {
        const at = handler.indexOf(later);
        if (at >= 0) assert.ok(check < at, `requireCronSecret comes before ${later}`);
      }
    },
  });
}

Deno.test({
  name: 'config.toml keeps the gateway JWT check off for exactly the two cron functions',
  ignore: !canRead,
  fn: () => {
    const toml = Deno.readTextFileSync(new URL('../../config.toml', import.meta.url));
    const sections = [...toml.matchAll(/^\[functions\.([a-z0-9-]+)\]\s*\nverify_jwt = (true|false)/gm)]
      .map((m) => `${m[1]}=${m[2]}`)
      .sort();
    assert.deepEqual(sections, ['refresh-all-tokens=false', 'scheduled-publisher=false']);
  },
});
