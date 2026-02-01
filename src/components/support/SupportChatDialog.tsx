/**
 * Support Chat Dialog
 * AI-powered chat for quick support with knowledge base integration
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Loader2,
  Bot,
  User,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  feedback?: 'helpful' | 'not_helpful';
}

interface SupportChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const INITIAL_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: 'Olá! Sou o assistente de suporte do MKTPFácil. Como posso ajudar você hoje?\n\nPosso responder dúvidas sobre:\n• Funcionamento do sistema\n• Configurações e integrações\n• Erros e problemas técnicos\n• Planos e faturamento',
  timestamp: new Date(),
};

export function SupportChatDialog({ open, onOpenChange }: SupportChatDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setMessages([INITIAL_MESSAGE]);
        setInput('');
      }, 300);
    }
  }, [open]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Call AI support edge function
      const { data, error } = await supabase.functions.invoke('support-ai-chat', {
        body: {
          message: userMessage.content,
          history: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content,
          })),
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data?.response || 'Desculpe, não consegui processar sua mensagem. Tente novamente ou abra um chamado.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('[SupportChat] Error:', error);
      
      // Fallback response
      const fallbackMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: 'Desculpe, estou com dificuldades para processar sua mensagem no momento. Por favor, tente novamente ou abra um chamado de suporte para atendimento personalizado.',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (messageId: string, feedback: 'helpful' | 'not_helpful') => {
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, feedback } : m
    ));

    if (feedback === 'not_helpful') {
      toast({
        title: 'Obrigado pelo feedback',
        description: 'Considere abrir um chamado para atendimento personalizado.',
      });
    } else {
      toast({
        title: 'Obrigado!',
        description: 'Ficamos felizes em ajudar.',
      });
    }
  };

  const handleOpenTicket = () => {
    onOpenChange(false);
    // Delay to allow dialog close animation
    setTimeout(() => {
      const event = new CustomEvent('open-support-ticket');
      window.dispatchEvent(event);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">Chat de Suporte</DialogTitle>
              <p className="text-xs text-muted-foreground">Assistente IA do MKTPFácil</p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea ref={scrollRef} className="flex-1 px-4 py-3">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
              >
                {message.role === 'assistant' && (
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                
                <div className={`max-w-[85%] space-y-1 ${message.role === 'user' ? 'items-end' : ''}`}>
                  <div
                    className={`rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                  
                  {message.role === 'assistant' && message.id !== 'welcome' && !message.feedback && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground mr-1">Útil?</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleFeedback(message.id, 'helpful')}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleFeedback(message.id, 'not_helpful')}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  
                  {message.feedback && (
                    <Badge variant="outline" className="text-xs">
                      {message.feedback === 'helpful' ? '✓ Obrigado!' : 'Feedback enviado'}
                    </Badge>
                  )}
                </div>

                {message.role === 'user' && (
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-secondary">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-3 space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Digite sua dúvida..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={isLoading}
            />
            <Button size="icon" onClick={handleSend} disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={handleOpenTicket}
          >
            <HelpCircle className="h-4 w-4" />
            Prefiro abrir um chamado
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
