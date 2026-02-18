import { useState, useEffect, useRef, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, Shield } from 'lucide-react';
import { useAccessProfiles } from '@/hooks/useAccessProfiles';
import { useUserContext } from '@/hooks/useUserContext';
import type { CollaboratorWithModules } from '@/types/collaborator';

interface CollaboratorFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborator?: CollaboratorWithModules | null;
  onSubmit: (data: {
    name: string;
    email: string;
    profileId: string | null;
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
  const [profileId, setProfileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lastInitKeyRef = useRef<string | null>(null);

  const isEditing = !!collaborator;
  const hasAccepted = collaborator?.accepted_at != null;

  const { activeCompanyId } = useUserContext();
  const { matrix } = useAccessProfiles({ companyId: activeCompanyId });

  // Available profiles for the select dropdown
  const availableProfiles = useMemo(() => {
    if (!matrix) return [];
    return matrix.profiles.filter(p => !p.is_protected || p.company_id);
  }, [matrix]);

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
      setProfileId((collaborator as any).profile_id ?? null);
      return;
    }

    setName('');
    setEmail('');
    setProfileId(null);
  }, [open, collaborator]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;
    if (!email.trim() || !email.includes('@')) return;

    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), profileId });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const selectedProfile = matrix?.profiles.find(p => p.id === profileId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar Colaborador' : 'Novo Colaborador'}
            </DialogTitle>
            <DialogDescription>
              {isEditing 
                ? 'Atualize os dados e o perfil de acesso do colaborador'
                : 'Cadastre um novo colaborador e defina seu perfil de acesso'
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

            {/* Profile Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Perfil de Acesso
              </Label>
              <Select
                value={profileId ?? 'none'}
                onValueChange={(val) => setProfileId(val === 'none' ? null : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um perfil..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem perfil atribuído</SelectItem>
                  {availableProfiles.map(profile => (
                    <SelectItem key={profile.id} value={profile.id}>
                      <span className="flex items-center gap-2">
                        {!profile.company_id && <Lock className="h-3 w-3" />}
                        {profile.name}
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          L{profile.level}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O perfil define quais módulos e ações o colaborador poderá acessar.
              </p>
            </div>

            {/* Profile Preview */}
            {selectedProfile && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Perfil: {selectedProfile.name} (Nível {selectedProfile.level})
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedProfile.company_id
                    ? 'Perfil customizado da sua empresa'
                    : 'Perfil base do sistema (somente leitura)'}
                </p>
              </div>
            )}
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
