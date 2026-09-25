/**
 * ============================================================================
 * 🔥 HOTNESS STREAMING - PRODUCTION-GRADE ROUTING & VIDEO ENGINE
 * ============================================================================
 * 
 * 🌐 PRODUCTION URL STRUCTURE:
 *   - Home Feed: `/`
 *   - Category Pages: `/category/bangladeshi`, `/category/chinese`, etc.
 *   - Video Watch Pages: `/watch/:videoId/:slug` (e.g. `/watch/123e4567/exclusive-video`)
 *   - Search Page: `/search?q=query`
 * 
 * 📱 NATIVE BACK/FORWARD HISTORY (Like YouTube & Facebook):
 *   - Back button navigates between pages/videos without exiting the site.
 *   - Direct deep-links automatically restore exact video or category state.
 * 
 * 🗄️ DATABASE INTEGRATION (Supabase PostgreSQL):
 *   - Table `videos`: id, title, thumbnail_url, video_url, channel_name, channel_avatar,
 *                     subscribers, category, duration, description, views, likes, dislikes, created_at
 *   - Table `site_settings`: id ('global_config'), vast_tag_url, vast_skip_seconds,
 *                            banner_top_image_url, banner_top_link_url,
 *                            in_feed_banner_image_url, in_feed_banner_link_url,
 *                            watch_page_banner_image_url, watch_page_banner_link_url,
 *                            logo_url, tiktok_url, facebook_url, telegram_url, youtube_url, instagram_url
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, X, Image as ImageIcon, Play, CheckCircle, 
  ThumbsUp, ThumbsDown, Share2, ArrowLeft, Eye, Clock,
  ExternalLink, SkipForward, Loader2
} from 'lucide-react';
import { supabase, SiteSettings as DbSiteSettings } from './supabase';

/**
 * URL sanitizer to ensure only safe http/https links are rendered in hrefs and srcs
 */
function sanitizeUrl(url?: string | null): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed;
  }
  return '#';
}

/**
 * Generates an SEO & human-friendly URL slug from any English or Bengali video title
 */
export function generateVideoSlug(title: string): string {
  if (!title) return 'video';
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0980-\u09FF-]/g, '') // Keep alphanumeric, Bengali characters and hyphens
    .replace(/\s+/g, '-')                 // Replace spaces with hyphens
    .replace(/-+/g, '-')                  // Remove duplicate hyphens
    .replace(/^-+|-+$/g, '') || 'video';
}

/**
 * Returns the exact direct shareable URL for a video based on its title
 */
export function getVideoWatchPath(videoId: string, title: string): string {
  const slug = encodeURIComponent(generateVideoSlug(title));
  return `/watch/${encodeURIComponent(videoId)}/${slug}`;
}

export function getVideoFullShareUrl(video: VideoItem): string {
  const origin = window.location.origin;
  return `${origin}${getVideoWatchPath(video.id, video.title)}`;
}

/**
 * Parses VAST XML to extract ad video MediaFile, ClickThrough URL, and fire Impression beacons.
 */
async function parseVastXml(xmlUrl: string, depth = 0): Promise<{ mediaUrl: string; clickThrough: string } | null> {
  if (!xmlUrl || !xmlUrl.trim() || depth > 3) return null;
  const safeUrl = sanitizeUrl(xmlUrl);
  if (safeUrl === '#') return null;

  try {
    const res = await fetch(safeUrl);
    const xmlText = await res.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Follow Wrapper tags if present
    const wrapperTag = xmlDoc.querySelector('VASTAdTagURI');
    if (wrapperTag?.textContent?.trim()) {
      return parseVastXml(wrapperTag.textContent.trim(), depth + 1);
    }

    // 1. Find MediaFile (prefer MP4)
    const mediaFiles = xmlDoc.querySelectorAll('MediaFile');
    let chosenMedia = '';
    for (let i = 0; i < mediaFiles.length; i++) {
      const mf = mediaFiles[i];
      const type = mf.getAttribute('type') || '';
      const src = mf.textContent?.trim() || '';
      if (src) {
        chosenMedia = src;
        if (type.includes('mp4')) break;
      }
    }

    // 2. Find ClickThrough URL
    const clickThroughEl = xmlDoc.querySelector('ClickThrough') || xmlDoc.querySelector('ClickTracking');
    const clickThrough = clickThroughEl?.textContent?.trim() || '';

    // 3. Trigger Impression tracking pixels silently
    const impressionEls = xmlDoc.querySelectorAll('Impression');
    impressionEls.forEach(imp => {
      const beacon = imp.textContent?.trim();
      if (beacon && (beacon.startsWith('http://') || beacon.startsWith('https://'))) {
        const beaconImg = new Image();
        beaconImg.src = beacon;
      }
    });

    if (chosenMedia) {
      return { mediaUrl: chosenMedia, clickThrough: sanitizeUrl(clickThrough) };
    }
  } catch (err) {
    console.warn('VAST fetch / parse warning:', err);
  }
  return null;
}

export interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  videoSrc: string; // Direct MP4 or video source (e.g. GitHub Releases)
  channelName: string;
  channelAvatar: string;
  subscribers: string;
  baseViews: number; // Real exact view count
  baseLikes: number; // Real exact like count
  baseDislikes?: number;
  uploadedAt: string;
  duration: string;
  description: string;
  category: 'bangladeshi' | 'chinese' | 'japanese' | 'african' | 'others';
}

const CATEGORIES = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'bangladeshi', label: 'Bangladeshi Video', path: '/category/bangladeshi' },
  { id: 'chinese', label: 'Chinese Video', path: '/category/chinese' },
  { id: 'japanese', label: 'Japanese Video', path: '/category/japanese' },
  { id: 'african', label: 'African Video', path: '/category/african' },
  { id: 'others', label: 'Others video', path: '/category/others' },
];

/**
 * Smart Logo Component
 */
