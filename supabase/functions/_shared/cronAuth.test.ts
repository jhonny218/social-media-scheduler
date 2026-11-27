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

// The gateway JWT setting of every Ritmo function, as it was live on 2026-11-26 (list_edge_functions). Deploys
// from the repo root read config.toml, so the file must say exactly this; a change here is a deliberate
// security decision.
const LIVE_VERIFY_JWT: Record<string, boolean> = {
  'delete-media': true,
  'exchange-facebook-token': true,
  'exchange-instagram-token': true,
  'exchange-pinterest-token': true,
  'get-account-insights': true,
  'get-facebook-insights': true,
  'get-post-insights': true,
  'get-upload-url': false,
  'mirror-instagram-media': false,
  'publish-facebook-post': true,
  'publish-pinterest-post': false,
  'publish-post-now': true,
  'refresh-all-tokens': true,
  'refresh-instagram-token': true,
  'refresh-pinterest-token': true,
  'refresh-post-media': false,
  'scheduled-publisher': true,
  'upload-media': true,
  'validate-instagram-connection': true,
};

Deno.test({
  name: 'config.toml sets verify_jwt for every function exactly as live, the two cron functions on',
  ignore: !canRead,
  fn: () => {
    const toml = Deno.readTextFileSync(new URL('../../config.toml', import.meta.url));
    const sections = Object.fromEntries(
      [...toml.matchAll(/^\[functions\.([a-z0-9-]+)\]\s*\nverify_jwt = (true|false)/gm)].map((m) => [m[1], m[2] === 'true'])
    );
    const headers = [...toml.matchAll(/^\[functions\.([a-z0-9-]+)\]/gm)].length;
    assert.equal(headers, Object.keys(sections).length, 'every [functions.x] section has a verify_jwt line');
    assert.deepEqual(sections, LIVE_VERIFY_JWT);
    assert.equal(sections['scheduled-publisher'], true);
    assert.equal(sections['refresh-all-tokens'], true);
  },
});

Deno.test({
  name: 'every function folder is listed in config.toml (a new function needs a deliberate setting)',
  ignore: !canRead,
  fn: () => {
    const folders = [...Deno.readDirSync(new URL('../', import.meta.url))]
      .filter((e) => e.isDirectory && !e.name.startsWith('_'))
      .map((e) => e.name)
      .sort();
    assert.deepEqual(folders, Object.keys(LIVE_VERIFY_JWT).sort());
  },
});
