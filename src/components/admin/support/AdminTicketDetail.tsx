/**
 * Admin Ticket Detail
 * View ticket timeline, reply as support, change status, send notification
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Image,
  FileText,
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
  user_id: string;
  workspace_id: string;
}

interface ClientProfile {
  full_name: string | null;
  email: string | null;
}

interface AdminTicketDetailProps {
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

export function AdminTicketDetail({ ticketId, onBack }: AdminTicketDetailProps) {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [ticketRes, messagesRes, attachmentsRes] = await Promise.all([
          supabase.from('support_tickets').select('*').eq('id', ticketId).single(),
          supabase.from('support_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }),
          supabase.from('support_attachments').select('*').eq('ticket_id', ticketId),
        ]);

        if (ticketRes.error) throw ticketRes.error;
        const ticketData = ticketRes.data as TicketData;
        setTicket(ticketData);
        setMessages((messagesRes.data || []).map(m => ({ ...m, sender_type: m.sender_type as Message['sender_type'] })));
        
        const atts = (attachmentsRes.data || []) as Attachment[];
        setAttachments(atts);

        // Fetch signed URLs for all attachments (private bucket)
        if (atts.length > 0) {
          const urlMap: Record<string, string> = {};
          await Promise.all(
            atts.map(async (att) => {
              try {
                const { data, error } = await supabase.storage
                  .from('support-attachments')
                  .createSignedUrl(att.storage_path, 3600);
                if (!error && data?.signedUrl) {
                  urlMap[att.id] = data.signedUrl;
                }
              } catch (e) {
                console.warn('[AdminTicketDetail] Signed URL error for', att.file_name, e);
              }
            })
          );
          setSignedUrls(urlMap);
        }

        // Fetch client profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', ticketData.user_id)
          .single();
        
        setClientProfile(profileData as ClientProfile | null);
      } catch (error) {
        console.error('[AdminTicketDetail] Error:', error);
        toast({ title: 'Erro ao carregar chamado', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [ticketId, toast]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!ticket || newStatus === ticket.status) return;
    setChangingStatus(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updateData: Record<string, string> = { status: newStatus };
      if (newStatus === 'resolved') updateData.resolved_at = new Date().toISOString();
      if (newStatus === 'closed') updateData.closed_at = new Date().toISOString();

      const { error } = await supabase
        .from('support_tickets')
        .update(updateData)
        .eq('id', ticketId);

      if (error) throw error;

      await supabase.from('support_ticket_logs').insert({
        ticket_id: ticketId,
        user_id: user?.id || null,
        action: 'status_changed',
        old_value: { status: ticket.status },
        new_value: { status: newStatus },
      });

      setTicket(prev => prev ? { ...prev, status: newStatus } : null);
      toast({ title: `Status alterado para "${STATUS_CONFIG[newStatus].label}"` });
    } catch (error) {
      console.error('[AdminTicketDetail] Status change error:', error);
      toast({ title: 'Erro ao alterar status', variant: 'destructive' });
    } finally {
      setChangingStatus(false);
    }
  };

  const handleSendReply = async () => {
    if (!newMessage.trim() || sending || !ticket) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data: msgData, error: msgError } = await supabase
        .from('support_messages')
        .insert([{
          ticket_id: ticketId,
          content: newMessage.trim(),
          sender_type: 'support',
          user_id: user.id,
          is_internal: false,
        }])
        .select()
        .single();

      if (msgError) throw msgError;

      setMessages(prev => [...prev, { ...msgData, sender_type: 'support' as const }]);
      setNewMessage('');

      if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
        await supabase
          .from('support_tickets')
          .update({ status: 'waiting_response' })
          .eq('id', ticketId);
        setTicket(prev => prev ? { ...prev, status: 'waiting_response' } : null);
      }

      await supabase.from('app_notifications').insert({
        user_id: ticket.user_id,
        workspace_id: ticket.workspace_id,
        category: 'system_alert',
        title: `Resposta no chamado: ${ticket.subject}`,
        body: newMessage.trim().slice(0, 200),
        action_url: `/settings?section=abrir-chamado&ticket=${ticket.id}`,
        reference_type: 'support_ticket',
        reference_id: ticket.id,
        origin_module: 'suporte',
        priority: 'normal',
      });

      try {
        await supabase.functions.invoke('support-notify', {
          body: { type: 'reply', ticket_id: ticket.id },
        });
      } catch (emailErr) {
        console.warn('[AdminTicketDetail] Email notify failed:', emailErr);
      }

      toast({ title: 'Resposta enviada e seller notificado' });
    } catch (error) {
      console.error('[AdminTicketDetail] Send error:', error);
      toast({ title: 'Erro ao enviar resposta', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
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
          <Button variant="outline" className="mt-4" onClick={onBack}>Voltar</Button>
        </CardContent>
      </Card>
    );
  }

  const statusConfig = STATUS_CONFIG[ticket.status];
  const StatusIcon = statusConfig.icon;
  const clientName = clientProfile?.full_name || clientProfile?.email || 'Seller';

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
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge variant="outline" className={statusConfig.color}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig.label}
                </Badge>
                <span className="text-xs text-muted-foreground">#{ticketId.slice(0, 8)}</span>
              </div>
              <CardTitle className="text-lg">{ticket.subject}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{clientName}</span>
                {clientProfile?.email && clientProfile?.full_name && (
                  <span className="ml-1">({clientProfile.email})</span>
                )}
                {' • '}
                Aberto {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
                {ticket.current_module && ` • ${ticket.current_module}`}
                {ticket.current_route && ` • ${ticket.current_route}`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm bg-muted/50 p-3 rounded-lg">{ticket.description}</p>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Anexos</p>
              <div className="flex flex-wrap gap-2">
                {attachments.map(att => {
                  const url = signedUrls[att.id];
                  const isImage = att.file_type.startsWith('image/');
                  if (!url) return (
                    <Badge key={att.id} variant="outline" className="gap-1.5 py-1.5 text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      <span className="max-w-[100px] truncate">{att.file_name}</span>
                      <span className="text-xs">(carregando...)</span>
                    </Badge>
                  );
                  return (
                    <a
                      key={att.id}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex"
                    >
                      {isImage ? (
                        <img
                          src={url}
                          alt={att.file_name}
                          className="h-24 w-auto rounded-md border object-cover hover:opacity-80 transition-opacity cursor-pointer"
                        />
                      ) : (
                        <Badge variant="outline" className="gap-1.5 py-1.5 cursor-pointer hover:bg-muted">
                          <FileText className="h-3 w-3" />
                          <span className="max-w-[100px] truncate">{att.file_name}</span>
                        </Badge>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status changer */}
          <div className="flex items-center gap-3 pt-2">
            <span className="text-sm font-medium">Alterar status:</span>
            <Select
              value={ticket.status}
              onValueChange={(v) => handleStatusChange(v as TicketStatus)}
              disabled={changingStatus}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Messages Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico de Mensagens</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea ref={scrollRef} className="h-[400px] pr-4">
            <div className="space-y-4">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.sender_type === 'support' ? 'justify-end' : ''}`}
                >
                  {message.sender_type !== 'support' && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className={
                        message.sender_type === 'user'
                          ? 'bg-secondary'
                          : 'bg-muted'
                      }>
                        {message.sender_type === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div className={`max-w-[80%] ${message.sender_type === 'support' ? 'items-end' : ''}`}>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-xs font-medium">
                        {message.sender_type === 'user' ? clientName : message.sender_type === 'support' ? 'Suporte' : 'Sistema'}
                      </span>
                    </div>
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        message.sender_type === 'support'
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

                  {message.sender_type === 'support' && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <Headphones className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Reply box */}
          {ticket.status !== 'closed' && (
            <>
              <Separator className="my-4" />
              <div className="flex gap-2">
                <Textarea
                  placeholder="Escreva sua resposta ao seller..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={3}
                  className="resize-none"
                  disabled={sending}
                />
                <Button
                  onClick={handleSendReply}
                  disabled={!newMessage.trim() || sending}
                  className="self-end"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
