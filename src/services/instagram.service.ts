import { supabase } from '../config/supabase';
import {
  CaptionGenerationRequest,
  CaptionGenerationResponse,
  HashtagSuggestionRequest,
  HashtagSuggestionResponse,
} from '../types';

// Instagram service for frontend
// Note: Most Instagram API calls should go through Edge Functions for security
export class InstagramService {
  // Generate AI-powered caption using Edge Function
  async generateCaption(request: CaptionGenerationRequest): Promise<CaptionGenerationResponse> {
    const { data, error } = await supabase.functions.invoke('generate-caption', {
      body: request,
    });

    if (error) {
      throw new Error(error.message || 'Failed to generate caption');
    }

    return data;
  }

  // Get hashtag suggestions using Edge Function
  async suggestHashtags(request: HashtagSuggestionRequest): Promise<HashtagSuggestionResponse> {
    const { data, error } = await supabase.functions.invoke('suggest-hashtags', {
      body: request,
    });

    if (error) {
      throw new Error(error.message || 'Failed to suggest hashtags');
    }

    return data;
  }

  // Publish a post immediately (triggers Edge Function)
  async publishPostNow(postId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('publish-post-now', {
      body: { postId },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return data;
  }

  // Refresh Instagram account token
  async refreshAccountToken(accountId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('refresh-instagram-token', {
      body: { accountId },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return data;
  }

  // Get post insights from Instagram
  async getPostInsights(
    postId: string,
    instagramPostId: string
  ): Promise<{
    impressions: number;
    reach: number;
    engagement: number;
    likes: number;
    comments: number;
    saves: number;
    shares: number;
  }> {
    const { data, error } = await supabase.functions.invoke('get-post-insights', {
      body: { postId, instagramPostId },
    });

    if (error) {
      throw new Error(error.message || 'Failed to get post insights');
    }

    return data;
  }

  // Get account insights
  async getAccountInsights(accountId: string): Promise<{
    followersCount: number;
    followersGrowth: number;
    profileViews: number;
    websiteClicks: number;
    postsCount: number;
  }> {
    const { data, error } = await supabase.functions.invoke('get-account-insights', {
      body: { accountId },
    });

    if (error) {
      throw new Error(error.message || 'Failed to get account insights');
    }

    return data;
  }

  // Validate Instagram connection
  async validateConnection(accountId: string): Promise<{ valid: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('validate-instagram-connection', {
      body: { accountId },
    });

    if (error) {
      return { valid: false, error: error.message };
    }

    return data;
  }
}

export const instagramService = new InstagramService();
export default InstagramService;
