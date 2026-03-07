import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import { LAYER_OPTIONS } from './types';
import type { TreeNode, ModuleItem } from './types';

interface ModuleEditSheetProps {
  item: TreeNode | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<ModuleItem>) => void;
  saving: boolean;
}

export function ModuleEditSheet({ item, onClose, onSave, saving }: ModuleEditSheetProps) {
  const [form, setForm] = useState<Partial<ModuleItem>>({});

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        icon_key: item.icon_key,
        route: item.route,
        description: item.description,
        is_active: item.is_active,
        is_internal_only: item.is_internal_only,
        layer: item.layer,
      });
    }
  }, [item]);

  if (!item) return null;

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:max-w-[400px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar Módulo</SheetTitle>
          <SheetDescription>Configure as propriedades do módulo.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 mt-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Ícone (Lucide key)</Label>
              <Input value={form.icon_key || ''} onChange={(e) => setForm({ ...form, icon_key: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Rota</Label>
              <Input
                value={form.route || ''}
                onChange={(e) => setForm({ ...form, route: e.target.value || null })}
                placeholder="Sem rota (agrupador)"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>Camada</Label>
              <Select value={form.layer || 'operacional'} onValueChange={(v) => setForm({ ...form, layer: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LAYER_OPTIONS.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Interno (só admin)</Label>
              <Switch checked={form.is_internal_only ?? false} onCheckedChange={(v) => setForm({ ...form, is_internal_only: v })} />
            </div>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground border-t pt-3">
            <p><strong>Key:</strong> {item.key}</p>
            <p><strong>ID:</strong> {item.id}</p>
            <p><strong>Sort Order:</strong> {item.sort_order}</p>
          </div>

          <Button
            onClick={() => onSave(item.id, form)}
            className="w-full"
            disabled={saving}
          >
            <Save className="h-4 w-4 mr-2" />
            Salvar Alterações
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
