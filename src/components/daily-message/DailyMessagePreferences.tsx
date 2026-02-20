import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: any;
  onSave: (prefs: any) => void;
}

const TEMAS = [
  { value: '__random__', label: 'Aleatório' },
  { value: 'empreendedorismo', label: 'Empreendedorismo' },
  { value: 'raul_inspirado', label: 'Raul Inspirado' },
  { value: 'biblica', label: 'Bíblica' },
  { value: 'crista', label: 'Cristã' },
  { value: 'atitude', label: 'Atitude' },
  { value: 'geral', label: 'Geral' },
];

export function DailyMessagePreferences({ open, onOpenChange, preferences, onSave }: Props) {
  const exibir = preferences?.exibir_mensagem ?? true;
  const tema = preferences?.tema_preferido ?? '__random__';
  const card = preferences?.permitir_gerar_card ?? true;

  const handleToggle = (key: string, value: boolean) => {
    onSave({ [key]: value });
    toast.success('Preferência atualizada');
  };

  const handleTemaChange = (value: string) => {
    onSave({ tema_preferido: value === '__random__' ? null : value });
    toast.success('Tema atualizado');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preferências da Mensagem do Dia</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="exibir">Exibir mensagem diária</Label>
            <Switch
              id="exibir"
              checked={exibir}
              onCheckedChange={(v) => handleToggle('exibir_mensagem', v)}
            />
          </div>

          <div className="space-y-2">
            <Label>Tema preferido</Label>
            <Select value={tema} onValueChange={handleTemaChange}>
              <SelectTrigger>
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
            <Label htmlFor="card">Permitir gerar card</Label>
            <Switch
              id="card"
              checked={card}
              onCheckedChange={(v) => handleToggle('permitir_gerar_card', v)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
