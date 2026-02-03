import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { refreshAccessToken, getUserBoards } from '../_shared/pinterest.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { user } = await getUserFromRequest(req);
    const { accountId } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Account ID is required' }),
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

    const supabaseAdmin = createSupabaseAdmin();

    // Fetch the account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('pin_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ success: false, error: 'Pinterest account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh the token
    console.log('Refreshing Pinterest token for account:', account.username);

    const { accessToken, refreshToken, expiresIn } = await refreshAccessToken(
      account.refresh_token,
      appId,
      appSecret
    );

    const now = new Date().toISOString();
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update the account with new tokens
    const { error: updateError } = await supabaseAdmin
      .from('pin_accounts')
      .update({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        is_connected: true,
        updated_at: now,
      })
      .eq('id', accountId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw new Error('Failed to update account');
    }

    // Also refresh boards
    try {
      console.log('Refreshing Pinterest boards...');
      const boards = await getUserBoards(accessToken);

      // Delete existing boards and insert fresh ones
      await supabaseAdmin
        .from('pin_boards')
        .delete()
        .eq('account_id', accountId);

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

        await supabaseAdmin
          .from('pin_boards')
          .insert(boardsToInsert);
      }
    } catch (boardsError) {
      console.error('Failed to refresh boards:', boardsError);
      // Don't fail the whole operation
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Token refreshed for @${account.username}`,
        expiresAt: tokenExpiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Pinterest token refresh error:', error);
    const message = error instanceof Error ? error.message : 'Failed to refresh token';

    // Mark account as disconnected if token refresh fails
    try {
      const { accountId } = await req.clone().json();
      const supabaseAdmin = createSupabaseAdmin();

      await supabaseAdmin
        .from('pin_accounts')
        .update({
          is_connected: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId);
    } catch {
      // Ignore cleanup errors
    }

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
