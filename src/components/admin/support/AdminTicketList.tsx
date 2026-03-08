/**
 * Admin Ticket List
 * Shows all tickets across all workspaces with filters
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Headphones,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TicketStatus = 'open' | 'in_progress' | 'waiting_response' | 'resolved' | 'closed';

interface AdminTicket {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: string;
  created_at: string;
  updated_at: string;
  current_module: string | null;
  user_id: string;
  workspace_id: string;
}

interface AdminTicketListProps {
  onSelectTicket: (ticketId: string) => void;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Aberto', color: 'bg-blue-500/10 text-blue-600 border-blue-200', icon: Clock },
  in_progress: { label: 'Em atendimento', color: 'bg-amber-500/10 text-amber-600 border-amber-200', icon: AlertCircle },
  waiting_response: { label: 'Aguard. resposta', color: 'bg-purple-500/10 text-purple-600 border-purple-200', icon: MessageSquare },
  resolved: { label: 'Resolvido', color: 'bg-green-500/10 text-green-600 border-green-200', icon: CheckCircle2 },
  closed: { label: 'Finalizado', color: 'bg-muted text-muted-foreground border-muted', icon: CheckCircle2 },
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Erro',
  question: 'Dúvida',
  suggestion: 'Sugestão',
  financial: 'Financeiro',
  integration: 'Integração',
  other: 'Outro',
};

export function AdminTicketList({ onSelectTicket }: AdminTicketListProps) {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');

  const fetchTickets = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('support_tickets')
        .select('id, subject, category, status, priority, created_at, updated_at, current_module, user_id, workspace_id')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTickets((data || []) as AdminTicket[]);
    } catch (error) {
      console.error('[AdminTicketList] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  const filteredTickets = tickets.filter(ticket =>
    ticket.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const counts = {
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    waiting_response: tickets.filter(t => t.status === 'waiting_response').length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Abertos</div>
          <div className="text-2xl font-bold text-blue-600">{counts.open}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Em atendimento</div>
          <div className="text-2xl font-bold text-amber-600">{counts.in_progress}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Aguardando resposta</div>
          <div className="text-2xl font-bold text-purple-600">{counts.waiting_response}</div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Headphones className="h-5 w-5" />
                Chamados de Suporte
              </CardTitle>
              <CardDescription>
                Gerencie todos os chamados abertos pelos sellers
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchTickets} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
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
              <SelectTrigger className="w-[200px]">
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
              <Headphones className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum chamado encontrado</p>
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
                {filteredTickets.map((ticket) => {
                  const statusCfg = STATUS_CONFIG[ticket.status];
                  const StatusIcon = statusCfg.icon;
                  return (
                    <TableRow
                      key={ticket.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelectTicket(ticket.id)}
                    >
                      <TableCell className="font-medium max-w-[250px] truncate">
                        {ticket.subject}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {CATEGORY_LABELS[ticket.category] || ticket.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusCfg.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
