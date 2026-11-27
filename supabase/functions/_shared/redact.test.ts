import assert from 'node:assert/strict';
import { apiError, fetchSafe, redactText, redactUrl, xmlErrorCode } from './redact.ts';

// Test values only. None is a real token or secret.
const IG_TOKEN = 'IGQ_test_access_token_value_1';
const FB_TOKEN = 'EAA_test_page_token_value_2';
const SECRET = 'test_app_secret_value_3';
const PIN_REFRESH = 'pinr_test_refresh_value_4';
const ALL = [IG_TOKEN, FB_TOKEN, SECRET, PIN_REFRESH];
const clean = (text: string) => ALL.every((v) => !text.includes(v));

Deno.test('redactUrl drops the query and keeps the rest', () => {
  assert.equal(
    redactUrl(`https://graph.instagram.com/v24.0/123?fields=status_code&access_token=${IG_TOKEN}`),
    'https://graph.instagram.com/v24.0/123?[query redacted]',
  );
  assert.equal(redactUrl('https://api.pinterest.com/v5/pins'), 'https://api.pinterest.com/v5/pins');
});

Deno.test('redactUrl also cuts a fragment, which OAuth redirects can carry tokens in', () => {
  assert.equal(redactUrl(`https://x.test/cb#access_token=${IG_TOKEN}`), 'https://x.test/cb#[query redacted]');
  assert.equal(redactUrl(`https://x.test/cb#a?access_token=${IG_TOKEN}`), 'https://x.test/cb#[query redacted]');
  assert.ok(clean(redactText(`redirected to https://x.test/cb#access_token=${IG_TOKEN}&state=1`)));
});

Deno.test('redactText removes Authorization header values', () => {
  const basic = btoa(`app-id:${SECRET}`);
  const out = redactText(`headers: Authorization: Bearer ${PIN_REFRESH}, Authorization: Basic ${basic}`);
  assert.ok(clean(out) && !out.includes(basic));
  assert.match(out, /Bearer \[redacted\]/);
  assert.match(out, /Basic \[redacted\]/);
});

Deno.test('redactText removes URL queries and token fields from free text', () => {
  const denoError = `error sending request for url (https://graph.facebook.com/v24.0/oauth/access_token?client_id=1&client_secret=${SECRET}&fb_exchange_token=${FB_TOKEN}): client error (Connect)`;
  const out = redactText(denoError);
  assert.ok(clean(out));
  assert.match(out, /graph\.facebook\.com\/v24\.0\/oauth\/access_token\?\[query redacted\]/);
  assert.ok(clean(redactText(`{"access_token":"${IG_TOKEN}","refresh_token":"${PIN_REFRESH}"}`)));
  assert.ok(clean(redactText(`access_token=${IG_TOKEN}&client_secret=${SECRET}`)));
  assert.equal(redactText('Invalid parameter (code 100, subcode 2207052)'), 'Invalid parameter (code 100, subcode 2207052)');
});

Deno.test('fetchSafe passes responses through and names a failed URL without its query', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (() => Promise.resolve(new Response('ok', { status: 201 }))) as typeof fetch;
    assert.equal((await fetchSafe('https://example.test/a?access_token=x')).status, 201);

    const url = `https://graph.instagram.com/v24.0/me?fields=id&access_token=${IG_TOKEN}`;
    globalThis.fetch = (() => Promise.reject(new TypeError(`error sending request for url (${url}): dns error`))) as typeof fetch;
    await assert.rejects(fetchSafe(url), (e: Error) => {
      assert.ok(clean(e.message), 'no token in the message');
      assert.match(e.message, /^Request to https:\/\/graph\.instagram\.com\/v24\.0\/me\?\[query redacted\] failed: /);
      assert.match(e.message, /dns error/);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test('apiError keeps the error fields and nothing else', () => {
  const graph = { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190, error_subcode: 463, fbtrace_id: 'Abc', access_token: IG_TOKEN };
  assert.equal(apiError(graph), 'message=Invalid OAuth access token type=OAuthException code=190 error_subcode=463 fbtrace_id=Abc');
  const oauth = { error: 'invalid_grant', error_description: 'Refresh token expired', access_token: IG_TOKEN, refresh_token: PIN_REFRESH };
  assert.equal(apiError(oauth), 'error=invalid_grant error_description=Refresh token expired');
  assert.ok(clean(apiError({ message: `bad token access_token=${IG_TOKEN}` })));
  assert.equal(apiError(undefined), 'no error details');
  assert.equal(apiError({ access_token: IG_TOKEN }), 'no error details');
  assert.ok(clean(apiError(`https://x.test/?access_token=${IG_TOKEN}`)));
});

Deno.test('xmlErrorCode keeps only the code of an S3-style error', () => {
  const xml = `<Error><Code>SignatureDoesNotMatch</Code><SignatureProvided>${SECRET}</SignatureProvided></Error>`;
  assert.equal(xmlErrorCode(xml), 'SignatureDoesNotMatch');
  assert.equal(xmlErrorCode(`<html>${SECRET}</html>`), 'unknown');
});

// Static checks on every function and _shared source: no log or error carries a raw API body, request
// params, a whole token-bearing object or a token variable, and every file that puts a token or secret in
// a URL calls fetchSafe, not fetch. They read the sources, so they need read access to supabase/functions.
const functionsDir = new URL('../', import.meta.url);
const canRead = Deno.permissions.querySync({ name: 'read', path: functionsDir }).state === 'granted';

function sourceFiles(dir: URL): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(dir)) {
    const url = new URL(e.name + (e.isDirectory ? '/' : ''), dir);
    if (e.isDirectory) out.push(...sourceFiles(url));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && e.name !== 'redact.ts') out.push(url.pathname);
  }
  return out;
}

