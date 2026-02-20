import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useCalendarPreferences, useSaveCalendarPreferences, UserPreferences } from '@/hooks/useSocialCalendar';
import { toast } from 'sonner';

const NICHES = [
  { value: 'geral', label: '🌐 Geral' },
  { value: 'beleza', label: '💄 Beleza' },
  { value: 'autopeças', label: '🔧 Autopeças' },
  { value: 'pet', label: '🐾 Pet' },
  { value: 'papelaria', label: '📝 Papelaria' },
  { value: 'eletrônicos', label: '⚡ Eletrônicos' },
  { value: 'moda', label: '👗 Moda' },
];

const FORMATS = [
  { value: 'feed', label: '🖼️ Feed' },
  { value: 'stories', label: '📱 Stories' },
  { value: 'reels', label: '🎬 Reels' },
  { value: 'carrossel', label: '🎠 Carrossel' },
  { value: 'shorts', label: '📹 Shorts' },
];

const OBJECTIVES = [
  { value: 'engajamento', label: '❤️ Engajamento' },
  { value: 'tráfego', label: '🚦 Tráfego' },
  { value: 'conversão', label: '💰 Conversão' },
  { value: 'marca', label: '🏷️ Marca' },
];

const COUNTRIES = [
  { value: 'BR', label: '🇧🇷 Brasil' },
  { value: 'AR', label: '🇦🇷 Argentina' },
  { value: 'MX', label: '🇲🇽 México' },
  { value: 'CO', label: '🇨🇴 Colômbia' },
  { value: 'CL', label: '🇨🇱 Chile' },
];

export function SocialCalendarSettings() {
  const { data: prefs, isLoading } = useCalendarPreferences();
  const save = useSaveCalendarPreferences();

  const [country, setCountry] = useState('BR');
  const [niches, setNiches] = useState<string[]>(['geral']);
  const [formats, setFormats] = useState<string[]>(['feed', 'stories']);
  const [objective, setObjective] = useState('engajamento');

  useEffect(() => {
    if (prefs) {
      setCountry(prefs.country_code ?? 'BR');
      setNiches((prefs.selected_niches as string[]) ?? ['geral']);
      setFormats((prefs.preferred_formats as string[]) ?? ['feed', 'stories']);
      setObjective(prefs.objective ?? 'engajamento');
    }
  }, [prefs]);

  const toggleItem = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const handleSave = () => {
    if (niches.length === 0) {
      toast.error('Selecione ao menos um nicho.');
      return;
    }
    if (formats.length === 0) {
      toast.error('Selecione ao menos um formato.');
      return;
    }
    save.mutate({
      country_code: country,
      selected_niches: niches,
      preferred_formats: formats,
      objective,
    });
  };

  if (isLoading) return <div className="text-muted-foreground animate-pulse py-8 text-center">Carregando...</div>;

  return (
    <div className="max-w-lg space-y-6">
      {/* Country */}
      <div className="space-y-2">
        <Label>País</Label>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Usado para carregar feriados oficiais.</p>
      </div>

      {/* Niches */}
      <div className="space-y-2">
        <Label>Nichos do seu negócio</Label>
        <div className="grid grid-cols-2 gap-2">
          {NICHES.map((n) => (
            <label key={n.value} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={niches.includes(n.value)}
                onCheckedChange={() => toggleItem(niches, setNiches, n.value)}
              />
              <span className="text-sm">{n.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">As sugestões serão filtradas por estes nichos.</p>
      </div>

      {/* Formats */}
      <div className="space-y-2">
        <Label>Formatos preferidos</Label>
        <div className="grid grid-cols-2 gap-2">
          {FORMATS.map((f) => (
            <label key={f.value} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={formats.includes(f.value)}
                onCheckedChange={() => toggleItem(formats, setFormats, f.value)}
              />
              <span className="text-sm">{f.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Objective */}
      <div className="space-y-2">
        <Label>Objetivo principal</Label>
        <Select value={objective} onValueChange={setObjective}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OBJECTIVES.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleSave} disabled={save.isPending} className="w-full">
        {save.isPending ? 'Salvando...' : 'Salvar preferências'}
      </Button>
    </div>
  );
}
