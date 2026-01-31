// Facebook Graph API utilities

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v24.0';

export interface FacebookPage {
  id: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
  token_expires_at: string | null;
}

export interface PublishResult {
  id: string;
  post_id?: string;
  permalink?: string;
}

/**
 * Get pages from Business accounts (for pages managed through Meta Business Suite)
 */
async function getPagesFromBusinessAccounts(
  userAccessToken: string
): Promise<Array<{
  id: string;
  name: string;
  access_token: string;
  category: string;
  picture?: { data?: { url?: string } };
  fan_count?: number;
}>> {
  // Get user's businesses
  const businessUrl = `${FACEBOOK_GRAPH_API}/me/businesses?access_token=${userAccessToken}`;
  console.log('Fetching user businesses...');

  const businessResponse = await fetch(businessUrl);
  const businessText = await businessResponse.text();
  console.log('Businesses response:', businessText);

  let businessData;
  try {
    businessData = JSON.parse(businessText);
  } catch {
    console.error('Failed to parse businesses response');
    return [];
  }

  if (businessData.error || !businessData.data) {
    console.log('No businesses found or error:', businessData.error?.message);
    return [];
  }

  const allPages: Array<{
    id: string;
    name: string;
    access_token: string;
    category: string;
    picture?: { data?: { url?: string } };
    fan_count?: number;
  }> = [];

  // For each business, get owned pages
  for (const business of businessData.data) {
    console.log(`Fetching pages for business: ${business.name} (${business.id})`);

    const pagesUrl = `${FACEBOOK_GRAPH_API}/${business.id}/owned_pages?fields=id,name,access_token,category,picture,fan_count&access_token=${userAccessToken}`;
    const pagesResponse = await fetch(pagesUrl);
    const pagesText = await pagesResponse.text();
    console.log(`Business ${business.id} pages response:`, pagesText);

    let pagesData;
    try {
      pagesData = JSON.parse(pagesText);
    } catch {
      continue;
    }

    if (pagesData.data && Array.isArray(pagesData.data)) {
      allPages.push(...pagesData.data);
    }
  }

  return allPages;
}

/**
 * Get all pages the user manages with their access tokens
 */
export async function getPageAccessTokens(
  userAccessToken: string
): Promise<Array<{
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  category: string;
  pictureUrl?: string;
  fanCount?: number;
}>> {
  // First, let's debug what user we're acting as
  const meUrl = `${FACEBOOK_GRAPH_API}/me?fields=id,name&access_token=${userAccessToken}`;
  const meResponse = await fetch(meUrl);
  const meText = await meResponse.text();
  console.log('Me response:', meText);

  // Try getting pages directly first
  const url = `${FACEBOOK_GRAPH_API}/me/accounts?fields=id,name,access_token,category,picture,fan_count&access_token=${userAccessToken}`;
  console.log('Fetching user pages...');

  const response = await fetch(url);
  const responseText = await response.text();
  console.log('Pages response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid response from Facebook: ${responseText}`);
  }

  if (data.error) {
    throw new Error(data.error.message || 'Failed to get pages');
  }

  let pages = data.data || [];

  // If no pages found, try getting pages through Business accounts
  if (pages.length === 0) {
    console.log('No direct pages found, checking Business accounts...');
    const businessPages = await getPagesFromBusinessAccounts(userAccessToken);
    pages = businessPages;
  }

  return pages.map((page: {
    id: string;
    name: string;
    access_token: string;
    category: string;
    picture?: { data?: { url?: string } };
    fan_count?: number;
  }) => ({
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    category: page.category,
    pictureUrl: page.picture?.data?.url,
    fanCount: page.fan_count,
  }));
}

/**
 * Create a photo post on a Facebook Page
 */
export async function createPhotoPost(
  pageId: string,
  pageAccessToken: string,
  options: {
    photoUrl: string;
    caption?: string;
  }
): Promise<PublishResult> {
  const params = new URLSearchParams();
  params.append('url', options.photoUrl);
  if (options.caption) {
    params.append('message', options.caption);
  }
  params.append('access_token', pageAccessToken);

  const url = `${FACEBOOK_GRAPH_API}/${pageId}/photos`;
  console.log('Creating photo post at:', url);

  const response = await fetch(url, {
    method: 'POST',
    body: params,
  });

  const responseText = await response.text();
  console.log('Photo post response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid response: ${responseText}`);
  }

  if (data.error) {
    throw new Error(data.error.message || 'Failed to create photo post');
  }

  // Get permalink
  const permalink = await getPostPermalink(data.post_id || data.id, pageAccessToken);

  return {
    id: data.id,
    post_id: data.post_id,
    permalink,
  };
}

/**
 * Create a video post on a Facebook Page
 */
export async function createVideoPost(
  pageId: string,
  pageAccessToken: string,
  options: {
    videoUrl: string;
    title?: string;
    description?: string;
  }
): Promise<PublishResult> {
  const params = new URLSearchParams();
  params.append('file_url', options.videoUrl);
  if (options.title) {
    params.append('title', options.title);
  }
  if (options.description) {
    params.append('description', options.description);
  }
  params.append('access_token', pageAccessToken);

  const url = `${FACEBOOK_GRAPH_API}/${pageId}/videos`;
  console.log('Creating video post at:', url);

  const response = await fetch(url, {
    method: 'POST',
    body: params,
  });

  const responseText = await response.text();
  console.log('Video post response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid response: ${responseText}`);
  }

  if (data.error) {
    throw new Error(data.error.message || 'Failed to create video post');
  }

  return { id: data.id };
}

