import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '../config/supabase';
import { useAuth } from './useAuth';
import { FacebookPage } from '../types';

interface UseFacebookReturn {
  pages: FacebookPage[];
  loading: boolean;
  error: string | null;
  connectPages: (authorizationCode: string) => Promise<void>;
  disconnectPage: (pageId: string) => Promise<void>;
  getAuthUrl: () => string;
  refreshPages: () => void;
}

// Database row type for Facebook pages
interface FbPageRow {
  id: string;
  user_id: string;
  page_id: string;
  page_name: string;
  page_category: string | null;
  page_access_token: string;
  token_expires_at: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  fan_count: number | null;
  website: string | null;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

// Convert database row to FacebookPage type
const dbRowToPage = (row: FbPageRow): FacebookPage => ({
  id: row.id,
  userId: row.user_id,
  pageId: row.page_id,
  pageName: row.page_name,
  pageCategory: row.page_category || undefined,
  pageAccessToken: row.page_access_token,
  tokenExpiresAt: row.token_expires_at || undefined,
  profilePictureUrl: row.profile_picture_url || undefined,
  followersCount: row.followers_count || 0,
  fanCount: row.fan_count || 0,
  website: row.website || undefined,
  isConnected: row.is_connected,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const useFacebook = (): UseFacebookReturn => {
  const { user } = useAuth();
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate Facebook OAuth URL
  const getAuthUrl = useCallback((): string => {
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    const redirectUri = `${window.location.origin}/oauth/facebook/callback`;
    const scope = 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_read_user_content,business_management';

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      state: crypto.randomUUID(),
      auth_type: 'rerequest', // Force re-asking for permissions
    });

    return `https://www.facebook.com/v24.0/dialog/oauth?${params.toString()}`;
  }, []);

  // Fetch pages
  const fetchPages = useCallback(async () => {
    if (!user?.id) {
      setPages([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from(TABLES.FB_PAGES)
        .select('*')
        .eq('user_id', user.id);

      if (fetchError) {
        throw fetchError;
      }

      setPages((data || []).map(dbRowToPage));
      setError(null);
    } catch (err) {
      console.error('Error fetching Facebook pages:', err);
      setError('Failed to load Facebook pages');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Listen to Facebook pages with real-time subscription
  useEffect(() => {
    if (!user?.id) {
      setPages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchPages();

    // Set up real-time subscription
    const channel = supabase
      .channel('fb-pages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.FB_PAGES,
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchPages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchPages]);

  // Connect Facebook pages using authorization code (OAuth flow)
  const connectPages = useCallback(async (authorizationCode: string): Promise<void> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setLoading(true);
    setError(null);

    try {
      // Call Supabase Edge Function to exchange token
      const { data, error: funcError } = await supabase.functions.invoke('exchange-facebook-token', {
        body: {
          code: authorizationCode,
          redirectUri: `${window.location.origin}/oauth/facebook/callback`,
        },
      });

      if (funcError || !data?.success) {
        throw new Error(data?.error || funcError?.message || 'Failed to connect Facebook pages');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect Facebook pages';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Disconnect Facebook page
  const disconnectPage = useCallback(async (pageId: string): Promise<void> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from(TABLES.FB_PAGES)
        .delete()
        .eq('id', pageId)
        .eq('user_id', user.id);

      if (deleteError) {
        throw deleteError;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect page';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Manual refresh
  const refreshPages = useCallback(() => {
    fetchPages();
  }, [fetchPages]);

  return {
    pages,
    loading,
    error,
    connectPages,
    disconnectPage,
    getAuthUrl,
    refreshPages,
  };
};

export default useFacebook;
