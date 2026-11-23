import { describe, it, expect } from 'vitest';
import { canSchedule } from './schedule-draft';

const now = new Date('2026-11-23T12:00:00Z');
const future = '2026-11-24T12:00:00Z';
const past = '2026-11-22T12:00:00Z';

describe('canSchedule', () => {
  it('allows a draft set in the future', () => {
    expect(
      canSchedule({ status: 'draft', scheduledTime: future, platform: 'instagram' }, now)
    ).toEqual({ ok: true });
  });

  it('accepts a Date as the scheduled time', () => {
    expect(
      canSchedule({ status: 'draft', scheduledTime: new Date(future), platform: 'facebook' }, now)
    ).toEqual({ ok: true });
  });

  it('refuses a draft whose time has passed', () => {
    expect(
      canSchedule({ status: 'draft', scheduledTime: past, platform: 'instagram' }, now)
    ).toEqual({ ok: false, reason: 'The time has passed. Change it first.' });
  });

  it('refuses a draft whose time is exactly now', () => {
    expect(
      canSchedule({ status: 'draft', scheduledTime: now, platform: 'instagram' }, now)
    ).toEqual({ ok: false, reason: 'The time has passed. Change it first.' });
  });

  it('refuses a draft with an unreadable time', () => {
    const result = canSchedule(
      { status: 'draft', scheduledTime: 'not a date', platform: 'instagram' },
      now
    );
    expect(result.ok).toBe(false);
  });

  it.each(['scheduled', 'publishing', 'published', 'failed'] as const)(
    'refuses a post that is %s',
    (status) => {
      const result = canSchedule({ status, scheduledTime: future, platform: 'instagram' }, now);
      expect(result.ok).toBe(false);
    }
  );

  it('refuses a Pinterest draft with no board', () => {
    expect(
      canSchedule({ status: 'draft', scheduledTime: future, platform: 'pinterest' }, now)
    ).toEqual({ ok: false, reason: 'Choose a board first' });
  });

  it('allows a Pinterest draft that has a board', () => {
    expect(
      canSchedule(
        { status: 'draft', scheduledTime: future, platform: 'pinterest', pinBoardId: 'b1' },
        now
      )
    ).toEqual({ ok: true });
  });
});
