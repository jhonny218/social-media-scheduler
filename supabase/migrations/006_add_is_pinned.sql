-- Add is_pinned column for Instagram pinned posts display
ALTER TABLE sch_scheduled_posts
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Partial index for efficient pinned post lookups
CREATE INDEX IF NOT EXISTS idx_sch_scheduled_posts_is_pinned
ON sch_scheduled_posts(account_id, is_pinned)
WHERE is_pinned = true;
