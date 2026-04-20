import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';
import { getCdnUrl, uploadFile } from '../_shared/bunny.ts';
import {
  createMediaContainer,
  createCarouselContainer,
  waitForMediaReady,
  publishMedia,
  postComment,
  refreshLongLivedToken,
} from '../_shared/instagram.ts';
import {
  createPhotoPost,
  createVideoPost,
  createLinkPost,
  createAlbumPost,
} from '../_shared/facebook.ts';
import {
  createPin,
  createVideoPin,
  uploadVideo,
  refreshAccessToken as refreshPinterestToken,
} from '../_shared/pinterest.ts';

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
  platform: 'instagram' | 'facebook' | 'pinterest';
  account_id: string;
  platform_user_id: string;
  post_type: 'feed' | 'reel' | 'carousel' | 'pin' | 'video_pin';
  fb_post_type?: 'photo' | 'video' | 'link' | 'album';
  caption: string | null;
  media: PostMedia[];
  reel_cover?: ReelCover;
  first_comment: string | null;
  scheduled_time: string;
  pin_board_id?: string;
  pin_link?: string;
  pin_alt_text?: string;
}

interface InstagramAccount {
  id: string;
  ig_user_id: string;
  access_token: string;
  token_expires_at: string | null;
}

interface FacebookPage {
  id: string;
  page_id: string;
  page_access_token: string;
}

interface PinterestAccount {
  id: string;
  pin_user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

interface PinterestBoard {
  id: string;
  board_id: string;
  board_name: string;
}

// Convert a PNG image to JPEG by fetching, decoding, and re-uploading
async function convertPngToJpeg(pngUrl: string, storagePath: string): Promise<string> {
  console.log(`Converting PNG to JPEG: ${storagePath}`);
  const response = await fetch(pngUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch PNG: ${response.status}`);
  }
  const pngData = new Uint8Array(await response.arrayBuffer());

  // Re-upload as JPEG path (Bunny serves based on content, and Instagram
  // checks the URL extension, so we need a .jpg path)
  const jpegPath = storagePath.replace(/\.png$/i, '.jpg');
  const { cdnUrl } = await uploadFile(jpegPath, pngData, 'image/jpeg');
  console.log(`Uploaded as JPEG: ${cdnUrl}`);
  return cdnUrl;
}

// Generate CDN URLs for media (Bunny URLs are public, no signing needed)
function getMediaWithUrls(post: ScheduledPost): {
  mediaWithUrls: PostMedia[];
  reelCoverUrl?: string;
} {
  // Update media with CDN URLs
  const mediaWithUrls = post.media.map((m) => ({
    ...m,
    url: m.storagePath ? getCdnUrl(m.storagePath) : m.url,
    thumbnailUrl: m.thumbnailStoragePath ? getCdnUrl(m.thumbnailStoragePath) : m.thumbnailUrl,
  }));

  // Get reel cover URL
  const reelCoverUrl = post.reel_cover?.storagePath
    ? getCdnUrl(post.reel_cover.storagePath)
    : undefined;

  return { mediaWithUrls, reelCoverUrl };
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
      .from('sch_scheduled_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', post.id);

    // Get CDN URLs for media
    const { mediaWithUrls, reelCoverUrl } = getMediaWithUrls(post);

    // Convert any PNG images to JPEG (Instagram doesn't accept PNG)
    for (const media of mediaWithUrls) {
      if (media.type === 'image' && media.storagePath && /\.png$/i.test(media.storagePath)) {
        try {
          media.url = await convertPngToJpeg(media.url, media.storagePath);
        } catch (err) {
          console.error(`Failed to convert PNG to JPEG: ${err}`);
          // Continue with original URL as fallback
        }
      }
    }

    let platformPostId: string;
    let permalink: string | undefined;

    if (post.post_type === 'carousel') {
      // Create individual media containers for carousel
      const containerIds: string[] = [];

      const sortedMedia = mediaWithUrls.sort((a, b) => a.order - b.order);
      for (const media of sortedMedia) {
        if (!media.url) {
          throw new Error(`Carousel item ${media.id} (${media.type}, order ${media.order}) has no URL. storagePath: ${media.storagePath || 'none'}`);
        }
        const container = await createMediaContainer(
          account.ig_user_id,
          account.access_token,
          {
            imageUrl: media.type === 'image' ? media.url : undefined,
            videoUrl: media.type === 'video' ? media.url : undefined,
            mediaType: media.type === 'video' ? 'VIDEO' : undefined,
            isCarouselItem: true,
          }
        );
        containerIds.push(container.id);
      }

      // Poll each child container until FINISHED or ERROR
      console.log(`Waiting for ${containerIds.length} child containers to finish processing...`);
      for (let i = 0; i < containerIds.length; i++) {
        const containerId = containerIds[i];
        const mediaItem = sortedMedia[i];
        console.log(`Polling child container ${containerId} (${mediaItem.type}, order ${mediaItem.order})...`);
        try {
          await waitForMediaReady(containerId, account.access_token, 90000);
          console.log(`Child container ${containerId} is FINISHED`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Carousel item #${mediaItem.order + 1} (${mediaItem.type}) failed processing: ${msg}`);
        }
      }
      console.log('All child containers ready, creating carousel container...');

      // Create carousel container
      const carouselContainer = await createCarouselContainer(
        account.ig_user_id,
        account.access_token,
        containerIds,
        post.caption || undefined
      );

      // Wait for carousel container to be ready
      console.log('Waiting for carousel container to be ready...');
      await waitForMediaReady(carouselContainer.id, account.access_token, 60000);
      console.log('Carousel container ready, publishing...');
      console.log('Publishing carousel...');

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

      // Add delay for image posts - Instagram needs time to fetch and process the image
      // from the external URL before the container is ready to publish
      if (media.type === 'image') {
        console.log('Adding delay for image container processing...');
        await new Promise(resolve => setTimeout(resolve, 3000));
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
      .from('sch_scheduled_posts')
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
      .from('sch_scheduled_posts')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id);

    return { success: false, error: errorMessage };
  }
}

