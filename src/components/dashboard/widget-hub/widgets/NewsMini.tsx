import { useState, useEffect } from 'react';
import { Newspaper, ExternalLink, RefreshCw } from 'lucide-react';

interface NewsItem {
  title: string;
  link: string;
  source: string;
}

export default function NewsMini() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchNews = async () => {
    setLoading(true);
    setError(false);
    try {
      // Using AwesomeAPI news endpoint for Brazil finance news
      const res = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL');
      const data = await res.json();
      
      // Generate news items from live market data
      const items: NewsItem[] = [];
      
      if (data.USDBRL) {
        const change = parseFloat(data.USDBRL.pctChange);
        items.push({
          title: `Dólar ${change >= 0 ? 'sobe' : 'cai'} ${Math.abs(change).toFixed(1)}% e fecha a R$ ${parseFloat(data.USDBRL.bid).toFixed(2)}`,
          link: 'https://www.google.com/search?q=cotação+dólar+hoje',
          source: 'Mercado Financeiro',
        });
      }
      
      if (data.EURBRL) {
        const change = parseFloat(data.EURBRL.pctChange);
        items.push({
          title: `Euro ${change >= 0 ? 'avança' : 'recua'} ${Math.abs(change).toFixed(1)}% frente ao real`,
          link: 'https://www.google.com/search?q=cotação+euro+hoje',
          source: 'Câmbio',
        });
      }

      if (data.BTCBRL) {
        const price = parseFloat(data.BTCBRL.bid);
        items.push({
          title: `Bitcoin cotado a ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(price)}`,
          link: 'https://www.google.com/search?q=bitcoin+preço+hoje',
          source: 'Criptomoedas',
        });
      }

      setNews(items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 300000); // 5 min
    return () => clearInterval(interval);
  }, []);

  if (loading && news.length === 0) {
    return (
      <div className="space-y-2 py-1 animate-pulse">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-8 rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 py-2">
        <Newspaper className="h-8 w-8 text-muted-foreground" />
        <div>
          <div className="text-sm text-muted-foreground">Erro ao carregar notícias</div>
          <button onClick={fetchNews} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
            <RefreshCw className="h-3 w-3" /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-1">
      {news.map((item, idx) => (
        <a
          key={idx}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block group"
        >
          <div className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {item.title}
              </p>
              <span className="text-[10px] text-muted-foreground">{item.source}</span>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </a>
      ))}
    </div>
  );
}
