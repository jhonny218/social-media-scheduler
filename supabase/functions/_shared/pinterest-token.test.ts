import assert from 'node:assert/strict';
import { parseTokenResponse } from './pinterest-token.ts';

const ACCESS = 'pina_ACCESS_SECRET_123';
const REFRESH = 'pinr_REFRESH_SECRET_456';

Deno.test('a good token response is read', () => {
  const data = parseTokenResponse(200, JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 60 }));
  assert.equal(data.access_token, ACCESS);
  assert.equal(data.refresh_token, REFRESH);
});

Deno.test('an unreadable token response names only the status, never the body', () => {
  const body = `<html>${ACCESS} ${REFRESH}</html>`;
  assert.throws(() => parseTokenResponse(502, body), (e: Error) => {
    assert.equal(e.message, 'Invalid token response (status 502)');
    return true;
  });
});

Deno.test('an error answer passes on Pinterest\'s own words, and a missing token is an error', () => {
  assert.throws(() => parseTokenResponse(400, JSON.stringify({ error: 'invalid_grant', error_description: 'Code expired' })), /Code expired/);
  assert.throws(() => parseTokenResponse(200, JSON.stringify({ refresh_token: REFRESH })), /Failed to exchange authorization code/);
});

// The two functions themselves: no token text in a log, and the refresh error path scoped to the caller.
// They read the function sources, so they run with read access: deno test --allow-read supabase/functions/_shared/
const canRead = Deno.permissions.querySync({ name: 'read' }).state === 'granted';
const source = (name: string) => Deno.readTextFileSync(new URL(`../${name}/index.ts`, import.meta.url));

Deno.test({
  name: 'exchange-pinterest-token never logs or throws the token response body',
  ignore: !canRead,
  fn() {
    const exchange = source('exchange-pinterest-token');
    assert.doesNotMatch(exchange, /console\.(?:log|error|warn|info)\([^)]*tokenText/);
    assert.doesNotMatch(exchange, /\$\{tokenText\}/);
    assert.match(exchange, /parseTokenResponse\(tokenResponse\.status, tokenText\)/);
  },
});

Deno.test({
  name: 'refresh-pinterest-token reads the account id once and its error path filters on the caller',
  ignore: !canRead,
  fn() {
    const refresh = source('refresh-pinterest-token');
    assert.doesNotMatch(refresh, /req\.clone\(\)/);
    const catchPart = refresh.slice(refresh.indexOf('} catch (error)'));
    assert.match(catchPart, /\.eq\('id', accountId\)\s*\.eq\('user_id', userId\)/);
  },
});
