// Instagram Graph API utilities

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v24.0';

export interface InstagramAccount {
  id: string;
  ig_user_id: string;
  access_token: string;
  token_expires_at: string;
}

export interface MediaContainer {
  id: string;
}

export interface PublishResult {
  id: string;
  permalink?: string;
}

// Retry helper for transient Instagram API errors
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 3000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isTransient = lastError.message.includes('unexpected error')
        || lastError.message.includes('Please retry');
      if (!isTransient || attempt === maxRetries) {
        throw lastError;
      }
      console.log(`Transient error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

// Create a media container for a single image/video post
export async function createMediaContainer(
  igUserId: string,
  accessToken: string,
  options: {
    imageUrl?: string;
    videoUrl?: string;
    caption?: string;
    mediaType?: 'IMAGE' | 'VIDEO' | 'REELS';
    coverUrl?: string;
    isCarouselItem?: boolean;
  }
): Promise<MediaContainer> {
  const params = new URLSearchParams();

  if (options.imageUrl) {
    params.append('image_url', options.imageUrl);
  }
  if (options.videoUrl) {
    params.append('video_url', options.videoUrl);
  }
  if (options.caption && !options.isCarouselItem) {
    params.append('caption', options.caption);
  }
  if (options.mediaType) {
    params.append('media_type', options.mediaType);
  }
  if (options.coverUrl) {
    params.append('cover_url', options.coverUrl);
  }
  if (options.isCarouselItem) {
    params.append('is_carousel_item', 'true');
  }
  params.append('access_token', accessToken);

  const url = `${INSTAGRAM_GRAPH_API}/${igUserId}/media`;

  return withRetry(async () => {
    console.log('Creating media container at:', url);
    console.log('Params:', params.toString());

    const response = await fetch(url, {
      method: 'POST',
      body: params,
    });

    const responseText = await response.text();
    console.log('Media container response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Invalid response from Instagram: ${responseText}`);
    }

    if (data.error) {
      throw new Error(data.error.message || 'Failed to create media container');
    }

    if (!data.id) {
      throw new Error(`Media ID not returned. Response: ${JSON.stringify(data)}`);
    }

    return { id: data.id };
  });
}

// Create a carousel container
export async function createCarouselContainer(
  igUserId: string,
  accessToken: string,
  childrenIds: string[],
  caption?: string
): Promise<MediaContainer> {
  const params = new URLSearchParams();
  params.append('media_type', 'CAROUSEL');
  params.append('children', childrenIds.join(','));
  if (caption) {
    params.append('caption', caption);
  }
  params.append('access_token', accessToken);

  const url = `${INSTAGRAM_GRAPH_API}/${igUserId}/media`;
  console.log('Creating carousel container at:', url);
  console.log('Children IDs:', childrenIds.join(','));

  const response = await fetch(url, {
    method: 'POST',
    body: params,
  });

  const responseText = await response.text();
  console.log('Carousel container response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid carousel response: ${responseText}`);
  }

  if (data.error) {
    throw new Error(data.error.message || 'Failed to create carousel container');
  }

  if (!data.id) {
    throw new Error(`Carousel ID not returned. Response: ${JSON.stringify(data)}`);
  }

  return { id: data.id };
}

// Check media container status (for videos)
export async function checkMediaStatus(
  containerId: string,
  accessToken: string
): Promise<{ status: string; statusCode?: string }> {
  const url = `${INSTAGRAM_GRAPH_API}/${containerId}?fields=status_code&access_token=${accessToken}`;
  console.log('Checking media status at:', url.replace(accessToken, '[TOKEN]'));

  const response = await fetch(url);
  const responseText = await response.text();
  console.log('Status check response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid status response: ${responseText}`);
  }

  if (data.error) {
    throw new Error(data.error.message || 'Failed to check media status');
  }

  return { status: data.status_code || 'FINISHED', statusCode: data.status_code };
}

