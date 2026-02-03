import { supabase, TABLES, STORAGE_BUCKETS } from '../config/supabase';
import { ScheduledPost, PostInput, PostStatus, PostMedia, ReelCover } from '../types';

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbRowToPost = (row: any): ScheduledPost => ({
  id: row.id,
  userId: row.user_id,
  platform: row.platform,
  accountId: row.account_id,
  platformUserId: row.platform_user_id,
  postType: row.post_type as ScheduledPost['postType'],
  fbPostType: row.fb_post_type || undefined,
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
  // Pinterest-specific fields
  pinBoardId: row.pin_board_id || undefined,
  pinLink: row.pin_link || undefined,
  pinAltText: row.pin_alt_text || undefined,
});

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

export class PostsService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  // Get all posts for the user
  async getAllPosts(): Promise<ScheduledPost[]> {
    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('user_id', this.userId)
      .order('scheduled_time', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);
    return attachReelCoverUrls(posts);
  }

  // Get posts with pagination
  async getPostsPaginated(
    pageSize: number = 20,
    offset: number = 0
  ): Promise<{ posts: ScheduledPost[]; hasMore: boolean }> {
    const { data, error, count } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*', { count: 'exact' })
      .eq('user_id', this.userId)
      .order('scheduled_time', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);
    const postsWithUrls = await attachReelCoverUrls(posts);
    const hasMore = count ? offset + pageSize < count : false;

    return { posts: postsWithUrls, hasMore };
  }

  // Get posts by status
  async getPostsByStatus(status: PostStatus | PostStatus[]): Promise<ScheduledPost[]> {
    let query = supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('user_id', this.userId);

    if (Array.isArray(status)) {
      query = query.in('status', status);
    } else {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('scheduled_time', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);
    return attachReelCoverUrls(posts);
  }

  // Get posts for a date range
  async getPostsInRange(startDate: Date, endDate: Date): Promise<ScheduledPost[]> {
    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('user_id', this.userId)
      .gte('scheduled_time', startDate.toISOString())
      .lte('scheduled_time', endDate.toISOString())
      .order('scheduled_time', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);
    return attachReelCoverUrls(posts);
  }

  // Get posts for a specific account
  async getPostsByAccount(accountId: string): Promise<ScheduledPost[]> {
    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('user_id', this.userId)
      .eq('account_id', accountId)
      .order('scheduled_time', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);
    return attachReelCoverUrls(posts);
  }

  // Get a single post by ID
  async getPostById(postId: string): Promise<ScheduledPost | null> {
    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('id', postId)
      .eq('user_id', this.userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to fetch post: ${error.message}`);
    }

    if (!data) return null;

    const post = dbRowToPost(data);
    const [postWithUrl] = await attachReelCoverUrls([post]);
    return postWithUrl;
  }

  // Create a new post
  async createPost(input: PostInput, platformUserId: string): Promise<string> {
    const now = new Date().toISOString();
    const postData = {
      user_id: this.userId,
      platform: input.platform,
      account_id: input.accountId,
      platform_user_id: platformUserId,
      post_type: input.postType,
      fb_post_type: input.fbPostType || null,
      caption: input.caption || null,
      media: input.media,
      scheduled_time: input.scheduledTime.toISOString(),
      status: 'scheduled',
      publish_method: input.publishMethod,
      first_comment: input.firstComment || null,
      reel_cover: input.reelCover || null,
      // Pinterest-specific fields
      pin_board_id: input.pinBoardId || null,
      pin_link: input.pinLink || null,
      pin_alt_text: input.pinAltText || null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .insert(postData)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create post: ${error.message}`);
    }

    return data.id;
  }

  // Update a post
  async updatePost(postId: string, updates: Partial<ScheduledPost>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
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
    if (updates.fbPostType !== undefined) updateData.fb_post_type = updates.fbPostType;
    if (updates.reelCover !== undefined) updateData.reel_cover = updates.reelCover;

    const { error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .update(updateData)
      .eq('id', postId)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to update post: ${error.message}`);
    }
  }

  // Update post status
  async updatePostStatus(
    postId: string,
    status: PostStatus,
    additionalData?: {
      platformPostId?: string;
      publishedAt?: string;
      errorMessage?: string;
    }
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (additionalData?.platformPostId) {
      updateData.platform_post_id = additionalData.platformPostId;
    }
    if (additionalData?.publishedAt) {
      updateData.published_at = additionalData.publishedAt;
    }
    if (additionalData?.errorMessage) {
      updateData.error_message = additionalData.errorMessage;
    }

    const { error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .update(updateData)
      .eq('id', postId)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to update post status: ${error.message}`);
    }
  }

  // Delete a post
  async deletePost(postId: string): Promise<void> {
    const { error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .delete()
      .eq('id', postId)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to delete post: ${error.message}`);
    }
  }

  // Get scheduled posts ready to publish
  async getPostsToPublish(): Promise<ScheduledPost[]> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'scheduled')
      .lte('scheduled_time', now)
      .order('scheduled_time', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch posts to publish: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);
    return attachReelCoverUrls(posts);
  }

  // Get post statistics
  async getPostStats(): Promise<{
    total: number;
    scheduled: number;
    published: number;
    failed: number;
    draft: number;
  }> {
    const posts = await this.getAllPosts();

    return {
      total: posts.length,
      scheduled: posts.filter((p) => p.status === 'scheduled').length,
      published: posts.filter((p) => p.status === 'published').length,
      failed: posts.filter((p) => p.status === 'failed').length,
      draft: posts.filter((p) => p.status === 'draft').length,
    };
  }
}

export default PostsService;
