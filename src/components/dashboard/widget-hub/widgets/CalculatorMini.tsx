import { useState } from 'react';
import { Button } from '@/components/ui/button';

const BUTTONS = ['7','8','9','÷','4','5','6','×','1','2','3','-','C','0','=','+'];

export default function CalculatorMini() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);

  const handle = (b: string) => {
    if (b === 'C') { setDisplay('0'); setPrev(null); setOp(null); return; }
    if ('0123456789'.includes(b)) {
      setDisplay(d => d === '0' ? b : d + b);
      return;
    }
    if (b === '=') {
      if (prev !== null && op) {
        const cur = parseFloat(display);
        let r = 0;
        if (op === '+') r = prev + cur;
        else if (op === '-') r = prev - cur;
        else if (op === '×') r = prev * cur;
        else if (op === '÷') r = cur !== 0 ? prev / cur : 0;
        setDisplay(String(parseFloat(r.toFixed(8))));
        setPrev(null); setOp(null);
      }
      return;
    }
    setPrev(parseFloat(display));
    setOp(b);
    setDisplay('0');
  };

  return (
    <div>
      <div className="bg-muted/50 rounded-md px-3 py-2 mb-2 text-right text-lg font-mono text-foreground tabular-nums truncate">
        {display}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {BUTTONS.map(b => (
          <Button key={b} variant={('÷×-+=').includes(b) ? 'secondary' : b === 'C' ? 'destructive' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => handle(b)}>
            {b}
          </Button>
        ))}
      </div>
    </div>
  );
}
