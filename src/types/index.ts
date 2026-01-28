// Supported platforms
export type Platform = 'instagram' | 'facebook' | 'pinterest';

// User types
export interface UserPreferences {
  timezone: string;
  notifications: {
    email: boolean;
    push: boolean;
  };
}

export interface User {
  id: string;
  uid?: string;
  email: string;
  displayName: string;
  photoURL?: string;
  planTier: 'free';
  createdAt: string;
  updatedAt: string;
  preferences: UserPreferences;
}

export interface UserInput {
  email: string;
  displayName: string;
  photoURL?: string;
}

// Instagram Account types (ig_ prefix in database)
export type InstagramAccountType = 'business' | 'creator' | 'personal';

export interface InstagramAccount {
  id: string;
  userId: string;
  igUserId: string; // was: instagramUserId
  instagramUserId?: string;
  username: string;
  accountType: InstagramAccountType;
  accessToken: string;
  tokenExpiresAt: string;
  profilePictureUrl?: string;
  followersCount: number;
  isConnected: boolean;
  createdAt: string;
  updatedAt: string;
}

// Post types
export type PostType = 'feed' | 'story' | 'reel' | 'carousel' | 'pin' | 'video';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type PublishMethod = 'auto' | 'notification';

export interface PostMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  order: number;
  thumbnailUrl?: string;
}

// Reel cover type
export interface ReelCover {
  type: 'frame' | 'custom';
  data: string; // Base64 data URL or image URL
  timestamp?: number; // Video timestamp if type is 'frame'
}

export interface ScheduledPost {
  id: string;
  userId: string;
  platform: Platform;
  accountId: string;
  platformUserId: string; // was: instagramUserId
  postType: PostType;
  caption?: string;
  media: PostMedia[];
  scheduledTime: string | Date;
  status: PostStatus;
  publishMethod: PublishMethod;
  platformPostId?: string; // was: instagramPostId
  instagramPostId?: string;
  permalink?: string;
  publishedAt?: string;
  firstComment?: string;
  reelCover?: ReelCover;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostInput {
  platform: Platform;
  accountId: string;
  postType: PostType;
  caption?: string;
  media: PostMedia[];
  scheduledTime: Date;
  publishMethod: PublishMethod;
  firstComment?: string;
  reelCover?: ReelCover;
}

// Media Library types
export type MediaType = 'image' | 'video';

export interface MediaItem {
  id: string;
  userId: string;
  fileName: string;
  fileType: MediaType;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  uploadedAt: string;
}

// Calendar Event type for react-big-calendar
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: ScheduledPost;
}

// Analytics types
export interface PostInsights {
  postId: string;
  impressions: number;
  reach: number;
  engagement: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export interface AccountInsights {
  accountId: string;
  followersCount: number;
  followersGrowth: number;
  profileViews: number;
  websiteClicks: number;
  postsCount: number;
  period: string;
}

// AI Caption types
export interface CaptionGenerationRequest {
  imageUrl?: string;
  imageUrls?: string[]; // Multiple images/frames for video content
  isVideo?: boolean; // Flag to indicate this is video content
  tone: 'casual' | 'professional' | 'playful' | 'inspirational';
  includeHashtags: boolean;
  maxLength?: number;
}

export interface CaptionGenerationResponse {
  caption: string;
  hashtags?: string[];
}

export interface HashtagSuggestionRequest {
  caption: string;
  niche?: string;
}

export interface HashtagSuggestionResponse {
  hashtags: string[];
}

// Auth types
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

// Form types
export interface LoginFormData {
  email: string;
  password: string;
}

export interface SignupFormData {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Instagram OAuth types
export interface InstagramOAuthResponse {
  access_token: string;
  user_id: string;
}

export interface InstagramUserProfile {
  id: string;
  username: string;
  account_type: string;
  media_count: number;
  profile_picture_url?: string;
  followers_count?: number;
}
