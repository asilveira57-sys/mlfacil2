import { useEffect, useRef, useState, memo } from 'react';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { useSellerVisualPreferences } from '@/hooks/useSellerVisualPreferences';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { supabase } from '@/integrations/supabase/client';

type OverlayMode = 'corners' | 'background' | 'animated';

interface CornerConfig {
  position: string;
  transform: string;
  className: string;
}

const CORNERS_DESKTOP: CornerConfig[] = [
  { position: 'top-0 left-0', transform: 'rotate(0deg)', className: 'origin-top-left' },
  { position: 'top-0 right-0', transform: 'rotate(90deg)', className: 'origin-top-right' },
  { position: 'bottom-0 right-0', transform: 'rotate(180deg)', className: 'origin-bottom-right' },
  { position: 'bottom-0 left-0', transform: 'rotate(270deg)', className: 'origin-bottom-left' },
];

const CORNERS_MOBILE: CornerConfig[] = [
  { position: 'top-0 left-0', transform: 'rotate(0deg)', className: 'origin-top-left' },
  { position: 'bottom-0 right-0', transform: 'rotate(180deg)', className: 'origin-bottom-right' },
];

// Deduplication: track last log key + timestamp
let lastLogKey = '';
let lastLogTime = 0;
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

async function logOverlayAction(
  action: string,
  sellerId: string | null,
  userId: string | null,
  details: Record<string, unknown>
) {
  try {
    const key = `${sellerId}:${action}:${details.template_id || ''}`;
    const now = Date.now();
    if (key === lastLogKey && now - lastLogTime < DEDUP_WINDOW_MS) return;
    lastLogKey = key;
    lastLogTime = now;

    await supabase.from('system_logs').insert({
      system_area: 'visual-overlay',
      action,
      level: 'info',
      success: true,
      user_id: userId,
      meta_json: { seller_id: sellerId, ...details },
    } as any);
  } catch {
    // fail-safe: never break the app
  }
}

/**
 * Global Visual Overlay Layer — renders resolved template overlay images
 * as decorative corner elements. Mount once in DashboardLayout.
 * 
 * Supports future modes: 'background', 'animated'.
 */
export const VisualOverlayLayer = memo(function VisualOverlayLayer() {
  const { resolved } = useApplyTheme();
  const { mode } = useSellerVisualPreferences();
  const { sellerId } = useActiveAccount();
  const userId = useCurrentUserId();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const prevOverlayRef = useRef<string | null>(null);

  // Responsive detection
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Extract overlay data from resolved theme
  const variant = resolved?.variant;
  const overlayUrl = variant?.overlay_url || null;
  const overlayOpacity = variant?.overlay_opacity ?? 0.5;
  const intensity = variant?.intensity ?? 5;
  const templateId = resolved?.template?.id || null;
  const ruleType = resolved?.resolution_source || 'unknown';

  const isClean = mode === 'clean';
  const shouldRender = !isClean && !!overlayUrl;

  // Logging
  useEffect(() => {
    if (!sellerId) return;

    if (isClean) {
      logOverlayAction('skipped_clean_mode', sellerId, userId, { mode: 'clean' });
      return;
    }
    if (!overlayUrl) {
      logOverlayAction('skipped_no_overlay', sellerId, userId, { template_id: templateId, rule_type: ruleType });
      return;
    }

    // Log when overlay changes
    if (overlayUrl !== prevOverlayRef.current) {
      prevOverlayRef.current = overlayUrl;
      logOverlayAction('applied', sellerId, userId, {
        template_id: templateId,
        overlay_url: overlayUrl,
        rule_type: ruleType,
        mode,
        intensity,
      });
    }
  }, [overlayUrl, isClean, sellerId, userId, templateId, ruleType, mode, intensity]);

  // Preload image
  useEffect(() => {
    if (!overlayUrl) { setImgLoaded(false); return; }
    const img = new Image();
    img.src = overlayUrl;
    img.onload = () => setImgLoaded(true);
    img.onerror = () => {
      setImgLoaded(false);
      logOverlayAction('error_loading', sellerId, userId, { overlay_url: overlayUrl, template_id: templateId });
    };
  }, [overlayUrl, sellerId, userId, templateId]);

  if (!shouldRender || !imgLoaded) return null;

  const effectiveOpacity = Math.min(overlayOpacity * 0.6, 0.5);
  const corners = isMobile ? CORNERS_MOBILE : CORNERS_DESKTOP;
  const size = isMobile ? 'w-[180px] h-[180px]' : 'w-[280px] h-[280px] lg:w-[360px] lg:h-[360px]';

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 1 }}
      aria-hidden="true"
      data-visual-overlay-layer
    >
      {corners.map((corner, i) => (
        <div
          key={i}
          className={`absolute ${corner.position} ${size} ${corner.className}`}
          style={{
            opacity: effectiveOpacity,
            filter: 'blur(3px)',
            transform: `${corner.transform} scale(0.85)`,
          }}
        >
          <img
            src={overlayUrl!}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
});
