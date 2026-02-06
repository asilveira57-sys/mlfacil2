import { ClockWidget } from './ClockWidget';
import { WeatherWidget } from './WeatherWidget';
import { CalculatorWidget } from './CalculatorWidget';
import { useUtilitiesPreferences } from '@/hooks/useUtilitiesPreferences';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface HeaderUtilitiesProps {
  className?: string;
}

export function HeaderUtilities({ className }: HeaderUtilitiesProps) {
  const { preferences, loading } = useUtilitiesPreferences();

  if (loading) {
    return null;
  }

  const showClock = preferences.showClockInHeader;
  const showWeather = preferences.showWeatherInHeader;
  const showCalculator = preferences.showCalculatorInHeader;

  const hasAnyWidget = showClock || showWeather || showCalculator;

  if (!hasAnyWidget) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {showClock && (
        <ClockWidget 
          variant="compact" 
          timezone={preferences.timezone}
          hourFormat={preferences.hourFormat}
        />
      )}
      
      {showClock && (showWeather || showCalculator) && (
        <Separator orientation="vertical" className="h-4" />
      )}
      
      {showWeather && (
        <WeatherWidget
          variant="compact"
          city={preferences.weatherCity}
          country={preferences.weatherCountry}
        />
      )}
      
      {showWeather && showCalculator && (
        <Separator orientation="vertical" className="h-4" />
      )}
      
      {showCalculator && (
        <CalculatorWidget variant="icon" />
      )}
    </div>
  );
}
