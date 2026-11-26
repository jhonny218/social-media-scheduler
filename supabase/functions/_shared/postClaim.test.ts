import assert from 'node:assert/strict';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claimScheduledPost } from './postClaim.ts';

// A fake of the one update chain claimScheduledPost uses, over an in-memory table. Like Postgres, the update
// applies only to rows matching every condition and returns those rows.
function fakeClient(rows: Record<string, { status: string; updated_at?: string }>, failWith?: string) {
  const calls: Array<{ values: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  const client = {
    from(table: string) {
      assert.equal(table, 'sch_scheduled_posts');
      return {
        update(values: Record<string, unknown>) {
          const filters: Array<[string, unknown]> = [];
          calls.push({ values, filters });
          const chain = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return chain;
            },
            select(columns: string) {
              assert.equal(columns, 'id');
              if (failWith) return Promise.resolve({ data: null, error: { message: failWith } });
              const matched = Object.entries(rows).filter(([id, row]) =>
                filters.every(([c, v]) => (c === 'id' ? id === v : (row as Record<string, unknown>)[c] === v))
              );
              for (const [, row] of matched) Object.assign(row, values);
              return Promise.resolve({ data: matched.map(([id]) => ({ id })), error: null });
            },
          };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

Deno.test('only the first of two claims on the same post gets it', async () => {
  const rows: Record<string, { status: string; updated_at?: string }> = { p1: { status: 'scheduled' } };
  const { client } = fakeClient(rows);
  assert.deepEqual(await claimScheduledPost(client, 'p1', () => 't1'), { claimed: true });
  assert.deepEqual(await claimScheduledPost(client, 'p1', () => 't2'), { claimed: false });
  assert.equal(rows.p1.status, 'publishing');
  assert.equal(rows.p1.updated_at, 't1');
});

Deno.test('the claim is conditional on status scheduled and asks for the changed rows', async () => {
  const { client, calls } = fakeClient({ p1: { status: 'scheduled' } });
  await claimScheduledPost(client, 'p1', () => 't');
  assert.deepEqual(calls[0].values, { status: 'publishing', updated_at: 't' });
  assert.deepEqual(calls[0].filters, [['id', 'p1'], ['status', 'scheduled']]);
});

Deno.test('a post that is not scheduled any more is not claimed', async () => {
  for (const status of ['publishing', 'published', 'failed', 'draft']) {
    const { client } = fakeClient({ p1: { status } });
    assert.deepEqual(await claimScheduledPost(client, 'p1'), { claimed: false });
  }
});

Deno.test('a database error is not a claim, and says why', async () => {
  const { client } = fakeClient({ p1: { status: 'scheduled' } }, 'connection reset');
  assert.deepEqual(await claimScheduledPost(client, 'p1'), { claimed: false, error: 'connection reset' });
});

// The main loop claims each post once, after the stale recovery and before anything else touches it: both token
// refreshes (#51), the account and board lookups, and the three publish functions (#49).
const canRead = Deno.permissions.querySync({ name: 'read' }).state === 'granted';
const publisherSource = () => Deno.readTextFileSync(new URL('../scheduled-publisher/index.ts', import.meta.url));

Deno.test({
  name: 'the main loop claims after the stale recovery and before both token refreshes and every publish call',
  ignore: !canRead,
  fn: () => {
    const src = publisherSource();
    const loop = src.slice(src.indexOf('serve(async (req: Request) => {'));
    const calls = loop.split('claimScheduledPost(').length - 1;
    assert.equal(calls, 1, 'claimed exactly once in the handler');
    const claim = loop.indexOf('await claimScheduledPost(supabaseAdmin, post.id)');
    const stale = loop.indexOf("if (post.status === 'publishing')");
    assert.ok(stale > 0 && claim > stale, 'claim comes after the stale recovery');
    const bail = loop.indexOf('if (!claim.claimed)', claim);
    const skip = loop.indexOf('continue;', bail);
    assert.ok(bail > claim && skip > bail, 'a lost claim records the post and moves on');
    for (const later of [
      'refreshPinterestToken(',
      'refreshLongLivedToken(',
      ".from('pin_accounts')",
      ".from('ig_accounts')",
      ".from('fb_pages')",
      'publishPinterestPost(',
      'publishFacebookPost(',
      'publishPost(',
    ]) {
      const at = loop.indexOf(later);
      assert.ok(at > skip, `claim comes before ${later}`);
    }
  },
});

Deno.test({
  name: 'no other claim is left: the publish functions and the file hold no unconditional status update to publishing',
  ignore: !canRead,
  fn: () => {
    const src = publisherSource();
    assert.equal(src.split('claimScheduledPost(').length - 1, 1, 'one claim in the whole file');
    assert.ok(!src.includes("status: 'publishing'"), 'no direct update to publishing');
    for (const fn of ['publishPost', 'publishFacebookPost', 'publishPinterestPost']) {
      const start = src.indexOf(`async function ${fn}(`);
      assert.ok(start >= 0, fn);
      const body = src.slice(start, src.indexOf('\n}\n', start));
      // A failure inside still marks the post failed (the catch), as before.
      assert.ok(body.includes("status: 'failed'"), `${fn}: a failed publish is still marked failed`);
    }
  },
});
