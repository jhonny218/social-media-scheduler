-- ============================================
-- PINTEREST ACCOUNTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS pin_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES sch_users(id) ON DELETE CASCADE,

  -- Pinterest identifiers
  pin_user_id TEXT NOT NULL,
  username TEXT NOT NULL,

  -- OAuth tokens (Pinterest uses refresh tokens)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,

  -- Account metadata
  profile_picture_url TEXT,
  followers_count INTEGER DEFAULT 0,
  account_type TEXT DEFAULT 'PERSONAL' CHECK (account_type IN ('PERSONAL', 'BUSINESS')),

  -- Connection status
  is_connected BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, pin_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pin_accounts_user_id ON pin_accounts(user_id);

-- ============================================
-- PINTEREST BOARDS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS pin_boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES pin_accounts(id) ON DELETE CASCADE,

  -- Board identifiers
  board_id TEXT NOT NULL,
  board_name TEXT NOT NULL,

  -- Board metadata
  description TEXT,
  pin_count INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  privacy TEXT DEFAULT 'PUBLIC' CHECK (privacy IN ('PUBLIC', 'PROTECTED', 'SECRET')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(account_id, board_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pin_boards_account_id ON pin_boards(account_id);

-- ============================================
-- ROW LEVEL SECURITY - pin_accounts
-- ============================================

ALTER TABLE pin_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Pinterest accounts"
  ON pin_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Pinterest accounts"
  ON pin_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Pinterest accounts"
  ON pin_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Pinterest accounts"
  ON pin_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- ROW LEVEL SECURITY - pin_boards
-- ============================================

ALTER TABLE pin_boards ENABLE ROW LEVEL SECURITY;

-- Users can view boards for their own accounts
CREATE POLICY "Users can view own Pinterest boards"
  ON pin_boards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pin_accounts
      WHERE pin_accounts.id = pin_boards.account_id
      AND pin_accounts.user_id = auth.uid()
    )
  );

-- Users can insert boards for their own accounts
CREATE POLICY "Users can insert own Pinterest boards"
  ON pin_boards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pin_accounts
      WHERE pin_accounts.id = pin_boards.account_id
      AND pin_accounts.user_id = auth.uid()
    )
  );

-- Users can update boards for their own accounts
CREATE POLICY "Users can update own Pinterest boards"
  ON pin_boards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pin_accounts
      WHERE pin_accounts.id = pin_boards.account_id
      AND pin_accounts.user_id = auth.uid()
    )
  );

-- Users can delete boards for their own accounts
CREATE POLICY "Users can delete own Pinterest boards"
  ON pin_boards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM pin_accounts
      WHERE pin_accounts.id = pin_boards.account_id
      AND pin_accounts.user_id = auth.uid()
    )
  );

-- ============================================
-- UPDATE SCHEDULED POSTS TABLE
-- ============================================

-- Add Pinterest-specific columns
ALTER TABLE sch_scheduled_posts
ADD COLUMN IF NOT EXISTS pin_board_id UUID REFERENCES pin_boards(id) ON DELETE SET NULL;

ALTER TABLE sch_scheduled_posts
ADD COLUMN IF NOT EXISTS pin_link TEXT;

ALTER TABLE sch_scheduled_posts
ADD COLUMN IF NOT EXISTS pin_alt_text TEXT;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp for pin_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_pin_accounts_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER update_pin_accounts_updated_at BEFORE UPDATE ON pin_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at timestamp for pin_boards
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_pin_boards_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER update_pin_boards_updated_at BEFORE UPDATE ON pin_boards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE pin_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE pin_boards;
