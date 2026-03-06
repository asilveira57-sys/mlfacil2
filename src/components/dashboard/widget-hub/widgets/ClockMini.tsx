import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ClockMini() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="text-center py-2">
      <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
        {format(now, 'HH:mm:ss')}
      </div>
      <div className="text-xs text-muted-foreground mt-1 capitalize">
        {format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })}
      </div>
    </div>
  );
}
