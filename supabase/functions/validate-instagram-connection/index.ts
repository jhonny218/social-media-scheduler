import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { validateAccessToken } from '../_shared/instagram.ts';

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
        JSON.stringify({ valid: false, error: 'Account ID is required' }),
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
        JSON.stringify({ valid: false, error: 'Instagram account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired
    const tokenExpiresAt = new Date(account.token_expires_at);
    const now = new Date();

    if (tokenExpiresAt <= now) {
      // Update account status
      await supabaseAdmin
        .from('ig_accounts')
        .update({ is_connected: false, updated_at: new Date().toISOString() })
        .eq('id', accountId);

      return new Response(
        JSON.stringify({ valid: false, error: 'Access token has expired. Please reconnect your account.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate token with Instagram API
    const { valid, userId } = await validateAccessToken(account.access_token);

    if (!valid) {
      // Update account status
      await supabaseAdmin
        .from('ig_accounts')
        .update({ is_connected: false, updated_at: new Date().toISOString() })
        .eq('id', accountId);

      return new Response(
        JSON.stringify({ valid: false, error: 'Access token is invalid. Please reconnect your account.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user ID matches
    if (userId && userId !== account.ig_user_id) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Token does not match the connected account.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update account status to connected if it wasn't
    if (!account.is_connected) {
      await supabaseAdmin
        .from('ig_accounts')
        .update({ is_connected: true, updated_at: new Date().toISOString() })
        .eq('id', accountId);
    }

    return new Response(
      JSON.stringify({ valid: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Validate connection error:', error);
    const message = error instanceof Error ? error.message : 'Failed to validate connection';

    return new Response(
      JSON.stringify({ valid: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
