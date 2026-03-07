import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LAYER_OPTIONS } from './types';

interface NewModuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    key: string;
    icon_key: string;
    route: string | null;
    layer: string;
    parent_module_id: string | null;
  }) => void;
  parentId?: string | null;
  parentName?: string;
}

export function NewModuleDialog({ open, onOpenChange, onSubmit, parentId = null, parentName }: NewModuleDialogProps) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [iconKey, setIconKey] = useState('Settings');
  const [route, setRoute] = useState('');
  const [layer, setLayer] = useState('operacional');

  const handleSubmit = () => {
    if (!name.trim() || !key.trim()) return;
    onSubmit({
      name: name.trim(),
      key: key.trim(),
      icon_key: iconKey,
      route: route.trim() || null,
      layer,
      parent_module_id: parentId,
    });
    setName('');
    setKey('');
    setIconKey('Settings');
    setRoute('');
    setLayer('operacional');
    onOpenChange(false);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!key || key === slugify(name)) {
      setKey(slugify(val));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {parentId ? `Novo submenu de "${parentName}"` : 'Novo Módulo'}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do novo {parentId ? 'submenu' : 'módulo'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Ex: Gestão Financeira" />
          </div>
          <div className="space-y-2">
            <Label>Key (slug)</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Ex: gestao-financeira" />
          </div>
          <div className="space-y-2">
            <Label>Ícone (Lucide)</Label>
            <Input value={iconKey} onChange={(e) => setIconKey(e.target.value)} placeholder="Settings" />
          </div>
          <div className="space-y-2">
            <Label>Rota</Label>
            <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="/gestao-financeira (vazio = agrupador)" />
          </div>
          {!parentId && (
            <div className="space-y-2">
              <Label>Camada</Label>
              <Select value={layer} onValueChange={setLayer}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LAYER_OPTIONS.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !key.trim()}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
