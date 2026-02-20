import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StarRating } from '@/components/ratings/StarRating';
import { useAdminSystemFeedback, useAdminModuleFeedback, useAdminTestimonials } from '@/hooks/useFeedback';
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { Star, TrendingUp, MessageSquare, Users, Award, ThumbsUp } from 'lucide-react';
import { format, subDays, startOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function KpiCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminFeedbackOverview() {
  const { data: systemFeedback = [] } = useAdminSystemFeedback();
  const { data: moduleFeedback = [] } = useAdminModuleFeedback();
  const { testimonials = [] } = useAdminTestimonials();

  // ── System Stats ──
  const systemStats = useMemo(() => {
    if (systemFeedback.length === 0) return null;
    const avg = systemFeedback.reduce((s, f) => s + f.rating, 0) / systemFeedback.length;
    const dist = [1, 2, 3, 4, 5].map(s => systemFeedback.filter(f => f.rating === s).length);
    
    // NPS from nps field or derive from rating
    const npsResponses = systemFeedback.filter(f => f.nps != null);
    let nps: number | null = null;
    if (npsResponses.length > 0) {
      const promoters = npsResponses.filter(f => (f.nps ?? 0) >= 9).length;
      const detractors = npsResponses.filter(f => (f.nps ?? 0) <= 6).length;
      nps = Math.round(((promoters - detractors) / npsResponses.length) * 100);
    }

    const withComments = systemFeedback.filter(f => f.comment && f.comment.trim().length > 0).length;
    const commentRate = Math.round((withComments / systemFeedback.length) * 100);

    return { avg, count: systemFeedback.length, dist, nps, commentRate, withComments };
  }, [systemFeedback]);

  // ── Module Stats ──
  const moduleStats = useMemo(() => {
    const grouped: Record<string, { sum: number; count: number }> = {};
    for (const f of moduleFeedback) {
      if (!grouped[f.module_slug]) grouped[f.module_slug] = { sum: 0, count: 0 };
      grouped[f.module_slug].sum += f.rating;
      grouped[f.module_slug].count++;
    }
    return Object.entries(grouped)
      .map(([slug, s]) => ({ slug, avg: s.sum / s.count, count: s.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [moduleFeedback]);

  // ── Daily Trend (last 30 days) ──
  const dailyTrend = useMemo(() => {
    const allFeedback = [
      ...systemFeedback.map(f => ({ date: f.created_at, rating: f.rating })),
      ...moduleFeedback.map(f => ({ date: f.created_at, rating: f.rating })),
    ];
    const today = startOfDay(new Date());
    const days: { date: string; label: string; count: number; avgRating: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const day = subDays(today, i);
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayItems = allFeedback.filter(f => format(parseISO(f.date), 'yyyy-MM-dd') === dayStr);
      days.push({
        date: dayStr,
        label: format(day, 'dd/MM'),
        count: dayItems.length,
        avgRating: dayItems.length > 0 ? dayItems.reduce((s, f) => s + f.rating, 0) / dayItems.length : 0,
      });
    }
    return days;
  }, [systemFeedback, moduleFeedback]);

  // ── Module bar chart data ──
  const moduleBarData = useMemo(() => {
    return moduleStats.slice(0, 8).map(m => ({
      name: m.slug.replace(/-/g, ' ').slice(0, 15),
      avg: Number(m.avg.toFixed(1)),
      count: m.count,
    }));
  }, [moduleStats]);

  const totalFeedback = systemFeedback.length + moduleFeedback.length;
  const totalPublished = testimonials.filter(t => t.published).length;
  const totalFeatured = testimonials.filter(t => t.featured).length;

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={MessageSquare} label="Total de Avaliações" value={String(totalFeedback)} />
        <KpiCard icon={Star} label="Média Geral" value={systemStats ? systemStats.avg.toFixed(1) : '—'} />
        <KpiCard icon={TrendingUp} label="NPS" value={systemStats?.nps != null ? `${systemStats.nps > 0 ? '+' : ''}${systemStats.nps}` : '—'} />
        <KpiCard icon={Users} label="Com Comentário" value={systemStats ? `${systemStats.commentRate}%` : '—'} sub={systemStats ? `${systemStats.withComments} de ${systemStats.count}` : undefined} />
        <KpiCard icon={Award} label="Depoimentos Publicados" value={String(totalPublished)} />
        <KpiCard icon={ThumbsUp} label="Destaques" value={String(totalFeatured)} />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Daily Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Avaliações por Dia (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} className="text-muted-foreground" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value: number, name: string) =>
                      name === 'count' ? [value, 'Avaliações'] : [value.toFixed(1), 'Média']
                    }
                  />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Module Avg Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Média por Módulo</CardTitle>
          </CardHeader>
          <CardContent>
            {moduleBarData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moduleBarData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [v.toFixed(1), 'Média']} contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma avaliação de módulo ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Distribution & Modules Detail ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Star Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Distribuição de Estrelas (Sistema)</CardTitle>
          </CardHeader>
          <CardContent>
            {systemStats ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <p className="text-4xl font-bold">{systemStats.avg.toFixed(1)}</p>
                  <div>
                    <StarRating value={Math.round(systemStats.avg)} readOnly size="md" />
                    <p className="text-sm text-muted-foreground mt-1">{systemStats.count} avaliações</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {[5, 4, 3, 2, 1].map(s => {
                    const count = systemStats.dist[s - 1];
                    const pct = systemStats.count > 0 ? (count / systemStats.count) * 100 : 0;
                    return (
                      <div key={s} className="flex items-center gap-2 text-sm">
                        <span className="w-3 text-muted-foreground">{s}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs text-muted-foreground">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma avaliação ainda.</p>
            )}
          </CardContent>
        </Card>

        {/* Top Modules Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ranking de Módulos</CardTitle>
          </CardHeader>
          <CardContent>
            {moduleStats.length > 0 ? (
              <div className="space-y-2">
                {moduleStats.map((m, i) => (
                  <div key={m.slug} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}.</span>
                      <span className="text-sm font-medium">{m.slug}</span>
                      <StarRating value={Math.round(m.avg)} readOnly size="sm" />
                    </div>
                    <span className="text-xs text-muted-foreground">{m.avg.toFixed(1)} ({m.count})</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma avaliação de módulo.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
