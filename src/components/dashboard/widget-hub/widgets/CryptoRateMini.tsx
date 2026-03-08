import { useState, useEffect } from 'react';
import { Bitcoin, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

interface CryptoData {
  name: string;
  symbol: string;
  price: number;
  change24h: number;
}

const COINS = ['bitcoin', 'ethereum'];

export default function CryptoRateMini() {
  const [coins, setCoins] = useState<CryptoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchPrices = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${COINS.join(',')}&vs_currencies=brl&include_24hr_change=true`
      );
      const data = await res.json();
      
      const result: CryptoData[] = [];
      if (data.bitcoin) {
        result.push({
          name: 'Bitcoin',
          symbol: 'BTC',
          price: data.bitcoin.brl,
          change24h: data.bitcoin.brl_24h_change ?? 0,
        });
      }
      if (data.ethereum) {
        result.push({
          name: 'Ethereum',
          symbol: 'ETH',
          price: data.ethereum.brl,
          change24h: data.ethereum.brl_24h_change ?? 0,
        });
      }
      setCoins(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 120000); // 2 min
    return () => clearInterval(interval);
  }, []);

  const formatBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

  if (loading && coins.length === 0) {
    return (
      <div className="space-y-2 py-1 animate-pulse">
        {[0, 1].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted" />
            <div className="space-y-1">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || coins.length === 0) {
    return (
      <div className="flex items-center gap-3 py-2">
        <Bitcoin className="h-8 w-8 text-muted-foreground" />
        <div>
          <div className="text-sm text-muted-foreground">Erro ao carregar cripto</div>
          <button onClick={fetchPrices} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
            <RefreshCw className="h-3 w-3" /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 py-1">
      {coins.map(coin => {
        const isPositive = coin.change24h >= 0;
        return (
          <div key={coin.symbol} className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
              coin.symbol === 'BTC' ? 'bg-orange-500/10' : 'bg-indigo-500/10'
            }`}>
              <span className={`text-xs font-bold ${
                coin.symbol === 'BTC' ? 'text-orange-500' : 'text-indigo-500'
              }`}>{coin.symbol}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{formatBRL(coin.price)}</span>
                <span className={`flex items-center gap-0.5 text-[10px] font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                  {isPositive ? '+' : ''}{coin.change24h.toFixed(1)}%
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">{coin.name} • 24h</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
