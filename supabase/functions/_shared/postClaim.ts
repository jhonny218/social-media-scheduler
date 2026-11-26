import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Claiming a due post before publishing it (security review #49).
//
// The update only matches while the post is still 'scheduled', and asks for the changed rows back. Postgres
// re-checks the condition after taking the row lock, so when two runs overlap (a slow video in one run
// while the next minute's run starts) exactly one gets the row; the other gets none and must not publish.
// A post that isn't claimed is left as it is: another run owns it, or (on a database error) it stays
// 'scheduled' and the next run retries it.

export const NOT_CLAIMED = 'Already claimed by another run; skipped';
export const CLAIM_FAILED = 'Could not claim the post; the next run retries it';

export async function claimScheduledPost(
  supabaseAdmin: SupabaseClient,
  postId: string,
  now: () => string = () => new Date().toISOString()
): Promise<{ claimed: boolean; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from('sch_scheduled_posts')
    .update({ status: 'publishing', updated_at: now() })
    .eq('id', postId)
    .eq('status', 'scheduled')
    .select('id');
  if (error) return { claimed: false, error: error.message };
  return { claimed: Array.isArray(data) && data.length > 0 };
}
