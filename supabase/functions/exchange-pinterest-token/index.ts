import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { getUserProfile, getUserBoards } from '../_shared/pinterest.ts';

const PINTEREST_OAUTH_URL = 'https://api.pinterest.com/v5/oauth/token';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

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

    const appId = Deno.env.get('PINTEREST_APP_ID');
    const appSecret = Deno.env.get('PINTEREST_APP_SECRET');

    if (!appId || !appSecret) {
      console.error('Missing PINTEREST_APP_ID or PINTEREST_APP_SECRET');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Exchange code for access token
    const credentials = btoa(`${appId}:${appSecret}`);

    console.log('Exchanging Pinterest code for token...');

    const tokenResponse = await fetch(PINTEREST_OAUTH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenText = await tokenResponse.text();
    console.log('Token response:', tokenText);

    let tokenData: TokenResponse & { error?: string; error_description?: string };
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      throw new Error(`Invalid token response: ${tokenText}`);
    }

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange authorization code');
    }

    // Step 2: Get user profile
    console.log('Fetching Pinterest user profile...');
    const profile = await getUserProfile(tokenData.access_token);

    // Step 3: Get user's boards
    console.log('Fetching Pinterest boards...');
    const boards = await getUserBoards(tokenData.access_token);

    const supabaseAdmin = createSupabaseAdmin();
    const now = new Date().toISOString();
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Step 4: Check if account already exists
    const { data: existingAccount } = await supabaseAdmin
      .from('pin_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('pin_user_id', profile.id)
      .single();

    let accountId: string;

    if (existingAccount) {
      // Update existing account
      const { error: updateError } = await supabaseAdmin
        .from('pin_accounts')
        .update({
          username: profile.username,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: tokenExpiresAt,
          profile_picture_url: profile.profile_image || null,
          followers_count: profile.follower_count || 0,
          account_type: profile.account_type || 'PERSONAL',
          is_connected: true,
          updated_at: now,
        })
        .eq('id', existingAccount.id);

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error('Failed to update account');
      }

      accountId = existingAccount.id;
    } else {
      // Insert new account
      const { data: insertedAccount, error: insertError } = await supabaseAdmin
        .from('pin_accounts')
        .insert({
          user_id: user.id,
          pin_user_id: profile.id,
          username: profile.username,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: tokenExpiresAt,
          profile_picture_url: profile.profile_image || null,
          followers_count: profile.follower_count || 0,
          account_type: profile.account_type || 'PERSONAL',
          is_connected: true,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();

      if (insertError || !insertedAccount) {
        console.error('Insert error:', insertError);
        throw new Error('Failed to connect account');
      }

      accountId = insertedAccount.id;
    }

    // Step 5: Sync boards
    // First, delete existing boards for this account (they'll be re-added)
    await supabaseAdmin
      .from('pin_boards')
      .delete()
      .eq('account_id', accountId);

    // Insert fresh boards
    if (boards.length > 0) {
      const boardsToInsert = boards.map(board => ({
        account_id: accountId,
        board_id: board.id,
        board_name: board.name,
        description: board.description || null,
        pin_count: board.pin_count || 0,
        follower_count: board.follower_count || 0,
        privacy: board.privacy || 'PUBLIC',
        created_at: now,
        updated_at: now,
      }));

      const { error: boardsError } = await supabaseAdmin
        .from('pin_boards')
        .insert(boardsToInsert);

      if (boardsError) {
        console.error('Boards insert error:', boardsError);
        // Don't fail the whole operation, just log it
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Connected Pinterest account @${profile.username}`,
        account: {
          username: profile.username,
          boardCount: boards.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Pinterest token exchange error:', error);
    const message = error instanceof Error ? error.message : 'Failed to connect Pinterest';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
