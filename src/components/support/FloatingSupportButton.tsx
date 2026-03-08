/**
 * Floating Support Button
 * Draggable global button with close option, screenshot capture, and ticket modal
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageCircle, X, Headphones, HelpCircle, BookOpen, ClipboardList } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateTicketDialog } from './CreateTicketDialog';
import { SupportChatDialog } from './SupportChatDialog';
import { useUnreadTicketReplies } from '@/hooks/useUnreadTicketReplies';
import { cn } from '@/lib/utils';

const POSITION_KEY = 'support-btn-position';
const DISMISSED_KEY = 'support-btn-dismissed';

interface Position {
  x: number;
  y: number;
}

function getDefaultPosition(): Position {
  return {
    x: window.innerWidth - 80,
    y: window.innerHeight - 80,
  };
}

function loadPosition(): Position {
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      const pos = JSON.parse(saved) as Position;
      // Clamp to viewport
      return {
        x: Math.min(Math.max(16, pos.x), window.innerWidth - 72),
        y: Math.min(Math.max(16, pos.y), window.innerHeight - 72),
      };
    }
  } catch { /* ignore */ }
  return getDefaultPosition();
}

interface FloatingSupportButtonProps {
  visible?: boolean;
  className?: string;
}

export function FloatingSupportButton({ visible = true, className }: FloatingSupportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [capturedScreenshot, setCapturedScreenshot] = useState<string | null>(null);
  const [capturedContext, setCapturedContext] = useState<{
    route: string;
    module: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem(DISMISSED_KEY) === 'true';
  });
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<Position>(loadPosition);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const navigate = useNavigate();

  // Recalculate position on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 72),
        y: Math.min(prev.y, window.innerHeight - 72),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Dragging handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-close-btn]')) return;
    e.preventDefault();
    didDrag.current = false;
    setDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    didDrag.current = true;
    const newX = Math.min(Math.max(16, e.clientX - dragOffset.current.x), window.innerWidth - 72);
    const newY = Math.min(Math.max(16, e.clientY - dragOffset.current.y), window.innerHeight - 72);
    setPosition({ x: newX, y: newY });
  }, [dragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  }, [dragging, position]);

  // Capture screenshot using html2canvas
  const captureScreenshot = useCallback(async () => {
    try {
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: 0.5,
      });
      return canvas.toDataURL('image/png', 0.7);
    } catch (error) {
      console.error('[Support] Screenshot capture failed:', error);
      return null;
    }
  }, []);

  // Get current module from route
  const getModuleFromRoute = (pathname: string): string => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return 'Dashboard';
    const moduleMap: Record<string, string> = {
      'dashboard': 'Dashboard',
      'vendas': 'Vendas',
      'etiquetas': 'Etiquetas',
      'radiografia': 'Radiografia',
      'custos': 'Custos',
      'precificacao': 'Precificação',
      'abc': 'Curva ABC',
      'ads': 'Mercado ADS',
      'settings': 'Configurações',
      'admin': 'Admin',
    };
    return moduleMap[parts[0]] || parts[0];
  };

  const handleOpenTicket = useCallback(async () => {
    if (didDrag.current) return;
    setIsOpen(false);
    const context = {
      route: location.pathname,
      module: getModuleFromRoute(location.pathname),
    };
    setCapturedContext(context);
    const screenshot = await captureScreenshot();
    setCapturedScreenshot(screenshot);
    setTicketDialogOpen(true);
  }, [location.pathname, captureScreenshot]);

  const handleOpenChat = useCallback(() => {
    if (didDrag.current) return;
    setIsOpen(false);
    setChatDialogOpen(true);
  }, []);

  const handleOpenKnowledgeBase = useCallback(() => {
    if (didDrag.current) return;
    setIsOpen(false);
    navigate('/settings?tab=support&section=knowledge');
  }, [navigate]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setIsOpen(false);
  }, []);

  // Don't render if not visible (user preference) or dismissed this session
  if (!visible || dismissed) return null;

  return (
    <>
      <div
        ref={buttonRef}
        className="fixed z-50"
        style={{
          left: position.x,
          top: position.y,
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Close button - appears on hover */}
        {hovered && !dragging && (
          <button
            data-close-btn
            onClick={handleDismiss}
            className="absolute -top-2 -right-2 z-[51] h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform"
            aria-label="Fechar botão de suporte"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        <Popover open={isOpen} onOpenChange={(open) => {
          if (didDrag.current) {
            didDrag.current = false;
            return;
          }
          setIsOpen(open);
        }}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              className={cn(
                'h-14 w-14 rounded-full shadow-lg',
                'bg-primary hover:bg-primary/90 text-primary-foreground',
                'transition-all duration-200',
                !dragging && 'hover:scale-105',
                className
              )}
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <MessageCircle className="h-6 w-6" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            className="w-64 p-2"
            sideOffset={8}
          >
            <div className="grid gap-1">
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12"
                onClick={handleOpenChat}
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Headphones className="h-4 w-4 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">Chat com IA</p>
                  <p className="text-xs text-muted-foreground">Tire dúvidas rápidas</p>
                </div>
              </Button>
              
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12"
                onClick={handleOpenTicket}
              >
                <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <HelpCircle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">Abrir Chamado</p>
                  <p className="text-xs text-muted-foreground">Suporte personalizado</p>
                </div>
              </Button>
              
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12"
                onClick={handleOpenKnowledgeBase}
              >
                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">Base de Conhecimento</p>
                  <p className="text-xs text-muted-foreground">Artigos e tutoriais</p>
                </div>
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <CreateTicketDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        screenshot={capturedScreenshot}
        context={capturedContext}
        onClearScreenshot={() => setCapturedScreenshot(null)}
      />

      <SupportChatDialog
        open={chatDialogOpen}
        onOpenChange={setChatDialogOpen}
      />
    </>
  );
}