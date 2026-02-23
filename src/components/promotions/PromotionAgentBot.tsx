import { useEffect, useRef, useState, useCallback } from 'react';

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
  const rafRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Blink animation for idle/mobile
  useEffect(() => {
    if (!isMobile && isEnabled) return;
    const interval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, [isMobile, isEnabled]);

  // Mouse tracking
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

  const eyeScaleY = blinkState ? 0.1 : 1;

  return (
    <div
      ref={botRef}
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 cursor-pointer select-none group"
      style={{ width: 72, height: 72 }}
      role="button"
      aria-label="Agente de Promoções"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
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

      {/* Main sphere body */}
      <div
        className="relative w-full h-full rounded-full transition-transform duration-200 group-hover:scale-105"
        style={{
          background: isEnabled
            ? 'radial-gradient(circle at 30% 25%, hsl(210 15% 95%), hsl(210 10% 70%) 40%, hsl(210 10% 45%) 70%, hsl(210 15% 30%))'
            : 'radial-gradient(circle at 30% 25%, hsl(0 0% 85%), hsl(0 0% 60%) 40%, hsl(0 0% 40%) 70%, hsl(0 0% 28%))',
          boxShadow: `
            inset -8px -8px 16px hsl(0 0% 0% / 0.3),
            inset 4px 4px 8px hsl(0 0% 100% / 0.15),
            0 6px 20px hsl(0 0% 0% / 0.3),
            0 2px 6px hsl(0 0% 0% / 0.2)
          `,
        }}
      >
        {/* Chrome highlight */}
        <div
          className="absolute rounded-full"
          style={{
            top: '8%',
            left: '18%',
            width: '35%',
            height: '20%',
            background: 'radial-gradient(ellipse, hsl(0 0% 100% / 0.6), transparent)',
            filter: 'blur(2px)',
          }}
        />

        {/* Antenna */}
        <div
          className="absolute"
          style={{
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 3,
            height: 14,
            background: isEnabled
              ? 'linear-gradient(to top, hsl(210 10% 50%), hsl(210 10% 70%))'
              : 'linear-gradient(to top, hsl(0 0% 45%), hsl(0 0% 60%))',
            borderRadius: 2,
          }}
        >
          {/* LED */}
          <div
            className="absolute rounded-full"
            style={{
              top: -4,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 7,
              height: 7,
              background: isEnabled
                ? 'radial-gradient(circle, hsl(142 71% 60%), hsl(142 71% 40%))'
                : 'radial-gradient(circle, hsl(0 0% 55%), hsl(0 0% 40%))',
              boxShadow: isEnabled
                ? '0 0 6px 2px hsl(142 71% 45% / 0.6)'
                : 'none',
              animation: isRunning ? 'ledBlink 0.8s ease-in-out infinite' : 'none',
            }}
          />
        </div>

        {/* Eyes container */}
        <div className="absolute flex gap-2.5" style={{ top: '32%', left: '50%', transform: 'translateX(-50%)' }}>
          {/* Left eye */}
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 16,
              height: 16,
              background: 'radial-gradient(circle at 40% 35%, hsl(0 0% 100%), hsl(0 0% 92%))',
              boxShadow: 'inset 0 1px 3px hsl(0 0% 0% / 0.15)',
              transform: `scaleY(${eyeScaleY})`,
              transition: 'transform 0.1s ease',
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, hsl(210 80% 30%), hsl(210 100% 10%))',
                transform: `translate(${pupilOffset.x}px, ${pupilOffset.y}px)`,
                transition: 'transform 0.15s ease-out',
              }}
            />
          </div>
          {/* Right eye */}
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 16,
              height: 16,
              background: 'radial-gradient(circle at 40% 35%, hsl(0 0% 100%), hsl(0 0% 92%))',
              boxShadow: 'inset 0 1px 3px hsl(0 0% 0% / 0.15)',
              transform: `scaleY(${eyeScaleY})`,
              transition: 'transform 0.1s ease',
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, hsl(210 80% 30%), hsl(210 100% 10%))',
                transform: `translate(${pupilOffset.x}px, ${pupilOffset.y}px)`,
                transition: 'transform 0.15s ease-out',
              }}
            />
          </div>
        </div>

        {/* Mouth / visor line */}
        <div
          className="absolute rounded-full"
          style={{
            bottom: '22%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '40%',
            height: 3,
            background: isEnabled
              ? 'linear-gradient(90deg, transparent, hsl(142 71% 55%), transparent)'
              : 'linear-gradient(90deg, transparent, hsl(0 0% 50%), transparent)',
          }}
        />
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes agentPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes ledBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
