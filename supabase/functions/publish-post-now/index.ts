import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { getCdnUrl } from '../_shared/bunny.ts';
import {
  createMediaContainer,
  createCarouselContainer,
  publishMedia,
  waitForMediaReady,
  postComment,
} from '../_shared/instagram.ts';

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
  platform: string;
  account_id: string;
  platform_user_id: string;
  post_type: string;
  caption?: string;
  media: PostMedia[];
  status: string;
  first_comment?: string;
  reel_cover?: { url?: string; storagePath?: string };
}

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate user
    const { user } = await getUserFromRequest(req);

    // Get request body
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
      .single();

    if (postError || !post) {
      return new Response(
        JSON.stringify({ success: false, error: 'Post not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scheduledPost = post as ScheduledPost;

    // Check if already published
    if (scheduledPost.status === 'published') {
      return new Response(
        JSON.stringify({ success: false, error: 'Post is already published' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Instagram account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('ig_accounts')
      .select('*')
      .eq('id', scheduledPost.account_id)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ success: false, error: 'Instagram account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to publishing
    await supabaseAdmin
      .from('sch_scheduled_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', postId);

    try {
      let publishResult: { id: string; permalink?: string };

      // Get CDN URLs for media (Bunny URLs are public, no signing needed)
      const mediaWithUrls = scheduledPost.media.map((media) => {
        if (media.storagePath) {
          return { ...media, url: getCdnUrl(media.storagePath) };
        }
        return media;
      });

      // Handle different post types
      if (scheduledPost.post_type === 'carousel') {
        // Create carousel children
        const childrenIds: string[] = [];

        for (const media of mediaWithUrls.sort((a, b) => a.order - b.order)) {
          const container = await createMediaContainer(
            account.ig_user_id,
            account.access_token,
            {
              imageUrl: media.type === 'image' ? media.url : undefined,
              videoUrl: media.type === 'video' ? media.url : undefined,
              isCarouselItem: true,
            }
          );

          // Wait for video processing if needed
          if (media.type === 'video') {
            await waitForMediaReady(container.id, account.access_token);
          }

          childrenIds.push(container.id);
        }

        // Create carousel container
        const carouselContainer = await createCarouselContainer(
          account.ig_user_id,
          account.access_token,
          childrenIds,
          scheduledPost.caption
        );

        // Wait for carousel container to be ready
        console.log('Waiting for carousel container to be ready...');
        await waitForMediaReady(carouselContainer.id, account.access_token);

        // Add delay to avoid Instagram API race condition
        console.log('Adding delay before publishing carousel...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Publish carousel
        publishResult = await publishMedia(
          account.ig_user_id,
          account.access_token,
          carouselContainer.id
        );
      } else if (scheduledPost.post_type === 'reel') {
        // Create reel container
        const media = mediaWithUrls[0];

        // Get cover URL if available (from Bunny CDN)
        let coverUrl: string | undefined;
        if (scheduledPost.reel_cover?.storagePath) {
          coverUrl = getCdnUrl(scheduledPost.reel_cover.storagePath);
        } else if (scheduledPost.reel_cover?.url) {
          coverUrl = scheduledPost.reel_cover.url;
        }

        const container = await createMediaContainer(
          account.ig_user_id,
          account.access_token,
          {
            videoUrl: media.url,
            caption: scheduledPost.caption,
            mediaType: 'REELS',
            coverUrl,
          }
        );

        // Wait for video processing
        await waitForMediaReady(container.id, account.access_token);

        // Publish reel
        publishResult = await publishMedia(
          account.ig_user_id,
          account.access_token,
          container.id
        );
      } else {
        // Single image or video post
        const media = mediaWithUrls[0];
        const isVideo = media.type === 'video';

        const container = await createMediaContainer(
          account.ig_user_id,
          account.access_token,
          {
            imageUrl: !isVideo ? media.url : undefined,
            videoUrl: isVideo ? media.url : undefined,
            caption: scheduledPost.caption,
            mediaType: isVideo ? 'VIDEO' : 'IMAGE',
          }
        );

        // Wait for video processing if needed
        if (isVideo) {
          await waitForMediaReady(container.id, account.access_token);
        }

        // Publish post
        publishResult = await publishMedia(
          account.ig_user_id,
          account.access_token,
          container.id
        );
      }

      // Post first comment if provided
      if (scheduledPost.first_comment && publishResult.id) {
        try {
          await postComment(publishResult.id, account.access_token, scheduledPost.first_comment);
        } catch (commentError) {
          console.error('Failed to post first comment:', commentError);
          // Don't fail the whole publish for a comment error
        }
      }

      // Update post as published
      await supabaseAdmin
        .from('sch_scheduled_posts')
        .update({
          status: 'published',
          platform_post_id: publishResult.id,
          permalink: publishResult.permalink,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            postId: publishResult.id,
            permalink: publishResult.permalink,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (publishError) {
      // Update post as failed
      const errorMessage = publishError instanceof Error ? publishError.message : 'Unknown error';

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
    console.error('Publish error:', error);
    const message = error instanceof Error ? error.message : 'Failed to publish post';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
