import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StarRating } from '@/components/ratings/StarRating';
import { useAdminSystemFeedback, useAdminModuleFeedback } from '@/hooks/useFeedback';
import { useMemo } from 'react';

export function AdminFeedbackOverview() {
  const { data: systemFeedback = [] } = useAdminSystemFeedback();
  const { data: moduleFeedback = [] } = useAdminModuleFeedback();

  const systemStats = useMemo(() => {
    if (systemFeedback.length === 0) return null;
    const avg = systemFeedback.reduce((sum, f) => sum + f.rating, 0) / systemFeedback.length;
    const dist = [1, 2, 3, 4, 5].map(s => systemFeedback.filter(f => f.rating === s).length);
    return { avg, count: systemFeedback.length, dist };
  }, [systemFeedback]);

  const moduleStats = useMemo(() => {
    const grouped: Record<string, { total: number; sum: number; count: number }> = {};
    for (const f of moduleFeedback) {
      if (!grouped[f.module_slug]) grouped[f.module_slug] = { total: 0, sum: 0, count: 0 };
      grouped[f.module_slug].total++;
      grouped[f.module_slug].sum += f.rating;
      grouped[f.module_slug].count++;
    }
    return Object.entries(grouped)
      .map(([slug, s]) => ({ slug, avg: s.sum / s.count, count: s.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [moduleFeedback]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Avaliação Geral do Sistema</CardTitle>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Média por Módulo</CardTitle>
        </CardHeader>
        <CardContent>
          {moduleStats.length > 0 ? (
            <div className="space-y-2">
              {moduleStats.map(m => (
                <div key={m.slug} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
  );
}
