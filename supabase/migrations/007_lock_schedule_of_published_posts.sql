-- Prevent scheduled_time from moving on a post that has already been published
-- (or is mid-publish).
--
-- The publisher cron only ever selects rows with status 'scheduled'. When
-- scheduled_time was changed on a row that was already 'published', nothing
-- re-published it: the row sat advertising a future date it would never act on,
-- while the details modal reported a publish that never happened on that date.
--
-- Client-side checks alone are not enough here -- the browser writes this table
-- directly under RLS, so the rule has to live in the database.

-- The rule deliberately keys on the row *staying* published/publishing. Moving a
-- post back to 'scheduled' in the same statement is an explicit decision to send
-- it again (clearing platform_post_id/permalink/published_at alongside), and that
-- recovery path stays open. The drift this guards against never touches status:
-- the composer and the grid drag write scheduled_time on their own.
CREATE OR REPLACE FUNCTION reject_reschedule_of_published_post()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('published', 'publishing')
     AND NEW.status IN ('published', 'publishing')
     AND NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time THEN
    RAISE EXCEPTION
      'Cannot change scheduled_time of a post with status %. Reset status to '
      '''scheduled'' in the same statement to deliberately re-queue it.', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'reject_reschedule_sch_scheduled_posts'
  ) THEN
    EXECUTE 'CREATE TRIGGER reject_reschedule_sch_scheduled_posts BEFORE UPDATE ON sch_scheduled_posts FOR EACH ROW EXECUTE FUNCTION reject_reschedule_of_published_post()';
  END IF;
END;
$$ LANGUAGE plpgsql;
