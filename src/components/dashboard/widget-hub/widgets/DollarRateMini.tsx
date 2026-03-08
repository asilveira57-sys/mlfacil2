import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

interface RateData {
  bid: string;
  ask: string;
  pctChange: string;
  high: string;
  low: string;
  timestamp: string;
}

export default function DollarRateMini() {
  const [rate, setRate] = useState<RateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchRate = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL');
      const data = await res.json();
      if (data.USDBRL) {
        setRate({
          bid: parseFloat(data.USDBRL.bid).toFixed(2),
          ask: parseFloat(data.USDBRL.ask).toFixed(2),
          pctChange: data.USDBRL.pctChange,
          high: parseFloat(data.USDBRL.high).toFixed(2),
          low: parseFloat(data.USDBRL.low).toFixed(2),
          timestamp: data.USDBRL.create_date,
        });
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRate();
    const interval = setInterval(fetchRate, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading && !rate) {
    return (
      <div className="flex items-center gap-3 py-2 animate-pulse">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="space-y-1.5">
          <div className="h-5 w-20 rounded bg-muted" />
          <div className="h-3 w-32 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !rate) {
    return (
      <div className="flex items-center gap-3 py-2">
        <DollarSign className="h-8 w-8 text-muted-foreground" />
        <div>
          <div className="text-sm text-muted-foreground">Erro ao carregar cotação</div>
          <button onClick={fetchRate} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
            <RefreshCw className="h-3 w-3" /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const change = parseFloat(rate.pctChange);
  const isPositive = change >= 0;

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
        <DollarSign className="h-5 w-5 text-green-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-foreground">R$ {rate.bid}</span>
          <span className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isPositive ? '+' : ''}{rate.pctChange}%
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-2">
          <span>Mín: R$ {rate.low}</span>
          <span>•</span>
          <span>Máx: R$ {rate.high}</span>
        </div>
      </div>
    </div>
  );
}
