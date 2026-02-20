import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StarRating } from '@/components/ratings/StarRating';
import { StarsDistribution } from '@/components/ratings/StarsDistribution';
import {
  useSystemRatingStats,
  useAdminAllRatings,
  useAdminTestimonialCandidates,
  useAdminPublicTestimonials,
} from '@/hooks/useRatings';
import { Eye, EyeOff, Check, X, Send, Archive, Star } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export function AdminRatings() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Avaliações & Depoimentos</h2>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="system">Sistema</TabsTrigger>
          <TabsTrigger value="modules">Módulos</TabsTrigger>
          <TabsTrigger value="candidates">Candidatos</TabsTrigger>
          <TabsTrigger value="published">Publicados</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="system"><SystemRatingsTab /></TabsContent>
        <TabsContent value="modules"><ModuleRatingsTab /></TabsContent>
        <TabsContent value="candidates"><CandidatesTab /></TabsContent>
        <TabsContent value="published"><PublishedTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab() {
  const { data: stats } = useSystemRatingStats();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Avaliação Geral do Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          {stats && stats.ratings_count > 0 ? (
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-4xl font-bold">{Number(stats.avg_stars).toFixed(1)}</p>
                <StarRating value={Math.round(Number(stats.avg_stars))} readOnly size="md" />
                <p className="text-sm text-muted-foreground mt-1">{stats.ratings_count} avaliações</p>
              </div>
              <div className="flex-1">
                <StarsDistribution stats={stats} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma avaliação ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SystemRatingsTab() {
  const { systemRatings, loadingSystemRatings, toggleHidden } = useAdminAllRatings();

  if (loadingSystemRatings) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-3">
      {systemRatings.map((r: any) => (
        <Card key={r.id}>
          <CardContent className="pt-4 flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <StarRating value={r.stars} readOnly size="sm" />
                {r.is_hidden_by_admin && <Badge variant="destructive" className="text-xs">Oculto</Badge>}
              </div>
              {r.comment && <p className="text-sm">{r.comment}</p>}
              <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                toggleHidden.mutate({ table: 'system_ratings', id: r.id, hidden: !r.is_hidden_by_admin });
                toast.success(r.is_hidden_by_admin ? 'Avaliação visível' : 'Avaliação ocultada');
              }}
            >
              {r.is_hidden_by_admin ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </CardContent>
        </Card>
      ))}
      {systemRatings.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma avaliação do sistema.</p>}
    </div>
  );
}

function ModuleRatingsTab() {
  const { moduleRatings, loadingModuleRatings, toggleHidden } = useAdminAllRatings();

  if (loadingModuleRatings) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-3">
      {moduleRatings.map((r: any) => (
        <Card key={r.id}>
          <CardContent className="pt-4 flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <StarRating value={r.stars} readOnly size="sm" />
                {r.is_hidden_by_admin && <Badge variant="destructive" className="text-xs">Oculto</Badge>}
              </div>
              {r.comment && <p className="text-sm">{r.comment}</p>}
              <p className="text-xs text-muted-foreground">Módulo: {r.module_id} · {format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                toggleHidden.mutate({ table: 'module_ratings', id: r.id, hidden: !r.is_hidden_by_admin });
                toast.success(r.is_hidden_by_admin ? 'Visível' : 'Ocultado');
              }}
            >
              {r.is_hidden_by_admin ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </CardContent>
        </Card>
      ))}
      {moduleRatings.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma avaliação de módulo.</p>}
    </div>
  );
}

function CandidatesTab() {
  const { candidates, isLoading, updateStatus, publish } = useAdminTestimonialCandidates();

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    published: 'bg-blue-100 text-blue-800',
    archived: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-3">
      {candidates.map((c: any) => (
        <Card key={c.id}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StarRating value={c.stars} readOnly size="sm" />
                <Badge className={statusColors[c.status] || ''}>{c.status}</Badge>
              </div>
              <div className="flex gap-1">
                {c.status === 'pending' && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => { updateStatus.mutate({ id: c.id, status: 'approved' }); toast.success('Aprovado'); }}>
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { updateStatus.mutate({ id: c.id, status: 'rejected' }); toast.success('Rejeitado'); }}>
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </>
                )}
                {c.status === 'approved' && (
                  <Button size="sm" variant="ghost" onClick={() => { publish.mutate(c); toast.success('Publicado'); }}>
                    <Send className="h-4 w-4 text-blue-600" />
                  </Button>
                )}
                {['approved', 'published'].includes(c.status) && (
                  <Button size="sm" variant="ghost" onClick={() => { updateStatus.mutate({ id: c.id, status: 'archived' }); toast.success('Arquivado'); }}>
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {c.text && <p className="text-sm">{c.text}</p>}
            <p className="text-xs text-muted-foreground">
              Canais: {c.suggested_channels?.join(', ')} · {format(new Date(c.created_at), 'dd/MM/yyyy')}
            </p>
          </CardContent>
        </Card>
      ))}
      {candidates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum candidato a depoimento.</p>}
    </div>
  );
}

function PublishedTab() {
  const { testimonials, isLoading, toggleActive } = useAdminPublicTestimonials();

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-3">
      {testimonials.map((t: any) => (
        <Card key={t.id}>
          <CardContent className="pt-4 flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <StarRating value={t.stars} readOnly size="sm" />
                <Badge variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              <p className="text-sm">{t.text}</p>
              <p className="text-xs text-muted-foreground">
                {t.display_name || 'Anônimo'} {t.display_company && `· ${t.display_company}`} · Canais: {t.channels?.join(', ')}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                toggleActive.mutate({ id: t.id, isActive: !t.is_active });
                toast.success(t.is_active ? 'Desativado' : 'Ativado');
              }}
            >
              {t.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </CardContent>
        </Card>
      ))}
      {testimonials.length === 0 && <p className="text-sm text-muted-foreground">Nenhum depoimento publicado.</p>}
    </div>
  );
}
