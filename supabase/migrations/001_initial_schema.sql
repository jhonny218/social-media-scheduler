-- Supabase Migration: Initial Schema
-- This migration creates all tables for the Social Media Scheduler app
-- Supports multiple platforms: Instagram (ig_), Facebook (fb_), Pinterest (pin_)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE (platform-agnostic)
-- ============================================
CREATE TABLE IF NOT EXISTS sch_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
  timezone TEXT DEFAULT 'UTC',
  notifications_email BOOLEAN DEFAULT true,
  notifications_push BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE sch_users ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own data
CREATE POLICY "Users can view own data" ON sch_users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON sch_users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own data" ON sch_users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow authenticated inserts for service role (trigger uses this)
-- This is safe because SECURITY DEFINER functions bypass RLS anyway
CREATE POLICY "Enable insert for service role" ON sch_users
  FOR INSERT TO service_role WITH CHECK (true);

-- ============================================
-- INSTAGRAM ACCOUNTS TABLE (ig_ prefix)
-- ============================================
CREATE TABLE IF NOT EXISTS ig_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES sch_users(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('business', 'creator')),
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  profile_picture_url TEXT,
  followers_count INTEGER DEFAULT 0,
  is_connected BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint on user + instagram account
  UNIQUE(user_id, ig_user_id)
);

-- Enable Row Level Security
ALTER TABLE ig_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only access their own accounts
CREATE POLICY "Users can view own ig_accounts" ON ig_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ig_accounts" ON ig_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ig_accounts" ON ig_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ig_accounts" ON ig_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_ig_accounts_user_id ON ig_accounts(user_id);

-- ============================================
-- SCHEDULED POSTS TABLE (platform-agnostic)
-- ============================================
CREATE TABLE IF NOT EXISTS sch_scheduled_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES sch_users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'pinterest')),
  account_id UUID NOT NULL, -- References platform-specific account table
  platform_user_id TEXT NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('feed', 'reel', 'story', 'carousel', 'pin', 'video')),
  caption TEXT,
  media JSONB NOT NULL DEFAULT '[]',
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  publish_method TEXT NOT NULL DEFAULT 'auto' CHECK (publish_method IN ('auto', 'notification')),
  platform_post_id TEXT,
  permalink TEXT,
  published_at TIMESTAMPTZ,
  first_comment TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE sch_scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Users can only access their own posts
CREATE POLICY "Users can view own posts" ON sch_scheduled_posts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own posts" ON sch_scheduled_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts" ON sch_scheduled_posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts" ON sch_scheduled_posts
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes for faster queries
CREATE INDEX idx_sch_scheduled_posts_user_id ON sch_scheduled_posts(user_id);
CREATE INDEX idx_sch_scheduled_posts_platform ON sch_scheduled_posts(platform);
CREATE INDEX idx_sch_scheduled_posts_account_id ON sch_scheduled_posts(account_id);
CREATE INDEX idx_sch_scheduled_posts_status ON sch_scheduled_posts(status);
CREATE INDEX idx_sch_scheduled_posts_scheduled_time ON sch_scheduled_posts(scheduled_time);

-- ============================================
-- MEDIA LIBRARY TABLE (platform-agnostic)
-- ============================================
CREATE TABLE IF NOT EXISTS sch_media_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES sch_users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  download_url TEXT NOT NULL,
  thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE sch_media_library ENABLE ROW LEVEL SECURITY;

-- Users can only access their own media
CREATE POLICY "Users can view own media" ON sch_media_library
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media" ON sch_media_library
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own media" ON sch_media_library
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own media" ON sch_media_library
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_sch_media_library_user_id ON sch_media_library(user_id);

-- ============================================
-- FUTURE: FACEBOOK ACCOUNTS TABLE (fb_ prefix)
-- ============================================
-- CREATE TABLE IF NOT EXISTS fb_accounts (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   fb_user_id TEXT NOT NULL,
--   fb_page_id TEXT NOT NULL,
--   page_name TEXT NOT NULL,
--   access_token TEXT NOT NULL,
--   token_expires_at TIMESTAMPTZ NOT NULL,
--   profile_picture_url TEXT,
--   followers_count INTEGER DEFAULT 0,
--   is_connected BOOLEAN DEFAULT true,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   UNIQUE(user_id, fb_page_id)
-- );

-- ============================================
-- FUTURE: PINTEREST ACCOUNTS TABLE (pin_ prefix)
-- ============================================
-- CREATE TABLE IF NOT EXISTS pin_accounts (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   pin_user_id TEXT NOT NULL,
--   username TEXT NOT NULL,
--   access_token TEXT NOT NULL,
--   refresh_token TEXT,
--   token_expires_at TIMESTAMPTZ NOT NULL,
--   profile_picture_url TEXT,
--   followers_count INTEGER DEFAULT 0,
--   is_connected BOOLEAN DEFAULT true,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   UNIQUE(user_id, pin_user_id)
-- );

-- ============================================
-- STORAGE BUCKET
-- ============================================
-- Note: Run this in Supabase Dashboard SQL Editor or via CLI
-- INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true);

-- Storage policies for the media bucket
-- CREATE POLICY "Users can upload own media"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Users can view own media"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Users can delete own media"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to create sch_users record when a new auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.sch_users (id, email, display_name, photo_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't block the auth user creation
    RAISE WARNING 'Error creating sch_users record: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create sch_users on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables (create only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_sch_users_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER update_sch_users_updated_at BEFORE UPDATE ON sch_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_ig_accounts_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER update_ig_accounts_updated_at BEFORE UPDATE ON ig_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_sch_scheduled_posts_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER update_sch_scheduled_posts_updated_at BEFORE UPDATE ON sch_scheduled_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================
-- Enable realtime for tables that need live updates
ALTER PUBLICATION supabase_realtime ADD TABLE sch_scheduled_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE ig_accounts;
