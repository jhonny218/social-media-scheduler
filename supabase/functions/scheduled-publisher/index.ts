import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';
import {
  createMediaContainer,
  createCarouselContainer,
  waitForMediaReady,
  publishMedia,
  postComment,
} from '../_shared/instagram.ts';

const STORAGE_BUCKET = 'media';
const SIGNED_URL_EXPIRY = 3600; // 1 hour

interface PostMedia {
  id: string;
  url: string;
  storagePath?: string;
  type: 'image' | 'video';
  order: number;
  thumbnailUrl?: string;
  thumbnailStoragePath?: string;
}

interface ReelCover {
  type: 'frame' | 'custom';
  storagePath: string;
  url?: string;
  timestamp?: number;
}

interface ScheduledPost {
  id: string;
  user_id: string;
  account_id: string;
  platform_user_id: string;
  post_type: 'feed' | 'reel' | 'carousel';
  caption: string | null;
  media: PostMedia[];
  reel_cover?: ReelCover;
  first_comment: string | null;
  scheduled_time: string;
}

interface InstagramAccount {
  id: string;
  ig_user_id: string;
  access_token: string;
}

interface SignedUrlEntry {
  path: string | null;
  signedUrl: string;
  error: string | null;
}

// Generate fresh signed URLs for media
async function getSignedUrls(
  supabaseAdmin: SupabaseClient,
  paths: string[]
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRY);

  if (error || !data) {
    console.error('Failed to generate signed URLs:', error);
    return new Map();
  }

  return new Map(
    (data as SignedUrlEntry[])
      .filter((entry: SignedUrlEntry) => entry.path && !entry.error)
      .map((entry: SignedUrlEntry) => [entry.path as string, entry.signedUrl])
  );
}

