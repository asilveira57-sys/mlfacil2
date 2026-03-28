import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { FreightProduct } from '@/hooks/useFreightProducts';

interface Props {
  product: FreightProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FreightProductEditDialog({ product, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [profile, setProfile] = useState('');

  // Reset form when product changes
  const resetForm = () => {
    if (product) {
      setWeightKg(product.weight_kg?.toString() || '');
      setHeightCm(product.height_cm?.toString() || '');
      setWidthCm(product.width_cm?.toString() || '');
      setLengthCm(product.length_cm?.toString() || '');
      setProfile(product.freight_profile || '');
    }
  };

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        dimensions_source: 'manual',
        updated_at: new Date().toISOString(),
      };
      if (weightKg) updates.weight_kg = parseFloat(weightKg);
      else updates.weight_kg = null;
      if (heightCm) updates.height_cm = parseFloat(heightCm);
      else updates.height_cm = null;
      if (widthCm) updates.width_cm = parseFloat(widthCm);
      else updates.width_cm = null;
      if (lengthCm) updates.length_cm = parseFloat(lengthCm);
      else updates.length_cm = null;
      if (profile) updates.freight_profile = profile;
      else updates.freight_profile = null;

      const { error } = await supabase
        .from('meli_listings_cache')
        .update(updates)
        .eq('id', product.id);

      if (error) throw error;

      toast.success('Dimensões atualizadas com sucesso');
      queryClient.invalidateQueries({ queryKey: ['freight-products'] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Dimensões</DialogTitle>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {product?.title || product?.item_id}
          </p>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="weight">Peso (kg)</Label>
              <Input id="weight" type="number" step="0.01" min="0"
                placeholder="ex: 1.5" value={weightKg}
                onChange={e => setWeightKg(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="height">Altura (cm)</Label>
              <Input id="height" type="number" step="0.1" min="0"
                placeholder="ex: 10" value={heightCm}
                onChange={e => setHeightCm(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="width">Largura (cm)</Label>
              <Input id="width" type="number" step="0.1" min="0"
                placeholder="ex: 20" value={widthCm}
                onChange={e => setWidthCm(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="length">Comprimento (cm)</Label>
              <Input id="length" type="number" step="0.1" min="0"
                placeholder="ex: 30" value={lengthCm}
                onChange={e => setLengthCm(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="profile">Perfil de Frete</Label>
            <Select value={profile} onValueChange={setProfile}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Perfil A</SelectItem>
                <SelectItem value="B">Perfil B</SelectItem>
                <SelectItem value="C">Perfil C</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
