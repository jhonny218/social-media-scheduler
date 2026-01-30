import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { getMediaInsights } from '../_shared/instagram.ts';

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate user
    const { user } = await getUserFromRequest(req);

    // Get request body - accept both platformPostId and instagramPostId for compatibility
    const body = await req.json();
    const postId = body.postId;
    const instagramPostId = body.platformPostId || body.instagramPostId;

    if (!postId || !instagramPostId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Post ID and Instagram Post ID are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Get the post to find the account
    const { data: post, error: postError } = await supabaseAdmin
      .from('sch_scheduled_posts')
      .select('account_id')
      .eq('id', postId)
      .eq('user_id', user.id)
      .single();

    if (postError || !post) {
      return new Response(
        JSON.stringify({ success: false, error: 'Post not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Instagram account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('ig_accounts')
      .select('access_token')
      .eq('id', post.account_id)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ success: false, error: 'Instagram account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get insights from Instagram
    const insights = await getMediaInsights(instagramPostId, account.access_token);

    return new Response(
      JSON.stringify({
        impressions: insights.impressions || 0,
        reach: insights.reach || 0,
        engagement: insights.engagement || 0,
        likes: insights.likes || 0,
        comments: insights.comments || 0,
        saves: insights.saved || 0,
        shares: insights.shares || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get insights error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get insights';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
