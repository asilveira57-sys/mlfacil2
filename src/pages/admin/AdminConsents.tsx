import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Shield, Download, Loader2, Clock, Search, FileText, Cookie, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { generateConsentPdf } from '@/lib/cookies/api';

interface ConsentRow {
  id: string;
  user_id: string;
  consent_scope: string;
  consent_type: string;
  document_version: string;
  accepted_at: string;
  ip_address: string | null;
  source: string;
  pdf_path: string | null;
  performance: boolean | null;
  analytics: boolean | null;
}

const PAGE_SIZE = 50;

export function AdminConsents() {
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchConsents = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('user_consents')
        .select('id, user_id, consent_scope, consent_type, document_version, accepted_at, ip_address, source, pdf_path, performance, analytics', { count: 'exact' })
        .order('accepted_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (scopeFilter !== 'all') {
        query = query.eq('consent_scope', scopeFilter);
      }

      if (search.trim()) {
        query = query.or(`user_id.eq.${search.trim()},ip_address.ilike.%${search.trim()}%,source.ilike.%${search.trim()}%`);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setConsents(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Failed to fetch consents:', err);
      toast.error('Erro ao carregar consentimentos');
    } finally {
      setLoading(false);
    }
  }, [page, scopeFilter, search]);

  useEffect(() => {
    fetchConsents();
  }, [fetchConsents]);

  const handleDownloadPdf = async (consentId: string) => {
    setDownloadingId(consentId);
    try {
      const url = await generateConsentPdf(consentId);
      if (url) {
        toast.success('PDF gerado com sucesso!');
        fetchConsents();
      } else {
        toast.error('Erro ao gerar PDF');
      }
    } catch {
      toast.error('Erro ao gerar PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch {
      return iso;
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const stats = {
    total: totalCount,
    cookies: consents.filter(c => c.consent_scope === 'cookies').length,
    terms: consents.filter(c => c.consent_scope === 'terms').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalCount}</p>
                <p className="text-xs text-muted-foreground">Total de Consentimentos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Cookie className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.cookies}</p>
                <p className="text-xs text-muted-foreground">Cookies (página atual)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.terms}</p>
                <p className="text-xs text-muted-foreground">Termos (página atual)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Auditoria Global de Consentimentos
          </CardTitle>
          <CardDescription>Visualize todos os consentimentos registrados na plataforma</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por user ID, IP ou origem..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={scopeFilter} onValueChange={(v) => { setScopeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os escopos</SelectItem>
                <SelectItem value="cookies">Cookies</SelectItem>
                <SelectItem value="terms">Termos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : consents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum consentimento encontrado.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Escopo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Versão</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead className="text-right">PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consents.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs font-mono max-w-[120px] truncate" title={c.user_id}>
                          {c.user_id.slice(0, 8)}…
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.consent_scope === 'cookies' ? 'default' : 'secondary'}>
                            {c.consent_scope === 'cookies' ? 'Cookies' : 'Termos'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{c.consent_type}</TableCell>
                        <TableCell className="text-sm">{c.document_version}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          <Clock className="inline h-3 w-3 mr-1" />
                          {formatDate(c.accepted_at)}
                        </TableCell>
                        <TableCell className="text-sm">{c.source}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.ip_address || '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownloadPdf(c.id)}
                            disabled={downloadingId === c.id}
                          >
                            {downloadingId === c.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      Anterior
                    </Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminConsents;
