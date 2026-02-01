import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Cloud, 
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

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  city: string;
  lastUpdate: Date;
}

interface WeatherWidgetProps {
  city?: string;
  state?: string;
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

// Mock weather data - in production, this would call a weather API
function generateMockWeather(city: string): WeatherData {
  const conditions = ['clear', 'clouds', 'rain', 'drizzle'];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  const baseTemp = 18 + Math.floor(Math.random() * 15);
  
  return {
    temperature: baseTemp,
    feelsLike: baseTemp + Math.floor(Math.random() * 4) - 2,
    humidity: 40 + Math.floor(Math.random() * 40),
    windSpeed: Math.floor(Math.random() * 20),
    condition,
    city,
    lastUpdate: new Date(),
  };
}

export function WeatherWidget({
  city = 'São Paulo',
  updateInterval = 30,
  variant = 'compact',
  className,
}: WeatherWidgetProps) {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // In production, call actual weather API here
      // For now, use mock data
      const data = generateMockWeather(city);
      setWeather(data);
    } catch (err) {
      setError(t('utilities:weather.error'));
      console.error('[Weather] Error fetching weather:', err);
    } finally {
      setLoading(false);
    }
  }, [city, t]);

  useEffect(() => {
    fetchWeather();
    
    const interval = setInterval(fetchWeather, updateInterval * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather, updateInterval]);

  const WeatherIcon = weather ? WEATHER_ICONS[weather.condition] || Cloud : Cloud;
  const conditionText = weather 
    ? t(`utilities:weather.conditions.${weather.condition}`, { defaultValue: weather.condition })
    : '';

  if (variant === 'compact') {
    if (loading && !weather) {
      return (
        <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      );
    }

    if (error || !weather) {
      return null;
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
              <p>{t('utilities:weather.feels_like')}: {weather.feelsLike}°C</p>
              <p>{t('utilities:weather.humidity')}: {weather.humidity}%</p>
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
