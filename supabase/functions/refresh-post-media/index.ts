import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { uploadFromUrl, getCdnUrl } from '../_shared/bunny.ts';

interface PostMedia {
  id: string;
  url: string;
  storagePath?: string;
  type: 'image' | 'video';
  order: number;
  thumbnailUrl?: string;
}

// Generate a unique filename based on Instagram media ID
function generatePath(igMediaId: string, type: 'image' | 'video', isThumbnail: boolean = false): string {
  const folder = 'instagram-mirror';
  const extension = type === 'video' ? 'mp4' : 'jpg';
  const suffix = isThumbnail ? '_thumb' : '';
  return `${folder}/${igMediaId}${suffix}.${extension}`;
}

// Check if URL is from our Bunny CDN
function isBunnyCdnUrl(url: string): boolean {
  const bunnyDomain = Deno.env.get('BUNNY_CDN_URL') || '';
  if (!bunnyDomain || !url) return false;
  return url.includes(bunnyDomain.replace('https://', '').replace('http://', ''));
}

// Check if URL is from Instagram CDN (will expire)
function isInstagramCdnUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('cdninstagram.com') ||
         url.includes('fbcdn.net') ||
         url.includes('instagram.com');
}

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate user
    const { user } = await getUserFromRequest(req);

    const supabaseAdmin = createSupabaseAdmin();

    // Get all published posts with Instagram CDN URLs that need refreshing
    const { data: posts, error: fetchError } = await supabaseAdmin
      .from('sch_scheduled_posts')
      .select('id, media, platform_post_id, platform')
      .eq('user_id', user.id)
      .eq('status', 'published')
      .eq('platform', 'instagram');

    if (fetchError) {
      throw new Error(`Failed to fetch posts: ${fetchError.message}`);
    }

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No posts to refresh', updated: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let updatedCount = 0;
    let errorCount = 0;

    let skippedCount = 0;
    let mirroredMediaCount = 0;

    for (const post of posts) {
      const media = (post.media || []) as PostMedia[];

      // Skip if no media or all media already have storagePath (already mirrored)
      const needsRefresh = media.some(m =>
        m.url && !m.storagePath
      );

      if (!needsRefresh) {
        skippedCount++;
        continue;
      }

      console.log(`Refreshing media for post ${post.id}`);

      const updatedMedia: PostMedia[] = [];
      let postHadSuccessfulMirror = false;

      for (const item of media) {
        // Skip if already mirrored (has storagePath)
        if (item.storagePath) {
          console.log(`  Media ${item.id} already has storagePath, skipping`);
          updatedMedia.push(item);
          continue;
        }

        // Skip if URL is already from Bunny CDN
        if (isBunnyCdnUrl(item.url)) {
          console.log(`  Media ${item.id} already on Bunny CDN, skipping`);
          updatedMedia.push(item);
          continue;
        }

        // Check if this is an Instagram URL we can try to mirror
        if (!isInstagramCdnUrl(item.url)) {
          console.log(`  Media ${item.id} is not an Instagram URL: ${item.url.substring(0, 50)}...`);
          updatedMedia.push(item);
          continue;
        }

        try {
          // Generate storage path based on media ID
          const storagePath = generatePath(item.id, item.type);

          // Upload to Bunny
          console.log(`  Mirroring media ${item.id} (${item.type}) from: ${item.url.substring(0, 80)}...`);
          const result = await uploadFromUrl(storagePath, item.url);

          const updatedItem: PostMedia = {
            ...item,
            url: result.cdnUrl,
            storagePath: result.storagePath,
          };

          // Mirror thumbnail for videos
          if (item.type === 'video' && item.thumbnailUrl && isInstagramCdnUrl(item.thumbnailUrl)) {
            try {
              const thumbPath = generatePath(item.id, 'image', true);
              const thumbResult = await uploadFromUrl(thumbPath, item.thumbnailUrl);
              updatedItem.thumbnailUrl = thumbResult.cdnUrl;
            } catch (thumbError) {
              console.error(`  Failed to mirror thumbnail: ${thumbError}`);
            }
          }

          updatedMedia.push(updatedItem);
          postHadSuccessfulMirror = true;
          mirroredMediaCount++;
          console.log(`  Successfully mirrored to: ${result.cdnUrl}`);
        } catch (mirrorError) {
          console.error(`  Failed to mirror media ${item.id}: ${mirrorError}`);
          // Keep original URL if mirroring fails - the URL is likely expired
          updatedMedia.push(item);
          errorCount++;
        }
      }

      // Only update post if we successfully mirrored at least one media item
      if (postHadSuccessfulMirror) {
        const { error: updateError } = await supabaseAdmin
          .from('sch_scheduled_posts')
          .update({
            media: updatedMedia,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        if (updateError) {
          console.error(`Failed to update post ${post.id}: ${updateError.message}`);
          errorCount++;
        } else {
          updatedCount++;
        }
      }
    }

    console.log(`Summary: ${updatedCount} posts updated, ${mirroredMediaCount} media mirrored, ${skippedCount} posts skipped, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          totalPosts: posts.length,
          updated: updatedCount,
          skipped: skippedCount,
          mirroredMedia: mirroredMediaCount,
          errors: errorCount,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Refresh error:', error);
    const message = error instanceof Error ? error.message : 'Failed to refresh media';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
