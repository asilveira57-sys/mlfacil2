import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Cloud, 
  CloudOff,
  Sun, 
  CloudRain, 
  CloudSnow, 
  CloudLightning, 
  Wind,
  Droplets,
  Thermometer,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  conditionDescription?: string;
  city: string;
  lastUpdate: Date;
}

interface WeatherWidgetProps {
  city?: string;
  country?: string;
  updateInterval?: number; // in minutes
  variant?: 'compact' | 'full';
  className?: string;
}

const WEATHER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  clear: Sun,
  clouds: Cloud,
  rain: CloudRain,
  drizzle: CloudRain,
  thunderstorm: CloudLightning,
  snow: CloudSnow,
  mist: Cloud,
  fog: Cloud,
  haze: Cloud,
};

export function WeatherWidget({
  city = 'São Paulo',
  country = 'BR',
  updateInterval = 30,
  variant = 'compact',
  className,
}: WeatherWidgetProps) {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const CACHE_KEY = `weather_cache_${city}_${country}`;
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  const fetchWeather = useCallback(async () => {
    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data: cachedData, cachedAt } = JSON.parse(cached);
        if (Date.now() - cachedAt < CACHE_TTL_MS) {
          setWeather({ ...cachedData, lastUpdate: new Date(cachedAt) });
          setLoading(false);
          return;
        }
      }
    } catch (_) { /* ignore parse errors */ }

    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('weather-api', {
        body: { city, country },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch weather');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const weatherData = {
        temperature: data.temperature,
        feelsLike: data.feelsLike,
        humidity: data.humidity,
        windSpeed: data.windSpeed,
        condition: data.condition,
        conditionDescription: data.conditionDescription,
        city: data.city,
        lastUpdate: new Date(),
      };
      setWeather(weatherData);

      // Save to localStorage cache
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: weatherData, cachedAt: Date.now() }));
      } catch (_) { /* quota exceeded */ }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      if (!message.includes('city not found') && !message.includes('404')) {
        console.error('[Weather] Error fetching weather:', message);
      }
    } finally {
      setLoading(false);
    }
  }, [city, country, CACHE_KEY]);

  useEffect(() => {
    fetchWeather();
    
    // Use longer interval since we have cache (60 min)
    const interval = setInterval(fetchWeather, Math.max(updateInterval, 60) * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather, updateInterval]);

  const WeatherIcon = weather ? WEATHER_ICONS[weather.condition] || Cloud : Cloud;
  const conditionText = weather?.conditionDescription
    || (weather ? t(`utilities:weather.conditions.${weather.condition}`, { defaultValue: weather.condition }) : '');

  if (variant === 'compact') {
    if (loading && !weather) {
      return (
        <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      );
    }

    if (error || !weather) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn('flex items-center gap-1.5 text-sm text-muted-foreground/50 cursor-default', className)}>
                <CloudOff className="h-4 w-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{t('utilities:weather.unavailable', { defaultValue: 'Clima indisponível' })}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-1.5 text-sm text-muted-foreground cursor-default', className)}>
              <WeatherIcon className="h-4 w-4" />
              <span className="font-medium">{weather.temperature}°C</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <p className="font-medium">{weather.city} • {conditionText}</p>
              <p>{t('utilities:weather.feels_like', { defaultValue: 'Sensação' })}: {weather.feelsLike}°C</p>
              <p>{t('utilities:weather.humidity', { defaultValue: 'Umidade' })}: {weather.humidity}%</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn('p-4 rounded-lg border bg-card', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{weather?.city || city}</span>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={fetchWeather}
          disabled={loading}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      {loading && !weather ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-4 text-sm text-destructive">
          {error}
        </div>
      ) : weather ? (
        <>
          <div className="flex items-center gap-4 mb-4">
            <WeatherIcon className="h-12 w-12 text-primary" />
            <div>
              <div className="text-3xl font-bold">{weather.temperature}°C</div>
              <div className="text-sm text-muted-foreground">{conditionText}</div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Thermometer className="h-4 w-4" />
              <span>{weather.feelsLike}°C</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Droplets className="h-4 w-4" />
              <span>{weather.humidity}%</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Wind className="h-4 w-4" />
              <span>{weather.windSpeed} km/h</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