// Publish a single post
async function publishPost(
  supabaseAdmin: SupabaseClient,
  post: ScheduledPost,
  account: InstagramAccount
): Promise<{ success: boolean; error?: string; platformPostId?: string; permalink?: string }> {
  try {
    // Update status to publishing
    await supabaseAdmin
      .from('scheduled_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', post.id);

    // Collect all storage paths that need signed URLs
    const storagePaths: string[] = [];
    post.media.forEach((m) => {
      if (m.storagePath) storagePaths.push(m.storagePath);
      if (m.thumbnailStoragePath) storagePaths.push(m.thumbnailStoragePath);
    });
    if (post.reel_cover?.storagePath) {
      storagePaths.push(post.reel_cover.storagePath);
    }

    // Generate fresh signed URLs
    const signedUrlMap = await getSignedUrls(supabaseAdmin, storagePaths);

    // Update media with fresh URLs
    const mediaWithUrls = post.media.map((m) => ({
      ...m,
      url: m.storagePath ? signedUrlMap.get(m.storagePath) || m.url : m.url,
      thumbnailUrl: m.thumbnailStoragePath
        ? signedUrlMap.get(m.thumbnailStoragePath) || m.thumbnailUrl
        : m.thumbnailUrl,
    }));

    // Update reel cover with fresh URL
    const reelCoverUrl = post.reel_cover?.storagePath
      ? signedUrlMap.get(post.reel_cover.storagePath)
      : undefined;

    let platformPostId: string;
    let permalink: string | undefined;

    if (post.post_type === 'carousel') {
      // Create individual media containers for carousel
      const containerIds: string[] = [];

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
        containerIds.push(container.id);
      }

      // Create carousel container
      const carouselContainer = await createCarouselContainer(
        account.ig_user_id,
        account.access_token,
        containerIds,
        post.caption || undefined
      );

      // Publish carousel
      const result = await publishMedia(
        account.ig_user_id,
        account.access_token,
        carouselContainer.id
      );
      platformPostId = result.id;
      permalink = result.permalink;
    } else if (post.post_type === 'reel') {
      // Create reel container
      const video = mediaWithUrls.find((m) => m.type === 'video');
      if (!video) {
        throw new Error('No video found for reel');
      }

      const reelContainer = await createMediaContainer(
        account.ig_user_id,
        account.access_token,
        {
          videoUrl: video.url,
          caption: post.caption || undefined,
          mediaType: 'REELS',
          coverUrl: reelCoverUrl || video.thumbnailUrl,
        }
      );

      // Wait for video processing
      await waitForMediaReady(reelContainer.id, account.access_token);

      // Publish reel
      const result = await publishMedia(
        account.ig_user_id,
        account.access_token,
        reelContainer.id
      );
      platformPostId = result.id;
      permalink = result.permalink;
    } else {
      // Single image or video (feed post)
      const media = mediaWithUrls[0];
      if (!media) {
        throw new Error('No media found for post');
      }

      const container = await createMediaContainer(
        account.ig_user_id,
        account.access_token,
        {
          imageUrl: media.type === 'image' ? media.url : undefined,
          videoUrl: media.type === 'video' ? media.url : undefined,
          caption: post.caption || undefined,
          mediaType: media.type === 'video' ? 'VIDEO' : undefined,
        }
      );

      // Wait for processing if video
      if (media.type === 'video') {
        await waitForMediaReady(container.id, account.access_token);
      }

      // Publish
      const result = await publishMedia(
        account.ig_user_id,
        account.access_token,
        container.id
      );
      platformPostId = result.id;
      permalink = result.permalink;
    }

    // Post first comment if specified
    if (post.first_comment && platformPostId) {
      try {
        await postComment(platformPostId, account.access_token, post.first_comment);
      } catch (commentError) {
        console.error('Failed to post first comment:', commentError);
        // Don't fail the whole publish for a comment error
      }
    }

    // Update post as published
    await supabaseAdmin
      .from('scheduled_posts')
      .update({
        status: 'published',
        platform_post_id: platformPostId,
        permalink: permalink || null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id);

    return { success: true, platformPostId, permalink };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to publish post ${post.id}:`, errorMessage);

    // Update post as failed
    await supabaseAdmin
      .from('scheduled_posts')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id);

    return { success: false, error: errorMessage };
  }
}

serve(async (req: Request) => {
  // Handle CORS for manual invocation
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabaseAdmin = createSupabaseAdmin();

    // Find posts that are due for publishing
    // Status is 'scheduled' and scheduled_time is in the past (or now)
    const { data: duePosts, error: fetchError } = await supabaseAdmin
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_time', new Date().toISOString())
      .order('scheduled_time', { ascending: true })
      .limit(10); // Process up to 10 posts per invocation to avoid timeout

    if (fetchError) {
      throw new Error(`Failed to fetch due posts: ${fetchError.message}`);
    }

    if (!duePosts || duePosts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No posts due for publishing', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${duePosts.length} posts due for publishing`);

    const results: Array<{ postId: string; success: boolean; error?: string }> = [];

    for (const post of duePosts as ScheduledPost[]) {
      // Get the Instagram account for this post
      const { data: account, error: accountError } = await supabaseAdmin
        .from('ig_accounts')
        .select('id, ig_user_id, access_token')
        .eq('id', post.account_id)
        .single();

      if (accountError || !account) {
        console.error(`Account not found for post ${post.id}`);
        await supabaseAdmin
          .from('scheduled_posts')
          .update({
            status: 'failed',
            error_message: 'Instagram account not found or disconnected',
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);
        results.push({ postId: post.id, success: false, error: 'Account not found' });
        continue;
      }

      // Publish the post
      const result = await publishPost(supabaseAdmin, post, account as InstagramAccount);
      results.push({ postId: post.id, ...result });

      // Small delay between posts to avoid rate limiting
      if (duePosts.indexOf(post) < duePosts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} posts`,
        successful,
        failed,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Scheduled publisher error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process scheduled posts';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
