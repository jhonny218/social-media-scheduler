import { useState, useEffect, useCallback } from 'react';
import { useInstagram } from './useInstagram';
import { ScheduledPost, PostMedia } from '../types';

// Instagram Graph API base URL
const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com';

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
      id: `ig_${media.id}`, // Prefix to distinguish from scheduled posts
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
      const mediaItems = await fetchInstagramMedia(
        account.igUserId,
        account.accessToken
      );

      const posts = mediaItems.map(item =>
        convertToScheduledPost(item, account.id, account.igUserId, account.userId)
      );

      setInstagramPosts(posts);
      setLastFetched(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch Instagram media';
      setError(message);
      console.error('Error fetching Instagram media:', err);
    } finally {
      setLoading(false);
    }
  }, [account, fetchInstagramMedia, convertToScheduledPost]);

  // Fetch media when account changes
  useEffect(() => {
    if (account) {
      refreshMedia();
    } else {
      setInstagramPosts([]);
    }
  }, [account?.id]); // Only re-fetch when account ID changes

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!account) return;

    const intervalId = setInterval(() => {
      refreshMedia();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(intervalId);
  }, [account, refreshMedia]);

  return {
    instagramPosts,
    loading,
    error,
    refreshMedia,
    lastFetched,
  };
};

export default useInstagramMedia;
