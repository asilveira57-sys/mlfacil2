import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DayRow {
  dia: string;
  contas_unicas: number;
  total_eventos: number;
}

interface TopUser {
  email: string | null;
  full_name: string | null;
  logins: number;
}

export function LoginActivityCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-login-activity'],
    queryFn: async () => {
      // Pull last 8 days of login_events; aggregate client-side in BRT
      const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const { data: events, error } = await supabase
        .from('login_events')
        .select('user_id, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const byDay = new Map<string, { users: Set<string>; total: number }>();
      const todayBrt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      todayBrt.setHours(0, 0, 0, 0);
      const todayKey = todayBrt.toISOString().slice(0, 10);
      const todayUserCounts = new Map<string, number>();

      for (const e of events ?? []) {
        // Convert UTC -> BRT day key
        const d = new Date(new Date(e.created_at).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const bucket = byDay.get(key) ?? { users: new Set<string>(), total: 0 };
        bucket.users.add(e.user_id);
        bucket.total += 1;
        byDay.set(key, bucket);
        if (key === todayKey) {
          todayUserCounts.set(e.user_id, (todayUserCounts.get(e.user_id) ?? 0) + 1);
        }
      }

      const days: DayRow[] = Array.from(byDay.entries())
        .map(([dia, v]) => ({ dia, contas_unicas: v.users.size, total_eventos: v.total }))
        .sort((a, b) => (a.dia < b.dia ? 1 : -1))
        .slice(0, 7);

      // Fetch top users today (names)
      const topIds = Array.from(todayUserCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      let topUsers: TopUser[] = [];
      if (topIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', topIds.map(([id]) => id));
        topUsers = topIds.map(([id, logins]) => {
          const p = profiles?.find((x) => x.id === id);
          return { email: p?.email ?? null, full_name: p?.full_name ?? null, logins };
        });
      }

      const today = byDay.get(todayKey);
      return {
        days,
        todayUnique: today?.users.size ?? 0,
        todayTotal: today?.total ?? 0,
        topUsers,
      };
    },
    staleTime: 60_000,
  });

  const maxDay = Math.max(1, ...(data?.days.map((d) => d.contas_unicas) ?? [1]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Atividade de Login (últimos 7 dias)
        </CardTitle>
        <CardDescription>
          Contas únicas que acessaram o MKTP Fácil por dia (horário BRT)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-6">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-primary">{data?.todayUnique ?? 0}</span>
              <span className="text-sm text-muted-foreground">
                contas únicas hoje · {data?.todayTotal ?? 0} eventos
              </span>
            </div>

            <div className="space-y-2">
              {data?.days.map((d) => {
                const [y, m, day] = d.dia.split('-');
                const label = `${day}/${m}`;
                const widthPct = (d.contas_unicas / maxDay) * 100;
                return (
                  <div key={d.dia} className="flex items-center gap-3 text-sm">
                    <span className="w-12 text-muted-foreground tabular-nums">{label}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-primary/80 flex items-center justify-end pr-2 text-xs text-primary-foreground font-medium"
                        style={{ width: `${Math.max(widthPct, 6)}%` }}
                      >
                        {d.contas_unicas}
                      </div>
                    </div>
                    <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                      {d.total_eventos} ev.
                    </span>
                  </div>
                );
              })}
            </div>

            {data && data.topUsers.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Mais ativos hoje</p>
                <div className="space-y-1">
                  {data.topUsers.map((u, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="truncate mr-2">
                        {u.full_name ?? u.email ?? 'Conta sem nome'}
                      </span>
                      <Badge variant="secondary">{u.logins} login(s)</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
