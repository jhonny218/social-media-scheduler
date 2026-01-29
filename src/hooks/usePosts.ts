import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES, PLATFORMS, STORAGE_BUCKETS } from '../config/supabase';
import { useAuth } from './useAuth';
import { ScheduledPost, PostInput, PostStatus, CalendarEvent, PostMedia, ReelCover } from '../types';

interface UsePostsOptions {
  status?: PostStatus | PostStatus[];
  accountId?: string;
  startDate?: Date;
  endDate?: Date;
}

interface UsePostsReturn {
  posts: ScheduledPost[];
  calendarEvents: CalendarEvent[];
  loading: boolean;
  error: string | null;
  createPost: (input: PostInput) => Promise<string>;
  updatePost: (postId: string, updates: Partial<ScheduledPost>) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  getPostById: (postId: string) => ScheduledPost | undefined;
  refreshPosts: () => void;
}

// Database row type for scheduled posts
interface PostRow {
  id: string;
  user_id: string;
  platform: string;
  account_id: string;
  platform_user_id: string;
  post_type: string;
  caption: string | null;
  media: PostMedia[] | null;
  scheduled_time: string;
  status: string;
  publish_method: string;
  platform_post_id: string | null;
  permalink: string | null;
  published_at: string | null;
  first_comment: string | null;
  reel_cover: { type: 'frame' | 'custom'; storagePath: string; timestamp?: number } | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour

// Generate signed URLs for media items that have storagePath
async function attachMediaUrls(posts: ScheduledPost[]): Promise<ScheduledPost[]> {
  // Collect all storage paths from media items
  const pathsToSign: string[] = [];

  posts.forEach(post => {
    post.media?.forEach(media => {
      if (media.storagePath) {
        pathsToSign.push(media.storagePath);
      }
      if (media.thumbnailStoragePath) {
        pathsToSign.push(media.thumbnailStoragePath);
      }
    });
  });

  if (pathsToSign.length === 0) return posts;

  // Get signed URLs in batch
  const { data: signedData, error } = await supabase.storage
    .from(STORAGE_BUCKETS.MEDIA)
    .createSignedUrls(pathsToSign, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !signedData) {
    console.error('Failed to generate signed URLs for media:', error);
    return posts;
  }

  const urlByPath = new Map(
    signedData
      .filter(entry => entry.path && !entry.error)
      .map(entry => [entry.path as string, entry.signedUrl])
  );

  // Update posts with fresh URLs
  return posts.map(post => {
    if (!post.media || post.media.length === 0) return post;

    const updatedMedia = post.media.map(media => {
      const updates: Partial<PostMedia> = {};

      if (media.storagePath) {
        const freshUrl = urlByPath.get(media.storagePath);
        if (freshUrl) {
          updates.url = freshUrl;
        }
      }

      if (media.thumbnailStoragePath) {
        const freshThumbnailUrl = urlByPath.get(media.thumbnailStoragePath);
        if (freshThumbnailUrl) {
          updates.thumbnailUrl = freshThumbnailUrl;
        }
      }

      return Object.keys(updates).length > 0 ? { ...media, ...updates } : media;
    });

    return { ...post, media: updatedMedia };
  });
}

// Generate signed URLs for reel covers
async function attachReelCoverUrls(posts: ScheduledPost[]): Promise<ScheduledPost[]> {
  const postsWithCovers = posts.filter(p => p.reelCover?.storagePath);
  if (postsWithCovers.length === 0) return posts;

  const paths = postsWithCovers.map(p => p.reelCover!.storagePath);

  const { data: signedData, error } = await supabase.storage
    .from(STORAGE_BUCKETS.MEDIA)
    .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !signedData) {
    console.error('Failed to generate signed URLs for covers:', error);
    return posts;
  }

  const urlByPath = new Map(
    signedData
      .filter(entry => entry.path && !entry.error)
      .map(entry => [entry.path as string, entry.signedUrl])
  );

  return posts.map(post => {
    if (post.reelCover?.storagePath) {
      const url = urlByPath.get(post.reelCover.storagePath);
      if (url) {
        return {
          ...post,
          reelCover: { ...post.reelCover, url } as ReelCover,
        };
      }
    }
    return post;
  });
}