// Wait for media container to be ready (for videos)
export async function waitForMediaReady(
  containerId: string,
  accessToken: string,
  maxWaitMs: number = 300000 // 5 minutes
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < maxWaitMs) {
    const { status } = await checkMediaStatus(containerId, accessToken);

    if (status === 'FINISHED') {
      return;
    }
    if (status === 'ERROR') {
      throw new Error('Media processing failed');
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error('Timeout waiting for media to process');
}

// Publish a media container
export async function publishMedia(
  igUserId: string,
  accessToken: string,
  containerId: string
): Promise<PublishResult> {
  const params = new URLSearchParams();
  params.append('creation_id', containerId);
  params.append('access_token', accessToken);

  const url = `${INSTAGRAM_GRAPH_API}/${igUserId}/media_publish`;
  console.log('Publishing media at:', url);
  console.log('Container ID:', containerId);

  const response = await fetch(url, {
    method: 'POST',
    body: params,
  });

  const responseText = await response.text();
  console.log('Publish response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid publish response: ${responseText}`);
  }

  if (data.error) {
    throw new Error(data.error.message || 'Failed to publish media');
  }

  if (!data.id) {
    throw new Error(`Published media ID not returned. Response: ${JSON.stringify(data)}`);
  }

  // Get permalink
  let permalink: string | undefined;
  try {
    const mediaResponse = await fetch(
      `${INSTAGRAM_GRAPH_API}/${data.id}?fields=permalink&access_token=${accessToken}`
    );
    const mediaData = await mediaResponse.json();
    permalink = mediaData.permalink;
  } catch {
    // Permalink fetch failed, continue without it
  }

  return { id: data.id, permalink };
}

// Post a comment on a media
export async function postComment(
  mediaId: string,
  accessToken: string,
  message: string
): Promise<{ id: string }> {
  const params = new URLSearchParams();
  params.append('message', message);
  params.append('access_token', accessToken);

  const response = await fetch(`${INSTAGRAM_GRAPH_API}/${mediaId}/comments`, {
    method: 'POST',
    body: params,
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to post comment');
  }

  return { id: data.id };
}

// Refresh long-lived access token
export async function refreshLongLivedToken(
  accessToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch(
    `${INSTAGRAM_GRAPH_API}/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${Deno.env.get('FACEBOOK_APP_ID')}&` +
      `client_secret=${Deno.env.get('FACEBOOK_APP_SECRET')}&` +
      `fb_exchange_token=${accessToken}`
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to refresh token');
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 5184000, // Default 60 days
  };
}

// Get user insights
export async function getUserInsights(
  igUserId: string,
  accessToken: string,
  metrics: string[] = ['impressions', 'reach', 'profile_views', 'website_clicks'],
  period: string = 'day'
): Promise<Record<string, number>> {
  const response = await fetch(
    `${INSTAGRAM_GRAPH_API}/${igUserId}/insights?` +
      `metric=${metrics.join(',')}&` +
      `period=${period}&` +
      `access_token=${accessToken}`
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to get user insights');
  }

  const result: Record<string, number> = {};
  for (const insight of data.data || []) {
    result[insight.name] = insight.values?.[0]?.value || 0;
  }

  return result;
}

// Get media insights
export async function getMediaInsights(
  mediaId: string,
  accessToken: string,
  metrics: string[] = ['impressions', 'reach', 'engagement', 'saved', 'likes', 'comments', 'shares']
): Promise<Record<string, number>> {
  const response = await fetch(
    `${INSTAGRAM_GRAPH_API}/${mediaId}/insights?` +
      `metric=${metrics.join(',')}&` +
      `access_token=${accessToken}`
  );

  const data = await response.json();

  if (data.error) {
    // Some metrics may not be available for all media types
    console.warn('Media insights error:', data.error);
    return {};
  }

  const result: Record<string, number> = {};
  for (const insight of data.data || []) {
    result[insight.name] = insight.values?.[0]?.value || 0;
  }

  return result;
}

// Validate access token
export async function validateAccessToken(
  accessToken: string
): Promise<{ valid: boolean; userId?: string; expiresAt?: number }> {
  try {
    const response = await fetch(
      `${INSTAGRAM_GRAPH_API}/me?fields=id,username&access_token=${accessToken}`
    );

    const data = await response.json();

    if (data.error) {
      return { valid: false };
    }

    return {
      valid: true,
      userId: data.id,
    };
  } catch {
    return { valid: false };
  }
}