const BrandLogo: React.FC<{
  logoUrl?: string;
  sizeClass?: string;
}> = ({ logoUrl, sizeClass = "w-11 h-11" }) => {
  const [imgSrc, setImgSrc] = useState<string>(logoUrl || '/logo.png');
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    setImgSrc(logoUrl || '/logo.png');
    setHasError(false);
  }, [logoUrl]);

  if (hasError) {
    return (
      <div 
        title="Hotness Streaming" 
        className={`relative ${sizeClass} rounded-xl border border-dashed border-red-400 bg-red-50 flex items-center justify-center text-red-600 shadow-xs transition-colors`}
      >
        <ImageIcon className="w-5 h-5 opacity-75" />
      </div>
    );
  }

  return (
    <div className={`relative ${sizeClass} rounded-full overflow-hidden border-2 border-red-600 shadow-md group-hover:scale-105 transition-all bg-white`}>
      <img 
        src={imgSrc} 
        alt="Hotness Logo" 
        onError={() => {
          if (imgSrc !== '/logo.png') {
            setImgSrc('/logo.png');
          } else {
            setHasError(true);
          }
        }}
        className="w-full h-full object-cover"
      />
    </div>
  );
};

/**
 * HilltopAds Live Header Banner (Zone #7458493)
 */
const HilltopHeaderBanner: React.FC<{
  fallbackImageUrl?: string;
  fallbackLinkUrl?: string;
}> = ({ fallbackImageUrl, fallbackLinkUrl }) => {
  const adContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fallbackImageUrl) return;
    if (!adContainerRef.current) return;

    adContainerRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = '//dismalscrew.com/bdXtV.sjdsG/ln0IYnWGcU/xe/mQ9Yu/ZSUvl/kePDTCcx0TNaT/gx1_MJDSElteN/zgQ_1jOUDoUBwlNWQQ';
    script.async = true;
    script.referrerPolicy = 'no-referrer-when-downgrade';

    adContainerRef.current.appendChild(script);
  }, [fallbackImageUrl]);

  if (fallbackImageUrl) {
    return (
      <div className="w-full flex justify-center mb-4">
        <div className="w-[320px] h-[50px] sm:w-[468px] sm:h-[60px] md:w-[728px] md:h-[90px] max-w-full bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center relative shadow-xs">
          <a 
            href={sanitizeUrl(fallbackLinkUrl)} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="w-full h-full block"
          >
            <img 
              src={fallbackImageUrl} 
              alt="Banner" 
              className="w-full h-full object-cover"
            />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center mb-4">
      <div 
        ref={adContainerRef} 
        className="w-full max-w-[320px] sm:max-w-[468px] md:max-w-[728px] min-h-[50px] sm:min-h-[60px] flex items-center justify-center overflow-hidden"
      />
    </div>
  );
};

