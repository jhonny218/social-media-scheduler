import { supabase, TABLES } from '../config/supabase';
import { ScheduledPost, PostInsights, AccountInsights, InstagramAccount, PostMedia } from '../types';

export interface AnalyticsSummary {
  totalPosts: number;
  publishedPosts: number;
  scheduledPosts: number;
  failedPosts: number;
  totalImpressions: number;
  totalReach: number;
  totalEngagement: number;
  averageEngagementRate: number;
}

export interface PostPerformance {
  post: ScheduledPost;
  insights: PostInsights | null;
}

export interface DailyStats {
  date: string;
  postsScheduled: number;
  postsPublished: number;
  impressions: number;
  engagement: number;
}

// Convert database row to ScheduledPost type
const dbRowToPost = (row: any): ScheduledPost => ({
  id: row.id,
  userId: row.user_id,
  platform: row.platform,
  accountId: row.account_id,
  platformUserId: row.platform_user_id,
  postType: row.post_type as ScheduledPost['postType'],
  caption: row.caption || undefined,
  media: (row.media as PostMedia[]) || [],
  scheduledTime: row.scheduled_time,
  status: row.status as ScheduledPost['status'],
  publishMethod: row.publish_method as ScheduledPost['publishMethod'],
  platformPostId: row.platform_post_id || undefined,
  permalink: row.permalink || undefined,
  publishedAt: row.published_at || undefined,
  firstComment: row.first_comment || undefined,
  errorMessage: row.error_message || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Convert database row to InstagramAccount type
const dbRowToAccount = (row: any): InstagramAccount => ({
  id: row.id,
  userId: row.user_id,
  igUserId: row.ig_user_id,
  username: row.username,
  accountType: row.account_type as InstagramAccount['accountType'],
  accessToken: row.access_token,
  tokenExpiresAt: row.token_expires_at,
  profilePictureUrl: row.profile_picture_url || undefined,
  followersCount: row.followers_count || 0,
  isConnected: row.is_connected,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class AnalyticsService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  // Get analytics summary for a date range
  async getAnalyticsSummary(startDate: Date, endDate: Date): Promise<AnalyticsSummary> {
    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('user_id', this.userId)
      .gte('scheduled_time', startDate.toISOString())
      .lte('scheduled_time', endDate.toISOString());

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);
    const publishedPosts = posts.filter((p) => p.status === 'published');

    // Fetch insights for published posts
    let totalImpressions = 0;
    let totalReach = 0;
    let totalEngagement = 0;

    for (const post of publishedPosts) {
      if (post.platformPostId) {
        try {
          const insights = await this.getPostInsights(post.id, post.platformPostId);
          if (insights) {
            totalImpressions += insights.impressions;
            totalReach += insights.reach;
            totalEngagement += insights.engagement;
          }
        } catch (error) {
          console.error('Error fetching insights for post:', post.id, error);
        }
      }
    }

    const averageEngagementRate =
      totalImpressions > 0 ? (totalEngagement / totalImpressions) * 100 : 0;

    return {
      totalPosts: posts.length,
      publishedPosts: publishedPosts.length,
      scheduledPosts: posts.filter((p) => p.status === 'scheduled').length,
      failedPosts: posts.filter((p) => p.status === 'failed').length,
      totalImpressions,
      totalReach,
      totalEngagement,
      averageEngagementRate,
    };
  }

  // Get insights for a specific post
  async getPostInsights(postId: string, platformPostId: string): Promise<PostInsights | null> {
    try {
      const { data, error } = await supabase.functions.invoke('get-post-insights', {
        body: { postId, platformPostId },
      });

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching post insights:', error);
      return null;
    }
  }

  // Get top performing posts
  async getTopPerformingPosts(limit: number = 10): Promise<PostPerformance[]> {
    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);
    const performanceData: PostPerformance[] = [];

    for (const post of posts.slice(0, limit)) {
      if (post.platformPostId) {
        const insights = await this.getPostInsights(post.id, post.platformPostId);
        performanceData.push({ post, insights });
      } else {
        performanceData.push({ post, insights: null });
      }
    }

    // Sort by engagement (if available)
    return performanceData.sort((a, b) => {
      const engagementA = a.insights?.engagement || 0;
      const engagementB = b.insights?.engagement || 0;
      return engagementB - engagementA;
    });
  }

  // Get account insights
  async getAccountInsights(accountId: string): Promise<AccountInsights | null> {
    try {
      const { data, error } = await supabase.functions.invoke('get-account-insights', {
        body: { accountId },
      });

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching account insights:', error);
      return null;
    }
  }

  // Get all connected Instagram accounts with their insights
  async getAllAccountsInsights(): Promise<(InstagramAccount & { insights: AccountInsights | null })[]> {
    const { data, error } = await supabase
      .from(TABLES.IG_ACCOUNTS)
      .select('*')
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to fetch accounts: ${error.message}`);
    }

    const accounts = (data || []).map(dbRowToAccount);

    const accountsWithInsights = await Promise.all(
      accounts.map(async (account) => {
        const insights = await this.getAccountInsights(account.id);
        return { ...account, insights };
      })
    );

    return accountsWithInsights;
  }

  // Get daily statistics for a date range
  async getDailyStats(startDate: Date, endDate: Date): Promise<DailyStats[]> {
    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('user_id', this.userId)
      .gte('scheduled_time', startDate.toISOString())
      .lte('scheduled_time', endDate.toISOString())
      .order('scheduled_time', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);

    // Group posts by day
    const dailyMap = new Map<string, DailyStats>();

    // Initialize all days in range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      dailyMap.set(dateKey, {
        date: dateKey,
        postsScheduled: 0,
        postsPublished: 0,
        impressions: 0,
        engagement: 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Populate with post data
    for (const post of posts) {
      const scheduledDate = new Date(post.scheduledTime);
      const dateKey = scheduledDate.toISOString().split('T')[0];
      const stats = dailyMap.get(dateKey);

      if (stats) {
        stats.postsScheduled++;
        if (post.status === 'published') {
          stats.postsPublished++;
        }
      }
    }

    return Array.from(dailyMap.values());
  }

  // Get posting patterns (best times to post)
  async getPostingPatterns(): Promise<{ hour: number; dayOfWeek: number; avgEngagement: number }[]> {
    const { data, error } = await supabase
      .from(TABLES.SCHEDULED_POSTS)
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'published');

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    const posts = (data || []).map(dbRowToPost);
    const patterns: Map<string, { total: number; count: number }> = new Map();

    for (const post of posts) {
      if (post.publishedAt) {
        const date = new Date(post.publishedAt);
        const hour = date.getHours();
        const dayOfWeek = date.getDay();
        const key = `${dayOfWeek}-${hour}`;

        if (!patterns.has(key)) {
          patterns.set(key, { total: 0, count: 0 });
        }

        const pattern = patterns.get(key)!;
        pattern.count++;

        // Try to get engagement data
        if (post.platformPostId) {
          try {
            const insights = await this.getPostInsights(post.id, post.platformPostId);
            if (insights) {
              pattern.total += insights.engagement;
            }
          } catch {
            // Ignore errors for individual posts
          }
        }
      }
    }

    return Array.from(patterns.entries()).map(([key, value]) => {
      const [dayOfWeek, hour] = key.split('-').map(Number);
      return {
        hour,
        dayOfWeek,
        avgEngagement: value.count > 0 ? value.total / value.count : 0,
      };
    });
  }
}

export default AnalyticsService;