/**
 * Create a link/text post on a Facebook Page
 */
export async function createLinkPost(
  pageId: string,
  pageAccessToken: string,
  options: {
    message?: string;
    link?: string;
  }
): Promise<PublishResult> {
  const params = new URLSearchParams();
  if (options.message) {
    params.append('message', options.message);
  }
  if (options.link) {
    params.append('link', options.link);
  }
  params.append('access_token', pageAccessToken);

  const url = `${FACEBOOK_GRAPH_API}/${pageId}/feed`;
  console.log('Creating link/text post at:', url);

  const response = await fetch(url, {
    method: 'POST',
    body: params,
  });

  const responseText = await response.text();
  console.log('Link post response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid response: ${responseText}`);
  }

  if (data.error) {
    throw new Error(data.error.message || 'Failed to create link post');
  }

  // Get permalink
  const permalink = await getPostPermalink(data.id, pageAccessToken);

  return { id: data.id, permalink };
}

/**
 * Create an album (multiple photos) post
 */
export async function createAlbumPost(
  pageId: string,
  pageAccessToken: string,
  options: {
    photoUrls: string[];
    caption?: string;
  }
): Promise<PublishResult> {
  console.log(`Creating album post with ${options.photoUrls.length} photos`);

  // Upload photos as unpublished first
  const photoIds: string[] = [];

  for (const photoUrl of options.photoUrls) {
    const params = new URLSearchParams();
    params.append('url', photoUrl);
    params.append('published', 'false');
    params.append('access_token', pageAccessToken);

    const response = await fetch(`${FACEBOOK_GRAPH_API}/${pageId}/photos`, {
      method: 'POST',
      body: params,
    });

    const responseText = await response.text();
    console.log('Unpublished photo response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Invalid photo response: ${responseText}`);
    }

    if (data.error) {
      throw new Error(data.error.message || 'Failed to upload photo');
    }

    photoIds.push(data.id);
  }

  console.log('Uploaded photo IDs:', photoIds);

  // Create post with attached photos
  const params = new URLSearchParams();
  if (options.caption) {
    params.append('message', options.caption);
  }
  photoIds.forEach((id, index) => {
    params.append(`attached_media[${index}]`, JSON.stringify({ media_fbid: id }));
  });
  params.append('access_token', pageAccessToken);

  const response = await fetch(`${FACEBOOK_GRAPH_API}/${pageId}/feed`, {
    method: 'POST',
    body: params,
  });

  const responseText = await response.text();
  console.log('Album post response:', responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid album response: ${responseText}`);
  }

  if (data.error) {
    throw new Error(data.error.message || 'Failed to create album post');
  }

  // Get permalink
  const permalink = await getPostPermalink(data.id, pageAccessToken);

  return { id: data.id, permalink };
}

/**
 * Get post permalink
 */
async function getPostPermalink(
  postId: string,
  pageAccessToken: string
): Promise<string | undefined> {
  try {
    const response = await fetch(
      `${FACEBOOK_GRAPH_API}/${postId}?fields=permalink_url&access_token=${pageAccessToken}`
    );
    const data = await response.json();
    return data.permalink_url;
  } catch {
    return undefined;
  }
}

/**
 * Get post insights
 */
export async function getPostInsights(
  postId: string,
  pageAccessToken: string,
  metrics: string[] = ['post_impressions', 'post_engaged_users', 'post_reactions_by_type_total']
): Promise<Record<string, number | Record<string, number>>> {
  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/${postId}/insights?metric=${metrics.join(',')}&access_token=${pageAccessToken}`
  );

  const data = await response.json();

  if (data.error) {
    console.warn('Post insights error:', data.error);
    return {};
  }

  const result: Record<string, number | Record<string, number>> = {};
  for (const insight of data.data || []) {
    result[insight.name] = insight.values?.[0]?.value || 0;
  }

  return result;
}

/**
 * Get page insights
 */
export async function getPageInsights(
  pageId: string,
  pageAccessToken: string,
  metrics: string[] = ['page_impressions', 'page_engaged_users', 'page_fans'],
  period: string = 'day'
): Promise<Record<string, number>> {
  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/${pageId}/insights?metric=${metrics.join(',')}&period=${period}&access_token=${pageAccessToken}`
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to get page insights');
  }

  const result: Record<string, number> = {};
  for (const insight of data.data || []) {
    result[insight.name] = insight.values?.[0]?.value || 0;
  }

  return result;
}

/**
 * Validate page access token
 */
export async function validatePageToken(
  pageAccessToken: string
): Promise<{ valid: boolean; pageId?: string; pageName?: string }> {
  try {
    const response = await fetch(
      `${FACEBOOK_GRAPH_API}/me?fields=id,name&access_token=${pageAccessToken}`
    );

    const data = await response.json();

    if (data.error) {
      return { valid: false };
    }

    return {
      valid: true,
      pageId: data.id,
      pageName: data.name,
    };
  } catch {
    return { valid: false };
  }
}

/**
 * Extend page access token (exchange for long-lived token)
 */
export async function extendPageToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${appId}&` +
    `client_secret=${appSecret}&` +
    `fb_exchange_token=${shortLivedToken}`
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Failed to extend token');
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}
