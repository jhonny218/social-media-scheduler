import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { uploadFromUrl, getCdnUrl } from '../_shared/bunny.ts';

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  thumbnailUrl?: string;
}

interface MirrorRequest {
  media: MediaItem[];
  postId?: string; // Instagram post ID for organizing files
}

interface MirrorResult {
  id: string;
  originalUrl: string;
  mirroredUrl: string;
  storagePath: string;
  thumbnailUrl?: string;
  thumbnailStoragePath?: string;
  success: boolean;
  error?: string;
}

// Generate a unique filename based on Instagram media ID
function generatePath(igMediaId: string, type: 'image' | 'video', isThumbnail: boolean = false): string {
  const folder = 'instagram-mirror';
  const extension = type === 'video' ? 'mp4' : 'jpg';
  const suffix = isThumbnail ? '_thumb' : '';
  return `${folder}/${igMediaId}${suffix}.${extension}`;
}

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate user
    const { user } = await getUserFromRequest(req);

    // Get request body
    const { media, postId }: MirrorRequest = await req.json();

    if (!media || !Array.isArray(media) || media.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Media array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: MirrorResult[] = [];

    for (const item of media) {
      const result: MirrorResult = {
        id: item.id,
        originalUrl: item.url,
        mirroredUrl: '',
        storagePath: '',
        success: false,
      };

      try {
        // Skip if URL is empty or already from our CDN
        if (!item.url) {
          result.error = 'Empty URL';
          results.push(result);
          continue;
        }

        // Check if already mirrored (URL is from our Bunny CDN)
        const bunnyDomain = Deno.env.get('BUNNY_CDN_URL') || '';
        if (bunnyDomain && item.url.includes(bunnyDomain.replace('https://', '').replace('http://', ''))) {
          result.mirroredUrl = item.url;
          result.storagePath = item.url.replace(bunnyDomain + '/', '');
          result.success = true;
          results.push(result);
          continue;
        }

        // Generate storage path
        const storagePath = generatePath(item.id, item.type);

        // Mirror the main media file
        console.log(`Mirroring ${item.type} from Instagram: ${item.id}`);
        const uploadResult = await uploadFromUrl(storagePath, item.url);

        result.mirroredUrl = uploadResult.cdnUrl;
        result.storagePath = uploadResult.storagePath;
        result.success = true;

        // For videos, also mirror the thumbnail if available
        if (item.type === 'video' && item.thumbnailUrl) {
          try {
            const thumbPath = generatePath(item.id, 'image', true);
            const thumbResult = await uploadFromUrl(thumbPath, item.thumbnailUrl);
            result.thumbnailUrl = thumbResult.cdnUrl;
            result.thumbnailStoragePath = thumbResult.storagePath;
          } catch (thumbError) {
            console.error(`Failed to mirror thumbnail for ${item.id}:`, thumbError);
            // Don't fail the whole item if thumbnail fails
          }
        }
      } catch (itemError) {
        console.error(`Failed to mirror media ${item.id}:`, itemError);
        result.error = itemError instanceof Error ? itemError.message : 'Unknown error';
      }

      results.push(result);
    }

    // Count successes
    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          results,
          mirrored: successCount,
          failed: results.length - successCount,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Mirror error:', error);
    const message = error instanceof Error ? error.message : 'Failed to mirror media';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
