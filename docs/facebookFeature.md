# Facebook Pages Management Feature

## Executive Summary

This document outlines the implementation plan for adding Facebook Pages management to the Social Media Scheduler application. The feature will mirror the existing Instagram functionality, allowing users to connect their Facebook Pages, schedule posts, and publish content directly to Facebook.

**Estimated Complexity:** Medium-High
**Dependencies:** Facebook Graph API v18.0, Existing OAuth infrastructure
**Parallel to:** Instagram implementation patterns

---

## Table of Contents

1. [Overview](#1-overview)
2. [Facebook Graph API Requirements](#2-facebook-graph-api-requirements)
3. [Database Schema](#3-database-schema)
4. [Backend Implementation](#4-backend-implementation)
5. [Frontend Implementation](#5-frontend-implementation)
6. [Publishing Flow](#6-publishing-flow)
7. [Migration Strategy](#7-migration-strategy)
8. [Testing Strategy](#8-testing-strategy)
9. [Implementation Phases](#9-implementation-phases)
10. [Risk Assessment](#10-risk-assessment)

---

## 1. Overview

### 1.1 Feature Goals

- Allow users to connect multiple Facebook Pages they manage
- Schedule and publish posts to Facebook Pages (photos, videos, links, text)
- Support carousel/album posts
- Provide analytics and insights for published posts
- Maintain feature parity with Instagram implementation where applicable

### 1.2 Key Differences from Instagram

| Aspect | Instagram | Facebook Pages |
|--------|-----------|----------------|
| Entity | Personal/Business Account | Pages (managed by users) |
| API Endpoint | `graph.instagram.com` | `graph.facebook.com` |
| Post Types | Feed, Reel, Carousel, Story | Photo, Video, Link, Album, Reel |
| Media Requirements | Square/portrait preferred | More flexible aspect ratios |
| Scheduling | Via API containers | Native scheduled posts supported |
| Permissions | `instagram_*` scopes | `pages_*` scopes |

### 1.3 Architecture Alignment

The Facebook feature will follow the same architectural patterns as Instagram:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  useInstagram.ts  │  useFacebook.ts (NEW)  │  usePosts.ts      │
│  AccountConnect   │  FBPageConnect (NEW)   │  PostComposer     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Edge Functions                      │
├─────────────────────────────────────────────────────────────────┤
│  instagram.ts     │  facebook.ts (NEW)     │  scheduled-       │
│  (shared utils)   │  (shared utils)        │  publisher.ts     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Database                          │
├─────────────────────────────────────────────────────────────────┤
│  ig_accounts      │  fb_pages (NEW)        │  scheduled_posts  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Facebook Graph API Requirements

### 2.1 Required Permissions (OAuth Scopes)

```
pages_show_list          - List pages user manages
pages_read_engagement    - Read page posts and engagement
pages_manage_posts       - Create, edit, delete page posts
pages_read_user_content  - Read user-generated content on page
pages_manage_engagement  - Respond to comments (future)
read_insights            - Access page analytics
```

### 2.2 App Review Requirements

For production use, the Facebook app will need:

- **Business Verification** - Required for pages_manage_posts
- **App Review** - Submit each permission for review
- **Privacy Policy** - Published and accessible
- **Data Deletion Callback** - Endpoint for user data deletion requests

### 2.3 API Endpoints

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List User's Pages | `/me/accounts` | GET |
| Get Page Details | `/{page-id}?fields=...` | GET |
| Create Photo Post | `/{page-id}/photos` | POST |
| Create Video Post | `/{page-id}/videos` | POST |
| Create Link Post | `/{page-id}/feed` | POST |
| Create Scheduled Post | `/{page-id}/feed` (with `scheduled_publish_time`) | POST |
| Get Post Insights | `/{post-id}/insights` | GET |
| Get Page Insights | `/{page-id}/insights` | GET |

### 2.4 Page Access Tokens

Unlike Instagram (which uses user tokens), Facebook Pages require **Page Access Tokens**:

```
User Token → Exchange → Page Token (per page)
```

Each page has its own access token that must be stored and managed separately.

---

## 3. Database Schema

### 3.1 New Table: `fb_pages`

```sql
-- Facebook Pages table (similar to ig_accounts)
CREATE TABLE fb_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES sch_users(id) ON DELETE CASCADE,

  -- Facebook identifiers
  page_id TEXT NOT NULL,              -- Facebook Page ID
  page_name TEXT NOT NULL,            -- Page display name
  page_category TEXT,                 -- Business category

  -- Access token (Page-specific, not user token)
  page_access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,       -- NULL = long-lived token

  -- Page metadata
  profile_picture_url TEXT,
  followers_count INTEGER DEFAULT 0,
  fan_count INTEGER DEFAULT 0,        -- "Likes" on the page
  website TEXT,

  -- Connection status
  is_connected BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, page_id)
);

-- Indexes
CREATE INDEX idx_fb_pages_user_id ON fb_pages(user_id);

-- RLS Policies
ALTER TABLE fb_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Facebook pages"
  ON fb_pages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Facebook pages"
  ON fb_pages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Facebook pages"
  ON fb_pages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Facebook pages"
  ON fb_pages FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE fb_pages;
```

### 3.2 Modify `scheduled_posts` Table

Add Facebook-specific fields:

```sql
-- Add Facebook-specific columns
ALTER TABLE sch_scheduled_posts
ADD COLUMN fb_post_type TEXT CHECK (fb_post_type IN ('photo', 'video', 'link', 'album', 'reel'));

-- Update platform constraint to include Facebook
ALTER TABLE sch_scheduled_posts
DROP CONSTRAINT IF EXISTS scheduled_posts_platform_check;

ALTER TABLE sch_scheduled_posts
ADD CONSTRAINT scheduled_posts_platform_check
CHECK (platform IN ('instagram', 'facebook', 'pinterest'));
```

### 3.3 Update `PLATFORMS` Constant

In `/src/config/supabase.ts`:

```typescript
export const PLATFORMS = {
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',    // NEW
  PINTEREST: 'pinterest',
} as const;

export const TABLES = {
  // ... existing tables
  FB_PAGES: 'fb_pages',    // NEW
};
```

---

## 4. Backend Implementation

### 4.1 Shared Facebook Utilities

Create `/supabase/functions/_shared/facebook.ts`:

```typescript
// Facebook Graph API utilities

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v18.0';

export interface FacebookPage {
  id: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
  token_expires_at: string | null;
}

export interface MediaContainer {
  id: string;
  post_id?: string;
}

export interface PublishResult {
  id: string;
  permalink?: string;
}

/**
 * Exchange user token for page access tokens
 * Returns all pages the user manages with their access tokens
 */
export async function getPageAccessTokens(
  userAccessToken: string
): Promise<Array<{
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  category: string;
  pictureUrl?: string;
}>> {
  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/me/accounts?` +
    `fields=id,name,access_token,category,picture&` +
    `access_token=${userAccessToken}`
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return (data.data || []).map((page: any) => ({
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    category: page.category,
    pictureUrl: page.picture?.data?.url,
  }));
}

/**
 * Create a photo post on a Facebook Page
 */
export async function createPhotoPost(
  pageId: string,
  pageAccessToken: string,
  options: {
    photoUrl?: string;
    caption?: string;
    scheduledTime?: Date;
  }
): Promise<PublishResult> {
  const params = new URLSearchParams();

  if (options.photoUrl) {
    params.append('url', options.photoUrl);
  }
  if (options.caption) {
    params.append('message', options.caption);
  }
  if (options.scheduledTime) {
    params.append('published', 'false');
    params.append('scheduled_publish_time',
      Math.floor(options.scheduledTime.getTime() / 1000).toString()
    );
  }
  params.append('access_token', pageAccessToken);

  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/${pageId}/photos`,
    { method: 'POST', body: params }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return { id: data.id || data.post_id };
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
    scheduledTime?: Date;
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
  if (options.scheduledTime) {
    params.append('published', 'false');
    params.append('scheduled_publish_time',
      Math.floor(options.scheduledTime.getTime() / 1000).toString()
    );
  }
  params.append('access_token', pageAccessToken);

  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/${pageId}/videos`,
    { method: 'POST', body: params }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
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
    scheduledTime?: Date;
  }
): Promise<PublishResult> {
  const params = new URLSearchParams();

  if (options.message) {
    params.append('message', options.message);
  }
  if (options.link) {
    params.append('link', options.link);
  }
  if (options.scheduledTime) {
    params.append('published', 'false');
    params.append('scheduled_publish_time',
      Math.floor(options.scheduledTime.getTime() / 1000).toString()
    );
  }
  params.append('access_token', pageAccessToken);

  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/${pageId}/feed`,
    { method: 'POST', body: params }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  // Get permalink
  let permalink: string | undefined;
  try {
    const postResponse = await fetch(
      `${FACEBOOK_GRAPH_API}/${data.id}?fields=permalink_url&access_token=${pageAccessToken}`
    );
    const postData = await postResponse.json();
    permalink = postData.permalink_url;
  } catch {
    // Continue without permalink
  }

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
  // Upload photos as unpublished first
  const photoIds: string[] = [];

  for (const photoUrl of options.photoUrls) {
    const params = new URLSearchParams();
    params.append('url', photoUrl);
    params.append('published', 'false');
    params.append('access_token', pageAccessToken);

    const response = await fetch(
      `${FACEBOOK_GRAPH_API}/${pageId}/photos`,
      { method: 'POST', body: params }
    );

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    photoIds.push(data.id);
  }

  // Create post with attached photos
  const params = new URLSearchParams();
  if (options.caption) {
    params.append('message', options.caption);
  }
  photoIds.forEach((id, index) => {
    params.append(`attached_media[${index}]`, JSON.stringify({ media_fbid: id }));
  });
  params.append('access_token', pageAccessToken);

  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/${pageId}/feed`,
    { method: 'POST', body: params }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return { id: data.id };
}

/**
 * Get post insights
 */
export async function getPostInsights(
  postId: string,
  pageAccessToken: string,
  metrics: string[] = ['post_impressions', 'post_engaged_users', 'post_reactions_by_type_total']
): Promise<Record<string, number>> {
  const response = await fetch(
    `${FACEBOOK_GRAPH_API}/${postId}/insights?` +
    `metric=${metrics.join(',')}&` +
    `access_token=${pageAccessToken}`
  );

  const data = await response.json();

  if (data.error) {
    console.warn('Post insights error:', data.error);
    return {};
  }

  const result: Record<string, number> = {};
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
    `${FACEBOOK_GRAPH_API}/${pageId}/insights?` +
    `metric=${metrics.join(',')}&` +
    `period=${period}&` +
    `access_token=${pageAccessToken}`
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
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
    throw new Error(data.error.message);
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in, // May be undefined for never-expiring tokens
  };
}
```

### 4.2 Edge Functions

#### 4.2.1 Exchange Facebook Token

Create `/supabase/functions/exchange-facebook-token/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { getPageAccessTokens, extendPageToken } from '../_shared/facebook.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { user } = await getUserFromRequest(req);
    const { code, redirectUri } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appId = Deno.env.get('FACEBOOK_APP_ID')!;
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET')!;

    // Exchange code for user access token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `client_id=${appId}&` +
      `client_secret=${appSecret}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code=${code}`
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message);
    }

    // Exchange for long-lived token
    const longLivedToken = await extendPageToken(
      tokenData.access_token,
      appId,
      appSecret
    );

    // Get all pages the user manages with their tokens
    const pages = await getPageAccessTokens(longLivedToken.accessToken);

    if (pages.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No Facebook Pages found. You must have admin access to at least one Facebook Page.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Store each page in the database
    const connectedPages = [];
    for (const page of pages) {
      const { data, error } = await supabaseAdmin
        .from('fb_pages')
        .upsert({
          user_id: user.id,
          page_id: page.pageId,
          page_name: page.pageName,
          page_access_token: page.pageAccessToken,
          page_category: page.category,
          profile_picture_url: page.pictureUrl,
          is_connected: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,page_id',
        })
        .select()
        .single();

      if (!error && data) {
        connectedPages.push(data);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pages: connectedPages,
        message: `Connected ${connectedPages.length} Facebook Page(s)`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Facebook token exchange error:', error);
    const message = error instanceof Error ? error.message : 'Failed to connect Facebook';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

#### 4.2.2 Publish Facebook Post

Create `/supabase/functions/publish-facebook-post/index.ts`:

```typescript
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
      .from('scheduled_posts')
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

    // Get the Facebook page
    const { data: page, error: pageError } = await supabaseAdmin
      .from('fb_pages')
      .select('*')
      .eq('id', post.account_id)
      .eq('user_id', user.id)
      .single();

    if (pageError || !page) {
      return new Response(
        JSON.stringify({ success: false, error: 'Facebook Page not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to publishing
    await supabaseAdmin
      .from('scheduled_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', postId);

    // Generate signed URLs for media
    const mediaWithUrls = await generateSignedUrls(supabaseAdmin, post.media || []);

    let result: { id: string; permalink?: string };

    // Publish based on post type
    const fbPostType = post.fb_post_type || detectPostType(post);

    switch (fbPostType) {
      case 'photo':
        result = await createPhotoPost(page.page_id, page.page_access_token, {
          photoUrl: mediaWithUrls[0]?.url,
          caption: post.caption,
        });
        break;

      case 'video':
        result = await createVideoPost(page.page_id, page.page_access_token, {
          videoUrl: mediaWithUrls[0]?.url,
          description: post.caption,
        });
        break;

      case 'album':
        result = await createAlbumPost(page.page_id, page.page_access_token, {
          photoUrls: mediaWithUrls.map(m => m.url),
          caption: post.caption,
        });
        break;

      case 'link':
      default:
        result = await createLinkPost(page.page_id, page.page_access_token, {
          message: post.caption,
        });
        break;
    }

    // Update post as published
    await supabaseAdmin
      .from('scheduled_posts')
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
        permalink: result.permalink
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Facebook publish error:', error);
    const message = error instanceof Error ? error.message : 'Failed to publish';

    // Update post as failed
    // Note: Would need postId in scope here - simplified for doc purposes

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper functions
async function generateSignedUrls(supabase: SupabaseClient, media: any[]) {
  // Similar to Instagram implementation
  const paths = media.filter(m => m.storagePath).map(m => m.storagePath);
  if (paths.length === 0) return media;

  const { data } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRY);

  const urlMap = new Map(data?.map(d => [d.path, d.signedUrl]) || []);

  return media.map(m => ({
    ...m,
    url: m.storagePath ? urlMap.get(m.storagePath) || m.url : m.url,
  }));
}

function detectPostType(post: any): string {
  if (!post.media || post.media.length === 0) return 'link';
  if (post.media.length > 1) return 'album';
  return post.media[0].type === 'video' ? 'video' : 'photo';
}
```

#### 4.2.3 Get Facebook Page Insights

Create `/supabase/functions/get-facebook-insights/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromRequest } from '../_shared/supabase.ts';
import { getPageInsights } from '../_shared/facebook.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { user } = await getUserFromRequest(req);
    const { pageId } = await req.json();

    if (!pageId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Page ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Get the Facebook page
    const { data: page, error: pageError } = await supabaseAdmin
      .from('fb_pages')
      .select('page_id, page_access_token')
      .eq('id', pageId)
      .eq('user_id', user.id)
      .single();

    if (pageError || !page) {
      return new Response(
        JSON.stringify({ success: false, error: 'Facebook Page not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const insights = await getPageInsights(
      page.page_id,
      page.page_access_token
    );

    return new Response(
      JSON.stringify(insights),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get Facebook insights error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get insights';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### 4.3 Update Scheduled Publisher

Modify `/supabase/functions/scheduled-publisher/index.ts` to handle Facebook posts:

```typescript
// Add import
import { createPhotoPost, createVideoPost, createLinkPost, createAlbumPost } from '../_shared/facebook.ts';

// In the main publishing logic, add platform check:
if (post.platform === 'facebook') {
  result = await publishFacebookPost(supabaseAdmin, post, account);
} else {
  result = await publishInstagramPost(supabaseAdmin, post, account);
}
```

---

## 5. Frontend Implementation

### 5.1 Types

Add to `/src/types/index.ts`:

```typescript
export interface FacebookPage {
  id: string;
  userId: string;
  pageId: string;
  pageName: string;
  pageCategory?: string;
  pageAccessToken: string;
  tokenExpiresAt?: string;
  profilePictureUrl?: string;
  followersCount: number;
  fanCount: number;
  website?: string;
  isConnected: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FacebookPostType = 'photo' | 'video' | 'link' | 'album' | 'reel';
```

### 5.2 Facebook Hook

Create `/src/hooks/useFacebook.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase, TABLES } from '../config/supabase';
import { useAuth } from './useAuth';
import { FacebookPage } from '../types';

interface UseFacebookReturn {
  pages: FacebookPage[];
  loading: boolean;
  error: string | null;
  connectPages: (code: string, redirectUri: string) => Promise<void>;
  disconnectPage: (pageId: string) => Promise<void>;
  refreshPages: () => void;
  getAuthUrl: () => string;
}

// Database row type
interface FbPageRow {
  id: string;
  user_id: string;
  page_id: string;
  page_name: string;
  page_category: string | null;
  page_access_token: string;
  token_expires_at: string | null;
  profile_picture_url: string | null;
  followers_count: number;
  fan_count: number;
  website: string | null;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

const dbRowToPage = (row: FbPageRow): FacebookPage => ({
  id: row.id,
  userId: row.user_id,
  pageId: row.page_id,
  pageName: row.page_name,
  pageCategory: row.page_category || undefined,
  pageAccessToken: row.page_access_token,
  tokenExpiresAt: row.token_expires_at || undefined,
  profilePictureUrl: row.profile_picture_url || undefined,
  followersCount: row.followers_count,
  fanCount: row.fan_count,
  website: row.website || undefined,
  isConnected: row.is_connected,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const useFacebook = (): UseFacebookReturn => {
  const { user } = useAuth();
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshPages = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Generate OAuth URL
  const getAuthUrl = useCallback(() => {
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    const redirectUri = `${window.location.origin}/oauth/facebook/callback`;
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_read_user_content',
      'read_insights',
    ].join(',');

    return `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${appId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${scopes}&` +
      `response_type=code`;
  }, []);

  // Fetch pages
  useEffect(() => {
    if (!user?.id) {
      setPages([]);
      setLoading(false);
      return;
    }

    const fetchPages = async () => {
      setLoading(true);
      try {
        const { data, error: fetchError } = await supabase
          .from(TABLES.FB_PAGES)
          .select('*')
          .eq('user_id', user.id)
          .order('page_name');

        if (fetchError) throw fetchError;

        setPages((data || []).map(dbRowToPage));
        setError(null);
      } catch (err) {
        console.error('Error fetching Facebook pages:', err);
        setError('Failed to load Facebook pages');
      } finally {
        setLoading(false);
      }
    };

    fetchPages();

    // Realtime subscription
    const channel = supabase
      .channel('fb-pages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.FB_PAGES,
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchPages()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshTrigger]);

  // Connect pages via OAuth
  const connectPages = async (code: string, redirectUri: string) => {
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'exchange-facebook-token',
        { body: { code, redirectUri } }
      );

      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error || 'Failed to connect');

      refreshPages();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect Facebook';
      setError(message);
      throw err;
    }
  };

  // Disconnect a page
  const disconnectPage = async (pageId: string) => {
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from(TABLES.FB_PAGES)
        .delete()
        .eq('id', pageId)
        .eq('user_id', user?.id);

      if (deleteError) throw deleteError;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect';
      setError(message);
      throw err;
    }
  };

  return {
    pages,
    loading,
    error,
    connectPages,
    disconnectPage,
    refreshPages,
    getAuthUrl,
  };
};

export default useFacebook;
```

### 5.3 Facebook Page Connect Component

Create `/src/components/facebook/FBPageConnect.tsx`:

```typescript
import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Avatar,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  Facebook as FacebookIcon,
  Delete as DeleteIcon,
  Link as LinkIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useFacebook } from '../../hooks/useFacebook';
import { FacebookPage } from '../../types';

const FBPageConnect: React.FC = () => {
  const { pages, loading, error, disconnectPage, getAuthUrl } = useFacebook();
  const [disconnectDialog, setDisconnectDialog] = useState<FacebookPage | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleConnect = () => {
    window.location.href = getAuthUrl();
  };

  const handleDisconnect = async () => {
    if (!disconnectDialog) return;

    setDisconnecting(true);
    try {
      await disconnectPage(disconnectDialog.id);
      setDisconnectDialog(null);
    } catch (err) {
      console.error('Disconnect error:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={100} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Connected Pages */}
      {pages.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Connected Facebook Pages
          </Typography>
          {pages.map((page) => (
            <Card key={page.id} sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar
                    src={page.profilePictureUrl}
                    sx={{ width: 56, height: 56, bgcolor: '#1877f2' }}
                  >
                    <FacebookIcon />
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {page.pageName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {page.pageCategory || 'Facebook Page'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                      <Chip
                        size="small"
                        label={`${page.fanCount.toLocaleString()} likes`}
                        variant="outlined"
                      />
                      {page.isConnected ? (
                        <Chip size="small" label="Connected" color="success" />
                      ) : (
                        <Chip
                          size="small"
                          label="Disconnected"
                          color="error"
                          icon={<WarningIcon />}
                        />
                      )}
                    </Box>
                  </Box>
                  <IconButton
                    onClick={() => setDisconnectDialog(page)}
                    color="error"
                    size="small"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Connect Button */}
      <Card
        sx={{
          border: '2px dashed',
          borderColor: 'divider',
          cursor: 'pointer',
          '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        }}
        onClick={handleConnect}
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', py: 2 }}>
            <FacebookIcon sx={{ fontSize: 40, color: '#1877f2' }} />
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                Connect Facebook Page
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Schedule and publish posts to your Facebook Pages
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={!!disconnectDialog} onClose={() => setDisconnectDialog(null)}>
        <DialogTitle>Disconnect Facebook Page?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to disconnect <strong>{disconnectDialog?.pageName}</strong>?
            Scheduled posts for this page will not be published.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisconnectDialog(null)}>Cancel</Button>
          <Button
            onClick={handleDisconnect}
            color="error"
            variant="contained"
            disabled={disconnecting}
          >
            Disconnect
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FBPageConnect;
```

### 5.4 Update PostComposer

Modify `/src/components/posts/PostComposer.tsx` to support Facebook:

```typescript
// Add Facebook-specific post type options
const getFacebookPostTypes = () => [
  { value: 'photo', label: 'Photo' },
  { value: 'video', label: 'Video' },
  { value: 'album', label: 'Album (Multiple Photos)' },
  { value: 'link', label: 'Link/Text Post' },
];

// In the account selector, include Facebook pages
const { pages: facebookPages } = useFacebook();

// Combine accounts for selection
const allAccounts = [
  ...instagramAccounts.map(a => ({ ...a, platform: 'instagram' })),
  ...facebookPages.map(p => ({
    id: p.id,
    username: p.pageName,
    profilePictureUrl: p.profilePictureUrl,
    platform: 'facebook'
  })),
];
```

### 5.5 OAuth Callback Handler

Create `/src/pages/OAuthFacebookCallback.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { useFacebook } from '../hooks/useFacebook';

const OAuthFacebookCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { connectPages } = useFacebook();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(searchParams.get('error_description') || 'Authorization failed');
      return;
    }

    if (!code) {
      setError('No authorization code received');
      return;
    }

    const handleCallback = async () => {
      try {
        const redirectUri = `${window.location.origin}/oauth/facebook/callback`;
        await connectPages(code, redirectUri);
        navigate('/settings?tab=accounts', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect Facebook');
      }
    };

    handleCallback();
  }, [searchParams, connectPages, navigate]);

  if (error) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Typography>
          <a href="/settings?tab=accounts">Return to settings</a>
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      <CircularProgress sx={{ mb: 2 }} />
      <Typography>Connecting your Facebook Pages...</Typography>
    </Box>
  );
};

export default OAuthFacebookCallback;
```

---

## 6. Publishing Flow

### 6.1 Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Creates Post                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PostComposer Component                            │
│  - Select Facebook Page                                              │
│  - Choose post type (photo/video/album/link)                        │
│  - Upload media / enter text                                         │
│  - Set schedule time                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Supabase Database                               │
│  scheduled_posts table                                               │
│  - platform: 'facebook'                                              │
│  - account_id: fb_pages.id                                          │
│  - fb_post_type: 'photo'|'video'|'album'|'link'                     │
│  - status: 'scheduled'                                               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │   Cron Trigger    │           │  Manual Publish   │
        │ (every minute)    │           │  (user clicks)    │
        └───────────────────┘           └───────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    scheduled-publisher Function                      │
│  1. Query due posts (scheduled_time <= now)                         │
│  2. For each Facebook post:                                          │
│     a. Get page access token from fb_pages                          │
│     b. Generate signed URLs for media                                │
│     c. Call appropriate Facebook API endpoint                        │
│  3. Update post status to 'published' or 'failed'                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Facebook Graph API                              │
│  POST /{page-id}/photos    - Photo posts                            │
│  POST /{page-id}/videos    - Video posts                            │
│  POST /{page-id}/feed      - Link/album posts                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Post Published!                              │
│  - platform_post_id stored                                          │
│  - permalink saved                                                   │
│  - status updated to 'published'                                    │
│  - UI auto-refreshes via realtime subscription                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Post Type Handling

| Post Type | Media | API Endpoint | Notes |
|-----------|-------|--------------|-------|
| Photo | 1 image | `/{page}/photos` | Direct upload or URL |
| Video | 1 video | `/{page}/videos` | Supports large files |
| Album | 2-10 images | `/{page}/feed` with `attached_media` | Upload each, then combine |
| Link | None (text only) | `/{page}/feed` | Can include link URL |
| Reel | 1 video | `/{page}/video_reels` | Similar to Instagram Reels |

---

## 7. Migration Strategy

### 7.1 Database Migration

Create `/supabase/migrations/003_facebook_pages.sql`:

```sql
-- Create fb_pages table
CREATE TABLE fb_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES sch_users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_category TEXT,
  page_access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  profile_picture_url TEXT,
  followers_count INTEGER DEFAULT 0,
  fan_count INTEGER DEFAULT 0,
  website TEXT,
  is_connected BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, page_id)
);

CREATE INDEX idx_fb_pages_user_id ON fb_pages(user_id);

-- RLS
ALTER TABLE fb_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Facebook pages"
  ON fb_pages FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Facebook pages"
  ON fb_pages FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Facebook pages"
  ON fb_pages FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Facebook pages"
  ON fb_pages FOR DELETE USING (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE fb_pages;

-- Add Facebook post type column to scheduled_posts
ALTER TABLE sch_scheduled_posts
ADD COLUMN IF NOT EXISTS fb_post_type TEXT
CHECK (fb_post_type IS NULL OR fb_post_type IN ('photo', 'video', 'link', 'album', 'reel'));
```

### 7.2 Environment Variables

Add to `.env`:

```env
# Facebook OAuth (same app as Instagram, different scopes)
VITE_FACEBOOK_APP_ID=1195342422705466
# Server-side only:
FACEBOOK_APP_SECRET=your_app_secret
```

### 7.3 Deployment Steps

1. Run database migration
2. Deploy new edge functions
3. Update scheduled-publisher function
4. Deploy frontend changes
5. Configure Facebook app permissions in Meta Developer Portal
6. Test OAuth flow end-to-end

---

## 8. Testing Strategy

### 8.1 Unit Tests

- `useFacebook` hook state management
- `facebook.ts` API utility functions
- Post type detection logic
- Token validation and refresh

### 8.2 Integration Tests

- OAuth flow (mock Facebook responses)
- Post creation and scheduling
- Publishing to Facebook API (sandbox mode)
- Error handling scenarios

### 8.3 E2E Tests

- Connect Facebook Page flow
- Create and schedule post
- Verify post appears on Facebook (test page)
- Disconnect page flow

### 8.4 Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Connect page via OAuth | Page saved to database, appears in UI |
| Connect without page admin access | Error message displayed |
| Schedule photo post | Post created with status 'scheduled' |
| Publish album with 5 photos | All photos uploaded, post published |
| Token expires | Warning shown, option to reconnect |
| Page disconnected | Future posts marked as failed |
| API rate limit hit | Retry with backoff, user notified |

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Database and basic infrastructure

- [ ] Create `fb_pages` database table and migration
- [ ] Add `fb_post_type` column to `scheduled_posts`
- [ ] Update `PLATFORMS` and `TABLES` constants
- [ ] Create Facebook types in `/src/types`
- [ ] Create `/supabase/functions/_shared/facebook.ts`

### Phase 2: OAuth & Connection (Week 2)

**Goal:** Users can connect Facebook Pages

- [ ] Create `exchange-facebook-token` edge function
- [ ] Create `useFacebook` hook
- [ ] Create `FBPageConnect` component
- [ ] Create OAuth callback page
- [ ] Add Facebook tab to Settings page
- [ ] Test OAuth flow with test page

### Phase 3: Post Creation (Week 3)

**Goal:** Users can create Facebook posts

- [ ] Update `PostComposer` to support Facebook
- [ ] Add Facebook post type selector (photo/video/album/link)
- [ ] Update `usePosts` hook for Facebook posts
- [ ] Create `publish-facebook-post` edge function
- [ ] Test manual publishing

### Phase 4: Scheduled Publishing (Week 4)

**Goal:** Automatic publishing works

- [ ] Update `scheduled-publisher` to handle Facebook
- [ ] Add Facebook-specific error handling
- [ ] Test scheduled publishing end-to-end
- [ ] Monitor and fix edge cases

### Phase 5: Analytics & Polish (Week 5)

**Goal:** Feature complete with analytics

- [ ] Create `get-facebook-insights` edge function
- [ ] Add Facebook analytics to Analytics page
- [ ] Token refresh functionality
- [ ] Error states and user feedback
- [ ] Documentation and cleanup

---

## 10. Risk Assessment

### 10.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Facebook API rate limits | Medium | Medium | Implement backoff, queue system |
| Token expiration mid-publish | Low | High | Validate token before publish |
| Video processing timeouts | Medium | Medium | Increase timeout, retry logic |
| Album post failures | Medium | Medium | Transactional approach, rollback |

### 10.2 Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| App review rejection | Medium | High | Follow guidelines, proper privacy policy |
| API deprecation | Low | High | Monitor Meta developer announcements |
| Permission scope changes | Low | Medium | Design for graceful degradation |

### 10.3 Dependencies

- Facebook Graph API v18.0 stability
- Meta Business Verification approval
- App Review for production permissions
- Existing Instagram OAuth app (shared)

---

## Appendix A: File Structure

```
src/
├── components/
│   └── facebook/
│       ├── FBPageConnect.tsx        # Page connection UI
│       └── FBPostTypeSelector.tsx   # Post type selection
├── hooks/
│   └── useFacebook.ts               # Facebook state management
├── services/
│   └── facebook.service.ts          # Frontend service layer
├── pages/
│   └── OAuthFacebookCallback.tsx    # OAuth redirect handler
└── types/
    └── index.ts                     # Updated with Facebook types

supabase/
├── functions/
│   ├── _shared/
│   │   └── facebook.ts              # Facebook API utilities
│   ├── exchange-facebook-token/
│   │   └── index.ts
│   ├── publish-facebook-post/
│   │   └── index.ts
│   ├── get-facebook-insights/
│   │   └── index.ts
│   └── scheduled-publisher/
│       └── index.ts                 # Updated for Facebook
└── migrations/
    └── 003_facebook_pages.sql
```

---

## Appendix B: API Reference

### Facebook Graph API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/oauth/access_token` | GET | Token exchange |
| `/me/accounts` | GET | List user's pages |
| `/{page-id}` | GET | Page details |
| `/{page-id}/photos` | POST | Create photo post |
| `/{page-id}/videos` | POST | Create video post |
| `/{page-id}/feed` | POST | Create link/album post |
| `/{page-id}/insights` | GET | Page analytics |
| `/{post-id}/insights` | GET | Post analytics |

### Required Permissions

| Permission | Purpose |
|------------|---------|
| `pages_show_list` | List manageable pages |
| `pages_read_engagement` | Read page content |
| `pages_manage_posts` | Create/edit/delete posts |
| `pages_read_user_content` | Read user content on page |
| `read_insights` | Access analytics |

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Author: Staff Software Engineer*
