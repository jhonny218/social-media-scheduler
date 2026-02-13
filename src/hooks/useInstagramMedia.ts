import { useState, useEffect, useCallback } from 'react';
import { useInstagram } from './useInstagram';
import { ScheduledPost, PostMedia } from '../types';
import { supabase, TABLES } from '../config/supabase';

// Instagram Graph API base URL
const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Refresh the profile picture URL stored in ig_accounts
async function refreshProfilePicture(igUserId: string, accessToken: string, accountId: string): Promise<void> {
  try {
    const url = `${INSTAGRAM_GRAPH_API}/${igUserId}?fields=profile_picture_url&access_token=${accessToken}`;
    const response = await fetch(url);
    if (!response.ok) return;
    const data = await response.json();
    if (data.profile_picture_url) {
      await supabase
        .from(TABLES.IG_ACCOUNTS)
        .update({
          profile_picture_url: data.profile_picture_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId);
    }
  } catch {
    // Non-critical, don't fail the media refresh
  }
}

interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  permalink: string;
  children?: {
    data: Array<{
      id: string;
      media_type: 'IMAGE' | 'VIDEO';
      media_url: string;
    }>;
  };
}

interface InstagramMediaResponse {
  data: InstagramMediaItem[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

interface UseInstagramMediaReturn {
  instagramPosts: ScheduledPost[];
  loading: boolean;
  error: string | null;
  refreshMedia: () => Promise<void>;
  refreshExpiredMedia: () => Promise<{ updated: number; errors: number }>;
  lastFetched: Date | null;
}

export const useInstagramMedia = (accountId?: string): UseInstagramMediaReturn => {
  const { accounts } = useInstagram();
  const [instagramPosts, setInstagramPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // Get the selected account or first account
  const account = accountId && accountId !== 'all'
    ? accounts.find(a => a.id === accountId)
    : accounts[0];

  // Fetch media from Instagram Graph API
  const fetchInstagramMedia = useCallback(async (
    igUserId: string,
    accessToken: string,
    limit: number = 30
  ): Promise<InstagramMediaItem[]> => {
    const fields = 'id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,children{id,media_type,media_url}';
    const url = `${INSTAGRAM_GRAPH_API}/${igUserId}/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to fetch Instagram media');
    }

    const data: InstagramMediaResponse = await response.json();
    return data.data || [];
  }, []);

  // Mirror Instagram media to Bunny CDN for permanent URLs
  const mirrorMediaToBunny = useCallback(async (
    media: Array<{ id: string; url: string; type: 'image' | 'video'; thumbnailUrl?: string }>
  ): Promise<Map<string, { url: string; storagePath: string; thumbnailUrl?: string }>> => {
    const mirroredMap = new Map<string, { url: string; storagePath: string; thumbnailUrl?: string }>();

    if (media.length === 0) return mirroredMap;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('No auth session for mirroring');
        return mirroredMap;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/mirror-instagram-media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ media }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Mirror API error:', errorData);
        return mirroredMap;
      }

      const result = await response.json();
      if (result.success && result.data?.results) {
        for (const item of result.data.results) {
          if (item.success) {
            mirroredMap.set(item.id, {
              url: item.mirroredUrl,
              storagePath: item.storagePath,
              thumbnailUrl: item.thumbnailUrl,
            });
          }
        }
        console.log(`Mirrored ${result.data.mirrored}/${media.length} media items to Bunny CDN`);
      }
    } catch (error) {
      console.error('Error mirroring media to Bunny:', error);
    }

    return mirroredMap;
  }, []);

  // Save Instagram posts to database (new ones) and update existing ones with fresh URLs
  const syncInstagramPostsToDatabase = useCallback(async (
    posts: ScheduledPost[]
  ): Promise<void> => {
    if (posts.length === 0) return;

    try {
      // Get existing published posts for this account from database (include id and media for updates)
      const { data: existingPosts, error: fetchError } = await supabase
        .from(TABLES.SCHEDULED_POSTS)
        .select('id, platform_post_id, media')
        .eq('user_id', posts[0].userId)
        .eq('account_id', posts[0].accountId)
        .eq('status', 'published')
        .not('platform_post_id', 'is', null);

      if (fetchError) {
        console.error('Error fetching existing posts:', fetchError);
        return;
      }

      // Create a map of existing posts by platform_post_id
      const existingPostsMap = new Map(
        (existingPosts || []).map(p => [p.platform_post_id, p])
      );

      // Separate new posts from existing ones that need URL updates
      const newPosts: ScheduledPost[] = [];
      const postsToUpdate: Array<{ dbId: string; freshMedia: PostMedia[] }> = [];

      for (const post of posts) {
        if (!post.platformPostId) continue;

        const existing = existingPostsMap.get(post.platformPostId);
        if (!existing) {
          // New post - will be inserted
          newPosts.push(post);
        } else {
          // Existing post - check if it needs URL updates (no storagePath means URLs might be expired)
          const existingMedia = (existing.media || []) as PostMedia[];
          const needsUpdate = existingMedia.some(m => !m.storagePath);
          if (needsUpdate) {
            postsToUpdate.push({
              dbId: existing.id,
              freshMedia: post.media || [],
            });
          }
        }
      }

      // Collect all media items that need to be mirrored (from both new and existing posts)
      const mediaToMirror: Array<{ id: string; url: string; type: 'image' | 'video'; thumbnailUrl?: string }> = [];

      // Media from new posts
      for (const post of newPosts) {
        for (const media of post.media || []) {
          if (media.url && !media.storagePath) {
            mediaToMirror.push({
              id: media.id,
              url: media.url,
              type: media.type,
              thumbnailUrl: media.thumbnailUrl,
            });
          }
        }
      }

      // Media from existing posts that need updates (use fresh URLs from Instagram)
      for (const post of postsToUpdate) {
        for (const media of post.freshMedia) {
          if (media.url) {
            mediaToMirror.push({
              id: media.id,
              url: media.url,
              type: media.type,
              thumbnailUrl: media.thumbnailUrl,
            });
          }
        }
      }

      // Mirror media to Bunny CDN for permanent URLs
      const mirroredMedia = await mirrorMediaToBunny(mediaToMirror);

      // Insert new posts with mirrored URLs
      if (newPosts.length > 0) {
        const postsWithMirroredMedia = newPosts.map(post => ({
          ...post,
          media: (post.media || []).map(media => {
            const mirrored = mirroredMedia.get(media.id);
            if (mirrored) {
              return {
                ...media,
                url: mirrored.url,
                storagePath: mirrored.storagePath,
                thumbnailUrl: mirrored.thumbnailUrl || media.thumbnailUrl,
              };
            }
            return media;
          }),
        }));

        const postsToInsert = postsWithMirroredMedia.map(post => ({
          user_id: post.userId,
          platform: post.platform,
          account_id: post.accountId,
          platform_user_id: post.platformUserId,
          post_type: post.postType,
          caption: post.caption || null,
          media: post.media,
          scheduled_time: post.scheduledTime,
          status: 'published',
          publish_method: post.publishMethod,
          platform_post_id: post.platformPostId,
          permalink: post.permalink || null,
          published_at: post.publishedAt,
          first_comment: null,
          error_message: null,
          created_at: post.publishedAt,
          updated_at: new Date().toISOString(),
        }));

        const { error: insertError } = await supabase
          .from(TABLES.SCHEDULED_POSTS)
          .insert(postsToInsert);

        if (insertError) {
          console.error('Error inserting new Instagram posts:', insertError);
        } else {
          console.log(`Inserted ${newPosts.length} new Instagram posts with mirrored media`);
        }
      }

      // Update existing posts with mirrored URLs
      if (postsToUpdate.length > 0) {
        let updatedCount = 0;
        for (const post of postsToUpdate) {
          const updatedMedia = post.freshMedia.map(media => {
            const mirrored = mirroredMedia.get(media.id);
            if (mirrored) {
              return {
                ...media,
                url: mirrored.url,
                storagePath: mirrored.storagePath,
                thumbnailUrl: mirrored.thumbnailUrl || media.thumbnailUrl,
              };
            }
            return media;
          });

          // Only update if at least one media was successfully mirrored
          const hasMirroredMedia = updatedMedia.some(m => m.storagePath);
          if (hasMirroredMedia) {
            const { error: updateError } = await supabase
              .from(TABLES.SCHEDULED_POSTS)
              .update({
                media: updatedMedia,
                updated_at: new Date().toISOString(),
              })
              .eq('id', post.dbId);

            if (updateError) {
              console.error(`Error updating post ${post.dbId}:`, updateError);
            } else {
              updatedCount++;
            }
          }
        }
        console.log(`Updated ${updatedCount} existing posts with mirrored media`);
      }
    } catch (error) {
      console.error('Error in syncInstagramPostsToDatabase:', error);
    }
  }, [mirrorMediaToBunny]);

  // Convert Instagram media to ScheduledPost format
  const convertToScheduledPost = useCallback((
    media: InstagramMediaItem,
    accountId: string,
    igUserId: string,
    userId: string
  ): ScheduledPost => {
    // Map media type
    const postTypeMap: Record<string, 'feed' | 'reel' | 'carousel'> = {
      'IMAGE': 'feed',
      'VIDEO': 'reel',
      'CAROUSEL_ALBUM': 'carousel',
    };

    // Create media array
    const postMedia: PostMedia[] = [];

    if (media.media_url || media.thumbnail_url) {
      postMedia.push({
        id: media.id,
        url: media.media_url || media.thumbnail_url || '',
        type: media.media_type === 'VIDEO' ? 'video' : 'image',
        order: 0,
        thumbnailUrl: media.thumbnail_url || undefined,
      });
    }

    // Parse timestamp
    const publishedDate = new Date(media.timestamp);

    return {
      id: `ig_${media.id}`, // Prefix to distinguish from scheduled posts (temporary, will use DB id)
      userId,
      platform: 'instagram',
      accountId,
      platformUserId: igUserId,
      postType: postTypeMap[media.media_type] || 'feed',
      caption: media.caption,
      media: postMedia,
      scheduledTime: publishedDate.toISOString(),
      status: 'published',
      publishMethod: 'auto',
      platformPostId: media.id,
      permalink: media.permalink,
      publishedAt: publishedDate.toISOString(),
      createdAt: publishedDate.toISOString(),
      updatedAt: publishedDate.toISOString(),
    };
  }, []);

  // Refresh media from Instagram
  const refreshMedia = useCallback(async () => {
    if (!account) {
      setInstagramPosts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Refresh profile picture URL (expires on Instagram CDN)
      await refreshProfilePicture(account.igUserId, account.accessToken, account.id);

      const mediaItems = await fetchInstagramMedia(
        account.igUserId,
        account.accessToken
      );

      const posts = mediaItems.map(item =>
        convertToScheduledPost(item, account.id, account.igUserId, account.userId)
      );

      // Sync new posts to database
      await syncInstagramPostsToDatabase(posts);

      // Note: We're not setting instagramPosts anymore since we'll fetch from DB
      setInstagramPosts([]);
      setLastFetched(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch Instagram media';
      setError(message);
      console.error('Error fetching Instagram media:', err);
    } finally {
      setLoading(false);
    }
  }, [account, fetchInstagramMedia, convertToScheduledPost, syncInstagramPostsToDatabase]);

  // Fetch media when account changes
  useEffect(() => {
    if (account) {
      refreshMedia();
    } else {
      setInstagramPosts([]);
    }
  }, [account, refreshMedia]);

  // Auto-refresh every 30 minutes
  useEffect(() => {
    if (!account) return;

    const intervalId = setInterval(() => {
      refreshMedia();
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(intervalId);
  }, [account, refreshMedia]);

  // Refresh expired media URLs by mirroring them to Bunny CDN
  const refreshExpiredMedia = useCallback(async (): Promise<{ updated: number; errors: number }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/refresh-post-media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to refresh media');
      }

      const result = await response.json();
      if (result.success) {
        return {
          updated: result.data?.updated || 0,
          errors: result.data?.errors || 0,
        };
      }

      throw new Error(result.error || 'Failed to refresh media');
    } catch (error) {
      console.error('Error refreshing expired media:', error);
      throw error;
    }
  }, []);

  return {
    instagramPosts,
    loading,
    error,
    refreshMedia,
    refreshExpiredMedia,
    lastFetched,
  };
};

export default useInstagramMedia;
