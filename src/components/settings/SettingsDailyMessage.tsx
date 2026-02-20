import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useDailyMessage } from '@/hooks/useDailyMessage';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { MessageSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const TEMAS = [
  { value: '__random__', label: 'Aleatório' },
  { value: 'empreendedorismo', label: 'Empreendedorismo' },
  { value: 'raul_inspirado', label: 'Raul Inspirado' },
  { value: 'biblica', label: 'Bíblica' },
  { value: 'crista', label: 'Cristã' },
  { value: 'atitude', label: 'Atitude' },
  { value: 'geral', label: 'Geral' },
];

export function SettingsDailyMessage() {
  const userId = useCurrentUserId();
  const { preferences, updatePreferences } = useDailyMessage(userId ?? undefined);

  const exibir = preferences?.exibir_mensagem ?? true;
  const tema = preferences?.tema_preferido ?? '__random__';
  const card = preferences?.permitir_gerar_card ?? true;

  const handleToggle = (key: string, value: boolean) => {
    updatePreferences.mutate({ [key]: value } as any);
    toast.success('Preferência atualizada');
  };

  const handleTemaChange = (value: string) => {
    updatePreferences.mutate({ tema_preferido: value === '__random__' ? null : value } as any);
    toast.success('Tema atualizado');
  };

  if (!userId) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Mensagem do Dia</h2>
          <p className="text-sm text-muted-foreground">Configure a exibição da mensagem inspiradora diária</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="exibir" className="text-sm font-medium">Exibir mensagem diária</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Mostra uma mensagem inspiradora no seu dashboard</p>
          </div>
          <Switch
            id="exibir"
            checked={exibir}
            onCheckedChange={(v) => handleToggle('exibir_mensagem', v)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Tema preferido</Label>
          <p className="text-xs text-muted-foreground">Escolha o tipo de mensagem que deseja receber</p>
          <Select value={tema} onValueChange={handleTemaChange}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMAS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="card" className="text-sm font-medium">Permitir gerar card</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Habilita a geração de cards para redes sociais</p>
          </div>
          <Switch
            id="card"
            checked={card}
            onCheckedChange={(v) => handleToggle('permitir_gerar_card', v)}
          />
        </div>
      </div>
    </div>
  );
}

export default SettingsDailyMessage;
