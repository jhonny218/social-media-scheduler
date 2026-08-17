import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';
import { refreshLongLivedToken } from '../_shared/instagram.ts';
import { refreshAccessToken as refreshPinterestToken } from '../_shared/pinterest.ts';

// Run by cron, independently of publishing. scheduled-publisher also refreshes
// tokens, but only for an account that happens to have a post going out inside
// the 7-day expiry window — so a quiet stretch in the calendar (or an outage in
// the publisher itself) silently lets tokens die. This sweeps every connected
// account regardless of whether anything is scheduled.
//
// The window is deliberately much wider than the publisher's 7 days: at one run
// per day it gives ~3 weeks of retries before a token actually expires, so a few
// consecutive failures (platform hiccup, brief outage) can't cost us an account.
const DEFAULT_WITHIN_DAYS = 20;

interface RefreshResult {
  platform: 'instagram' | 'pinterest';
  accountId: string;
  label: string;
  refreshed: boolean;
  skipped?: string;
  newExpiry?: string;
  error?: string;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Body is optional — cron posts '{}'. `dryRun` reports what would be
    // refreshed without calling the platform APIs, for safe verification.
    let withinDays = DEFAULT_WITHIN_DAYS;
    let dryRun = false;
    try {
      const body = await req.json();
      if (typeof body?.withinDays === 'number') withinDays = body.withinDays;
      if (body?.dryRun === true) dryRun = true;
    } catch {
      // No/invalid body — use defaults.
    }

    const supabaseAdmin = createSupabaseAdmin();
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();
    const results: RefreshResult[] = [];

    // --- Instagram ---------------------------------------------------------
    const { data: igAccounts, error: igError } = await supabaseAdmin
      .from('ig_accounts')
      .select('id, username, access_token, token_expires_at')
      .eq('is_connected', true)
      .not('token_expires_at', 'is', null)
      .lte('token_expires_at', cutoff);

    if (igError) {
      throw new Error(`Failed to fetch Instagram accounts: ${igError.message}`);
    }

    for (const account of igAccounts ?? []) {
      const label = `@${account.username}`;

      // A token that has already expired cannot be exchanged — Instagram
      // rejects it, and only a fresh OAuth connect can recover the account.
      if (new Date(account.token_expires_at).getTime() <= Date.now()) {
        results.push({
          platform: 'instagram',
          accountId: account.id,
          label,
          refreshed: false,
          skipped: 'already expired — needs manual reconnect',
        });
        continue;
      }

      if (dryRun) {
        results.push({
          platform: 'instagram',
          accountId: account.id,
          label,
          refreshed: false,
          skipped: `dry run (expires ${account.token_expires_at})`,
        });
        continue;
      }

      try {
        const { accessToken, expiresIn } = await refreshLongLivedToken(account.access_token);
        const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        const { error: updateError } = await supabaseAdmin
          .from('ig_accounts')
          .update({
            access_token: accessToken,
            token_expires_at: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq('id', account.id);

        if (updateError) {
          throw new Error(`Failed to persist new token: ${updateError.message}`);
        }

        console.log(`Refreshed Instagram token for ${label}, new expiry: ${newExpiry}`);
        results.push({
          platform: 'instagram',
          accountId: account.id,
          label,
          refreshed: true,
          newExpiry,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Instagram token refresh failed for ${label}: ${message}`);
        // Leave is_connected alone: the existing token is still valid until its
        // expiry, and tomorrow's run gets another attempt.
        results.push({
          platform: 'instagram',
          accountId: account.id,
          label,
          refreshed: false,
          error: message,
        });
      }
    }

    // --- Pinterest ---------------------------------------------------------
    const appId = Deno.env.get('PINTEREST_APP_ID') || '';
    const appSecret = Deno.env.get('PINTEREST_APP_SECRET') || '';

    const { data: pinAccounts, error: pinError } = await supabaseAdmin
      .from('pin_accounts')
      .select('id, username, refresh_token, token_expires_at')
      .eq('is_connected', true)
      .not('token_expires_at', 'is', null)
      .lte('token_expires_at', cutoff);

    if (pinError) {
      throw new Error(`Failed to fetch Pinterest accounts: ${pinError.message}`);
    }

    for (const account of pinAccounts ?? []) {
      const label = `@${account.username}`;

      if (!account.refresh_token) {
        results.push({
          platform: 'pinterest',
          accountId: account.id,
          label,
          refreshed: false,
          skipped: 'no refresh token — needs manual reconnect',
        });
        continue;
      }

      if (!appId || !appSecret) {
        results.push({
          platform: 'pinterest',
          accountId: account.id,
          label,
          refreshed: false,
          error: 'PINTEREST_APP_ID / PINTEREST_APP_SECRET not configured',
        });
        continue;
      }

      if (dryRun) {
        results.push({
          platform: 'pinterest',
          accountId: account.id,
          label,
          refreshed: false,
          skipped: `dry run (expires ${account.token_expires_at})`,
        });
        continue;
      }

      try {
        const { accessToken, refreshToken, expiresIn } = await refreshPinterestToken(
          account.refresh_token,
          appId,
          appSecret
        );
        const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        const { error: updateError } = await supabaseAdmin
          .from('pin_accounts')
          .update({
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expires_at: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq('id', account.id);

        if (updateError) {
          throw new Error(`Failed to persist new token: ${updateError.message}`);
        }

        console.log(`Refreshed Pinterest token for ${label}, new expiry: ${newExpiry}`);
        results.push({
          platform: 'pinterest',
          accountId: account.id,
          label,
          refreshed: true,
          newExpiry,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Pinterest token refresh failed for ${label}: ${message}`);
        results.push({
          platform: 'pinterest',
          accountId: account.id,
          label,
          refreshed: false,
          error: message,
        });
      }
    }

    const refreshed = results.filter((r) => r.refreshed).length;
    const failed = results.filter((r) => r.error).length;

    return new Response(
      JSON.stringify({
        message: `Checked ${results.length} account(s) expiring within ${withinDays} days`,
        dryRun,
        refreshed,
        failed,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('refresh-all-tokens error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
