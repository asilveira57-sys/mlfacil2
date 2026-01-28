import { useSeoMeta } from '@/hooks/useSeoMeta';

/**
 * SeoHead Component
 * 
 * This component automatically injects SEO meta tags into the document head
 * based on the current route. It should be rendered once at the app root level.
 * 
 * Features:
 * - Fetches SEO settings from database based on current route
 * - Updates document title, meta description, keywords
 * - Sets robots directives (index/noindex, follow/nofollow)
 * - Updates canonical URL
 * - Sets Open Graph tags for social sharing
 * - Sets Twitter Card meta tags
 * - Uses caching to avoid redundant API calls
 * - Falls back to default SEO when no config exists
 */
export function SeoHead() {
  // This hook handles all the SEO meta tag injection
  useSeoMeta();
  
  // This component doesn't render anything visible
  return null;
}
