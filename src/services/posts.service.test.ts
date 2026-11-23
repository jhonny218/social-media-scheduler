import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A fake Supabase query chain: records every filter, answers from `answers` in call order.
type Call = { table: string; op: string; payload?: unknown; columns?: string; filters: [string, string, unknown][] };
const calls: Call[] = [];
let answers: { data: unknown; error: unknown }[] = [];

vi.mock('../config/supabase', () => ({
  TABLES: { SCHEDULED_POSTS: 'sch_scheduled_posts' },
  supabase: {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] };
      calls.push(call);
      const q = {
        update(p: unknown) { call.op = 'update'; call.payload = p; return q; },
        select(c: string) { call.columns = c; return q; },
        eq(k: string, v: unknown) { call.filters.push(['eq', k, v]); return q; },
        gt(k: string, v: unknown) { call.filters.push(['gt', k, v]); return q; },
        maybeSingle() { return q; },
        then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
          return Promise.resolve(answers.shift() ?? { data: [], error: null }).then(res, rej);
        },
      };
      return q;
    },
  },
}));
vi.mock('../config/bunny', () => ({ getCdnUrl: (p: string) => p }));

import { PostsService } from './posts.service';

const NOW = new Date('2026-11-23T15:00:00Z');

describe('PostsService.scheduleDraft', () => {
  beforeEach(() => { calls.length = 0; answers = []; vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('schedules only a draft of this user whose time is still ahead, in one request', async () => {
    answers = [{ data: [{ id: 'p1' }], error: null }];
    await new PostsService('u1').scheduleDraft('p1');
    expect(calls).toHaveLength(1);
    const [update] = calls;
    expect(update.op).toBe('update');
    expect(update.payload).toMatchObject({ status: 'scheduled' });
    expect(update.filters).toEqual([
      ['eq', 'id', 'p1'],
      ['eq', 'user_id', 'u1'],
      ['eq', 'status', 'draft'],
      ['gt', 'scheduled_time', NOW.toISOString()],
    ]);
  });

  it('says the time has passed when a stale modal tries a draft whose time is behind', async () => {
    answers = [
      { data: [], error: null },
      { data: { status: 'draft', scheduled_time: '2026-11-23T14:00:00Z' }, error: null },
    ];
    await expect(new PostsService('u1').scheduleDraft('p1')).rejects.toThrow('The time has passed. Change it first.');
    expect(calls[1].op).toBe('select');
    expect(calls[1].filters).toEqual([['eq', 'id', 'p1'], ['eq', 'user_id', 'u1']]);
  });

  it('says the post is no longer a draft when someone already scheduled it', async () => {
    answers = [
      { data: [], error: null },
      { data: { status: 'scheduled', scheduled_time: '2026-11-24T14:00:00Z' }, error: null },
    ];
    await expect(new PostsService('u1').scheduleDraft('p1')).rejects.toThrow('This post is no longer a draft');
  });

  it('says the post is no longer a draft when it is gone', async () => {
    answers = [{ data: [], error: null }, { data: null, error: null }];
    await expect(new PostsService('u1').scheduleDraft('p1')).rejects.toThrow('This post is no longer a draft');
  });

  it('passes on a database error', async () => {
    answers = [{ data: null, error: { message: 'boom' } }];
    await expect(new PostsService('u1').scheduleDraft('p1')).rejects.toThrow('Failed to schedule post: boom');
  });
});
