import assert from 'node:assert/strict';
import { planBoardSync, syncBoards } from './pin-boards.ts';
import type { PinterestBoard } from './pinterest.ts';

const board = (over: Partial<PinterestBoard> = {}): PinterestBoard => ({
  id: 'b1',
  name: 'Board One',
  privacy: 'PUBLIC',
  ...over,
});

Deno.test('a board in both lists keeps its row id and takes the new name and counts', () => {
  const plan = planBoardSync(
    [{ id: 'row-1', board_id: 'b1' }],
    [board({ name: 'Renamed', pin_count: 12, follower_count: 3, description: 'New', privacy: 'SECRET' })],
  );
  assert.equal(plan.upsert.length, 1);
  assert.equal(plan.upsert[0].id, 'row-1');
  assert.equal(plan.upsert[0].board_id, 'b1');
  assert.equal(plan.upsert[0].board_name, 'Renamed');
  assert.equal(plan.upsert[0].pin_count, 12);
  assert.equal(plan.upsert[0].follower_count, 3);
  assert.equal(plan.upsert[0].description, 'New');
  assert.equal(plan.upsert[0].privacy, 'SECRET');
  assert.deepEqual(plan.removeIds, []);
});

Deno.test('a board gone from Pinterest is removed', () => {
  const plan = planBoardSync(
    [{ id: 'row-1', board_id: 'b1' }, { id: 'row-2', board_id: 'b2' }],
    [board({ id: 'b1' })],
  );
  assert.deepEqual(plan.removeIds, ['row-2']);
  assert.equal(plan.upsert.length, 1);
});

Deno.test('a new board is upserted without an id', () => {
  const plan = planBoardSync([{ id: 'row-1', board_id: 'b1' }], [board({ id: 'b1' }), board({ id: 'b9', name: 'Fresh' })]);
  const fresh = plan.upsert.find((r) => r.board_id === 'b9')!;
  assert.equal(fresh.board_name, 'Fresh');
  assert.equal('id' in fresh, false);
});

Deno.test('missing optional fields get the same defaults as before', () => {
  const [row] = planBoardSync([], [board({ id: 'b2', description: undefined, privacy: undefined as never })]).upsert;
  assert.equal(row.description, null);
  assert.equal(row.pin_count, 0);
  assert.equal(row.follower_count, 0);
  assert.equal(row.privacy, 'PUBLIC');
});

Deno.test('an empty fresh list removes nothing (a failed Pinterest fetch returns [])', () => {
  const plan = planBoardSync([{ id: 'row-1', board_id: 'b1' }], []);
  assert.deepEqual(plan.upsert, []);
  assert.deepEqual(plan.removeIds, []);
});

// A fake client that records calls.
function fakeClient(existing: { id: string; board_id: string }[]) {
  const calls: unknown[][] = [];
  const client = {
    from(table: string) {
      calls.push(['from', table]);
      return {
        select(cols: string) {
          calls.push(['select', cols]);
          return { eq: (col: string, val: string) => { calls.push(['eq', col, val]); return Promise.resolve({ data: existing, error: null }); } };
        },
        upsert(rows: unknown[], opts: unknown) { calls.push(['upsert', rows, opts]); return Promise.resolve({ error: null }); },
        delete() {
          calls.push(['delete']);
          return { in: (col: string, ids: string[]) => { calls.push(['in', col, ids]); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
  return { client, calls };
}

Deno.test('syncBoards upserts on account_id,board_id then deletes the gone boards', async () => {
  const { client, calls } = fakeClient([{ id: 'row-1', board_id: 'b1' }, { id: 'row-2', board_id: 'b2' }]);
  await syncBoards(client, 'acc-1', [board({ id: 'b1' })]);
  const upsert = calls.find((c) => c[0] === 'upsert')!;
  assert.deepEqual(upsert[2], { onConflict: 'account_id,board_id' });
  assert.equal((upsert[1] as { account_id: string; id: string }[])[0].account_id, 'acc-1');
  assert.equal('id' in (upsert[1] as object[])[0], false); // conflict key keeps the row id
  assert.deepEqual(calls.find((c) => c[0] === 'in'), ['in', 'id', ['row-2']]);
  assert.ok(calls.findIndex((c) => c[0] === 'upsert') < calls.findIndex((c) => c[0] === 'delete'));
});

Deno.test('syncBoards with an empty fresh list makes no writes', async () => {
  const { client, calls } = fakeClient([{ id: 'row-1', board_id: 'b1' }]);
  await syncBoards(client, 'acc-1', []);
  assert.equal(calls.some((c) => c[0] === 'upsert' || c[0] === 'delete'), false);
});
