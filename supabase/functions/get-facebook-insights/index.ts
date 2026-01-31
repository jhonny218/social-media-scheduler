import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { getPageInsights, getPostInsights } from '../_shared/facebook.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { user } = await getUserFromRequest(req);
    const body = await req.json();
    const { pageId, postId, platformPostId } = body;

    if (!pageId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Page ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Get the Facebook page
    const { data: page, error: pageError } = await supabaseAdmin
      .from('fb_pages')
      .select('page_id, page_access_token')
      .eq('id', pageId)
      .eq('user_id', user.id)
      .single();

    if (pageError || !page) {
      return new Response(
        JSON.stringify({ success: false, error: 'Facebook Page not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If postId/platformPostId provided, get post insights
    if (postId || platformPostId) {
      let fbPostId = platformPostId;

      // If only internal postId provided, fetch the platform post ID
      if (postId && !platformPostId) {
        const { data: post } = await supabaseAdmin
          .from('sch_scheduled_posts')
          .select('platform_post_id')
          .eq('id', postId)
          .eq('user_id', user.id)
          .single();

        fbPostId = post?.platform_post_id;
      }

      if (!fbPostId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Post not found or not published' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const insights = await getPostInsights(fbPostId, page.page_access_token);

      return new Response(
        JSON.stringify({
          impressions: insights.post_impressions || 0,
          engagement: insights.post_engaged_users || 0,
          reactions: insights.post_reactions_by_type_total || {},
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Otherwise get page insights
    const insights = await getPageInsights(page.page_id, page.page_access_token);

    return new Response(
      JSON.stringify({
        impressions: insights.page_impressions || 0,
        engagement: insights.page_engaged_users || 0,
        fans: insights.page_fans || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get Facebook insights error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get insights';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
