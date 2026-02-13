import { ScheduledPost } from '../types';

/**
 * Get the timestamp value as a Date object
 */
export const getScheduledDate = (post: ScheduledPost): Date => {
  const timestamp = post.scheduledTime;
  if (typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp) {
    return (timestamp as { toDate: () => Date }).toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return new Date(timestamp as string);
};

/**
 * Sort posts by scheduled time (newest first)
 */
export const sortPostsByScheduledTime = (posts: ScheduledPost[]): ScheduledPost[] => {
  return [...posts].sort((a, b) => {
    const dateA = getScheduledDate(a);
    const dateB = getScheduledDate(b);
    return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
  });
};

/**
 * Calculate new scheduled time when reordering posts
 */
export const calculateNewScheduledTime = (
  posts: ScheduledPost[],
  newIndex: number
): Date => {
  const sortedPosts = sortPostsByScheduledTime(posts);
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const FOUR_HOURS = 4 * 60 * 60 * 1000;

  if (sortedPosts.length === 0) {
    // No other posts, schedule for 4 hours from now
    return new Date(Date.now() + FOUR_HOURS);
  }

  if (newIndex === 0) {
    // Moving to first position - schedule before the first post
    const firstPost = sortedPosts[0];
    const firstTime = getScheduledDate(firstPost).getTime();
    const newTime = firstTime - SIX_HOURS;
    // Don't schedule in the past
    return new Date(Math.max(newTime, Date.now() + 60000));
  }

  if (newIndex >= sortedPosts.length) {
    // Moving to last position - schedule after the last post
    const lastPost = sortedPosts[sortedPosts.length - 1];
    const lastTime = getScheduledDate(lastPost).getTime();
    return new Date(lastTime + SIX_HOURS);
  }

  // Moving between two posts - calculate midpoint
  const prevPost = sortedPosts[newIndex - 1];
  const nextPost = sortedPosts[newIndex];
  const prevTime = getScheduledDate(prevPost).getTime();
  const nextTime = getScheduledDate(nextPost).getTime();

  // Calculate midpoint
  const midpoint = (prevTime + nextTime) / 2;

  // Ensure we're not scheduling in the past
  return new Date(Math.max(midpoint, Date.now() + 60000));
};

/**
 * Get status color for a post
 */
export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    scheduled: '#4caf50',
    published: '#2196f3',
    failed: '#f44336',
    draft: '#9e9e9e',
    publishing: '#ff9800',
  };
  return colors[status] || colors.draft;
};

/**
 * Get status border color with transparency
 */
export const getStatusBorderColor = (status: string): string => {
  const colors: Record<string, string> = {
    scheduled: '#4caf50',
    published: '#2196f3',
    failed: '#f44336',
    draft: '#bdbdbd',
    publishing: '#ff9800',
  };
  return colors[status] || colors.draft;
};

/**
 * Filter posts by type for grid view
 */
export const filterPostsForGrid = (
  posts: ScheduledPost[],
  options: {
    showFeed?: boolean;
    showReels?: boolean;
    showCarousels?: boolean;
    accountId?: string;
  }
): ScheduledPost[] => {
  const { showFeed = true, showReels = false, showCarousels = true, accountId } = options;

  return posts.filter((post) => {
    // Filter by account
    if (accountId && accountId !== 'all' && post.accountId !== accountId) {
      return false;
    }

    // Pinterest pins always pass through (no feed/reel/carousel distinction)
    if (post.platform === 'pinterest') return true;

    // Filter by post type
    if (post.postType === 'feed' && !showFeed) return false;
    if (post.postType === 'reel' && !showReels) return false;
    if (post.postType === 'carousel' && !showCarousels) return false;
    if (post.postType === 'story') return false; // Never show stories in grid

    return true;
  });
};

/**
 * Reorder array by moving item from one index to another
 */
export const reorderArray = <T>(
  array: T[],
  fromIndex: number,
  toIndex: number
): T[] => {
  const result = Array.from(array);
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
};