// Code only: comments and plain string literals removed, template literals reduced to their ${...} parts.
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, (t) => '`' + [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' ') + '`');
}

// Each console call or new Error(...) with its arguments, up to the closing parenthesis on the statement.
function calls(code: string): string[] {
  return [...code.matchAll(/(?:console\.(?:log|error|warn|info|debug)|new Error)\(([\s\S]*?)\);/g)].map((m) => m[1]);
}

const RULES: Array<[string, RegExp]> = [
  ['a raw response body (…Text)', /\b[a-z]\w*Text\b(?!\s*\.)/],
  ['request params', /\bparams\b(?!\.keys\(\))/],
  ['a whole token-bearing object', /\b(?:tokenData|longLivedData|pagesData|meData|businessData|registerData|data|parsed)\b(?!\s*[.?])/],
  ['a token or secret variable', /\b(?:access_?[tT]oken|refresh_?[tT]oken|page_?[aA]ccess_?[tT]oken|accessToken|refreshToken|pageAccessToken|userAccessToken|shortLivedToken|longLivedToken|appSecret|app_secret|client_secret|credentials|tokenUrl)\b/],
  ['an OAuth code', /(?<![.\w])code\b/],
  ['JSON.stringify of anything', /JSON\.stringify\(/],
  ['an inline body read', /\.(?:text|json)\(\)/],
];

// Names a file assigns from a template URL holding a token or secret, e.g. const tokenUrl = `...client_secret=...`.
function tokenUrlNames(src: string): RegExp | null {
  const names = [...src.matchAll(/const (\w+)\s*=\s*`[^`]*(?:access_token|client_secret|fb_exchange_token)=/g)].map((m) => m[1]);
  return names.length ? new RegExp(`\\b(?:${names.join('|')})\\b`) : null;
}

// apiError, redactUrl and redactText only let safe text through, so whatever is passed to them is fine.
const withoutApiError = (args: string) =>
  args.replace(/(apiError|redactUrl|redactText)\((?:[^()]|\([^()]*\))*\)/g, '$1()');

// Reviewed exceptions, by file and argument text. Bunny Storage error bodies are {HttpCode, Message}; the
// AccessKey travels in a request header and isn't echoed.
// PostgREST errors from pin-boards are {message, details, hint, code} about board rows, no tokens.
const ALLOWED = new Set([
  '_shared/bunny.ts: `response.status errorText`',
  '_shared/pin-boards.ts: `JSON.stringify(readError)`',
  '_shared/pin-boards.ts: `JSON.stringify(upsertError)`',
  '_shared/pin-boards.ts: `JSON.stringify(deleteError)`',
]);

Deno.test({
  name: 'no log or thrown error carries a response body, params, a token or a secret',
  ignore: !canRead,
  fn: () => {
    const files = sourceFiles(functionsDir);
    assert.ok(files.length > 19, 'found the function sources');
    const problems: string[] = [];
    for (const file of files) {
      const src = Deno.readTextFileSync(file);
      const urlNames = tokenUrlNames(src);
      const rules: Array<[string, RegExp]> = urlNames ? [...RULES, ['a URL holding a token or secret', urlNames]] : RULES;
      for (const args of calls(codeOnly(src)).map(withoutApiError)) {
        for (const [what, re] of rules) {
          const key = `${file.split('/functions/')[1]}: ${args.trim()}`;
          if (re.test(args) && !ALLOWED.has(key)) problems.push(`${key.slice(0, 120)} (${what})`);
        }
      }
    }
    assert.deepEqual(problems, []);
  },
});

Deno.test({
  name: 'files that put a token or secret in a URL call fetchSafe, never bare fetch',
  ignore: !canRead,
  fn: () => {
    const problems: string[] = [];
    for (const file of sourceFiles(functionsDir)) {
      const src = Deno.readTextFileSync(file);
      if (!/(?:access_token|client_secret|fb_exchange_token)=/.test(src)) continue;
      if (/(?<![\w.])fetch\(/.test(codeOnly(src))) problems.push(file.split('/functions/')[1]);
    }
    assert.deepEqual(problems, []);
  },
});

Deno.test({
  name: 'the token calls named in finding #52 log only their status',
  ignore: !canRead,
  fn: () => {
    const read = (p: string) => Deno.readTextFileSync(new URL(p, functionsDir));
    assert.doesNotMatch(read('_shared/instagram.ts'), /params\.toString\(\)\s*\)/);
    assert.match(read('_shared/pinterest.ts'), /console\.log\('Token refresh response status:', response\.status\)/);
    assert.match(read('exchange-instagram-token/index.ts'), /console\.log\('Token exchange response status:', tokenResponse\.status\)/);
    assert.match(read('exchange-facebook-token/index.ts'), /console\.log\('Token response status:', tokenResponse\.status\)/);
  },
});
