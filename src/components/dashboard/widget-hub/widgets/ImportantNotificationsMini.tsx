import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  read: boolean;
}

export default function ImportantNotificationsMini() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Try to fetch from notifications table if it exists
        const { data } = await supabase
          .from('notifications')
          .select('id, title, body, created_at, read')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(3);

        setNotifications((data || []) as Notification[]);
      } catch {
        // Table may not exist, silently fail
        setNotifications([]);
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

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-3 text-muted-foreground">
        <CheckCircle2 className="h-8 w-8 mb-1.5 text-green-500/60" />
        <span className="text-xs">Tudo em dia! Sem notificações.</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 py-1">
      {notifications.map(n => (
        <div key={n.id} className="flex items-start gap-2 px-2 py-1 rounded-md bg-muted/30">
          {n.read ? (
            <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground leading-tight line-clamp-1">{n.title}</p>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
