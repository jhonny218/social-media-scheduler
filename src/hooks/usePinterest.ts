import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '../config/supabase';
import { useAuth } from './useAuth';
import { PinterestAccount, PinterestBoard } from '../types';

interface UsePinterestReturn {
  accounts: PinterestAccount[];
  boards: PinterestBoard[];
  loading: boolean;
  error: string | null;
  connectAccount: (authorizationCode: string) => Promise<void>;
  disconnectAccount: (accountId: string) => Promise<void>;
  getAuthUrl: () => string;
  refreshAccounts: () => void;
  getBoardsForAccount: (accountId: string) => PinterestBoard[];
}

// Database row type for Pinterest accounts
interface PinAccountRow {
  id: string;
  user_id: string;
  pin_user_id: string;
  username: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  profile_picture_url: string | null;
  followers_count: number | null;
  account_type: string | null;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

// Database row type for Pinterest boards
interface PinBoardRow {
  id: string;
  account_id: string;
  board_id: string;
  board_name: string;
  description: string | null;
  pin_count: number | null;
  follower_count: number | null;
  privacy: string;
  created_at: string;
  updated_at: string;
}

// Convert database row to PinterestAccount type
const dbRowToAccount = (row: PinAccountRow): PinterestAccount => ({
  id: row.id,
  userId: row.user_id,
  pinUserId: row.pin_user_id,
  username: row.username,
  accessToken: row.access_token,
  refreshToken: row.refresh_token,
  tokenExpiresAt: row.token_expires_at,
  profilePictureUrl: row.profile_picture_url || undefined,
  followersCount: row.followers_count || 0,
  accountType: (row.account_type as 'PERSONAL' | 'BUSINESS') || 'PERSONAL',
  isConnected: row.is_connected,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Convert database row to PinterestBoard type
const dbRowToBoard = (row: PinBoardRow): PinterestBoard => ({
  id: row.id,
  accountId: row.account_id,
  boardId: row.board_id,
  boardName: row.board_name,
  description: row.description || undefined,
  pinCount: row.pin_count || 0,
  followerCount: row.follower_count || 0,
  privacy: (row.privacy as 'PUBLIC' | 'PROTECTED' | 'SECRET') || 'PUBLIC',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const usePinterest = (): UsePinterestReturn => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<PinterestAccount[]>([]);
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate Pinterest OAuth URL
  const getAuthUrl = useCallback((): string => {
    const clientId = import.meta.env.VITE_PINTEREST_APP_ID;
    const redirectUri = `${window.location.origin}/oauth/pinterest/callback`;
    const scope = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      state: crypto.randomUUID(),
    });

    return `https://www.pinterest.com/oauth/?${params.toString()}`;
  }, []);

  // Fetch accounts and boards
  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setAccounts([]);
      setBoards([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from(TABLES.PIN_ACCOUNTS)
        .select('*')
        .eq('user_id', user.id);

      if (accountsError) {
        throw accountsError;
      }

      const fetchedAccounts = (accountsData || []).map(dbRowToAccount);
      setAccounts(fetchedAccounts);

      // Fetch boards for all accounts
      if (fetchedAccounts.length > 0) {
        const accountIds = fetchedAccounts.map(a => a.id);
        const { data: boardsData, error: boardsError } = await supabase
          .from(TABLES.PIN_BOARDS)
          .select('*')
          .in('account_id', accountIds);

        if (boardsError) {
          console.error('Error fetching boards:', boardsError);
        } else {
          setBoards((boardsData || []).map(dbRowToBoard));
        }
      } else {
        setBoards([]);
      }

      setError(null);
    } catch (err) {
      console.error('Error fetching Pinterest data:', err);
      setError('Failed to load Pinterest accounts');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Listen to Pinterest accounts with real-time subscription
  useEffect(() => {
    if (!user?.id) {
      setAccounts([]);
      setBoards([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchData();

    // Set up real-time subscription for accounts
    const accountsChannel = supabase
      .channel('pin-accounts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.PIN_ACCOUNTS,
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    // Set up real-time subscription for boards
    const boardsChannel = supabase
      .channel('pin-boards-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.PIN_BOARDS,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(accountsChannel);
      supabase.removeChannel(boardsChannel);
    };
  }, [user?.id, fetchData]);

  // Connect Pinterest account using authorization code (OAuth flow)
  const connectAccount = useCallback(async (authorizationCode: string): Promise<void> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: funcError } = await supabase.functions.invoke('exchange-pinterest-token', {
        body: {
          code: authorizationCode,
          redirectUri: `${window.location.origin}/oauth/pinterest/callback`,
        },
      });

      if (funcError || !data?.success) {
        throw new Error(data?.error || funcError?.message || 'Failed to connect Pinterest account');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect Pinterest account';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Disconnect Pinterest account
  const disconnectAccount = useCallback(async (accountId: string): Promise<void> => {
    if (!user?.id) {
      throw new Error('User must be authenticated');
    }

    setLoading(true);
    setError(null);

    try {
      // Boards will be deleted automatically via CASCADE
      const { error: deleteError } = await supabase
        .from(TABLES.PIN_ACCOUNTS)
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

  // Get boards for a specific account
  const getBoardsForAccount = useCallback((accountId: string): PinterestBoard[] => {
    return boards.filter(b => b.accountId === accountId);
  }, [boards]);

  // Manual refresh
  const refreshAccounts = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    accounts,
    boards,
    loading,
    error,
    connectAccount,
    disconnectAccount,
    getAuthUrl,
    refreshAccounts,
    getBoardsForAccount,
  };
};

export default usePinterest;