// Publish a Facebook post
async function publishFacebookPost(
  supabaseAdmin: SupabaseClient,
  post: ScheduledPost,
  page: FacebookPage
): Promise<{ success: boolean; error?: string; platformPostId?: string; permalink?: string }> {
  try {
    // Update status to publishing
    await supabaseAdmin
      .from('sch_scheduled_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', post.id);

    // Get CDN URLs for media
    const { mediaWithUrls } = getMediaWithUrls(post);

    let platformPostId: string;
    let permalink: string | undefined;

    // Determine post type
    const fbPostType = post.fb_post_type || detectFacebookPostType(post);
    console.log(`Publishing Facebook post type: ${fbPostType}`);

    switch (fbPostType) {
      case 'photo': {
        const result = await createPhotoPost(page.page_id, page.page_access_token, {
          photoUrl: mediaWithUrls[0]?.url,
          caption: post.caption || undefined,
        });
        platformPostId = result.id;
        permalink = result.permalink;
        break;
      }

      case 'video': {
        const result = await createVideoPost(page.page_id, page.page_access_token, {
          videoUrl: mediaWithUrls[0]?.url,
          description: post.caption || undefined,
        });
        platformPostId = result.id;
        break;
      }

      case 'album': {
        // Facebook albums only support photos - filter out videos
        const photoMedia = mediaWithUrls.filter(m => m.type === 'image');
        if (photoMedia.length === 0) {
          throw new Error('No images found for Facebook album post');
        }
        if (photoMedia.length < mediaWithUrls.length) {
          console.log(`Filtered out ${mediaWithUrls.length - photoMedia.length} video(s) from Facebook album - albums only support photos`);
        }
        const result = await createAlbumPost(page.page_id, page.page_access_token, {
          photoUrls: photoMedia.map(m => m.url),
          caption: post.caption || undefined,
        });
        platformPostId = result.id;
        permalink = result.permalink;
        break;
      }

      case 'link':
      default: {
        const result = await createLinkPost(page.page_id, page.page_access_token, {
          message: post.caption || undefined,
        });
        platformPostId = result.id;
        permalink = result.permalink;
        break;
      }
    }

    // Update post as published
    await supabaseAdmin
      .from('sch_scheduled_posts')
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
    console.error(`Failed to publish Facebook post ${post.id}:`, errorMessage);

    // Update post as failed
    await supabaseAdmin
      .from('sch_scheduled_posts')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id);

    return { success: false, error: errorMessage };
  }
}