// Convert database row to ScheduledPost type
const dbRowToPost = (row: PostRow): ScheduledPost => ({
  id: row.id,
  userId: row.user_id,
  platform: row.platform as ScheduledPost['platform'],
  accountId: row.account_id,
  platformUserId: row.platform_user_id,
  postType: row.post_type as ScheduledPost['postType'],
  caption: row.caption || undefined,
  media: (row.media as PostMedia[]) || [],
  reelCover: row.reel_cover || undefined,
  scheduledTime: row.scheduled_time,
  status: row.status as PostStatus,
  publishMethod: row.publish_method as ScheduledPost['publishMethod'],
  platformPostId: row.platform_post_id || undefined,
  permalink: row.permalink || undefined,
  publishedAt: row.published_at || undefined,
  firstComment: row.first_comment || undefined,
  errorMessage: row.error_message || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const usePosts = (options: UsePostsOptions = {}): UsePostsReturn => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Extract date timestamps for stable dependency comparison
  const startDateTimestamp = options.startDate?.getTime();
  const endDateTimestamp = options.endDate?.getTime();

  // Force refresh posts
  const refreshPosts = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Convert posts to calendar events
  const calendarEvents: CalendarEvent[] = posts.map((post) => {
    const scheduledTime = post.scheduledTime instanceof Date
      ? post.scheduledTime
      : new Date(post.scheduledTime);
    return {
      id: post.id,
      title: post.caption?.slice(0, 50) || `${post.postType} post`,
      start: scheduledTime,
      end: new Date(scheduledTime.getTime() + 60 * 60 * 1000),
      resource: post,
    };
  });

  // Fetch posts
  useEffect(() => {
    if (!user?.id) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const fetchPosts = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from(TABLES.SCHEDULED_POSTS)
          .select('*')
          .eq('user_id', user.id);

        // Filter by status
        if (options.status) {
          if (Array.isArray(options.status)) {
            query = query.in('status', options.status);
          } else {
            query = query.eq('status', options.status);
          }
        }

        // Filter by account
        if (options.accountId) {
          query = query.eq('account_id', options.accountId);
        }

        // Filter by date range
        if (options.startDate) {
          query = query.gte('scheduled_time', options.startDate.toISOString());
        }
        if (options.endDate) {
          query = query.lte('scheduled_time', options.endDate.toISOString());
        }

        // Order by scheduled time
        query = query.order('scheduled_time', { ascending: true });

        const { data, error: fetchError } = await query;

        if (fetchError) {
          throw fetchError;
        }

        const posts = (data || []).map(dbRowToPost);
        // Regenerate signed URLs for media and reel covers
        const postsWithMediaUrls = await attachMediaUrls(posts);
        const postsWithAllUrls = await attachReelCoverUrls(postsWithMediaUrls);
        setPosts(postsWithAllUrls);
        setError(null);
      } catch (err) {
        console.error('Error fetching posts:', err);
        setError('Failed to load posts');
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();

    // Set up real-time subscription
    const channel = supabase
      .channel('posts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.SCHEDULED_POSTS,
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refresh on any change
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Using timestamps for stable date comparison
  }, [
    user?.id,
    options.status,
    options.accountId,
    startDateTimestamp,
    endDateTimestamp,
    refreshTrigger,
  ]);

  // Create a new post
  const createPost = async (input: PostInput): Promise<string> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setError(null);

    try {
      // Get platform user ID from the account based on platform
      let platformUserId = '';

      if (input.platform === PLATFORMS.INSTAGRAM) {
        const { data: account } = await supabase
          .from(TABLES.IG_ACCOUNTS)
          .select('ig_user_id')
          .eq('id', input.accountId)
          .eq('user_id', user.id)
          .single();
        platformUserId = account?.ig_user_id || '';
      }
      // Future: Add fb_accounts and pin_accounts lookups

      const now = new Date().toISOString();
      const postData = {
        user_id: user.id,
        platform: input.platform,
        account_id: input.accountId,
        platform_user_id: platformUserId,
        post_type: input.postType,
        caption: input.caption || null,
        media: input.media,
        scheduled_time: input.scheduledTime.toISOString(),
        status: 'scheduled',
        publish_method: input.publishMethod,
        first_comment: input.firstComment || null,
        created_at: now,
        updated_at: now,
      };

      const { data, error: insertError } = await supabase
        .from(TABLES.SCHEDULED_POSTS)
        .insert(postData)
        .select('id')
        .single();

      if (insertError) {
        throw insertError;
      }

      return data.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create post';
      setError(message);
      throw err;
    }
  };

  // Update an existing post
  const updatePost = async (
    postId: string,
    updates: Partial<ScheduledPost>
  ): Promise<void> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setError(null);

    try {
      const updateData: Partial<PostRow> & { updated_at: string } = {
        updated_at: new Date().toISOString(),
      };

      if (updates.caption !== undefined) updateData.caption = updates.caption;
      if (updates.media) updateData.media = updates.media;
      if (updates.scheduledTime) {
        updateData.scheduled_time = updates.scheduledTime instanceof Date
          ? updates.scheduledTime.toISOString()
          : updates.scheduledTime;
      }
      if (updates.status) updateData.status = updates.status;
      if (updates.firstComment !== undefined) updateData.first_comment = updates.firstComment;
      if (updates.postType) updateData.post_type = updates.postType;

      const { error: updateError } = await supabase
        .from(TABLES.SCHEDULED_POSTS)
        .update(updateData)
        .eq('id', postId)
        .eq('user_id', user.id);

      if (updateError) {
        throw updateError;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update post';
      setError(message);
      throw err;
    }
  };

  // Delete a post
  const deletePost = async (postId: string): Promise<void> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from(TABLES.SCHEDULED_POSTS)
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id);

      if (deleteError) {
        throw deleteError;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete post';
      setError(message);
      throw err;
    }
  };

  // Get a specific post by ID
  const getPostById = useCallback(
    (postId: string): ScheduledPost | undefined => {
      return posts.find((post) => post.id === postId);
    },
    [posts]
  );

  return {
    posts,
    calendarEvents,
    loading,
    error,
    createPost,
    updatePost,
    deletePost,
    getPostById,
    refreshPosts,
  };
};

export default usePosts;
