-- One row per Pinterest board per account, so the board list can be updated in
-- place (upsert on account_id, board_id) instead of deleted and re-inserted.
--
-- Deleting the rows used to set sch_scheduled_posts.pin_board_id to NULL for
-- every scheduled Pin, because that column references pin_boards(id) ON DELETE
-- SET NULL.
--
-- 005_pinterest.sql already declares UNIQUE(account_id, board_id), so this is a
-- no-op where that ran as written. It adds the constraint where it is missing.
-- If duplicates exist, the ALTER fails; remove them first, keeping the row any
-- post points to.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.pin_boards'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM pg_attribute a
        WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      ) = ARRAY['account_id', 'board_id']
  ) THEN
    ALTER TABLE public.pin_boards
      ADD CONSTRAINT pin_boards_account_id_board_id_key UNIQUE (account_id, board_id);
  END IF;
END $$;
