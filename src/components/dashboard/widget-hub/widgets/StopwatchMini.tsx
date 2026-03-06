import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw } from 'lucide-react';

export default function StopwatchMini() {
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (running) ref.current = setInterval(() => setMs(p => p + 10), 10);
    else clearInterval(ref.current);
    return () => clearInterval(ref.current);
  }, [running]);

  const fmt = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  };

  return (
    <div className="text-center py-2">
      <div className="text-2xl font-mono font-bold tabular-nums text-foreground">{fmt(ms)}</div>
      <div className="flex justify-center gap-2 mt-2">
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setRunning(r => !r)}>
          {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setRunning(false); setMs(0); }}>
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
