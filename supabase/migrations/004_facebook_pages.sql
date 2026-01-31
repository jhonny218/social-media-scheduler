-- ============================================
-- FACEBOOK PAGES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS fb_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES sch_users(id) ON DELETE CASCADE,

  -- Facebook identifiers
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_category TEXT,

  -- Access token (Page-specific, not user token)
  page_access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,

  -- Page metadata
  profile_picture_url TEXT,
  followers_count INTEGER DEFAULT 0,
  fan_count INTEGER DEFAULT 0,
  website TEXT,

  -- Connection status
  is_connected BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, page_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fb_pages_user_id ON fb_pages(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE fb_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Facebook pages"
  ON fb_pages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Facebook pages"
  ON fb_pages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Facebook pages"
  ON fb_pages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Facebook pages"
  ON fb_pages FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- UPDATE SCHEDULED POSTS TABLE
-- ============================================

-- Add Facebook post type column
ALTER TABLE sch_scheduled_posts
ADD COLUMN IF NOT EXISTS fb_post_type TEXT
CHECK (fb_post_type IS NULL OR fb_post_type IN ('photo', 'video', 'link', 'album', 'reel'));

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_fb_pages_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER update_fb_pages_updated_at BEFORE UPDATE ON fb_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE fb_pages;
