import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { refreshLongLivedToken } from '../_shared/instagram.ts';

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

    // Get the Instagram account
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

    // Refresh the token
    const { accessToken, expiresIn } = await refreshLongLivedToken(account.access_token);

    // Calculate new expiration date
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update the account with new token
    const { error: updateError } = await supabaseAdmin
      .from('ig_accounts')
      .update({
        access_token: accessToken,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    if (updateError) {
      throw new Error('Failed to update account token');
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          expiresAt,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Token refresh error:', error);
    const message = error instanceof Error ? error.message : 'Failed to refresh token';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
