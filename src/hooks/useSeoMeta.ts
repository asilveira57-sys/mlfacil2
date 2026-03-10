import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface SeoMetaData {
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  robots_index: boolean;
  robots_follow: boolean;
}

const DEFAULT_SEO: SeoMetaData = {
  meta_title: 'Mktpfacil - Gestão Completa para Vendedores de Marketplace',
  meta_description: 'Plataforma completa para vendedores de Mercado Livre. Gerencie vendas, etiquetas, anúncios e muito mais.',
  meta_keywords: null,
  canonical_url: null,
  og_title: null,
  og_description: null,
  og_image: null,
  robots_index: true,
  robots_follow: true,
};

// Cache for SEO settings to avoid re-fetching
const seoCache = new Map<string, SeoMetaData>();

export function useSeoMeta() {
  const location = useLocation();
  const pathname = location.pathname;

  const { data: seoData } = useQuery({
    queryKey: ['seo-meta', pathname],
    queryFn: async () => {
      // Check cache first
      if (seoCache.has(pathname)) {
        return seoCache.get(pathname)!;
      }

      // Try exact match first
      let { data } = await supabase
        .from('seo_page_settings')
        .select('meta_title, meta_description, meta_keywords, canonical_url, og_title, og_description, og_image, robots_index, robots_follow')
        .eq('page_path', pathname)
        .maybeSingle();

      // If no exact match, try pattern matching for dynamic routes
      if (!data && pathname.startsWith('/nlog/')) {
        const { data: nlogData } = await supabase
          .from('seo_page_settings')
          .select('meta_title, meta_description, meta_keywords, canonical_url, og_title, og_description, og_image, robots_index, robots_follow')
          .eq('page_path', pathname)
          .maybeSingle();
        data = nlogData;
      }

      const result = data || DEFAULT_SEO;
      seoCache.set(pathname, result as SeoMetaData);
      return result as SeoMetaData;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  useEffect(() => {
    if (!seoData) return;

    const baseUrl = window.location.origin;

    // Update title
    document.title = seoData.meta_title || DEFAULT_SEO.meta_title!;

    // Helper to update or create meta tag
    const setMeta = (name: string, content: string | null, isProperty = false) => {
      if (!content) return;
      const attr = isProperty ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    // Update meta description
    setMeta('description', seoData.meta_description);

    // Update meta keywords
    if (seoData.meta_keywords) {
      setMeta('keywords', seoData.meta_keywords);
    }

    // Update robots
    const robotsContent = [
      seoData.robots_index ? 'index' : 'noindex',
      seoData.robots_follow ? 'follow' : 'nofollow',
    ].join(', ');
    setMeta('robots', robotsContent);

    // Update canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = seoData.canonical_url || `${baseUrl}${pathname}`;

    // Update Open Graph tags
    setMeta('og:title', seoData.og_title || seoData.meta_title, true);
    setMeta('og:description', seoData.og_description || seoData.meta_description, true);
    setMeta('og:url', `${baseUrl}${pathname}`, true);
    if (seoData.og_image) {
      setMeta('og:image', seoData.og_image, true);
    }
    setMeta('og:type', 'website', true);

    // Twitter cards
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', seoData.og_title || seoData.meta_title);
    setMeta('twitter:description', seoData.og_description || seoData.meta_description);
    if (seoData.og_image) {
      setMeta('twitter:image', seoData.og_image);
    }

  }, [seoData, pathname]);

  return seoData;
}

// Clear SEO cache (useful when admin updates SEO settings)
export function clearSeoCache() {
  seoCache.clear();
}
