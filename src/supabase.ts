import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://aepnixifzhijlbjhibai.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_7nLejO7In2P_VWdZLOsN1A_KJY1NUfT';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface VideoItem {
  id: string;
  title: string;
  thumbnail_url: string;
  video_url: string;
  channel_name: string;
  channel_avatar: string;
  subscribers: string;
  category: string;
  duration: string;
  description: string;
  views: number;
  likes: number;
  dislikes: number;
  created_at?: string;
}

export interface SiteSettings {
  id: string;
  vast_tag_url: string;
  vast_skip_seconds: number;
  banner_top_image_url: string;
  banner_top_link_url: string;
  in_feed_banner_image_url: string;
  in_feed_banner_link_url: string;
  watch_page_banner_image_url: string;
  watch_page_banner_link_url: string;
  logo_url: string;
  tiktok_url: string;
  facebook_url: string;
  telegram_url: string;
  youtube_url: string;
  instagram_url: string;
  updated_at?: string;
}
