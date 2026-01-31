import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import {
  createPhotoPost,
  createVideoPost,
  createLinkPost,
  createAlbumPost,
} from '../_shared/facebook.ts';

const STORAGE_BUCKET = 'media';
const SIGNED_URL_EXPIRY = 3600;

interface PostMedia {
  id: string;
  url: string;
  storagePath?: string;
  type: 'image' | 'video';
  order: number;
}

interface ScheduledPost {
  id: string;
  user_id: string;
  account_id: string;
  platform_user_id: string;
  post_type: string;
  fb_post_type?: string;
  caption: string | null;
  media: PostMedia[];
}

interface FacebookPage {
  id: string;
  page_id: string;
  page_access_token: string;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { user } = await getUserFromRequest(req);
    const { postId } = await req.json();

    if (!postId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Post ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Get the post
    const { data: post, error: postError } = await supabaseAdmin
      .from('sch_scheduled_posts')
      .select('*')
      .eq('id', postId)
      .eq('user_id', user.id)
      .eq('platform', 'facebook')
      .single();

    if (postError || !post) {
      return new Response(
        JSON.stringify({ success: false, error: 'Post not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scheduledPost = post as ScheduledPost;

    // Check if already published
    if (post.status === 'published') {
      return new Response(
        JSON.stringify({ success: false, error: 'Post is already published' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the Facebook page
    const { data: page, error: pageError } = await supabaseAdmin
      .from('fb_pages')
      .select('*')
      .eq('id', scheduledPost.account_id)
      .eq('user_id', user.id)
      .single();

    if (pageError || !page) {
      return new Response(
        JSON.stringify({ success: false, error: 'Facebook Page not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fbPage = page as FacebookPage;

    // Update status to publishing
    await supabaseAdmin
      .from('sch_scheduled_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', postId);

    try {
      // Generate signed URLs for media
      const mediaWithUrls = await generateSignedUrls(supabaseAdmin, scheduledPost.media || []);

      let result: { id: string; permalink?: string };

      // Determine post type
      const fbPostType = scheduledPost.fb_post_type || detectPostType(scheduledPost);
      console.log('Publishing Facebook post type:', fbPostType);

      switch (fbPostType) {
        case 'photo':
          result = await createPhotoPost(fbPage.page_id, fbPage.page_access_token, {
            photoUrl: mediaWithUrls[0]?.url,
            caption: scheduledPost.caption || undefined,
          });
          break;

        case 'video':
          result = await createVideoPost(fbPage.page_id, fbPage.page_access_token, {
            videoUrl: mediaWithUrls[0]?.url,
            description: scheduledPost.caption || undefined,
          });
          break;

        case 'album':
          result = await createAlbumPost(fbPage.page_id, fbPage.page_access_token, {
            photoUrls: mediaWithUrls.map(m => m.url),
            caption: scheduledPost.caption || undefined,
          });
          break;

        case 'link':
        default:
          result = await createLinkPost(fbPage.page_id, fbPage.page_access_token, {
            message: scheduledPost.caption || undefined,
          });
          break;
      }

      // Update post as published
      await supabaseAdmin
        .from('sch_scheduled_posts')
        .update({
          status: 'published',
          platform_post_id: result.id,
          permalink: result.permalink || null,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);

      return new Response(
        JSON.stringify({
          success: true,
          postId: result.id,
          permalink: result.permalink,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (publishError) {
      const errorMessage = publishError instanceof Error ? publishError.message : 'Unknown error';

      // Update post as failed
      await supabaseAdmin
        .from('sch_scheduled_posts')
        .update({
          status: 'failed',
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);

      throw publishError;
    }
  } catch (error) {
    console.error('Facebook publish error:', error);
    const message = error instanceof Error ? error.message : 'Failed to publish';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper: Generate signed URLs for media
async function generateSignedUrls(
  supabase: SupabaseClient,
  media: PostMedia[]
): Promise<Array<PostMedia & { url: string }>> {
  const paths = media.filter(m => m.storagePath).map(m => m.storagePath as string);

  if (paths.length === 0) {
    return media.map(m => ({ ...m, url: m.url }));
  }

  const { data } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRY);

  const urlMap = new Map(
    (data || [])
      .filter(d => d.path && !d.error)
      .map(d => [d.path, d.signedUrl])
  );

  return media.map(m => ({
    ...m,
    url: m.storagePath ? urlMap.get(m.storagePath) || m.url : m.url,
  }));
}

// Helper: Detect post type based on media
function detectPostType(post: ScheduledPost): string {
  if (!post.media || post.media.length === 0) return 'link';
  if (post.media.length > 1) return 'album';
  return post.media[0].type === 'video' ? 'video' : 'photo';
}
