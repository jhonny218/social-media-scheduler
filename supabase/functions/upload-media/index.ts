import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getUserFromRequest } from '../_shared/supabase.ts';
import { uploadFile, getCdnUrl } from '../_shared/bunny.ts';

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate user
    const { user } = await getUserFromRequest(req);

    // Get form data with file
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const customPath = formData.get('path') as string | null;

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size (500MB max for Bunny)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      return new Response(
        JSON.stringify({ success: false, error: 'File size exceeds 500MB limit' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate storage path: userId/filename or custom path
    let storagePath: string;
    if (customPath) {
      // Ensure custom path is scoped to user
      storagePath = `${user.id}/${customPath}`;
    } else {
      // Generate unique filename
      const extension = file.name.split('.').pop() || '';
      const uuid = crypto.randomUUID();
      const fileName = `${uuid}.${extension}`;
      storagePath = `${user.id}/${fileName}`;
    }

    // Read file as Uint8Array
    const fileData = new Uint8Array(await file.arrayBuffer());

    // Upload to Bunny
    const result = await uploadFile(storagePath, fileData, file.type);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          storagePath: result.storagePath,
          cdnUrl: result.cdnUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload file';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
