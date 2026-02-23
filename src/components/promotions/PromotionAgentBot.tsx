import { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';

const POSITION_KEY = 'promotion-agent-position';
const DISMISSED_KEY = 'promotion-agent-dismissed';

interface Position { x: number; y: number; }

function getDefaultPosition(): Position {
  return { x: window.innerWidth - 90, y: window.innerHeight - 160 };
}

function loadPosition(): Position {
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      const pos = JSON.parse(saved) as Position;
      return {
        x: Math.min(Math.max(16, pos.x), window.innerWidth - 80),
        y: Math.min(Math.max(16, pos.y), window.innerHeight - 80),
      };
    }
  } catch { /* ignore */ }
  return getDefaultPosition();
}

interface PromotionAgentBotProps {
  isEnabled: boolean;
  isRunning: boolean;
  onClick: () => void;
  containerRef: React.RefObject<HTMLElement>;
}

export function PromotionAgentBot({ isEnabled, isRunning, onClick, containerRef }: PromotionAgentBotProps) {
  const botRef = useRef<HTMLDivElement>(null);
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [blinkState, setBlinkState] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === 'true');
  const [position, setPosition] = useState<Position>(loadPosition);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const rafRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const check = () => setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Clamp on resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 80),
        y: Math.min(prev.y, window.innerHeight - 80),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Blink
  useEffect(() => {
    if (!isMobile && isEnabled) return;
    const interval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, [isMobile, isEnabled]);

  // Mouse tracking for eyes
  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!botRef.current) return;
      const rect = botRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = mouseRef.current.x - cx;
      const dy = mouseRef.current.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxOffset = 5;
      if (dist < 10) {
        setPupilOffset({ x: 0, y: 0 });
      } else {
        const ratio = Math.min(maxOffset / dist, 1);
        setPupilOffset({ x: dx * ratio, y: dy * ratio });
      }
    });
  }, []);

  useEffect(() => {
    if (isMobile) return;
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, handleMouseMove, isMobile]);

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-close-btn]')) return;
    e.preventDefault();
    didDrag.current = false;
    setDragging(true);
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    didDrag.current = true;
    setPosition({
      x: Math.min(Math.max(16, e.clientX - dragOffset.current.x), window.innerWidth - 80),
      y: Math.min(Math.max(16, e.clientY - dragOffset.current.y), window.innerHeight - 80),
    });
  }, [dragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  }, [dragging, position]);

  const handleClick = useCallback(() => {
    if (didDrag.current) { didDrag.current = false; return; }
    onClick();
  }, [onClick]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, 'true');
  }, []);

  if (dismissed) return null;

  const eyeScaleY = blinkState ? 0.1 : 1;

  return (
    <div
      ref={botRef}
      className="fixed z-50"
      style={{
        left: position.x,
        top: position.y,
        width: 72,
        height: 72,
        touchAction: 'none',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      aria-label="Agente de Promoções"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      onClick={handleClick}
    >
      {/* Close button on hover */}
      {hovered && !dragging && (
        <button
          data-close-btn
          onClick={handleDismiss}
          className="absolute -top-2 -right-2 z-[51] h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform"
          aria-label="Fechar agente"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Halo glow */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-500"
        style={{
          boxShadow: isRunning
            ? '0 0 20px 6px hsl(142 71% 45% / 0.5), 0 0 40px 12px hsl(142 71% 45% / 0.2)'
            : isEnabled
              ? '0 0 12px 3px hsl(142 71% 45% / 0.3)'
              : 'none',
          animation: isRunning ? 'agentPulse 1.5s ease-in-out infinite' : 'none',
        }}
      />

      {/* Main sphere */}
      <div
        className="relative w-full h-full rounded-full transition-transform duration-200"
        style={{
          background: isEnabled
            ? 'radial-gradient(circle at 30% 25%, hsl(210 15% 95%), hsl(210 10% 70%) 40%, hsl(210 10% 45%) 70%, hsl(210 15% 30%))'
            : 'radial-gradient(circle at 30% 25%, hsl(0 0% 85%), hsl(0 0% 60%) 40%, hsl(0 0% 40%) 70%, hsl(0 0% 28%))',
          boxShadow: 'inset -8px -8px 16px hsl(0 0% 0% / 0.3), inset 4px 4px 8px hsl(0 0% 100% / 0.15), 0 6px 20px hsl(0 0% 0% / 0.3), 0 2px 6px hsl(0 0% 0% / 0.2)',
        }}
      >
        {/* Chrome highlight */}
        <div className="absolute rounded-full" style={{ top: '8%', left: '18%', width: '35%', height: '20%', background: 'radial-gradient(ellipse, hsl(0 0% 100% / 0.6), transparent)', filter: 'blur(2px)' }} />

        {/* Antenna */}
        <div className="absolute" style={{ top: -12, left: '50%', transform: 'translateX(-50%)', width: 3, height: 14, background: isEnabled ? 'linear-gradient(to top, hsl(210 10% 50%), hsl(210 10% 70%))' : 'linear-gradient(to top, hsl(0 0% 45%), hsl(0 0% 60%))', borderRadius: 2 }}>
          <div className="absolute rounded-full" style={{ top: -4, left: '50%', transform: 'translateX(-50%)', width: 7, height: 7, background: isEnabled ? 'radial-gradient(circle, hsl(142 71% 60%), hsl(142 71% 40%))' : 'radial-gradient(circle, hsl(0 0% 55%), hsl(0 0% 40%))', boxShadow: isEnabled ? '0 0 6px 2px hsl(142 71% 45% / 0.6)' : 'none', animation: isRunning ? 'ledBlink 0.8s ease-in-out infinite' : 'none' }} />
        </div>

        {/* Eyes */}
        <div className="absolute flex gap-2.5" style={{ top: '32%', left: '50%', transform: 'translateX(-50%)' }}>
          {[0, 1].map(i => (
            <div key={i} className="rounded-full flex items-center justify-center" style={{ width: 16, height: 16, background: 'radial-gradient(circle at 40% 35%, hsl(0 0% 100%), hsl(0 0% 92%))', boxShadow: 'inset 0 1px 3px hsl(0 0% 0% / 0.15)', transform: `scaleY(${eyeScaleY})`, transition: 'transform 0.1s ease' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, hsl(210 80% 30%), hsl(210 100% 10%))', transform: `translate(${pupilOffset.x}px, ${pupilOffset.y}px)`, transition: 'transform 0.15s ease-out' }} />
            </div>
          ))}
        </div>

        {/* Mouth */}
        <div className="absolute rounded-full" style={{ bottom: '22%', left: '50%', transform: 'translateX(-50%)', width: '40%', height: 3, background: isEnabled ? 'linear-gradient(90deg, transparent, hsl(142 71% 55%), transparent)' : 'linear-gradient(90deg, transparent, hsl(0 0% 50%), transparent)' }} />
      </div>

      <style>{`
        @keyframes agentPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes ledBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
