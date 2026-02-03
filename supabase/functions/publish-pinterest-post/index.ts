import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { createPin, createVideoPin, uploadVideo } from '../_shared/pinterest.ts';

const STORAGE_BUCKET = 'media';
const SIGNED_URL_EXPIRY = 3600; // 1 hour

interface PostMedia {
  id: string;
  url: string;
  storagePath?: string;
  type: 'image' | 'video';
  order: number;
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

    // Fetch the post
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

    if (post.platform !== 'pinterest') {
      return new Response(
        JSON.stringify({ success: false, error: 'Post is not a Pinterest post' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the Pinterest account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('pin_accounts')
      .select('*')
      .eq('id', post.account_id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ success: false, error: 'Pinterest account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the board
    const { data: board, error: boardError } = await supabaseAdmin
      .from('pin_boards')
      .select('*')
      .eq('id', post.pin_board_id)
      .single();

    if (boardError || !board) {
      return new Response(
        JSON.stringify({ success: false, error: 'Pinterest board not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to publishing
    await supabaseAdmin
      .from('sch_scheduled_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', postId);

    // Get signed URLs for media
    const media: PostMedia[] = post.media || [];
    const storagePaths = media
      .filter(m => m.storagePath)
      .map(m => m.storagePath as string);

    let signedUrlMap = new Map<string, string>();

    if (storagePaths.length > 0) {
      const { data: signedUrls } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrls(storagePaths, SIGNED_URL_EXPIRY);

      if (signedUrls) {
        signedUrlMap = new Map(
          signedUrls
            .filter((entry: { path: string | null; signedUrl: string }) => entry.path && entry.signedUrl)
            .map((entry: { path: string | null; signedUrl: string }) => [entry.path as string, entry.signedUrl])
        );
      }
    }

    // Get media URL
    const primaryMedia = media[0];
    if (!primaryMedia) {
      throw new Error('No media found for pin');
    }

    const mediaUrl = primaryMedia.storagePath
      ? signedUrlMap.get(primaryMedia.storagePath) || primaryMedia.url
      : primaryMedia.url;

    let result;

    if (primaryMedia.type === 'video') {
      // For video pins, we need to upload the video first
      console.log('Uploading video to Pinterest...');
      const { mediaId } = await uploadVideo(account.access_token, {
        videoUrl: mediaUrl,
      });

      console.log('Creating video pin...');
      result = await createVideoPin(account.access_token, {
        boardId: board.board_id,
        videoUrl: mediaId,
        title: post.caption?.substring(0, 100),
        description: post.caption,
        link: post.pin_link,
        altText: post.pin_alt_text,
      });
    } else {
      // For image pins
      console.log('Creating image pin...');
      result = await createPin(account.access_token, {
        boardId: board.board_id,
        mediaUrl: mediaUrl,
        title: post.caption?.substring(0, 100),
        description: post.caption,
        link: post.pin_link,
        altText: post.pin_alt_text,
      });
    }

    // Update post as published
    await supabaseAdmin
      .from('sch_scheduled_posts')
      .update({
        status: 'published',
        platform_post_id: result.id,
        permalink: result.url || null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    return new Response(
      JSON.stringify({
        success: true,
        pinId: result.id,
        url: result.url,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Pinterest publish error:', error);
    const message = error instanceof Error ? error.message : 'Failed to publish pin';

    // Update post status to failed
    try {
      const { postId } = await req.clone().json();
      const supabaseAdmin = createSupabaseAdmin();

      await supabaseAdmin
        .from('sch_scheduled_posts')
        .update({
          status: 'failed',
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
    } catch {
      // Ignore cleanup errors
    }

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
