import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(supabaseUrl, supabaseAnonKey);

// Table names as constants to avoid typos
// Platform-specific tables use prefixes: ig_, fb_, pin_
export const TABLES = {
  // Core tables (platform-agnostic)
  USERS: 'sch_users',
  MEDIA_LIBRARY: 'sch_media_library',
  SCHEDULED_POSTS: 'sch_scheduled_posts',

  // Instagram tables
  IG_ACCOUNTS: 'ig_accounts',

  // Facebook tables
  FB_PAGES: 'fb_pages',

  // Pinterest tables
  PIN_ACCOUNTS: 'pin_accounts',
  PIN_BOARDS: 'pin_boards',
} as const;

// Storage bucket names
export const STORAGE_BUCKETS = {
  MEDIA: 'media',
} as const;

// Supported platforms
export const PLATFORMS = {
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
  PINTEREST: 'pinterest',
} as const;

export type Platform = (typeof PLATFORMS)[keyof typeof PLATFORMS];
