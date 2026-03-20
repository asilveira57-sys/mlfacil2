import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Info, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface Alert {
  id: string;
  title: string;
  message_pt: string;
  severity: 'info' | 'warning' | 'critical';
  alert_type: string;
  item_id: string | null;
  campaign_id: string | null;
  created_at: string;
}

export default function SystemAlertsMini() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data } = await supabase
          .from('ads_alerts')
          .select('id, title, message_pt, severity, alert_type, item_id, campaign_id, created_at')
          .eq('user_id', session.user.id)
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false })
          .limit(3);

        setAlerts((data || []).map(a => ({
          id: a.id,
          title: a.title,
          message_pt: a.message_pt,
          severity: a.severity as Alert['severity'],
          alert_type: a.alert_type,
          item_id: a.item_id,
          campaign_id: a.campaign_id,
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

  const handleAlertClick = (alert: Alert) => {
    navigate('/ads');
  };

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
      case 'critical': return <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />;
      case 'warning': return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
      default: return <Info className="h-3.5 w-3.5 text-primary shrink-0" />;
    }
  };

  return (
    <div className="space-y-1.5 py-1">
      {alerts.map(alert => (
        <button
          key={alert.id}
          onClick={() => handleAlertClick(alert)}
          className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors w-full text-left group cursor-pointer"
        >
          {getIcon(alert.severity)}
          <div className="flex-1 min-w-0">
            <span className="text-xs text-foreground leading-tight line-clamp-2">
              {alert.message_pt || alert.title}
            </span>
          </div>
          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
        </button>
      ))}
    </div>
  );
}