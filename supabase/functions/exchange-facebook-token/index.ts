import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { getPageAccessTokens, extendPageToken } from '../_shared/facebook.ts';

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v24.0';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { user } = await getUserFromRequest(req);
    const { code, redirectUri } = await req.json();

    if (!code || !redirectUri) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization code and redirect URI are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appId = Deno.env.get('FACEBOOK_APP_ID');
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');

    if (!appId || !appSecret) {
      console.error('Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Exchange code for user access token
    const tokenUrl = `${FACEBOOK_GRAPH_API}/oauth/access_token?` +
      `client_id=${appId}&` +
      `client_secret=${appSecret}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code=${code}`;

    console.log('Exchanging code for token...');

    const tokenResponse = await fetch(tokenUrl);
    const tokenText = await tokenResponse.text();
    console.log('Token response:', tokenText);

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      throw new Error(`Invalid token response: ${tokenText}`);
    }

    if (tokenData.error) {
      throw new Error(tokenData.error.message || 'Failed to exchange code');
    }

    if (!tokenData.access_token) {
      throw new Error('No access token in response');
    }

    // Step 2: Get all pages the user manages with their tokens
    // Use the original token first (before extending) as extending can sometimes cause issues
    console.log('Fetching user pages with original token...');
    let pages = await getPageAccessTokens(tokenData.access_token);

    // If no pages found, try with extended token
    if (pages.length === 0) {
      console.log('No pages found with original token, trying with extended token...');
      const longLivedToken = await extendPageToken(
        tokenData.access_token,
        appId,
        appSecret
      );
      pages = await getPageAccessTokens(longLivedToken.accessToken);
    }

    if (pages.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No Facebook Pages found. You must have admin access to at least one Facebook Page.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const connectedPages: string[] = [];

    // Step 4: Store each page in the database
    for (const page of pages) {
      const now = new Date().toISOString();

      // Check if page already exists
      const { data: existingPage } = await supabaseAdmin
        .from('fb_pages')
        .select('id')
        .eq('user_id', user.id)
        .eq('page_id', page.pageId)
        .single();

      if (existingPage) {
        // Update existing page
        const { error: updateError } = await supabaseAdmin
          .from('fb_pages')
          .update({
            page_name: page.pageName,
            page_category: page.category,
            page_access_token: page.pageAccessToken,
            profile_picture_url: page.pictureUrl || null,
            fan_count: page.fanCount || 0,
            is_connected: true,
            updated_at: now,
          })
          .eq('id', existingPage.id);

        if (!updateError) {
          connectedPages.push(page.pageName);
        }
      } else {
        // Insert new page
        const { error: insertError } = await supabaseAdmin
          .from('fb_pages')
          .insert({
            user_id: user.id,
            page_id: page.pageId,
            page_name: page.pageName,
            page_category: page.category,
            page_access_token: page.pageAccessToken,
            profile_picture_url: page.pictureUrl || null,
            fan_count: page.fanCount || 0,
            is_connected: true,
            created_at: now,
            updated_at: now,
          });

        if (!insertError) {
          connectedPages.push(page.pageName);
        }
      }
    }

    if (connectedPages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to connect any pages' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Connected ${connectedPages.length} Facebook Page(s)`,
        pages: connectedPages,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Facebook token exchange error:', error);
    const message = error instanceof Error ? error.message : 'Failed to connect Facebook';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
