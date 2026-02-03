export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      sch_users: {
        Row: {
          id: string
          email: string
          display_name: string
          photo_url: string | null
          plan_tier: string
          timezone: string
          notifications_email: boolean
          notifications_push: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name: string
          photo_url?: string | null
          plan_tier?: string
          timezone?: string
          notifications_email?: boolean
          notifications_push?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string
          photo_url?: string | null
          plan_tier?: string
          timezone?: string
          notifications_email?: boolean
          notifications_push?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      ig_accounts: {
        Row: {
          id: string
          user_id: string
          ig_user_id: string
          username: string
          account_type: string
          access_token: string
          token_expires_at: string
          profile_picture_url: string | null
          followers_count: number
          is_connected: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ig_user_id: string
          username: string
          account_type: string
          access_token: string
          token_expires_at: string
          profile_picture_url?: string | null
          followers_count?: number
          is_connected?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ig_user_id?: string
          username?: string
          account_type?: string
          access_token?: string
          token_expires_at?: string
          profile_picture_url?: string | null
          followers_count?: number
          is_connected?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      sch_scheduled_posts: {
        Row: {
          id: string
          user_id: string
          platform: string
          account_id: string
          platform_user_id: string
          post_type: string
          caption: string | null
          media: Json
          scheduled_time: string
          status: string
          publish_method: string
          platform_post_id: string | null
          permalink: string | null
          published_at: string | null
          first_comment: string | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          platform: string
          account_id: string
          platform_user_id: string
          post_type: string
          caption?: string | null
          media: Json
          scheduled_time: string
          status?: string
          publish_method: string
          platform_post_id?: string | null
          permalink?: string | null
          published_at?: string | null
          first_comment?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          platform?: string
          account_id?: string
          platform_user_id?: string
          post_type?: string
          caption?: string | null
          media?: Json
          scheduled_time?: string
          status?: string
          publish_method?: string
          platform_post_id?: string | null
          permalink?: string | null
          published_at?: string | null
          first_comment?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      sch_media_library: {
        Row: {
          id: string
          user_id: string
          file_name: string
          file_type: string
          mime_type: string
          file_size: number
          storage_path: string
          download_url: string
          thumbnail_url: string | null
          width: number | null
          height: number | null
          uploaded_at: string
        }
        Insert: {
          id?: string
          user_id: string
          file_name: string
          file_type: string
          mime_type: string
          file_size: number
          storage_path: string
          download_url: string
          thumbnail_url?: string | null
          width?: number | null
          height?: number | null
          uploaded_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          file_name?: string
          file_type?: string
          mime_type?: string
          file_size?: number
          storage_path?: string
          download_url?: string
          thumbnail_url?: string | null
          width?: number | null
          height?: number | null
          uploaded_at?: string
        }
      }
    }
    pin_accounts: {
      Row: {
        id: string
        user_id: string
        pin_user_id: string
        username: string
        access_token: string
        refresh_token: string
        token_expires_at: string
        profile_picture_url: string | null
        followers_count: number
        account_type: string
        is_connected: boolean
        created_at: string
        updated_at: string
      }
      Insert: {
        id?: string
        user_id: string
        pin_user_id: string
        username: string
        access_token: string
        refresh_token: string
        token_expires_at: string
        profile_picture_url?: string | null
        followers_count?: number
        account_type?: string
        is_connected?: boolean
        created_at?: string
        updated_at?: string
      }
      Update: {
        id?: string
        user_id?: string
        pin_user_id?: string
        username?: string
        access_token?: string
        refresh_token?: string
        token_expires_at?: string
        profile_picture_url?: string | null
        followers_count?: number
        account_type?: string
        is_connected?: boolean
        created_at?: string
        updated_at?: string
      }
    }
    pin_boards: {
      Row: {
        id: string
        account_id: string
        board_id: string
        board_name: string
        description: string | null
        pin_count: number
        follower_count: number
        privacy: string
        created_at: string
        updated_at: string
      }
      Insert: {
        id?: string
        account_id: string
        board_id: string
        board_name: string
        description?: string | null
        pin_count?: number
        follower_count?: number
        privacy?: string
        created_at?: string
        updated_at?: string
      }
      Update: {
        id?: string
        account_id?: string
        board_id?: string
        board_name?: string
        description?: string | null
        pin_count?: number
        follower_count?: number
        privacy?: string
        created_at?: string
        updated_at?: string
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
