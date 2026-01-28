import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
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

interface AuthProviderProps {
  children: React.ReactNode;
}

// Convert database row to User type
const dbRowToUser = (row: any): User => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // Fetch user document from database
  const fetchUserDoc = useCallback(async (userId: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return dbRowToUser(data);
    } catch (error) {
      console.error('Error fetching user document:', error);
      return null;
    }
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

      const { data, error } = await supabase
        .from(TABLES.USERS)
        .insert(userData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create user: ${error.message}`);
      }

      return dbRowToUser(data);
    },
    []
  );

  // Listen to auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const userDoc = await fetchUserDoc(session.user.id);
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
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const userDoc = await fetchUserDoc(session.user.id);
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
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchUserDoc]);

  // Sign in with email and password
  const signIn = async (email: string, password: string): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      const userDoc = await fetchUserDoc(data.user.id);

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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('Sign up failed');
      }

      // Create user document in database
      const userDoc = await createUserDoc(data.user, displayName);

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
      const { error } = await supabase.auth.signOut();
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
      const updateData: Record<string, any> = {
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
      const updateData: Record<string, any> = {
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
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
