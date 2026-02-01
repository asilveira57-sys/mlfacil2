/**
 * Floating Support Button
 * Global button that captures screenshot and opens ticket modal
 */

import { useState, useCallback } from 'react';
import { MessageCircle, X, Headphones, HelpCircle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLocation } from 'react-router-dom';
import { CreateTicketDialog } from './CreateTicketDialog';
import { SupportChatDialog } from './SupportChatDialog';
import { cn } from '@/lib/utils';

interface FloatingSupportButtonProps {
  className?: string;
}

export function FloatingSupportButton({ className }: FloatingSupportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [capturedScreenshot, setCapturedScreenshot] = useState<string | null>(null);
  const [capturedContext, setCapturedContext] = useState<{
    route: string;
    module: string;
  } | null>(null);
  const location = useLocation();

  // Capture screenshot using html2canvas
  const captureScreenshot = useCallback(async () => {
    try {
      // Dynamic import to avoid loading if not needed
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: 0.5, // Reduce size for performance
      });
      
      const dataUrl = canvas.toDataURL('image/png', 0.7);
      return dataUrl;
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

  // Handle opening ticket dialog with context capture
  const handleOpenTicket = useCallback(async () => {
    setIsOpen(false);
    
    // Capture context first
    const context = {
      route: location.pathname,
      module: getModuleFromRoute(location.pathname),
    };
    setCapturedContext(context);
    
    // Capture screenshot
    const screenshot = await captureScreenshot();
    setCapturedScreenshot(screenshot);
    
    // Open dialog
    setTicketDialogOpen(true);
  }, [location.pathname, captureScreenshot]);

  // Handle opening AI chat
  const handleOpenChat = useCallback(() => {
    setIsOpen(false);
    setChatDialogOpen(true);
  }, []);

  // Handle opening knowledge base
  const handleOpenKnowledgeBase = useCallback(() => {
    setIsOpen(false);
    window.location.href = '/settings?tab=support&section=knowledge';
  }, []);

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            className={cn(
              'fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg',
              'bg-primary hover:bg-primary/90 text-primary-foreground',
              'transition-all duration-200 hover:scale-105',
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
