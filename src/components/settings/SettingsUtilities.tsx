import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, CloudSun, Calculator, Wrench } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUtilitiesPreferences } from '@/hooks/useUtilitiesPreferences';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Mexico_City',
  'America/Santiago',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Lisbon',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

const TIMEZONE_LABELS: Record<string, string> = {
  'America/Sao_Paulo': 'São Paulo (BRT)',
  'America/New_York': 'Nova York (EST)',
  'America/Chicago': 'Chicago (CST)',
  'America/Denver': 'Denver (MST)',
  'America/Los_Angeles': 'Los Angeles (PST)',
  'America/Argentina/Buenos_Aires': 'Buenos Aires (ART)',
  'America/Bogota': 'Bogotá (COT)',
  'America/Mexico_City': 'Cidade do México (CST)',
  'America/Santiago': 'Santiago (CLT)',
  'Europe/London': 'Londres (GMT)',
  'Europe/Paris': 'Paris (CET)',
  'Europe/Berlin': 'Berlim (CET)',
  'Europe/Madrid': 'Madrid (CET)',
  'Europe/Lisbon': 'Lisboa (WET)',
  'Europe/Moscow': 'Moscou (MSK)',
  'Asia/Tokyo': 'Tóquio (JST)',
  'Asia/Shanghai': 'Xangai (CST)',
  'Asia/Dubai': 'Dubai (GST)',
  'Asia/Kolkata': 'Calcutá (IST)',
  'Asia/Singapore': 'Singapura (SGT)',
  'Australia/Sydney': 'Sydney (AEST)',
  'Pacific/Auckland': 'Auckland (NZST)',
  'UTC': 'UTC',
};

export function SettingsUtilities() {
  const { t } = useTranslation();
  const { preferences, loading, updatePreferences } = useUtilitiesPreferences();

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Clock Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('utilities:clock.title', { defaultValue: 'Relógio' })}
          </CardTitle>
          <CardDescription>
            {t('utilities:settings.clock_description', { defaultValue: 'Configure o relógio exibido no header da aplicação.' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="clock-header">
              {t('utilities:settings.show_in_header', { defaultValue: 'Exibir no header' })}
            </Label>
            <Switch
              id="clock-header"
              checked={preferences.showClockInHeader}
              onCheckedChange={(checked) =>
                updatePreferences({
                  showClockInHeader: checked,
                  widgetsEnabled: {
                    ...preferences.widgetsEnabled,
                    clock: checked,
                  },
                })
              }
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="timezone">
              {t('utilities:settings.timezone', { defaultValue: 'Fuso horário' })}
            </Label>
            <Select
              value={preferences.timezone}
              onValueChange={(value) => updatePreferences({ timezone: value })}
            >
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {TIMEZONE_LABELS[tz] || tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              {t('utilities:settings.hour_format', { defaultValue: 'Formato de hora' })}
            </Label>
            <Select
              value={preferences.hourFormat}
              onValueChange={(value) =>
                updatePreferences({ hourFormat: value as '12h' | '24h' })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24 horas (14:30)</SelectItem>
                <SelectItem value="12h">12 horas (2:30 PM)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Weather Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudSun className="h-5 w-5" />
            {t('utilities:weather.title', { defaultValue: 'Clima' })}
          </CardTitle>
          <CardDescription>
            {t('utilities:settings.weather_description', { defaultValue: 'Configure o widget de clima com dados reais da sua cidade.' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="weather-header">
              {t('utilities:settings.show_in_header', { defaultValue: 'Exibir no header' })}
            </Label>
            <Switch
              id="weather-header"
              checked={preferences.showWeatherInHeader}
              onCheckedChange={(checked) =>
                updatePreferences({
                  showWeatherInHeader: checked,
                  widgetsEnabled: {
                    ...preferences.widgetsEnabled,
                    weather: checked,
                  },
                })
              }
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weather-city">
                {t('utilities:settings.city', { defaultValue: 'Cidade' })}
              </Label>
              <Input
                id="weather-city"
                value={preferences.weatherCity}
                onChange={(e) => updatePreferences({ weatherCity: e.target.value })}
                placeholder="São Paulo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weather-country">
                {t('utilities:settings.country', { defaultValue: 'País (código)' })}
              </Label>
              <Input
                id="weather-country"
                value={preferences.weatherCountry}
                onChange={(e) => updatePreferences({ weatherCountry: e.target.value.toUpperCase() })}
                placeholder="BR"
                maxLength={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calculator Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            {t('utilities:calculator.title', { defaultValue: 'Calculadora' })}
          </CardTitle>
          <CardDescription>
            {t('utilities:settings.calculator_description', { defaultValue: 'Ative ou desative a calculadora rápida no header.' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="calculator-header">
              {t('utilities:settings.show_in_header', { defaultValue: 'Exibir no header' })}
            </Label>
            <Switch
              id="calculator-header"
              checked={preferences.showCalculatorInHeader}
              onCheckedChange={(checked) =>
                updatePreferences({
                  showCalculatorInHeader: checked,
                  widgetsEnabled: {
                    ...preferences.widgetsEnabled,
                    calculator: checked,
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
