import { useState, useEffect, useCallback } from 'react';
import { usePinterest } from './usePinterest';
import { ScheduledPost, PostMedia } from '../types';
import { supabase, TABLES } from '../config/supabase';

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface PinterestPinMedia {
  media_type?: string;
  images?: {
    originals?: { url: string };
    '1200x'?: { url: string };
    '600x'?: { url: string };
  };
}

interface PinterestPin {
  id: string;
  title?: string;
  description?: string;
  link?: string;
  media?: PinterestPinMedia;
  created_at: string;
  board_id?: string;
  alt_text?: string;
}

interface PinterestPinsResponse {
  items: PinterestPin[];
  bookmark?: string;
}

interface UsePinterestMediaReturn {
  loading: boolean;
  error: string | null;
  refreshMedia: () => Promise<void>;
  lastFetched: Date | null;
}

export const usePinterestMedia = (accountId?: string): UsePinterestMediaReturn => {
  const { accounts } = usePinterest();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // Get the selected Pinterest account
  const account = accountId && accountId !== 'all'
    ? accounts.find(a => a.id === accountId)
    : undefined;

  // Only activate for Pinterest accounts
  const isPinterestAccount = account !== undefined;

  // Fetch pins from Pinterest API v5
  const fetchPinterestPins = useCallback(async (
    accessToken: string,
    limit: number = 50
  ): Promise<PinterestPin[]> => {
    const url = `${PINTEREST_API_BASE}/pins?page_size=${limit}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to fetch Pinterest pins');
    }

    const data: PinterestPinsResponse = await response.json();
    return data.items || [];
  }, []);

  // Get best available image URL from pin media
  const getPinImageUrl = (media?: PinterestPinMedia): string | undefined => {
    if (!media?.images) return undefined;
    return media.images.originals?.url
      || media.images['1200x']?.url
      || media.images['600x']?.url;
  };

  // Convert Pinterest pin to ScheduledPost format
  const convertToScheduledPost = useCallback((
    pin: PinterestPin,
    accountId: string,
    pinUserId: string,
    userId: string
  ): ScheduledPost => {
    const imageUrl = getPinImageUrl(pin.media);
    const postMedia: PostMedia[] = [];

    if (imageUrl) {
      postMedia.push({
        id: pin.id,
        url: imageUrl,
        type: 'image',
        order: 0,
      });
    }

    const publishedDate = new Date(pin.created_at);

    return {
      id: `pin_${pin.id}`,
      userId,
      platform: 'pinterest',
      accountId,
      platformUserId: pinUserId,
      postType: 'pin',
      caption: pin.description || pin.title,
      media: postMedia,
      scheduledTime: publishedDate.toISOString(),
      status: 'published',
      publishMethod: 'auto',
      platformPostId: pin.id,
      permalink: `https://www.pinterest.com/pin/${pin.id}/`,
      publishedAt: publishedDate.toISOString(),
      createdAt: publishedDate.toISOString(),
      updatedAt: publishedDate.toISOString(),
      pinBoardId: pin.board_id,
      pinLink: pin.link,
      pinAltText: pin.alt_text,
    };
  }, []);

  // Mirror media to Bunny CDN via edge function
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
        body: JSON.stringify({ media, platform: 'pinterest' }),
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
        console.log(`Mirrored ${result.data.mirrored}/${media.length} Pinterest media items to Bunny CDN`);
      }
    } catch (error) {
      console.error('Error mirroring Pinterest media to Bunny:', error);
    }

    return mirroredMap;
  }, []);

  // Sync Pinterest posts to database
  const syncPinterestPostsToDatabase = useCallback(async (
    posts: ScheduledPost[]
  ): Promise<void> => {
    if (posts.length === 0) return;

    try {
      // Get existing published Pinterest posts for this account
      const { data: existingPosts, error: fetchError } = await supabase
        .from(TABLES.SCHEDULED_POSTS)
        .select('id, platform_post_id, media')
        .eq('user_id', posts[0].userId)
        .eq('account_id', posts[0].accountId)
        .eq('platform', 'pinterest')
        .eq('status', 'published')
        .not('platform_post_id', 'is', null);

      if (fetchError) {
        console.error('Error fetching existing Pinterest posts:', fetchError);
        return;
      }

      const existingPostsMap = new Map(
        (existingPosts || []).map(p => [p.platform_post_id, p])
      );

      // Find new posts only
      const newPosts: ScheduledPost[] = [];
      const postsToUpdate: Array<{ dbId: string; freshMedia: PostMedia[] }> = [];

      for (const post of posts) {
        if (!post.platformPostId) continue;

        const existing = existingPostsMap.get(post.platformPostId);
        if (!existing) {
          newPosts.push(post);
        } else {
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

      // Collect media that needs mirroring
      const mediaToMirror: Array<{ id: string; url: string; type: 'image' | 'video'; thumbnailUrl?: string }> = [];

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

      // Mirror media to Bunny CDN
      const mirroredMedia = await mirrorMediaToBunny(mediaToMirror);

      // Insert new posts
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
          pin_board_id: post.pinBoardId || null,
          pin_link: post.pinLink || null,
          pin_alt_text: post.pinAltText || null,
          created_at: post.publishedAt,
          updated_at: new Date().toISOString(),
        }));

        const { error: insertError } = await supabase
          .from(TABLES.SCHEDULED_POSTS)
          .insert(postsToInsert);

        if (insertError) {
          console.error('Error inserting new Pinterest posts:', insertError);
        } else {
          console.log(`Inserted ${newPosts.length} new Pinterest posts with mirrored media`);
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
              console.error(`Error updating Pinterest post ${post.dbId}:`, updateError);
            } else {
              updatedCount++;
            }
          }
        }
        console.log(`Updated ${updatedCount} existing Pinterest posts with mirrored media`);
      }
    } catch (error) {
      console.error('Error in syncPinterestPostsToDatabase:', error);
    }
  }, [mirrorMediaToBunny]);

  // Main refresh entry point
  const refreshMedia = useCallback(async () => {
    if (!account || !isPinterestAccount) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const pins = await fetchPinterestPins(account.accessToken);

      const posts = pins.map(pin =>
        convertToScheduledPost(pin, account.id, account.pinUserId, account.userId)
      );

      await syncPinterestPostsToDatabase(posts);

      setLastFetched(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch Pinterest pins';
      setError(message);
      console.error('Error fetching Pinterest pins:', err);
    } finally {
      setLoading(false);
    }
  }, [account, isPinterestAccount, fetchPinterestPins, convertToScheduledPost, syncPinterestPostsToDatabase]);

  // Fetch when account changes
  useEffect(() => {
    if (account && isPinterestAccount) {
      refreshMedia();
    }
  }, [account, isPinterestAccount, refreshMedia]);

  // Auto-refresh every 30 minutes
  useEffect(() => {
    if (!account || !isPinterestAccount) return;

    const intervalId = setInterval(() => {
      refreshMedia();
    }, 30 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [account, isPinterestAccount, refreshMedia]);

  return {
    loading,
    error,
    refreshMedia,
    lastFetched,
  };
};

export default usePinterestMedia;
