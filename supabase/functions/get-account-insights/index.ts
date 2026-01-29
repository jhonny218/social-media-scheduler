import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { getUserInsights } from '../_shared/instagram.ts';

const INSTAGRAM_GRAPH_API = 'https://graph.facebook.com/v18.0';

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate user
    const { user } = await getUserFromRequest(req);

    // Get request body
    const { accountId } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Account ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Get Instagram account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('ig_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ success: false, error: 'Instagram account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile for followers count and media count
    const profileResponse = await fetch(
      `${INSTAGRAM_GRAPH_API}/${account.ig_user_id}?fields=followers_count,media_count&access_token=${account.access_token}`
    );
    const profileData = await profileResponse.json();

    if (profileData.error) {
      throw new Error(profileData.error.message);
    }

    // Get insights
    let insights: Record<string, number> = {};
    try {
      insights = await getUserInsights(
        account.ig_user_id,
        account.access_token,
        ['impressions', 'reach', 'profile_views', 'website_clicks'],
        'day'
      );
    } catch (insightError) {
      // Insights may not be available for all account types
      console.warn('Failed to get insights:', insightError);
    }

    // Calculate followers growth (would need historical data in a real app)
    const followersGrowth = 0; // Placeholder - would need to compare with stored historical data

    return new Response(
      JSON.stringify({
        followersCount: profileData.followers_count || 0,
        followersGrowth,
        profileViews: insights.profile_views || 0,
        websiteClicks: insights.website_clicks || 0,
        postsCount: profileData.media_count || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get account insights error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get account insights';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
