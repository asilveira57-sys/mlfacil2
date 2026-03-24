import { useState, useEffect, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { useCalendarPreferences, useSaveCalendarPreferences, UserPreferences } from '@/hooks/useSocialCalendar';
import { useBrEstados, useBrMunicipios } from '@/hooks/useBrLocation';
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

export function SocialCalendarSettings() {
  const { data: prefs, isLoading } = useCalendarPreferences();
  const save = useSaveCalendarPreferences();

  // Location data
  const { data: estados = [] } = useBrEstados();
  const [uf, setUf] = useState<string>('');
  const [codigoIbge, setCodigoIbge] = useState<number | null>(null);
  const [munSearch, setMunSearch] = useState('');
  const { data: municipios = [], isLoading: loadingMunicipios } = useBrMunicipios(uf || null);

  const [niches, setNiches] = useState<string[]>(['geral']);
  const [formats, setFormats] = useState<string[]>(['feed', 'stories']);
  const [objective, setObjective] = useState('engajamento');

  useEffect(() => {
    if (prefs) {
      setUf((prefs as any).uf ?? '');
      setCodigoIbge((prefs as any).codigo_ibge ?? null);
      setNiches((prefs.selected_niches as string[]) ?? ['geral']);
      setFormats((prefs.preferred_formats as string[]) ?? ['feed', 'stories']);
      setObjective(prefs.objective ?? 'engajamento');
    }
  }, [prefs]);

  // Filter municipios by search
  const filteredMunicipios = useMemo(() => {
    if (!munSearch.trim()) return municipios;
    const term = munSearch.toLowerCase();
    return municipios.filter((m) => m.nome.toLowerCase().includes(term));
  }, [municipios, munSearch]);

  const toggleItem = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const handleUfChange = (newUf: string) => {
    setUf(newUf);
    setCodigoIbge(null);
    setMunSearch('');
  };

  const handleSave = async () => {
    if (niches.length === 0) {
      toast.error('Selecione ao menos um nicho.');
      return;
    }
    if (formats.length === 0) {
      toast.error('Selecione ao menos um formato.');
      return;
    }

    // If municipality changed, fetch municipal holidays from complementary API
    if (codigoIbge && codigoIbge !== (prefs as any)?.codigo_ibge) {
      try {
        const currentYear = new Date().getFullYear();
        const { error } = await supabase.functions.invoke('fetch-municipal-holidays', {
          body: { codigo_ibge: codigoIbge, ano: currentYear },
        });
        if (error) {
          console.warn('Failed to fetch municipal holidays:', error);
        } else {
          toast.success('Feriados municipais atualizados!');
        }
      } catch (e) {
        console.warn('Municipal holidays fetch error:', e);
      }
    }

    save.mutate({
      country_code: 'BR',
      selected_niches: niches,
      preferred_formats: formats,
      objective,
      uf: uf || null,
      codigo_ibge: codigoIbge,
    } as any);
  };

  if (isLoading) return <div className="text-muted-foreground animate-pulse py-8 text-center">Carregando...</div>;

  const selectedMunName = municipios.find((m) => m.codigo_ibge === codigoIbge)?.nome;

  return (
    <div className="max-w-lg space-y-6">
      {/* Estado */}
      <div className="space-y-2">
        <Label>Estado</Label>
        <Select value={uf} onValueChange={handleUfChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione seu estado" />
          </SelectTrigger>
          <SelectContent>
            {estados.map((e) => (
              <SelectItem key={e.uf} value={e.uf}>{e.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Feriados estaduais serão exibidos no calendário.</p>
      </div>

      {/* Município */}
      {uf && (
        <div className="space-y-2">
          <Label>Município</Label>
          <Input
            placeholder="Buscar município..."
            value={munSearch}
            onChange={(e) => setMunSearch(e.target.value)}
            className="mb-1"
          />
          {loadingMunicipios ? (
            <p className="text-xs text-muted-foreground animate-pulse">Carregando municípios...</p>
          ) : (
            <Select
              value={codigoIbge ? String(codigoIbge) : ''}
              onValueChange={(v) => setCodigoIbge(v ? Number(v) : null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione seu município">
                  {selectedMunName || 'Selecione seu município'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {filteredMunicipios.slice(0, 100).map((m) => (
                  <SelectItem key={m.codigo_ibge} value={String(m.codigo_ibge)}>
                    {m.nome}{m.capital ? ' ⭐' : ''}
                  </SelectItem>
                ))}
                {filteredMunicipios.length > 100 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    Mostrando 100 de {filteredMunicipios.length}. Use a busca para filtrar.
                  </div>
                )}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">Feriados municipais serão exibidos no calendário.</p>
        </div>
      )}

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
