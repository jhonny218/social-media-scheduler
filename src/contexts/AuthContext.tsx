import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User as SupabaseUser, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, TABLES } from '../config/supabase';
import { User, UserInput, AuthState, UserPreferences } from '../types';

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUserProfile: (data: Partial<UserInput>) => Promise<void>;
  updateUserPreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Default user preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  notifications: {
    email: true,
    push: true,
  },
};

// Timeout for auth operations (10 seconds)
const AUTH_TIMEOUT = 10000;

interface AuthProviderProps {
  children: React.ReactNode;
}

// Database row type
interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
  plan_tier: string;
  timezone: string;
  notifications_email: boolean;
  notifications_push: boolean;
  created_at: string;
  updated_at: string;
}

// Convert database row to User type
const dbRowToUser = (row: UserRow): User => ({
  id: row.id,
  uid: row.id,
  email: row.email,
  displayName: row.display_name || '',
  photoURL: row.photo_url || undefined,
  planTier: row.plan_tier as 'free',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  preferences: {
    timezone: row.timezone,
    notifications: {
      email: row.notifications_email,
      push: row.notifications_push,
    },
  },
});

// Helper to add timeout to promises
const withTimeout = <T,>(
  promiseOrThenable: Promise<T> | PromiseLike<T>,
  ms: number,
  errorMessage: string
): Promise<T> => {
  const promise = Promise.resolve(promiseOrThenable);
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    ),
  ]);
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // Track if we've completed initial auth check
  const initializedRef = useRef(false);
  const processingRef = useRef(false);

  // Fetch user document from database with retry
  const fetchUserDoc = useCallback(async (userId: string, retries = 2): Promise<User | null> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from(TABLES.USERS)
            .select('*')
            .eq('id', userId)
            .single(),
          5000,
          'Database request timed out'
        );

        if (error) {
          // PGRST116 = no rows found - not a retry-able error
          if (error.code === 'PGRST116') {
            return null;
          }
          throw error;
        }

        return data ? dbRowToUser(data) : null;
      } catch (error) {
        console.error(`Fetch user attempt ${attempt + 1} failed:`, error);
        if (attempt === retries) {
          return null;
        }
        // Wait before retry
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    return null;
  }, []);

  // Create user document in database
  const createUserDoc = useCallback(
    async (supabaseUser: SupabaseUser, displayName: string): Promise<User> => {
      const now = new Date().toISOString();
      const userData = {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        display_name: displayName,
        photo_url: null,
        plan_tier: 'free',
        timezone: DEFAULT_PREFERENCES.timezone,
        notifications_email: DEFAULT_PREFERENCES.notifications.email,
        notifications_push: DEFAULT_PREFERENCES.notifications.push,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await withTimeout(
        supabase
          .from(TABLES.USERS)
          .insert(userData)
          .select()
          .single(),
        5000,
        'Failed to create user profile'
      );

      if (error) {
        throw new Error(`Failed to create user: ${error.message}`);
      }

      return dbRowToUser(data);
    },
    []
  );

  // Handle session changes - single source of truth
  const handleAuthChange = useCallback(async (
    _event: AuthChangeEvent,
    userId: string | null
  ) => {
    // Prevent concurrent processing
    if (processingRef.current) {
      return;
    }
    processingRef.current = true;

    try {
      if (userId) {
        const userDoc = await fetchUserDoc(userId);

        if (!userDoc) {
          // User authenticated but no profile - sign them out
          console.warn('User profile not found, signing out');
          await supabase.auth.signOut();
          setState({
            user: null,
            loading: false,
            error: 'User profile not found. Please sign up again.',
          });
          return;
        }

        setState({
          user: userDoc,
          loading: false,
          error: null,
        });
      } else {
        setState({
          user: null,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      console.error('Auth change error:', error);
      setState({
        user: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
    } finally {
      processingRef.current = false;
      initializedRef.current = true;
    }
  }, [fetchUserDoc]);

  // Single auth listener - handles both initial load and changes
  useEffect(() => {
    let mounted = true;

    // Safety timeout - if nothing happens in 10 seconds, stop loading
    const safetyTimeout = setTimeout(() => {
      if (mounted && !initializedRef.current) {
        console.warn('Auth initialization timed out');
        setState({
          user: null,
          loading: false,
          error: 'Authentication timed out. Please refresh the page.',
        });
      }
    }, AUTH_TIMEOUT);

    // Subscribe to auth changes - this fires INITIAL_SESSION on mount
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        // Skip if already processing or if this is a duplicate INITIAL_SESSION
        if (event === 'INITIAL_SESSION' && initializedRef.current) {
          return;
        }

        // Defer database calls to avoid deadlock with Supabase client's internal lock
        // The Supabase client holds a lock during auth state processing, so making
        // database queries inside this callback causes them to wait indefinitely
        setTimeout(() => {
          if (mounted) {
            handleAuthChange(event, session?.user?.id || null);
          }
        }, 0);
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [handleAuthChange]);

  // Sign in with email and password
  const signIn = async (email: string, password: string): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        AUTH_TIMEOUT,
        'Sign in timed out'
      );

      if (error) {
        throw error;
      }

      // Fetch user doc immediately to update state
      const userDoc = await fetchUserDoc(data.user.id);

      if (!userDoc) {
        await supabase.auth.signOut();
        throw new Error('User profile not found. Please contact support.');
      }

      setState({
        user: userDoc,
        loading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  };

  // Sign up with email and password
  const signUp = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
          },
        }),
        AUTH_TIMEOUT,
        'Sign up timed out'
      );

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('Sign up failed');
      }

      // Wait a moment for the database trigger to create the user doc
      await new Promise(r => setTimeout(r, 500));

      // Try to fetch the user doc (created by trigger)
      let userDoc = await fetchUserDoc(data.user.id);

      // If trigger didn't create it, create it manually
      if (!userDoc) {
        userDoc = await createUserDoc(data.user, displayName);
      }

      setState({
        user: userDoc,
        loading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  };

  // Sign out
  const signOut = async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { error } = await withTimeout(
        supabase.auth.signOut(),
        5000,
        'Sign out timed out'
      );

      if (error) {
        throw error;
      }

      setState({
        user: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign out failed';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  };

  // Update user profile
  const updateUserProfile = async (data: Partial<UserInput>): Promise<void> => {
    if (!state.user) {
      throw new Error('No authenticated user');
    }

    try {
      const updateData: Partial<UserRow> & { updated_at: string } = {
        updated_at: new Date().toISOString(),
      };

      if (data.displayName) {
        updateData.display_name = data.displayName;
      }
      if (data.photoURL !== undefined) {
        updateData.photo_url = data.photoURL || null;
      }

      const { error } = await supabase
        .from(TABLES.USERS)
        .update(updateData)
        .eq('id', state.user.id);

      if (error) {
        throw error;
      }

      // Refresh user data
      const updatedUser = await fetchUserDoc(state.user.id);
      setState((prev) => ({ ...prev, user: updatedUser }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Profile update failed';
      throw new Error(message);
    }
  };

  // Update user preferences
  const updateUserPreferences = async (
    preferences: Partial<UserPreferences>
  ): Promise<void> => {
    if (!state.user) {
      throw new Error('No authenticated user');
    }

    try {
      const updateData: Partial<UserRow> & { updated_at: string } = {
        updated_at: new Date().toISOString(),
      };

      if (preferences.timezone) {
        updateData.timezone = preferences.timezone;
      }
      if (preferences.notifications?.email !== undefined) {
        updateData.notifications_email = preferences.notifications.email;
      }
      if (preferences.notifications?.push !== undefined) {
        updateData.notifications_push = preferences.notifications.push;
      }

      const { error } = await supabase
        .from(TABLES.USERS)
        .update(updateData)
        .eq('id', state.user.id);

      if (error) {
        throw error;
      }

      // Refresh user data
      const updatedUser = await fetchUserDoc(state.user.id);
      setState((prev) => ({ ...prev, user: updatedUser }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preferences update failed';
      throw new Error(message);
    }
  };

  // Refresh user data from database
  const refreshUser = async (): Promise<void> => {
    if (!state.user) {
      return;
    }

    const userDoc = await fetchUserDoc(state.user.id);
    setState((prev) => ({ ...prev, user: userDoc }));
  };

  const value: AuthContextType = {
    ...state,
    signIn,
    signUp,
    signOut,
    updateUserProfile,
    updateUserPreferences,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