export default function App() {
  // Navigation / Route state
  const [activeCategory, setActiveCategory] = useState<string>('home');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Supabase dynamic state
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState<boolean>(true);
  const [siteSettings, setSiteSettings] = useState<DbSiteSettings>({
    id: 'global_config',
    vast_tag_url: 'https://probable-alternative.com/dqm.Ffz/dzG/NhvlZBGZUD/Deamg9fuSZSUxlfkcPuTtcq0/N/T/g-0SO/ToMRtmNhzAQm1/OcDCQi5aNYwc',
    vast_skip_seconds: 6,
    banner_top_image_url: '',
    banner_top_link_url: '#',
    in_feed_banner_image_url: '',
    in_feed_banner_link_url: '#',
    watch_page_banner_image_url: '',
    watch_page_banner_link_url: '#',
    logo_url: '',
    tiktok_url: 'https://tiktok.com',
    facebook_url: 'https://facebook.com',
    telegram_url: 'https://telegram.org',
    youtube_url: 'https://youtube.com',
    instagram_url: 'https://instagram.com',
  });

  // Active Video Item helper
  const activeVideo = useMemo(() => {
    if (!activeVideoId) return null;
    return videos.find(v => v.id === activeVideoId) || null;
  }, [activeVideoId, videos]);

  // Real view counts persisted in localStorage
  const [videoViews, setVideoViews] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('hotness_video_views_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const [userLikes, setUserLikes] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('hotness_user_likes_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const [userDislikes, setUserDislikes] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('hotness_user_dislikes_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const [copiedMethod, setCopiedMethod] = useState<string | null>(null);
  const [isTabHidden, setIsTabHidden] = useState(false);
  const [likeAnimated, setLikeAnimated] = useState(false);
  const [viewCountJustBumped, setViewCountJustBumped] = useState(false);

  // 🎬 VAST Video Ad Pre-roll Engine State
  const [isAdPlaying, setIsAdPlaying] = useState<boolean>(false);
  const [adCountdown, setAdCountdown] = useState<number>(siteSettings.vast_skip_seconds || 6);
  const [adMediaUrl, setAdMediaUrl] = useState<string>('');
  const [adClickThrough, setAdClickThrough] = useState<string>('');
  const [adProgressPercent, setAdProgressPercent] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // ========================================================
  // 🧭 ROUTE PARSER & HISTORY SYNC ENGINE (YouTube/FB Style)
  // ========================================================
  const parseCurrentUrl = useCallback(() => {
    const pathname = window.location.pathname;
    const search = window.location.search;
    const urlParams = new URLSearchParams(search);

    // 1. Check Watch Page `/watch/:id/:slug` or `/?v=:id`
    const watchMatch = pathname.match(/^\/watch\/([^/]+)/);
    const queryVideoId = urlParams.get('v') || urlParams.get('video');
    const targetVideoId = watchMatch ? decodeURIComponent(watchMatch[1]) : queryVideoId;

    if (targetVideoId) {
      setActiveVideoId(targetVideoId);
      return;
    } else {
      setActiveVideoId(null);
    }

    // 2. Check Search Page `/search?q=:query` or `/?q=:query`
    const qParam = urlParams.get('q') || urlParams.get('search');
    if (pathname.startsWith('/search') || qParam) {
      setSearchQuery(qParam || '');
      return;
    }

    // 3. Check Category Page `/category/:cat`
    const categoryMatch = pathname.match(/^\/category\/([^/]+)/);
    if (categoryMatch) {
      const cat = decodeURIComponent(categoryMatch[1]);
      setActiveCategory(cat);
      setSearchQuery('');
      return;
    }

    // 4. Default Home
    setActiveCategory('home');
    setSearchQuery('');
  }, []);

  // Listen to browser Back / Forward events (popstate)
  useEffect(() => {
    parseCurrentUrl();

    const handlePopState = () => {
      parseCurrentUrl();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [parseCurrentUrl]);

  // Navigation action creators (Push state & update address bar)
  const navigateToHome = () => {
    setActiveVideoId(null);
    setActiveCategory('home');
    setSearchQuery('');
    window.history.pushState({ page: 'home' }, '', '/');
    document.title = 'Hotness - Premium Video Streaming Platform';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCategory = (catId: string) => {
    setActiveVideoId(null);
    setActiveCategory(catId);
    setSearchQuery('');
    const targetPath = catId === 'home' ? '/' : `/category/${catId}`;
    window.history.pushState({ page: 'category', catId }, '', targetPath);
    const foundCat = CATEGORIES.find(c => c.id === catId);
    document.title = foundCat ? `${foundCat.label} - Hotness Streaming` : 'Hotness Streaming';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToVideo = (video: VideoItem) => {
    setActiveVideoId(video.id);
    const targetPath = getVideoWatchPath(video.id, video.title);
    window.history.pushState({ page: 'watch', videoId: video.id }, '', targetPath);
    document.title = `${video.title} - Hotness Streaming`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToSearch = (query: string) => {
    setActiveVideoId(null);
    setSearchQuery(query);
    if (query.trim()) {
      window.history.pushState({ page: 'search', query }, '', `/search?q=${encodeURIComponent(query)}`);
      document.title = `Search: "${query}" - Hotness Streaming`;
    } else {
      navigateToHome();
    }
  };

  // ========================================================
  // 🔄 SUPABASE LIVE DATA FETCHING & REALTIME LISTENER
  // ========================================================
  const fetchVideosFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });

      if (data && !error) {
        const mapped: VideoItem[] = data.map((d: any) => ({
          id: d.id,
          title: d.title || 'Untitled Video',
          thumbnail: d.thumbnail_url || '',
          videoSrc: d.video_url || '',
          channelName: d.channel_name || 'Hotness Official',
          channelAvatar: d.channel_avatar || '',
          subscribers: d.subscribers || '100K subscribers',
          baseViews: Number(d.views) || 0,
          baseLikes: Number(d.likes) || 0,
          baseDislikes: Number(d.dislikes) || 0,
          uploadedAt: d.created_at ? new Date(d.created_at).toLocaleDateString('bn-BD') : 'নতুন',
          duration: d.duration || '10:00',
          description: d.description || '',
          category: (d.category || 'others') as any
        }));
        setVideos(mapped);
      }
    } catch (err) {
      console.warn('Error loading videos from Supabase:', err);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const fetchSettingsFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .eq('id', 'global_config')
        .single();

      if (data && !error) {
        setSiteSettings(prev => ({
          ...prev,
          ...data,
          vast_tag_url: data.vast_tag_url || prev.vast_tag_url,
        }));
      }
    } catch (err) {
      console.warn('Error loading settings from Supabase:', err);
    }
  };

  useEffect(() => {
    fetchVideosFromSupabase();
    fetchSettingsFromSupabase();

    // Supabase Realtime Channel
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => {
        fetchVideosFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, () => {
        fetchSettingsFromSupabase();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Sync initial title if active video is present on load
  useEffect(() => {
    if (activeVideo) {
      document.title = `${activeVideo.title} - Hotness Streaming`;
    }
  }, [activeVideo]);

  // 🎬 VAST Ad initialization when a video is clicked
  useEffect(() => {
    if (!activeVideo) {
      setIsAdPlaying(false);
      setAdMediaUrl('');
      setAdClickThrough('');
      return;
    }

    // Check if VAST_TAG_URL is configured in siteSettings
    const vastUrl = siteSettings.vast_tag_url?.trim();
    if (vastUrl) {
      const skipSecs = siteSettings.vast_skip_seconds || 6;
      setIsAdPlaying(true);
      setAdCountdown(skipSecs);
      setAdProgressPercent(0);

      parseVastXml(vastUrl).then(vastResult => {
        if (vastResult?.mediaUrl) {
          setAdMediaUrl(vastResult.mediaUrl);
          setAdClickThrough(vastResult.clickThrough || '');
        } else {
          // Fallback if VAST fails or has no media: play video directly
          setIsAdPlaying(false);
        }
      });
    } else {
      setIsAdPlaying(false);
    }
  }, [activeVideo?.id, siteSettings.vast_tag_url, siteSettings.vast_skip_seconds]);

  // VAST Ad countdown timer
  useEffect(() => {
    if (!isAdPlaying) return;

    const timer = setInterval(() => {
      setAdCountdown(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAdPlaying]);

  const handleSkipAd = () => {
    setIsAdPlaying(false);
    setAdMediaUrl('');
  };

  const handleAdTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    if (vid.duration) {
      setAdProgressPercent((vid.currentTime / vid.duration) * 100);
    }
  };

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('hotness_video_views_v2', JSON.stringify(videoViews));
    } catch (e) {}
  }, [videoViews]);

  useEffect(() => {
    try {
      localStorage.setItem('hotness_user_likes_v2', JSON.stringify(userLikes));
    } catch (e) {}
  }, [userLikes]);

  useEffect(() => {
    try {
      localStorage.setItem('hotness_user_dislikes_v2', JSON.stringify(userDislikes));
    } catch (e) {}
  }, [userDislikes]);

  // 🛡️ Privacy Shield (Instantly hide on blur / tab switch)
  useEffect(() => {
    let originalTitle = document.title;

    const hideScreen = () => {
      setIsTabHidden(true);
      originalTitle = document.title;
      document.title = '🔒 Protected Tab';
      document.querySelectorAll('video').forEach(v => {
        try { v.pause(); } catch(e) {}
      });
    };

    const restoreScreen = () => {
      setIsTabHidden(false);
      if (originalTitle) {
        document.title = originalTitle;
      }
    };

    const handleVisibility = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        hideScreen();
      } else {
        restoreScreen();
      }
    };

    const handleWindowBlur = () => {
      hideScreen();
    };

    const handleWindowFocus = () => {
      restoreScreen();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pagehide', hideScreen);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pagehide', hideScreen);
    };
  }, []);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Helper to sync view count to Supabase
  const syncViewToSupabase = async (videoId: string, newTotalViews: number) => {
    try {
      await supabase
        .from('videos')
        .update({ views: newTotalViews })
        .eq('id', videoId);
    } catch (err) {
      console.warn('View update warning:', err);
    }
  };

  // ========================================================
  // ⏱️ REAL VIEW COUNT: প্রতি ১০ মিনিট পরপর কাউন্ট ইনক্রিমেন্ট হবে
  // ========================================================
  useEffect(() => {
    if (!activeVideo) return;

    // Initial view count on opening video (after initial buffer time)
    const initialViewTimer = setTimeout(() => {
      setVideoViews(prev => {
        const currentViews = prev[activeVideo.id] || activeVideo.baseViews;
        const updated = currentViews + 1;
        syncViewToSupabase(activeVideo.id, updated);
        return {
          ...prev,
          [activeVideo.id]: updated,
        };
      });
      setViewCountJustBumped(true);
      setTimeout(() => setViewCountJustBumped(false), 2500);
    }, 2000);

    // প্রতি ১০ মিনিট (10 minutes = 600,000 ms) পরপর ভিউ স্বয়ংক্রিয়ভাবে +১ যোগ হবে
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const tenMinuteInterval = setInterval(() => {
      setVideoViews(prev => {
        const currentViews = prev[activeVideo.id] || activeVideo.baseViews;
        const updated = currentViews + 1;
        syncViewToSupabase(activeVideo.id, updated);
        return {
          ...prev,
          [activeVideo.id]: updated,
        };
      });
      setViewCountJustBumped(true);
      setTimeout(() => setViewCountJustBumped(false), 2500);
    }, TEN_MINUTES_MS);

    return () => {
      clearTimeout(initialViewTimer);
      clearInterval(tenMinuteInterval);
    };
  }, [activeVideo?.id]);

  const handleLikeToggle = async (videoId: string) => {
    const isCurrentlyLiked = !!userLikes[videoId];
    const newLiked = !isCurrentlyLiked;
    setUserLikes(prev => ({
      ...prev,
      [videoId]: newLiked,
    }));

    if (newLiked && userDislikes[videoId]) {
      setUserDislikes(prev => ({
        ...prev,
        [videoId]: false,
      }));
    }

    if (!isCurrentlyLiked) {
      setLikeAnimated(true);
      setTimeout(() => setLikeAnimated(false), 800);
    }

    // Sync to Supabase
    try {
      const v = videos.find(x => x.id === videoId);
      if (v) {
        const newLikes = v.baseLikes + (newLiked ? 1 : -1);
        await supabase.from('videos').update({ likes: Math.max(0, newLikes) }).eq('id', videoId);
      }
    } catch (e) {}
  };

  const handleDislikeToggle = (videoId: string) => {
    const isCurrentlyDisliked = !!userDislikes[videoId];
    setUserDislikes(prev => ({
      ...prev,
      [videoId]: !isCurrentlyDisliked,
    }));

    if (!isCurrentlyDisliked && userLikes[videoId]) {
      setUserLikes(prev => ({
        ...prev,
        [videoId]: false,
      }));
    }
  };

  const getLikeCount = (video: VideoItem): number => {
    const isLiked = !!userLikes[video.id];
    return video.baseLikes + (isLiked ? 1 : 0);
  };

  const getViewCount = (video: VideoItem): number => {
    return videoViews[video.id] ?? video.baseViews;
  };

  const handleCopy = (text: string, method: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMethod(method);
    setTimeout(() => {
      setCopiedMethod(null);
    }, 2000);
  };

  // 🔗 Title-based Direct Share
  const handleShare = async () => {
    if (!activeVideo) return;
    const shareUrl = getVideoFullShareUrl(activeVideo);
    if (navigator.share) {
      try {
        await navigator.share({
          title: activeVideo.title,
          text: `Watch "${activeVideo.title}" on Hotness Streaming:`,
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    handleCopy(shareUrl, 'share');
  };

  const displayedVideos = useMemo(() => {
    return videos.filter(video => {
      const matchesCategory = activeCategory === 'home' || video.category === activeCategory;
      const matchesSearch = searchQuery.trim() === '' || 
        video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.channelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [videos, activeCategory, searchQuery]);

  const suggestedVideos = useMemo(() => {
    return videos.filter(v => v.id !== activeVideo?.id);
  }, [videos, activeVideo?.id]);

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-red-500 selection:text-white relative ${isTabHidden ? 'filter blur-2xl select-none pointer-events-none opacity-0' : 'transition-opacity duration-200'}`}>

      {/* 
        PREMIUM CLEAN LIGHT THEME HEADER
      */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.06)] relative overflow-hidden">
        {/* Modern sculpted curved gradient crest */}
        <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none">
          <svg 
            viewBox="0 0 1200 16" 
            className="w-full h-3 md:h-3.5 preserve-3d" 
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="headerHotGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.1" />
                <stop offset="25%" stopColor="#f43f5e" />
                <stop offset="50%" stopColor="#dc2626" />
                <stop offset="75%" stopColor="#ea580c" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            <path 
              d="M0,0 C300,14 450,16 600,16 C750,16 900,14 1200,0 L1200,0 L0,0 Z" 
              fill="url(#headerHotGradient)"
            />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3.5 flex items-center justify-between gap-5">
          
          {/* Brand Logo Slot & Typography */}
          <div 
            onClick={navigateToHome} 
            className="flex items-center gap-3 cursor-pointer shrink-0 select-none group"
          >
            <BrandLogo logoUrl={siteSettings.logo_url} sizeClass="w-12 h-12" />

            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-widest text-slate-900 group-hover:text-red-600 transition-colors">
                HOT<span className="text-red-600">NESS</span>
              </span>
              <span className="text-[10px] tracking-[0.25em] text-red-600 font-bold uppercase -mt-1">
                STREAMING
              </span>
            </div>
          </div>

          {/* Clean Light Theme Nav Bar (Desktop) with URL Push State */}
          <nav className="hidden lg:flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100/90 border border-slate-200">
            {CATEGORIES.map((item) => {
              const isActive = !activeVideoId && !searchQuery && activeCategory === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => navigateToCategory(item.id)}
                  className={`relative px-4 py-2 text-[13px] font-bold tracking-wide transition-all duration-200 flex items-center gap-2 cursor-pointer select-none rounded-xl ${
                    isActive
                      ? 'text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-600 shadow-md shadow-red-500/30 -translate-y-0.5'
                      : 'text-slate-600 hover:text-red-600 hover:bg-white border border-transparent hover:border-slate-200 shadow-none'
                  }`}
                  style={{
                    clipPath: isActive 
                      ? 'polygon(6% 0%, 100% 0%, 94% 100%, 0% 100%)' 
                      : 'polygon(4% 0%, 100% 0%, 96% 100%, 0% 100%)'
                  }}
                >
                  <span className="relative z-10 px-1">{item.label}</span>
                  {isActive && (
                    <span className="absolute -bottom-1 left-2 right-2 h-1 bg-red-400 rounded-full blur-[1px]"></span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Light Theme Search Icon Trigger */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search"
              className="relative group p-2.5 sm:px-4 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-700 hover:text-slate-900 transition-all duration-150 shadow-sm cursor-pointer flex items-center gap-2.5"
            >
              <div className="w-5 h-5 flex items-center justify-center text-red-600 group-hover:scale-110 transition-transform">
                <Search className="w-4 h-4" />
              </div>
              <span className="hidden sm:inline text-xs font-bold tracking-wider text-slate-700 group-hover:text-slate-900">
                {searchQuery ? `"${searchQuery}"` : 'SEARCH'}
              </span>
            </button>
          </div>

        </div>

        {/* Mobile Light Navigation Strip */}
        <div className="lg:hidden px-3 pb-2 pt-1.5 overflow-x-auto scrollbar-none flex items-center gap-1.5 border-t border-slate-100">
          {CATEGORIES.map((item) => {
            const isActive = !activeVideoId && !searchQuery && activeCategory === item.id;

            return (
              <button
                key={item.id}
                onClick={() => navigateToCategory(item.id)}
                className={`relative px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 rounded-lg ${
                  isActive
                    ? 'text-white bg-gradient-to-r from-red-600 to-rose-600 shadow-sm'
                    : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200 border border-slate-200/80'
                }`}
                style={{
                  clipPath: isActive 
                    ? 'polygon(7% 0%, 100% 0%, 93% 100%, 0% 100%)' 
                    : 'polygon(5% 0%, 100% 0%, 95% 100%, 0% 100%)'
                }}
              >
                <span className="px-0.5">{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-5 flex flex-col items-center">

        {/* ======================================================== */}
        {/* 📢 HILLTOPADS LIVE HEADER BANNER (OR ADMIN CUSTOM BANNER)*/}
        {/* ======================================================== */}
        {!activeVideo && (
          <HilltopHeaderBanner 
            fallbackImageUrl={siteSettings.banner_top_image_url}
            fallbackLinkUrl={siteSettings.banner_top_link_url}
          />
        )}

        {/* Content wrapper */}
        <div className="w-full">

        {/* Active search filter badge */}
        {searchQuery && !activeVideo && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-slate-800">
              Searching for: <strong className="text-red-600">"{searchQuery}"</strong> ({displayedVideos.length} found)
            </span>
            <button 
              onClick={navigateToHome} 
              className="text-xs font-bold text-red-600 hover:text-red-700 underline cursor-pointer"
            >
              Clear Search
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* 🎬 YOUTUBE-STYLE VIDEO PLAYER VIEW                       */}
        {/* ======================================================== */}
        {activeVideo ? (
          <div className="flex flex-col lg:flex-row gap-6">
            
            {/* Left Column: Video Player + Meta details */}
            <div className="flex-1 min-w-0">
              
              {/* Back to Home / Previous History Button (YouTube Style) */}
              <button 
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    navigateToHome();
                  }
                }}
                className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-red-600 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-sm transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>সব ভিডিওতে ফিরে যান</span>
              </button>

              {/* Real HTML5 Video Player with YouTube-Style VAST Pre-roll Integration */}
              <div className="relative aspect-video w-full bg-black rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-slate-200">
                {isAdPlaying ? (
                  <div className="relative w-full h-full bg-black flex items-center justify-center">
                    <video 
                      key={`ad-${activeVideo.id}`}
                      src={adMediaUrl || activeVideo.videoSrc}
                      autoPlay
                      playsInline
                      onTimeUpdate={handleAdTimeUpdate}
                      onEnded={handleSkipAd}
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => {
                        if (adClickThrough && adClickThrough !== '#') {
                          window.open(adClickThrough, '_blank', 'noopener,noreferrer');
                        }
                      }}
                    />

                    {/* YouTube-style Ad Top Badge & Advertiser Link */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-auto z-20">
                      <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-bold border border-white/10 shadow-lg">
                        <span className="bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded text-[10px] font-black uppercase">
                          Ad
                        </span>
                        <span>1 of 1</span>
                        <span className="text-white/40">•</span>
                        <span className="text-white/80">0:0{adCountdown}</span>
                      </div>

                      {adClickThrough && adClickThrough !== '#' && (
                        <a
                          href={adClickThrough}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-white/95 hover:bg-white text-slate-900 px-3 py-1 rounded-full text-xs font-bold shadow-lg transition-all hover:scale-105"
                        >
                          <span>Visit Advertiser</span>
                          <ExternalLink className="w-3 h-3 text-slate-600" />
                        </a>
                      )}
                    </div>

                    {/* YouTube-style Yellow Ad Progress Bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-10">
                      <div 
                        className="h-full bg-amber-400 transition-all duration-200 ease-linear"
                        style={{ width: `${adProgressPercent}%` }}
                      />
                    </div>

                    {/* YouTube-style Skip Ad Button / Countdown Pill */}
                    <div className="absolute bottom-4 right-4 z-20 pointer-events-auto">
                      {adCountdown > 0 ? (
                        <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md text-white/90 px-4 py-2 rounded-xl text-xs font-bold border border-white/10 shadow-xl select-none">
                          <span>Video will play in</span>
                          <span className="text-amber-400 font-black text-sm">{adCountdown}s</span>
                        </div>
                      ) : (
                        <button
                          onClick={handleSkipAd}
                          className="flex items-center gap-2 bg-black/90 hover:bg-amber-500 hover:text-slate-950 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black border border-white/20 shadow-2xl transition-all transform hover:scale-105 cursor-pointer animate-in fade-in"
                        >
                          <span>Skip Ad</span>
                          <SkipForward className="w-4 h-4 fill-current" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <video
                    ref={videoPlayerRef}
                    key={`main-${activeVideo.id}`}
                    src={activeVideo.videoSrc}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                )}
              </div>

              {/* Video Title & Key Stats */}
              <div className="mt-4">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
                  {activeVideo.title}
                </h1>

                {/* Meta details & Action buttons */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  
                  {/* Channel Meta */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shrink-0">
                      {activeVideo.channelAvatar ? (
                        <img 
                          src={activeVideo.channelAvatar} 
                          alt={activeVideo.channelName} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="font-black text-slate-700 text-sm">
                          {activeVideo.channelName.charAt(0)}
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-slate-900">
                          {activeVideo.channelName}
                        </span>
                        <CheckCircle className="w-3.5 h-3.5 text-red-600 fill-red-100" />
                      </div>
                      <span className="text-xs text-slate-500">
                        {activeVideo.subscribers}
                      </span>
                    </div>
                  </div>

                  {/* Right Actions: Likes, Dislikes, Share */}
                  <div className="flex items-center gap-2">
                    
                    {/* YouTube-style Like / Dislike pill button */}
                    <div className="flex items-center bg-slate-100 border border-slate-200 rounded-full overflow-hidden shadow-xs">
                      
                      {/* Like Button with live animation */}
                      <button
                        onClick={() => handleLikeToggle(activeVideo.id)}
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                          userLikes[activeVideo.id]
                            ? 'bg-red-50 text-red-600'
                            : 'text-slate-700 hover:bg-slate-200/80'
                        }`}
                      >
                        <ThumbsUp className={`w-4 h-4 ${userLikes[activeVideo.id] ? 'fill-red-600 text-red-600' : ''} ${likeAnimated ? 'scale-130 transition-transform duration-200' : ''}`} />
                        <span>{getLikeCount(activeVideo).toLocaleString()}</span>
                      </button>

                      <div className="w-[1px] h-4 bg-slate-300" />

                      {/* Dislike Button */}
                      <button
                        onClick={() => handleDislikeToggle(activeVideo.id)}
                        className={`px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                          userDislikes[activeVideo.id]
                            ? 'bg-slate-200 text-slate-900'
                            : 'text-slate-700 hover:bg-slate-200/80'
                        }`}
                      >
                        <ThumbsDown className={`w-4 h-4 ${userDislikes[activeVideo.id] ? 'fill-slate-900 text-slate-900' : ''}`} />
                      </button>
                    </div>

                    {/* Share Button (Generates Title-based unique Link) */}
                    <button
                      onClick={handleShare}
                      title="ভিডিওর টাইটেল-বেজড লিঙ্ক কপি ও শেয়ার করুন"
                      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200 px-4 py-2 rounded-full text-xs font-bold shadow-xs transition-all cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>{copiedMethod === 'share' ? 'লিঙ্ক কপি হয়েছে!' : 'Share'}</span>
                    </button>
                  </div>
                </div>

                {/* Expandable Video Description Box with Live View & Duration Details */}
                <div className="mt-4 bg-slate-100/90 border border-slate-200/80 rounded-2xl p-4 text-xs sm:text-sm text-slate-700">
                  <div className="flex items-center gap-3 font-bold text-slate-900 mb-2">
                    <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                      <Eye className="w-3.5 h-3.5" />
                      <strong className={`transition-all ${viewCountJustBumped ? 'text-red-700 scale-105' : ''}`}>
                        {getViewCount(activeVideo).toLocaleString()} ভিউ
                      </strong>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-slate-600">
                      <Clock className="w-3.5 h-3.5" />
                      {activeVideo.duration}
                    </span>
                    <span>•</span>
                    <span className="text-slate-500 font-medium">{activeVideo.uploadedAt}</span>
                  </div>

                  <p className="whitespace-pre-line leading-relaxed text-slate-700 font-medium">
                    {activeVideo.description || 'সম্পূর্ণ HD কোয়ালিটিতে উপভোগ করুন এই এক্সক্লুসিভ ভিডিওটি। বন্ধুদের সাথে শেয়ার করুন ও চ্যানেল সাবস্ক্রাইব করুন।'}
                  </p>
                </div>
              </div>

            </div>

            {/* Right Column: In-Stream Sponsored Banner & Suggested Videos List */}
            <div className="w-full lg:w-96 shrink-0 flex flex-col gap-4">
              
              {/* ======================================================== */}
              {/* 🔴 WATCH PAGE IN-STREAM SPONSORED BANNER                 */}
              {/* ======================================================== */}
              <div className="w-full bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase px-1.5 py-0.5 rounded">
                      Sponsored
                    </span>
                    <span className="text-xs font-bold text-slate-700">স্পন্সরড বিজ্ঞাপন</span>
                  </div>
                </div>

                {/* Banner Ad Display Slot */}
                <div className="w-full rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex items-center justify-center min-h-[100px]">
                  {siteSettings.watch_page_banner_image_url ? (
                    <a 
                      href={sanitizeUrl(siteSettings.watch_page_banner_link_url)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="w-full h-full block"
                    >
                      <img 
                        src={siteSettings.watch_page_banner_image_url} 
                        alt="Sponsored Banner" 
                        className="w-full h-auto object-cover"
                      />
                    </a>
                  ) : (
                    <div className="py-6 flex flex-col items-center justify-center text-slate-300">
                      <ImageIcon className="w-6 h-6 mb-1 opacity-60" />
                      <span className="text-[11px] font-medium tracking-wider">Watch Page Banner Slot</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Suggested Videos Title */}
              <h3 className="text-sm font-black text-slate-900 tracking-wide uppercase mt-1">
                Suggested Videos
              </h3>

              {/* Suggested Video Cards */}
              <div className="flex flex-col gap-3">
                {suggestedVideos.map(video => (
                  <div
                    key={video.id}
                    onClick={() => navigateToVideo(video)}
                    className="flex gap-3 group cursor-pointer bg-white p-2 rounded-2xl border border-slate-200/70 hover:border-red-300 hover:shadow-md transition-all"
                  >
                    {/* Thumbnail */}
                    <div className="relative w-36 aspect-video rounded-xl overflow-hidden bg-slate-900 shrink-0">
                      <img 
                        src={video.thumbnail} 
                        alt={video.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {video.duration}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-red-600 transition-colors">
                        {video.title}
                      </h4>
                      <span className="text-[11px] text-slate-500 mt-1 font-medium">
                        {video.channelName}
                      </span>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <span>{getViewCount(video).toLocaleString()} views</span>
                        <span>•</span>
                        <span>{video.uploadedAt}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>

          </div>
        ) : (
          /* ======================================================== */
          /* 🏠 HOME FEED: VIDEOS GRID + IN-FEED BANNERS               */
          /* ======================================================== */
          <>
            {isLoadingVideos ? (
              <div className="py-24 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
                <span className="text-xs font-bold text-slate-500">লোড হচ্ছে...</span>
              </div>
            ) : displayedVideos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
                {displayedVideos.map((video, index) => (
                  <React.Fragment key={video.id}>
                    
                    {/* Video Card */}
                    <div 
                      onClick={() => navigateToVideo(video)}
                      className="group flex flex-col bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-red-300 transition-all duration-300 cursor-pointer"
                    >
                      {/* Thumbnail with overlay duration */}
                      <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
                        <img 
                          src={video.thumbnail} 
                          alt={video.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors flex items-center justify-center">
                          <div className="w-11 h-11 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300 shadow-lg shadow-red-600/50">
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </div>
                        </div>

                        {/* Duration badge */}
                        <span className="absolute bottom-2 right-2 bg-black/85 backdrop-blur-xs text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm">
                          {video.duration}
                        </span>
                      </div>

                      {/* Card Content & Meta */}
                      <div className="p-3.5 flex gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-slate-700">
                          {video.channelAvatar ? (
                            <img src={video.channelAvatar} alt={video.channelName} className="w-full h-full object-cover" />
                          ) : (
                            video.channelName.charAt(0)
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-red-600 transition-colors">
                            {video.title}
                          </h3>

                          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                            <span>{video.channelName}</span>
                            <CheckCircle className="w-3 h-3 text-red-500" />
                          </div>

                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                            <span>{getViewCount(video).toLocaleString()} views</span>
                            <span>•</span>
                            <span>{video.uploadedAt}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ======================================================== */}
                    {/* 📢 IN-FEED BANNER (Shown after every 2 video cards)      */}
                    {/* ======================================================== */}
                    {(index + 1) % 2 === 0 && (
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 my-2">
                        <div className="w-full bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs flex flex-col items-center">
                          <div className="w-full flex items-center justify-between mb-2">
                            <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase px-1.5 py-0.5 rounded">
                              Sponsored
                            </span>
                            <span className="text-[11px] font-bold text-slate-400">বিজ্ঞাপন</span>
                          </div>

                          {siteSettings.in_feed_banner_image_url ? (
                            <a 
                              href={sanitizeUrl(siteSettings.in_feed_banner_link_url)} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="w-full block rounded-xl overflow-hidden"
                            >
                              <img 
                                src={siteSettings.in_feed_banner_image_url} 
                                alt="In-Feed Ad" 
                                className="w-full h-auto max-h-48 object-contain rounded-xl"
                              />
                            </a>
                          ) : (
                            <div className="w-full py-8 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-300">
                              <ImageIcon className="w-7 h-7 mb-1 opacity-50" />
                              <span className="text-xs font-medium">In-Feed Native Banner Slot</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-slate-300 p-8 shadow-xs">
                <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4 shadow-inner">
                  <Play className="w-8 h-8 fill-red-100 text-red-600 ml-0.5" />
                </div>
                <h3 className="text-lg font-black text-slate-900">
                  {searchQuery ? 'কোনো ভিডিও পাওয়া যায়নি' : 'নতুন ভিডিও শীঘ্রই আসছে'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm font-medium">
                  {searchQuery 
                    ? 'অন্য কোনো কী-ওয়ার্ড দিয়ে সার্চ করুন অথবা ফিল্টার পরিবর্তন করুন।' 
                    : 'শীঘ্রই নতুন ও ট্রেন্ডিং ভিডিও যোগ করা হবে। সাথেই থাকুন।'}
                </p>
                {searchQuery && (
                  <button
                    onClick={navigateToHome}
                    className="mt-5 px-5 py-2.5 bg-red-600 text-white text-xs font-bold rounded-xl shadow-md hover:bg-red-700 transition cursor-pointer"
                  >
                    সব ভিডিও দেখুন
                  </button>
                )}
              </div>
            )}
          </>
        )}
        </div>

      </main>

      {/* 
        SEARCH OVERLAY MODAL
      */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 flex items-center gap-3 border-b border-slate-100">
              <Search className="w-5 h-5 text-red-600 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setIsSearchOpen(false);
                    navigateToSearch(searchQuery);
                  }
                }}
                placeholder="ভিডিওর নাম, ক্যাটাগরি বা চ্যানেল খুঁজুন..."
                className="w-full text-sm font-semibold text-slate-900 focus:outline-none placeholder:text-slate-400"
              />
              <button
                onClick={() => setIsSearchOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span>Enter চেপে সার্চ করুন</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-red-600 hover:underline font-bold cursor-pointer"
                >
                  ক্লিয়ার
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 
        FOOTER (CLEAN & DYNAMIC)
      */}
      <footer className="w-full bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
          
          {/* Top Footer Row: Brand Info & Social Channels */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            
            {/* Brand Logo & Name */}
            <div 
              onClick={navigateToHome} 
              className="flex items-center gap-3 cursor-pointer select-none group"
            >
              <BrandLogo logoUrl={siteSettings.logo_url} sizeClass="w-10 h-10" />

              <div className="flex flex-col">
                <span className="text-xl font-black tracking-widest text-slate-900 group-hover:text-red-600 transition-colors">
                  HOT<span className="text-red-600">NESS</span>
                </span>
                <span className="text-[9px] tracking-[0.25em] text-red-600 font-bold uppercase -mt-1">
                  STREAMING
                </span>
              </div>
            </div>

            {/* Social Media Platforms */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-2.5">
                Join Our Community
              </h4>

              {/* Social Icons Grid with Branded Colors */}
              <div className="flex flex-wrap items-center gap-2.5">
                
                {/* Facebook */}
                <a 
                  href={sanitizeUrl(siteSettings.facebook_url || 'https://facebook.com')} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  title="Facebook"
                  className="w-9 h-9 rounded-xl bg-[#1877F2]/10 hover:bg-[#1877F2] text-[#1877F2] hover:text-white flex items-center justify-center transition-all duration-200 border border-[#1877F2]/20 hover:scale-110 shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>

                {/* Telegram */}
                <a 
                  href={sanitizeUrl(siteSettings.telegram_url || 'https://telegram.org')} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  title="Telegram"
                  className="w-9 h-9 rounded-xl bg-[#229ED9]/10 hover:bg-[#229ED9] text-[#229ED9] hover:text-white flex items-center justify-center transition-all duration-200 border border-[#229ED9]/20 hover:scale-110 shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                  </svg>
                </a>

                {/* YouTube */}
                <a 
                  href={sanitizeUrl(siteSettings.youtube_url || 'https://youtube.com')} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  title="YouTube"
                  className="w-9 h-9 rounded-xl bg-[#FF0000]/10 hover:bg-[#FF0000] text-[#FF0000] hover:text-white flex items-center justify-center transition-all duration-200 border border-[#FF0000]/20 hover:scale-110 shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </a>

                {/* Twitter / X */}
                <a 
                  href={sanitizeUrl('https://x.com')} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  title="X (Twitter)"
                  className="w-9 h-9 rounded-xl bg-slate-900/10 hover:bg-slate-900 text-slate-900 hover:text-white flex items-center justify-center transition-all duration-200 border border-slate-900/20 hover:scale-110 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>

                {/* Instagram */}
                <a 
                  href={sanitizeUrl(siteSettings.instagram_url || 'https://instagram.com')} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  title="Instagram"
                  className="w-9 h-9 rounded-xl bg-[#E4405F]/10 hover:bg-[#E4405F] text-[#E4405F] hover:text-white flex items-center justify-center transition-all duration-200 border border-[#E4405F]/20 hover:scale-110 shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>

                {/* TikTok */}
                <a 
                  href={sanitizeUrl(siteSettings.tiktok_url || 'https://tiktok.com')} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  title="TikTok"
                  className="w-9 h-9 rounded-xl bg-black/10 hover:bg-black text-slate-900 hover:text-white flex items-center justify-center transition-all duration-200 border border-slate-900/20 hover:scale-110 shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298 0 .586.044.86.128V9.37a6.34 6.34 0 0 0-.86-.06A6.34 6.34 0 0 0 3.14 15.65a6.34 6.34 0 0 0 10.82 4.47c1.38-1.39 1.99-3.2 1.99-5.12V8.29a8.16 8.16 0 0 0 4.77 1.52V6.69z"/>
                  </svg>
                </a>
              </div>
            </div>

          </div>

          {/* Bottom Copyright */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800 tracking-wider">HOTNESS</span>
              <span className="text-red-600 font-bold">•</span>
              <span>All rights reserved.</span>
            </div>

            <div className="text-[11px] text-slate-400 font-medium">
              © {new Date().getFullYear()} Hotness Streaming
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}