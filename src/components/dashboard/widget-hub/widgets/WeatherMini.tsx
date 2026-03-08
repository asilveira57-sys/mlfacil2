import { useState, useEffect } from 'react';
import { CloudSun, Cloud, Sun, CloudRain, Snowflake, CloudFog, RefreshCw } from 'lucide-react';

interface WeatherData {
  temp: number;
  description: string;
  city: string;
  icon: string;
}

export default function WeatherMini() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchWeather = async () => {
    setLoading(true);
    setError(false);
    try {
      // Use wttr.in free API (no key needed)
      const res = await fetch('https://wttr.in/?format=j1&lang=pt');
      const data = await res.json();
      
      if (data.current_condition?.[0]) {
        const current = data.current_condition[0];
        const area = data.nearest_area?.[0];
        setWeather({
          temp: parseInt(current.temp_C),
          description: current.lang_pt?.[0]?.value || current.weatherDesc?.[0]?.value || 'N/D',
          city: area?.areaName?.[0]?.value || 'Sua localização',
          icon: current.weatherCode,
        });
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 600000); // 10 min
    return () => clearInterval(interval);
  }, []);

  const getWeatherIcon = (code: string) => {
    const c = parseInt(code);
    if (c === 113) return <Sun className="h-8 w-8 text-yellow-500" />;
    if (c === 116 || c === 119) return <CloudSun className="h-8 w-8 text-primary" />;
    if (c === 122) return <Cloud className="h-8 w-8 text-muted-foreground" />;
    if ([176, 263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359].includes(c))
      return <CloudRain className="h-8 w-8 text-blue-500" />;
    if ([227, 230, 323, 326, 329, 332, 335, 338, 368, 371, 374, 377, 392, 395].includes(c))
      return <Snowflake className="h-8 w-8 text-blue-300" />;
    if ([143, 248, 260].includes(c)) return <CloudFog className="h-8 w-8 text-muted-foreground" />;
    return <CloudSun className="h-8 w-8 text-primary" />;
  };

  if (loading && !weather) {
    return (
      <div className="flex items-center gap-3 py-2 animate-pulse">
        <div className="h-8 w-8 rounded bg-muted" />
        <div className="space-y-1">
          <div className="h-6 w-16 rounded bg-muted" />
          <div className="h-3 w-32 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="flex items-center gap-3 py-2">
        <CloudSun className="h-8 w-8 text-muted-foreground" />
        <div>
          <div className="text-sm text-muted-foreground">Erro ao carregar clima</div>
          <button onClick={fetchWeather} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
            <RefreshCw className="h-3 w-3" /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2">
      {getWeatherIcon(weather.icon)}
      <div>
        <div className="text-2xl font-bold text-foreground">{weather.temp}°C</div>
        <div className="text-xs text-muted-foreground">{weather.city} • {weather.description}</div>
      </div>
    </div>
  );
}
