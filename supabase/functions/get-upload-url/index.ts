import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getUserFromRequest } from '../_shared/supabase.ts';
import { getBunnyConfig } from '../_shared/bunny.ts';

// This function returns the Bunny upload URL and credentials
// for direct browser-to-Bunny uploads (bypassing edge function memory limits)

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate user
    const { user } = await getUserFromRequest(req);

    // Get request body
    const { fileName, contentType, fileSize } = await req.json();

    if (!fileName || !contentType) {
      return new Response(
        JSON.stringify({ success: false, error: 'fileName and contentType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size (500MB max)
    const maxSize = 500 * 1024 * 1024;
    if (fileSize && fileSize > maxSize) {
      return new Response(
        JSON.stringify({ success: false, error: 'File size exceeds 500MB limit' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate storage path: userId/uuid.extension
    const extension = fileName.split('.').pop() || '';
    const uuid = crypto.randomUUID();
    const storagePath = `${user.id}/${uuid}.${extension}`;

    // Get Bunny config
    const config = getBunnyConfig();
    const uploadUrl = `https://${config.hostname}/${config.storageZone}/${storagePath}`;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          uploadUrl,
          storagePath,
          accessKey: config.apiKey,
          cdnUrl: `${config.cdnUrl}/${storagePath}`,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get upload URL error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get upload URL';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
