import { CloudSun } from 'lucide-react';

export default function WeatherMini() {
  return (
    <div className="flex items-center gap-3 py-2">
      <CloudSun className="h-8 w-8 text-primary" />
      <div>
        <div className="text-2xl font-bold text-foreground">28°C</div>
        <div className="text-xs text-muted-foreground">São Paulo • Parcialmente nublado</div>
      </div>
    </div>
  );
}
