/**
 * Support Ticket Detail
 * Timeline view of a single ticket with messages
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Send,
  Loader2,
  User,
  Headphones,
  Bot,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Paperclip,
  Image,
  FileText,
  Download,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

type TicketStatus = 'open' | 'in_progress' | 'waiting_response' | 'resolved' | 'closed';

interface Message {
  id: string;
  content: string;
  sender_type: 'user' | 'support' | 'system';
  created_at: string;
  user_id: string | null;
  is_internal: boolean | null;
}

interface Attachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  storage_path: string;
  is_screenshot: boolean | null;
}

interface TicketLog {
  id: string;
  action: string;
  old_value: any;
  new_value: any;
  created_at: string;
}

interface TicketData {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: TicketStatus;
  priority: string;
  current_route: string | null;
  current_module: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportTicketDetailProps {
  ticketId: string;
  onBack: () => void;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Aberto', color: 'bg-blue-500/10 text-blue-600 border-blue-200', icon: Clock },
  in_progress: { label: 'Em atendimento', color: 'bg-amber-500/10 text-amber-600 border-amber-200', icon: AlertCircle },
  waiting_response: { label: 'Aguardando resposta', color: 'bg-purple-500/10 text-purple-600 border-purple-200', icon: MessageSquare },
  resolved: { label: 'Resolvido', color: 'bg-green-500/10 text-green-600 border-green-200', icon: CheckCircle2 },
  closed: { label: 'Finalizado', color: 'bg-muted text-muted-foreground border-muted', icon: CheckCircle2 },
};

export function SupportTicketDetail({ ticketId, onBack }: SupportTicketDetailProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [logs, setLogs] = useState<TicketLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const fetchTicketData = async () => {
      setLoading(true);
      try {
        // Fetch ticket
        const { data: ticketData, error: ticketError } = await supabase
          .from('support_tickets')
          .select('*')
          .eq('id', ticketId)
          .single();

        if (ticketError) throw ticketError;
        setTicket(ticketData);

        // Fetch messages
        const { data: messagesData } = await supabase
          .from('support_messages')
          .select('*')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });

        setMessages((messagesData || []).map(m => ({
          ...m,
          sender_type: m.sender_type as 'user' | 'support' | 'system',
        })));

        // Fetch attachments
        const { data: attachmentsData } = await supabase
          .from('support_attachments')
          .select('*')
          .eq('ticket_id', ticketId);

        setAttachments(attachmentsData || []);

        // Fetch logs
        const { data: logsData } = await supabase
          .from('support_ticket_logs')
          .select('*')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });

        setLogs(logsData || []);
      } catch (error) {
        console.error('[SupportTicketDetail] Error:', error);
        toast({
          title: 'Erro ao carregar chamado',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTicketData();
  }, [ticketId, toast]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending || !ticket) return;
    if (ticket.status === 'closed') {
      toast({
        title: 'Chamado finalizado',
        description: 'Não é possível enviar mensagens em chamados finalizados.',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await supabase
        .from('support_messages')
        .insert([{
          ticket_id: ticketId,
          content: newMessage.trim(),
          sender_type: 'user',
          user_id: user.id,
          is_internal: false,
        }])
        .select()
        .single();

      if (error) throw error;

      const typedMessage: Message = {
        ...data,
        sender_type: data.sender_type as 'user' | 'support' | 'system',
      };
      setMessages(prev => [...prev, typedMessage]);
      setNewMessage('');

      // Update ticket status if it was waiting_response
      if (ticket.status === 'waiting_response') {
        await supabase
          .from('support_tickets')
          .update({ status: 'in_progress' })
          .eq('id', ticketId);
        setTicket(prev => prev ? { ...prev, status: 'in_progress' } : null);
      }
    } catch (error) {
      console.error('[SupportTicketDetail] Send error:', error);
      toast({
        title: 'Erro ao enviar mensagem',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const getAttachmentIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return Image;
    return FileText;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!ticket) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Chamado não encontrado</p>
          <Button variant="outline" className="mt-4" onClick={onBack}>
            Voltar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const statusConfig = STATUS_CONFIG[ticket.status];
  const StatusIcon = statusConfig.icon;
  const isClosed = ticket.status === 'closed';

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={statusConfig.color}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  #{ticketId.slice(0, 8)}
                </span>
              </div>
              <CardTitle className="text-lg">{ticket.subject}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Aberto {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
                {ticket.current_module && ` • ${ticket.current_module}`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm bg-muted/50 p-3 rounded-lg">{ticket.description}</p>
          
          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">Anexos</p>
              <div className="flex flex-wrap gap-2">
                {attachments.map(attachment => {
                  const Icon = getAttachmentIcon(attachment.file_type);
                  return (
                    <Badge key={attachment.id} variant="outline" className="gap-1.5 py-1.5">
                      <Icon className="h-3 w-3" />
                      <span className="max-w-[100px] truncate">{attachment.file_name}</span>
                      {attachment.file_size && (
                        <span className="text-muted-foreground">
                          ({formatFileSize(attachment.file_size)})
                        </span>
                      )}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Messages Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea ref={scrollRef} className="h-[400px] pr-4">
            <div className="space-y-4">
              {/* Initial log */}
              {logs.filter(log => log.action === 'created').map(log => (
                <div key={log.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <span>
                    Chamado criado em {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}

              {/* Messages */}
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.sender_type === 'user' ? 'justify-end' : ''}`}
                >
                  {message.sender_type !== 'user' && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className={
                        message.sender_type === 'support' 
                          ? 'bg-primary/10 text-primary' 
                          : 'bg-muted'
                      }>
                        {message.sender_type === 'support' ? (
                          <Headphones className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div className={`max-w-[80%] ${message.sender_type === 'user' ? 'items-end' : ''}`}>
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        message.sender_type === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : message.sender_type === 'system'
                          ? 'bg-muted/50 text-muted-foreground italic'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {format(new Date(message.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>

                  {message.sender_type === 'user' && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="bg-secondary">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}

              {/* Status change logs */}
              {logs.filter(log => log.action === 'status_changed').map(log => (
                <div key={log.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <span>
                    Status alterado para "{STATUS_CONFIG[(log.new_value as any)?.status]?.label || log.new_value}" 
                    em {format(new Date(log.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Reply box */}
          {!isClosed && (
            <>
              <Separator className="my-4" />
              <div className="flex gap-2">
                <Textarea
                  placeholder="Escreva sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={2}
                  className="resize-none"
                  disabled={sending}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sending}
                  className="self-end"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </>
          )}

          {isClosed && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg text-center text-sm text-muted-foreground">
              Este chamado foi finalizado. Para novas dúvidas, abra um novo chamado.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
