import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { CollaboratorModuleGrid } from './CollaboratorModuleGrid';
import { MODULE_CATALOG, type CollaboratorWithModules } from '@/types/collaborator';

interface CollaboratorFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborator?: CollaboratorWithModules | null;
  onSubmit: (data: {
    name: string;
    email: string;
    modules: Record<string, boolean>;
  }) => Promise<void>;
}

export function CollaboratorFormModal({
  open,
  onOpenChange,
  collaborator,
  onSubmit,
}: CollaboratorFormModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Guard against repeated initialization loops while the dialog is open.
  // In some cases, parent props can change identity during renders (even if
  // the underlying data didn't), which would retrigger the effect below and
  // repeatedly call setState → "Maximum update depth exceeded".
  const lastInitKeyRef = useRef<string | null>(null);

  const isEditing = !!collaborator;
  const hasAccepted = collaborator?.accepted_at != null;

  // Initialize form when opening
  useEffect(() => {
    if (!open) {
      lastInitKeyRef.current = null;
      return;
    }

    const initKey = collaborator
      ? `edit:${collaborator.id}:${collaborator.updated_at ?? ''}`
      : 'create';

    if (lastInitKeyRef.current === initKey) return;
    lastInitKeyRef.current = initKey;

    if (collaborator) {
      setName(collaborator.name);
      setEmail(collaborator.email);

      // Build modules map from existing access
      const moduleMap: Record<string, boolean> = {};
      MODULE_CATALOG.forEach((mod) => {
        const access = collaborator.modules.find((m) => m.module_key === mod.key);
        moduleMap[mod.key] = access?.enabled ?? false;
      });
      setModules(moduleMap);
      return;
    }

    setName('');
    setEmail('');

    // Default all modules to false
    const defaultModules: Record<string, boolean> = {};
    MODULE_CATALOG.forEach((mod) => {
      defaultModules[mod.key] = false;
    });
    setModules(defaultModules);
  }, [open, collaborator]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;
    if (!email.trim() || !email.includes('@')) return;

    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), modules });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar Colaborador' : 'Novo Colaborador'}
            </DialogTitle>
            <DialogDescription>
              {isEditing 
                ? 'Atualize os dados e permissões do colaborador'
                : 'Cadastre um novo colaborador e defina suas permissões'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="collab-name">Nome *</Label>
                <Input
                  id="collab-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do colaborador"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collab-email">E-mail *</Label>
                <Input
                  id="collab-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  required
                  disabled={hasAccepted}
                />
                {hasAccepted && (
                  <p className="text-xs text-muted-foreground">
                    E-mail não pode ser alterado após aceite do convite
                  </p>
                )}
              </div>
            </div>

            {/* Module Permissions */}
            <div className="border-t pt-4">
              <CollaboratorModuleGrid
                selectedModules={modules}
                onChange={setModules}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !email.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Salvar Alterações' : 'Criar Colaborador'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
