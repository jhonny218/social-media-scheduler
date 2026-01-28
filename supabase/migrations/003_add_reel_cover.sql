-- Migration: Add reel_cover column to sch_scheduled_posts
-- This column stores the cover image data for Instagram Reels

ALTER TABLE sch_scheduled_posts
ADD COLUMN IF NOT EXISTS reel_cover JSONB;

-- Comment for documentation
COMMENT ON COLUMN sch_scheduled_posts.reel_cover IS 'Cover image for Reels: { type: "frame" | "custom", data: string (base64 or URL), timestamp?: number }';
