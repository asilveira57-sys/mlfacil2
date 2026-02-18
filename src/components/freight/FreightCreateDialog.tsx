import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useFreightRulesets } from '@/hooks/useFreightRulesets';
import { useToast } from '@/hooks/use-toast';

interface RuleLine {
  logistic_mode: string;
  ad_type: string;
  weight_min: number;
  weight_max: number | null;
  price_band_min: number;
  price_band_max: number | null;
  seller_pays_value: number;
}

interface FreightCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const EMPTY_LINE: RuleLine = {
  logistic_mode: 'drop_off',
  ad_type: 'gold_pro',
  weight_min: 0,
  weight_max: null,
  price_band_min: 0,
  price_band_max: null,
  seller_pays_value: 0,
};

export function FreightCreateDialog({ open, onOpenChange, onCreated }: FreightCreateDialogProps) {
  const { createRuleset } = useFreightRulesets();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState<RuleLine[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);

  const addLine = () => setLines([...lines, { ...EMPTY_LINE }]);
  const removeLine = (index: number) => setLines(lines.filter((_, i) => i !== index));

  const updateLine = (index: number, field: keyof RuleLine, value: string | number | null) => {
    const updated = [...lines];
    (updated[index] as any)[field] = value;
    setLines(updated);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    if (lines.length === 0) {
      toast({ title: 'Adicione ao menos uma linha', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await createRuleset(
        {
          name: name.trim(),
          description: description.trim() || null,
          marketplace: 'mercadolivre',
          country: 'BR',
          status: 'active',
          valid_from: validFrom,
          valid_until: null,
        },
        lines.map((line, i) => ({
          logistic_mode: line.logistic_mode,
          ad_type: line.ad_type,
          weight_min: line.weight_min,
          weight_max: line.weight_max,
          price_band_min: line.price_band_min,
          price_band_max: line.price_band_max,
          seller_pays_value: line.seller_pays_value,
          seller_pays_formula: null,
          dimensions_limit_policy: null,
          dimensions_limit_value: null,
          subsidy_type: 'none' as const,
          subsidy_value: 0,
          is_free_shipping: line.seller_pays_value === 0,
          notes: null,
          sort_order: i,
        }))
      );

      toast({ title: 'Tabela criada com sucesso!' });
      onOpenChange(false);
      onCreated?.();

      // Reset form
      setName('');
      setDescription('');
      setLines([{ ...EMPTY_LINE }]);
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Tabela de Frete</DialogTitle>
          <DialogDescription>
            Cadastre manualmente as regras da tabela oficial do Mercado Livre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Nome da Tabela *</Label>
              <Input
                placeholder="Ex: Tabela ML Jan 2026"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                placeholder="Observações opcionais"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Válida desde</Label>
              <Input
                type="date"
                value={validFrom}
                onChange={e => setValidFrom(e.target.value)}
              />
            </div>
          </div>

          {/* Rule lines table */}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Logístico</TableHead>
                  <TableHead className="text-xs">Anúncio</TableHead>
                  <TableHead className="text-xs">Peso Min (kg)</TableHead>
                  <TableHead className="text-xs">Peso Max (kg)</TableHead>
                  <TableHead className="text-xs">Preço Min (R$)</TableHead>
                  <TableHead className="text-xs">Preço Max (R$)</TableHead>
                  <TableHead className="text-xs">Valor Frete (R$)</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell className="p-1">
                      <Select value={line.logistic_mode} onValueChange={v => updateLine(i, 'logistic_mode', v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="drop_off">Drop Off</SelectItem>
                          <SelectItem value="xd_drop_off">Cross Docking</SelectItem>
                          <SelectItem value="fulfillment">Full</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1">
                      <Select value={line.ad_type} onValueChange={v => updateLine(i, 'ad_type', v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gold_pro">Premium</SelectItem>
                          <SelectItem value="gold_special">Clássico</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1">
                      <Input className="h-8 text-xs w-16" type="number" step="0.1"
                        value={line.weight_min} onChange={e => updateLine(i, 'weight_min', parseFloat(e.target.value) || 0)} />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input className="h-8 text-xs w-16" type="number" step="0.1" placeholder="∞"
                        value={line.weight_max ?? ''} onChange={e => updateLine(i, 'weight_max', e.target.value ? parseFloat(e.target.value) : null)} />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input className="h-8 text-xs w-20" type="number" step="1"
                        value={line.price_band_min} onChange={e => updateLine(i, 'price_band_min', parseFloat(e.target.value) || 0)} />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input className="h-8 text-xs w-20" type="number" step="1" placeholder="∞"
                        value={line.price_band_max ?? ''} onChange={e => updateLine(i, 'price_band_max', e.target.value ? parseFloat(e.target.value) : null)} />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input className="h-8 text-xs w-20" type="number" step="0.01"
                        value={line.seller_pays_value} onChange={e => updateLine(i, 'seller_pays_value', parseFloat(e.target.value) || 0)} />
                    </TableCell>
                    <TableCell className="p-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button variant="outline" size="sm" className="gap-1" onClick={addLine}>
            <Plus className="h-3 w-3" /> Adicionar Linha
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar Tabela
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
