import type { Platform, PostStatus } from '../types';

export interface SchedulablePost {
  status: PostStatus;
  scheduledTime: string | Date;
  platform: Platform;
  pinBoardId?: string;
}

export type CanScheduleResult = { ok: true } | { ok: false; reason: string };

/**
 * Whether a draft can be handed to the publisher now. The publisher only acts
 * on status 'scheduled', so the checks here stop a draft from being scheduled
 * into a publish that would fail or never happen.
 */
export function canSchedule(post: SchedulablePost, now: Date): CanScheduleResult {
  if (post.status !== 'draft') {
    return { ok: false, reason: 'Only drafts can be scheduled.' };
  }

  const time = new Date(post.scheduledTime).getTime();
  if (isNaN(time) || time <= now.getTime()) {
    return { ok: false, reason: 'The time has passed. Change it first.' };
  }

  if (post.platform === 'pinterest' && !post.pinBoardId) {
    return { ok: false, reason: 'Choose a board first' };
  }

  return { ok: true };
}
