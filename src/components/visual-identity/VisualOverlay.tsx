import { useVisualIdentity } from '@/hooks/useVisualIdentity';
import { cn } from '@/lib/utils';

interface VisualOverlayProps {
  target: 'dashboard' | 'menu' | 'cards';
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps content with visual identity overlay (gradient + optional image).
 * Only applies if the current target is enabled in settings.
 */
export function VisualOverlay({ target, children, className }: VisualOverlayProps) {
  const { isClean, gradient, overlayUrl, intensity, applyToDashboard, applyToMenu, applyToCards } = useVisualIdentity();

  const shouldApply = (() => {
    if (isClean) return false;
    if (!gradient) return false;
    switch (target) {
      case 'dashboard': return applyToDashboard;
      case 'menu': return applyToMenu;
      case 'cards': return applyToCards;
      default: return false;
    }
  })();

  if (!shouldApply) {
    return <div className={className}>{children}</div>;
  }

  const opacityValue = Math.min(Math.max(intensity / 10, 0.05), 0.8);

  return (
    <div className={cn('relative', className)}>
      {/* Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none rounded-inherit z-0 transition-opacity duration-500 dark:brightness-[0.6] dark:saturate-[0.7]"
        style={{
          background: gradient,
          opacity: opacityValue,
          mixBlendMode: 'overlay',
          borderRadius: 'inherit',
        }}
      />

      {/* Image overlay */}
      {overlayUrl && (
        <div
          className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-500 dark:brightness-[0.6] dark:saturate-[0.7]"
          style={{
            backgroundImage: `url(${overlayUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: opacityValue * 0.5,
            mixBlendMode: 'soft-light',
            borderRadius: 'inherit',
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
