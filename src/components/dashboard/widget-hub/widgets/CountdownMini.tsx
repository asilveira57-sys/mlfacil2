import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Pause, RotateCcw } from 'lucide-react';

export default function CountdownMini() {
  const [total, setTotal] = useState(300); // 5 min
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (running && remaining > 0) {
      ref.current = setInterval(() => setRemaining(r => { if (r <= 1) { setRunning(false); return 0; } return r - 1; }), 1000);
    } else clearInterval(ref.current);
    return () => clearInterval(ref.current);
  }, [running, remaining]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="text-center py-2">
      {!running && remaining === total ? (
        <div className="flex items-center justify-center gap-2">
          <Input type="number" value={Math.floor(total / 60)} onChange={e => { const v = Number(e.target.value) * 60; setTotal(v); setRemaining(v); }} className="h-8 w-16 text-center text-sm" min={1} max={999} />
          <span className="text-xs text-muted-foreground">min</span>
        </div>
      ) : (
        <div className="text-3xl font-mono font-bold tabular-nums text-foreground">{fmt(remaining)}</div>
      )}
      <div className="flex justify-center gap-2 mt-2">
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setRunning(r => !r)} disabled={remaining === 0 && !running}>
          {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setRunning(false); setRemaining(total); }}>
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
