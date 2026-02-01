/**
 * Support Ticket List
 * Panel showing all user tickets with filters
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Filter,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TicketStatus = 'open' | 'in_progress' | 'waiting_response' | 'resolved' | 'closed';
type TicketCategory = 'bug' | 'question' | 'suggestion' | 'financial' | 'integration' | 'other';

interface Ticket {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: string;
  created_at: string;
  updated_at: string;
  current_module: string | null;
}

interface SupportTicketListProps {
  onSelectTicket: (ticketId: string) => void;
  onCreateTicket: () => void;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Aberto', color: 'bg-blue-500/10 text-blue-600 border-blue-200', icon: Clock },
  in_progress: { label: 'Em atendimento', color: 'bg-amber-500/10 text-amber-600 border-amber-200', icon: AlertCircle },
  waiting_response: { label: 'Aguardando resposta', color: 'bg-purple-500/10 text-purple-600 border-purple-200', icon: MessageSquare },
  resolved: { label: 'Resolvido', color: 'bg-green-500/10 text-green-600 border-green-200', icon: CheckCircle2 },
  closed: { label: 'Finalizado', color: 'bg-muted text-muted-foreground border-muted', icon: CheckCircle2 },
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: 'Erro',
  question: 'Dúvida',
  suggestion: 'Sugestão',
  financial: 'Financeiro',
  integration: 'Integração',
  other: 'Outro',
};

export function SupportTicketList({ onSelectTicket, onCreateTicket }: SupportTicketListProps) {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');

  useEffect(() => {
    const fetchTickets = async () => {
      if (!currentWorkspace) return;
      
      setLoading(true);
      try {
        let query = supabase
          .from('support_tickets')
          .select('id, subject, category, status, priority, created_at, updated_at, current_module')
          .eq('workspace_id', currentWorkspace.id)
          .order('created_at', { ascending: false });

        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        setTickets(data || []);
      } catch (error) {
        console.error('[SupportTicketList] Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [currentWorkspace, statusFilter]);

  const filteredTickets = tickets.filter(ticket =>
    ticket.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: TicketStatus) => {
    const config = STATUS_CONFIG[status];
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Meus Chamados</CardTitle>
            <CardDescription>
              Acompanhe o status dos seus chamados de suporte
            </CardDescription>
          </div>
          <Button onClick={onCreateTicket} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Chamado
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por assunto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TicketStatus | 'all')}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== 'all' 
                ? 'Nenhum chamado encontrado com os filtros aplicados'
                : 'Você ainda não possui chamados de suporte'
              }
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button variant="outline" className="mt-4" onClick={onCreateTicket}>
                Abrir primeiro chamado
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assunto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Criado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectTicket(ticket.id)}
                >
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {ticket.subject}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {CATEGORY_LABELS[ticket.category]}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {ticket.current_module || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(ticket.created_at), { 
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
