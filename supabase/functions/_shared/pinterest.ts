// Pinterest API v5 utilities

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

export interface PinterestAccount {
  id: string;
  pin_user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

export interface PublishResult {
  id: string;
  url?: string;
}

export interface PinterestUserProfile {
  id: string;
  username: string;
  profile_image?: string;
  account_type?: string;
  follower_count?: number;
}

export interface PinterestBoard {
  id: string;
  name: string;
  description?: string;
  pin_count?: number;
  follower_count?: number;
  privacy: 'PUBLIC' | 'PROTECTED' | 'SECRET';
}

/**
 * Get user profile from Pinterest
 */
export async function getUserProfile(
  accessToken: string
): Promise<PinterestUserProfile> {
  const url = `${PINTEREST_API_BASE}/user_account`;
  console.log('Fetching Pinterest user profile...');

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const responseText = await response.text();
  console.log('User profile response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid response from Pinterest: ${responseText}`);
  }

  if (!response.ok || data.code) {
    throw new Error(data.message || 'Failed to get user profile');
  }

  return {
    id: data.id || data.username,
    username: data.username,
    profile_image: data.profile_image,
    account_type: data.account_type,
    follower_count: data.follower_count,
  };
}

/**
 * Get user's boards from Pinterest
 */
export async function getUserBoards(
  accessToken: string
): Promise<PinterestBoard[]> {
  const url = `${PINTEREST_API_BASE}/boards?page_size=100`;
  console.log('Fetching Pinterest boards...');

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const responseText = await response.text();
  console.log('Boards response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid response from Pinterest: ${responseText}`);
  }

  if (!response.ok || data.code) {
    throw new Error(data.message || 'Failed to get boards');
  }

  return (data.items || []).map((board: {
    id: string;
    name: string;
    description?: string;
    pin_count?: number;
    follower_count?: number;
    privacy: string;
  }) => ({
    id: board.id,
    name: board.name,
    description: board.description,
    pin_count: board.pin_count,
    follower_count: board.follower_count,
    privacy: board.privacy || 'PUBLIC',
  }));
}

/**
 * Create a pin on Pinterest
 */
export async function createPin(
  accessToken: string,
  options: {
    boardId: string;
    mediaUrl: string;
    title?: string;
    description?: string;
    link?: string;
    altText?: string;
  }
): Promise<PublishResult> {
  const url = `${PINTEREST_API_BASE}/pins`;
  console.log('Creating pin at:', url);

  const body: Record<string, unknown> = {
    board_id: options.boardId,
    media_source: {
      source_type: 'image_url',
      url: options.mediaUrl,
    },
  };

  if (options.title) {
    body.title = options.title;
  }
  if (options.description) {
    body.description = options.description;
  }
  if (options.link) {
    body.link = options.link;
  }
  if (options.altText) {
    body.alt_text = options.altText;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  console.log('Create pin response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid response from Pinterest: ${responseText}`);
  }

  if (!response.ok || data.code) {
    throw new Error(data.message || 'Failed to create pin');
  }

  if (!data.id) {
    throw new Error(`Pin ID not returned. Response: ${JSON.stringify(data)}`);
  }

  return {
    id: data.id,
    url: data.link,
  };
}

/**
 * Create a video pin on Pinterest
 * Note: Video pins require a multi-step process
 */
export async function createVideoPin(
  accessToken: string,
  options: {
    boardId: string;
    videoUrl: string;
    coverImageUrl?: string;
    title?: string;
    description?: string;
    link?: string;
    altText?: string;
  }
): Promise<PublishResult> {
  const url = `${PINTEREST_API_BASE}/pins`;
  console.log('Creating video pin at:', url);

  const body: Record<string, unknown> = {
    board_id: options.boardId,
    media_source: {
      source_type: 'video_id',
      // For external video URLs, we need to use a different approach
      // Pinterest requires videos to be uploaded first via media upload endpoint
      // For now, we'll use the video URL directly if it's already a Pinterest video ID
      cover_image_url: options.coverImageUrl,
      media_id: options.videoUrl, // This should be a media_id from prior upload
    },
  };

  if (options.title) {
    body.title = options.title;
  }
  if (options.description) {
    body.description = options.description;
  }
  if (options.link) {
    body.link = options.link;
  }
  if (options.altText) {
    body.alt_text = options.altText;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  console.log('Create video pin response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid response from Pinterest: ${responseText}`);
  }

  if (!response.ok || data.code) {
    throw new Error(data.message || 'Failed to create video pin');
  }

  return {
    id: data.id,
    url: data.link,
  };
}

/**
 * Upload video to Pinterest (for video pins)
 * Returns a media_id that can be used in createVideoPin
 */
export async function uploadVideo(
  accessToken: string,
  options: {
    videoUrl: string;
  }
): Promise<{ mediaId: string }> {
  // Step 1: Register the media upload
  const registerUrl = `${PINTEREST_API_BASE}/media`;
  console.log('Registering video upload...');

  const registerResponse = await fetch(registerUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      media_type: 'video',
    }),
  });

  const registerText = await registerResponse.text();
  console.log('Register response:', registerText);

  let registerData;
  try {
    registerData = JSON.parse(registerText);
  } catch {
    throw new Error(`Invalid register response: ${registerText}`);
  }

  if (!registerResponse.ok || registerData.code) {
    throw new Error(registerData.message || 'Failed to register video upload');
  }

  const mediaId = registerData.media_id;
  const uploadUrl = registerData.upload_url;

  if (!mediaId || !uploadUrl) {
    throw new Error('Missing media_id or upload_url from register response');
  }

  // Step 2: Upload the video file to the provided URL
  // Note: This requires fetching the video from the URL and uploading it
  console.log('Fetching video from:', options.videoUrl);
  const videoResponse = await fetch(options.videoUrl);
  if (!videoResponse.ok) {
    throw new Error('Failed to fetch video from URL');
  }

  const videoBlob = await videoResponse.blob();
  console.log('Uploading video to Pinterest...');

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': videoBlob.type || 'video/mp4',
    },
    body: videoBlob,
  });

  if (!uploadResponse.ok) {
    const uploadError = await uploadResponse.text();
    throw new Error(`Failed to upload video: ${uploadError}`);
  }

  // Step 3: Wait for processing
  // Pinterest processes videos asynchronously
  // We should poll the media status endpoint
  let status = 'processing';
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max wait

  while (status === 'processing' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    attempts++;

    const statusResponse = await fetch(`${PINTEREST_API_BASE}/media/${mediaId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const statusText = await statusResponse.text();
    console.log(`Video status check ${attempts}:`, statusText);

    let statusData;
    try {
      statusData = JSON.parse(statusText);
    } catch {
      continue;
    }

    status = statusData.status;

    if (status === 'failed') {
      throw new Error('Video processing failed');
    }
  }

  if (status !== 'succeeded') {
    throw new Error('Video processing timed out');
  }

  return { mediaId };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const url = 'https://api.pinterest.com/v5/oauth/token';
  console.log('Refreshing Pinterest access token...');

  const credentials = btoa(`${appId}:${appSecret}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const responseText = await response.text();
  console.log('Token refresh response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid token response: ${responseText}`);
  }

  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Failed to refresh token');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Validate access token
 */
export async function validateToken(
  accessToken: string
): Promise<{ valid: boolean; expiresAt?: Date }> {
  try {
    await getUserProfile(accessToken);
    return { valid: true };
  } catch {
    return { valid: false };
  }
}