// Detect Facebook post type based on media
function detectFacebookPostType(post: ScheduledPost): string {
  if (!post.media || post.media.length === 0) return 'link';
  if (post.media.length > 1) return 'album';
  return post.media[0].type === 'video' ? 'video' : 'photo';
}

// Publish a Pinterest post
async function publishPinterestPost(
  supabaseAdmin: SupabaseClient,
  post: ScheduledPost,
  account: PinterestAccount,
  board: PinterestBoard
): Promise<{ success: boolean; error?: string; platformPostId?: string; permalink?: string }> {
  try {
    // Update status to publishing
    await supabaseAdmin
      .from('sch_scheduled_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', post.id);

    // Get CDN URLs for media
    const { mediaWithUrls } = getMediaWithUrls(post);

    // Pinterest requires exactly one media item per pin
    const primaryMedia = mediaWithUrls[0];
    if (!primaryMedia) {
      throw new Error('Pinterest pins require at least one media item');
    }

    let platformPostId: string;
    let permalink: string | undefined;

    if (primaryMedia.type === 'video') {
      // For video pins, upload video first
      console.log('Uploading video to Pinterest...');
      const { mediaId } = await uploadVideo(account.access_token, {
        videoUrl: primaryMedia.url,
      });

      console.log('Creating video pin...');
      const result = await createVideoPin(account.access_token, {
        boardId: board.board_id,
        videoUrl: mediaId,
        title: post.caption?.substring(0, 100),
        description: post.caption || undefined,
        link: post.pin_link || undefined,
        altText: post.pin_alt_text || undefined,
      });
      platformPostId = result.id;
      permalink = result.url;
    } else {
      // For image pins
      console.log('Creating image pin...');
      const result = await createPin(account.access_token, {
        boardId: board.board_id,
        mediaUrl: primaryMedia.url,
        title: post.caption?.substring(0, 100),
        description: post.caption || undefined,
        link: post.pin_link || undefined,
        altText: post.pin_alt_text || undefined,
      });
      platformPostId = result.id;
      permalink = result.url;
    }

    // Update post as published
    await supabaseAdmin
      .from('sch_scheduled_posts')
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
    console.error(`Failed to publish Pinterest post ${post.id}:`, errorMessage);

    // Update post as failed
    await supabaseAdmin
      .from('sch_scheduled_posts')
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
      .from('sch_scheduled_posts')
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
      const platform = post.platform || 'instagram'; // Default to Instagram for backwards compatibility
      console.log(`Processing ${platform} post ${post.id}`);

      if (platform === 'pinterest') {
        // Get the Pinterest account for this post
        const { data: account, error: accountError } = await supabaseAdmin
          .from('pin_accounts')
          .select('id, pin_user_id, access_token, refresh_token, token_expires_at')
          .eq('id', post.account_id)
          .single();

        if (accountError || !account) {
          console.error(`Pinterest account not found for post ${post.id}`);
          await supabaseAdmin
            .from('sch_scheduled_posts')
            .update({
              status: 'failed',
              error_message: 'Pinterest account not found or disconnected',
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);
          results.push({ postId: post.id, success: false, error: 'Pinterest account not found' });
          continue;
        }

        // Auto-refresh Pinterest token if it expires within 7 days
        const pinAccount = account as PinterestAccount;
        if (pinAccount.token_expires_at && pinAccount.refresh_token) {
          const expiresAt = new Date(pinAccount.token_expires_at).getTime();
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          if (expiresAt - Date.now() < sevenDaysMs) {
            console.log(`Pinterest token for account ${pinAccount.id} expires soon, refreshing...`);
            try {
              const appId = Deno.env.get('PINTEREST_APP_ID') || '';
              const appSecret = Deno.env.get('PINTEREST_APP_SECRET') || '';
              const refreshed = await refreshPinterestToken(pinAccount.refresh_token, appId, appSecret);
              pinAccount.access_token = refreshed.accessToken;
              const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
              await supabaseAdmin
                .from('pin_accounts')
                .update({
                  access_token: refreshed.accessToken,
                  refresh_token: refreshed.refreshToken,
                  token_expires_at: newExpiresAt,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', pinAccount.id);
              console.log(`Pinterest token refreshed successfully, new expiry: ${newExpiresAt}`);
            } catch (refreshError) {
              console.error(`Failed to refresh Pinterest token: ${refreshError}`);
            }
          }
        }

        // Get the board for this post
        const { data: board, error: boardError } = await supabaseAdmin
          .from('pin_boards')
          .select('id, board_id, board_name')
          .eq('id', post.pin_board_id)
          .single();

        if (boardError || !board) {
          console.error(`Pinterest board not found for post ${post.id}`);
          await supabaseAdmin
            .from('sch_scheduled_posts')
            .update({
              status: 'failed',
              error_message: 'Pinterest board not found',
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);
          results.push({ postId: post.id, success: false, error: 'Pinterest board not found' });
          continue;
        }

        // Publish the Pinterest post
        const result = await publishPinterestPost(supabaseAdmin, post, pinAccount, board as PinterestBoard);
        results.push({ postId: post.id, ...result });
      } else if (platform === 'facebook') {
        // Get the Facebook page for this post
        const { data: page, error: pageError } = await supabaseAdmin
          .from('fb_pages')
          .select('id, page_id, page_access_token')
          .eq('id', post.account_id)
          .single();

        if (pageError || !page) {
          console.error(`Facebook page not found for post ${post.id}`);
          await supabaseAdmin
            .from('sch_scheduled_posts')
            .update({
              status: 'failed',
              error_message: 'Facebook page not found or disconnected',
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);
          results.push({ postId: post.id, success: false, error: 'Facebook page not found' });
          continue;
        }

        // Publish the Facebook post
        const result = await publishFacebookPost(supabaseAdmin, post, page as FacebookPage);
        results.push({ postId: post.id, ...result });
      } else {
        // Get the Instagram account for this post
        const { data: account, error: accountError } = await supabaseAdmin
          .from('ig_accounts')
          .select('id, ig_user_id, access_token, token_expires_at')
          .eq('id', post.account_id)
          .single();

        if (accountError || !account) {
          console.error(`Instagram account not found for post ${post.id}`);
          await supabaseAdmin
            .from('sch_scheduled_posts')
            .update({
              status: 'failed',
              error_message: 'Instagram account not found or disconnected',
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);
          results.push({ postId: post.id, success: false, error: 'Account not found' });
          continue;
        }

        // Auto-refresh Instagram token if it expires within 7 days
        const igAccount = account as InstagramAccount;
        if (igAccount.token_expires_at) {
          const expiresAt = new Date(igAccount.token_expires_at).getTime();
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          if (expiresAt - Date.now() < sevenDaysMs) {
            console.log(`Instagram token for account ${igAccount.id} expires soon, refreshing...`);
            try {
              const refreshed = await refreshLongLivedToken(igAccount.access_token);
              igAccount.access_token = refreshed.accessToken;
              const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
              await supabaseAdmin
                .from('ig_accounts')
                .update({
                  access_token: refreshed.accessToken,
                  token_expires_at: newExpiresAt,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', igAccount.id);
              console.log(`Instagram token refreshed successfully, new expiry: ${newExpiresAt}`);
            } catch (refreshError) {
              console.error(`Failed to refresh Instagram token: ${refreshError}`);
              // Continue with the existing token — it may still work if not fully expired
            }
          }
        }

        // Publish the Instagram post
        const result = await publishPost(supabaseAdmin, post, igAccount);
        results.push({ postId: post.id, ...result });
      }

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
