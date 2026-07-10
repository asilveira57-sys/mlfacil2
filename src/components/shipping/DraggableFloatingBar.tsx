import { useRef, useState, useCallback, useEffect, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';

interface DraggableFloatingBarProps {
  children: ReactNode;
  storageKey?: string;
}

/**
 * Floating bar fixed near the bottom-center of the viewport that the user can
 * drag by the grip handle to any position on the screen. Position is persisted
 * per `storageKey` so the user's preferred spot survives navigation/reloads.
 */
export function DraggableFloatingBar({ children, storageKey = 'floating-bar-pos' }: DraggableFloatingBarProps) {
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset?.x ?? 0,
      baseY: offset?.y ?? 0,
    };
    setDragging(true);
  }, [offset]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset({ x: dragState.current.baseX + dx, y: dragState.current.baseY + dy });
  }, []);

  const endDrag = useCallback(() => {
    if (!dragState.current) return;
    dragState.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!offset) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(offset));
    } catch { /* ignore */ }
  }, [offset, storageKey]);

  const style: React.CSSProperties = {
    transform: `translate(-50%, 0) translate(${offset?.x ?? 0}px, ${offset?.y ?? 0}px)`,
    touchAction: 'none',
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 z-50"
      style={style}
    >
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg flex items-stretch">
        <button
          type="button"
          aria-label="Arrastar"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`flex items-center px-1.5 rounded-l-lg hover:bg-primary-foreground/10 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <GripVertical className="h-4 w-4 opacity-70" />
        </button>
        <div className="flex-1 px-6 py-3 flex flex-col gap-2 min-w-[500px]">
          {children}
        </div>
      </div>
    </div>
  );
}
