import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v18.0';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface PageResponse {
  data: Array<{
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: {
      id: string;
    };
  }>;
}

interface InstagramProfile {
  id: string;
  username: string;
  name?: string;
  account_type: string;
  profile_picture_url?: string;
  followers_count?: number;
}

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate user
    const { user } = await getUserFromRequest(req);

    // Get request body
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

    // Step 1: Exchange authorization code for short-lived token
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code: code,
    });

    const tokenUrl = `${FACEBOOK_GRAPH_API}/oauth/access_token?${tokenParams.toString()}`;
    console.log('Exchanging code at:', tokenUrl.replace(appSecret, '[REDACTED]').replace(code, '[CODE]'));

    const tokenResponse = await fetch(tokenUrl);
    const tokenText = await tokenResponse.text();
    console.log('Token exchange response:', tokenText);

    let tokenData: TokenResponse & { error?: { message: string; type: string; code: number } };
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      console.error('Failed to parse token response:', tokenText);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid response from Facebook' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tokenData.error || !tokenData.access_token) {
      console.error('Failed to exchange code for token:', tokenData);
      const errorMsg = tokenData.error?.message || 'Failed to exchange authorization code';
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Exchange short-lived token for long-lived token
    const longLivedParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: tokenData.access_token,
    });

    const longLivedResponse = await fetch(
      `${FACEBOOK_GRAPH_API}/oauth/access_token?${longLivedParams.toString()}`
    );
    const longLivedData: TokenResponse = await longLivedResponse.json();

    if (!longLivedData.access_token) {
      console.error('Failed to get long-lived token:', longLivedData);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to get long-lived access token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const longLivedToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // Default 60 days

    // Step 3: Get user's Facebook Pages with Instagram Business Accounts
    const pagesUrl = `${FACEBOOK_GRAPH_API}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longLivedToken}`;
    console.log('Fetching pages...');

    const pagesResponse = await fetch(pagesUrl);
    const pagesText = await pagesResponse.text();
    console.log('Pages response:', pagesText);

    let pagesData: PageResponse & { error?: { message: string } };
    try {
      pagesData = JSON.parse(pagesText);
    } catch {
      console.error('Failed to parse pages response');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid response from Facebook Pages API' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (pagesData.error) {
      console.error('Pages API error:', pagesData.error);
      return new Response(
        JSON.stringify({ success: false, error: pagesData.error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      // Try to get user info to debug
      const meResponse = await fetch(`${FACEBOOK_GRAPH_API}/me?fields=id,name&access_token=${longLivedToken}`);
      const meData = await meResponse.json();
      console.log('User info:', meData);

      return new Response(
        JSON.stringify({
          success: false,
          error: 'No Facebook Pages found. Please ensure you have a Facebook Page connected to an Instagram Business or Creator account and that you granted page permissions during login.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find pages with Instagram Business Accounts
    const pagesWithInstagram = pagesData.data.filter(
      (page) => page.instagram_business_account?.id
    );

    if (pagesWithInstagram.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No Instagram Business or Creator accounts found linked to your Facebook Pages.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const connectedAccounts: string[] = [];

    // Step 4: Connect each Instagram account
    for (const page of pagesWithInstagram) {
      const igAccountId = page.instagram_business_account!.id;

      // Get Instagram account details
      const igResponse = await fetch(
        `${FACEBOOK_GRAPH_API}/${igAccountId}?fields=id,username,name,account_type,profile_picture_url,followers_count&access_token=${page.access_token}`
      );
      const igProfile: InstagramProfile = await igResponse.json();

      if (!igProfile.username) {
        console.error('Failed to fetch Instagram profile for:', igAccountId);
        continue;
      }

      // Map account type
      const accountTypeMap: Record<string, string> = {
        'BUSINESS': 'business',
        'MEDIA_CREATOR': 'creator',
        'CREATOR_ACCOUNT': 'creator',
        'PERSONAL': 'personal',
      };
      const accountType = accountTypeMap[igProfile.account_type] || 'business';

      const now = new Date().toISOString();
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Check if account already exists
      const { data: existingAccount } = await supabaseAdmin
        .from('ig_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('ig_user_id', igProfile.id)
        .single();

      if (existingAccount) {
        // Update existing account
        const { error: updateError } = await supabaseAdmin
          .from('ig_accounts')
          .update({
            username: igProfile.username,
            account_type: accountType,
            access_token: page.access_token, // Use page access token for Instagram API
            token_expires_at: tokenExpiresAt,
            profile_picture_url: igProfile.profile_picture_url || null,
            followers_count: igProfile.followers_count || 0,
            is_connected: true,
            updated_at: now,
          })
          .eq('id', existingAccount.id);

        if (updateError) {
          console.error('Failed to update account:', updateError);
        } else {
          connectedAccounts.push(igProfile.username);
        }
      } else {
        // Insert new account
        const { error: insertError } = await supabaseAdmin
          .from('ig_accounts')
          .insert({
            user_id: user.id,
            ig_user_id: igProfile.id,
            username: igProfile.username,
            account_type: accountType,
            access_token: page.access_token, // Use page access token for Instagram API
            token_expires_at: tokenExpiresAt,
            profile_picture_url: igProfile.profile_picture_url || null,
            followers_count: igProfile.followers_count || 0,
            is_connected: true,
            created_at: now,
            updated_at: now,
          });

        if (insertError) {
          console.error('Failed to insert account:', insertError);
        } else {
          connectedAccounts.push(igProfile.username);
        }
      }
    }

    if (connectedAccounts.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to connect any Instagram accounts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Connected ${connectedAccounts.length} Instagram account(s)`,
        accounts: connectedAccounts,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Exchange token error:', error);
    const message = error instanceof Error ? error.message : 'Failed to exchange token';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
