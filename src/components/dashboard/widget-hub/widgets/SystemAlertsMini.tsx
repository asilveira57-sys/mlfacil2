import { useState, useEffect } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Alert {
  id: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
}

export default function SystemAlertsMini() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data } = await supabase
          .from('ads_alerts')
          .select('id, title, severity, created_at')
          .eq('user_id', session.user.id)
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false })
          .limit(3);

        setAlerts((data || []).map(a => ({
          id: a.id,
          title: a.title,
          severity: a.severity as Alert['severity'],
          created_at: a.created_at,
        })));
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2 py-1 animate-pulse">
        {[0, 1].map(i => <div key={i} className="h-6 rounded bg-muted" />)}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-3 text-muted-foreground">
        <CheckCircle2 className="h-8 w-8 mb-1.5 text-green-500/60" />
        <span className="text-xs">Nenhum alerta pendente</span>
      </div>
    );
  }

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
      case 'warning': return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
      default: return <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    }
  };

  return (
    <div className="space-y-1.5 py-1">
      {alerts.map(alert => (
        <div key={alert.id} className="flex items-start gap-2 px-2 py-1 rounded-md bg-muted/30">
          {getIcon(alert.severity)}
          <span className="text-xs text-foreground leading-tight line-clamp-2">{alert.title}</span>
        </div>
      ))}
    </div>
  );
}
