import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getUserFromRequest } from '../_shared/supabase.ts';
import { deleteFile } from '../_shared/bunny.ts';

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate user
    const { user } = await getUserFromRequest(req);

    // Get storage path from request body
    const { storagePath } = await req.json();

    if (!storagePath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Storage path is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Security: Ensure the path belongs to the user
    if (!storagePath.startsWith(`${user.id}/`)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Cannot delete files from other users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete from Bunny
    const deleted = await deleteFile(storagePath);

    return new Response(
      JSON.stringify({
        success: true,
        deleted,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Delete error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete file';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
