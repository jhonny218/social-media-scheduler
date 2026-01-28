import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '../config/supabase';
import { useAuth } from './useAuth';
import { InstagramAccount, InstagramAccountType } from '../types';

// Instagram Graph API base URL
const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com';

interface InstagramProfile {
  id: string;
  username: string;
  name?: string;
  account_type: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

interface UseInstagramReturn {
  accounts: InstagramAccount[];
  loading: boolean;
  error: string | null;
  connectAccount: (authorizationCode: string) => Promise<void>;
  connectWithToken: (igUserId: string, accessToken: string) => Promise<void>;
  disconnectAccount: (accountId: string) => Promise<void>;
  getAuthUrl: () => string;
  refreshAccounts: () => void;
  fetchInstagramProfile: (igUserId: string, accessToken: string) => Promise<InstagramProfile>;
}

// Convert database row to InstagramAccount type
const dbRowToAccount = (row: any): InstagramAccount => ({
  id: row.id,
  userId: row.user_id,
  igUserId: row.ig_user_id,
  username: row.username,
  accountType: row.account_type as InstagramAccountType,
  accessToken: row.access_token,
  tokenExpiresAt: row.token_expires_at,
  profilePictureUrl: row.profile_picture_url || undefined,
  followersCount: row.followers_count || 0,
  isConnected: row.is_connected,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const useInstagram = (): UseInstagramReturn => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate Instagram OAuth URL
  const getAuthUrl = useCallback((): string => {
    const clientId = import.meta.env.VITE_INSTAGRAM_APP_ID;
    const redirectUri = `${window.location.origin}/oauth/callback`;
    const scope = 'instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      state: crypto.randomUUID(),
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }, []);

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    if (!user?.id) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from(TABLES.IG_ACCOUNTS)
        .select('*')
        .eq('user_id', user.id);

      if (fetchError) {
        throw fetchError;
      }

      setAccounts((data || []).map(dbRowToAccount));
      setError(null);
    } catch (err) {
      console.error('Error fetching Instagram accounts:', err);
      setError('Failed to load Instagram accounts');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Listen to Instagram accounts with real-time subscription
  useEffect(() => {
    if (!user?.id) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchAccounts();

    // Set up real-time subscription
    const channel = supabase
      .channel('ig-accounts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.IG_ACCOUNTS,
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchAccounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchAccounts]);

  // Fetch Instagram profile directly from Graph API
  const fetchInstagramProfile = useCallback(async (
    igUserId: string,
    accessToken: string
  ): Promise<InstagramProfile> => {
    const fields = 'id,username,name,account_type,profile_picture_url,followers_count,media_count';
    const url = `${INSTAGRAM_GRAPH_API}/${igUserId}?fields=${fields}&access_token=${accessToken}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to fetch Instagram profile');
    }

    return response.json();
  }, []);

  // Connect Instagram account using authorization code (OAuth flow)
  const connectAccount = useCallback(async (authorizationCode: string): Promise<void> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setLoading(true);
    setError(null);

    try {
      // Call Supabase Edge Function to exchange token
      const { data, error: funcError } = await supabase.functions.invoke('exchange-instagram-token', {
        body: {
          code: authorizationCode,
          redirectUri: `${window.location.origin}/oauth/callback`,
        },
      });

      if (funcError || !data?.success) {
        throw new Error(data?.error || funcError?.message || 'Failed to connect Instagram account');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect Instagram account';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Connect Instagram account directly with token (for test accounts)
  const connectWithToken = useCallback(async (
    igUserId: string,
    accessToken: string
  ): Promise<void> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch profile from Instagram Graph API
      const profile = await fetchInstagramProfile(igUserId, accessToken);

      // Map account type to valid type
      const accountTypeMap: Record<string, InstagramAccountType> = {
        'BUSINESS': 'business',
        'MEDIA_CREATOR': 'creator',
        'PERSONAL': 'personal',
        'business': 'business',
        'creator': 'creator',
        'personal': 'personal',
      };
      const accountType = accountTypeMap[profile.account_type] || 'business';

      const now = new Date().toISOString();
      // Long-lived tokens typically last 60 days
      const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

      const accountData = {
        user_id: user.id,
        ig_user_id: profile.id,
        username: profile.username,
        account_type: accountType,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        profile_picture_url: profile.profile_picture_url || null,
        followers_count: profile.followers_count || 0,
        is_connected: true,
        created_at: now,
        updated_at: now,
      };

      const { error: insertError } = await supabase
        .from(TABLES.IG_ACCOUNTS)
        .insert(accountData);

      if (insertError) {
        throw insertError;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect Instagram account';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user?.id, fetchInstagramProfile]);

  // Disconnect Instagram account
  const disconnectAccount = useCallback(async (accountId: string): Promise<void> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from(TABLES.IG_ACCOUNTS)
        .delete()
        .eq('id', accountId)
        .eq('user_id', user.id);

      if (deleteError) {
        throw deleteError;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect account';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Manual refresh
  const refreshAccounts = useCallback(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    loading,
    error,
    connectAccount,
    connectWithToken,
    disconnectAccount,
    getAuthUrl,
    refreshAccounts,
    fetchInstagramProfile,
  };
};

export default useInstagram;
