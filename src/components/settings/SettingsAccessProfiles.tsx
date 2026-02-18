import { useState, useMemo } from 'react';
import { useAccessProfiles } from '@/hooks/useAccessProfiles';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Shield, Search, Lock, Copy, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserContext } from '@/hooks/useUserContext';

const LAYER_LABELS: Record<string, string> = {
  marketplace: 'Marketplace',
  operacional: 'Operacional',
  admin: 'Admin',
  sistema: 'Sistema',
};

const ACTION_LABELS: Record<string, string> = {
  view: 'Ver',
  create: 'Criar',
  edit: 'Editar',
  delete: 'Excluir',
  execute: 'Executar',
  configure: 'Config.',
  approve: 'Aprovar',
  export: 'Exportar',
};

export function SettingsAccessProfiles() {
  const { activeCompanyId } = useUserContext();
  const { matrix, isLoading, togglePermission, duplicateProfile, renameProfile } = useAccessProfiles({
    companyId: activeCompanyId,
  });
  const [search, setSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const groupedModules = useMemo(() => {
    if (!matrix) return {};
    const filtered = matrix.modules.filter(m =>
      !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.key.toLowerCase().includes(search.toLowerCase())
    );
    const groups: Record<string, typeof filtered> = {};
    for (const m of filtered) {
      const layer = m.layer || 'other';
      if (!groups[layer]) groups[layer] = [];
      groups[layer].push(m);
    }
    return groups;
  }, [matrix, search]);

  const visibleActions = useMemo(() => {
    if (!matrix) return [];
    const actionIdsInFeatures = new Set(
      Object.keys(matrix.featureMap).map(k => k.split(':')[1])
    );
    return matrix.actions.filter(a => actionIdsInFeatures.has(a.id));
  }, [matrix]);

  const activeProfile = selectedProfile || matrix?.profiles[0]?.id || null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!matrix) return null;

  const currentProfile = matrix.profiles.find(p => p.id === activeProfile);
  // System profiles (global base) are read-only; custom profiles (with company_id) are editable
  const isReadOnly = currentProfile?.is_system || currentProfile?.is_protected || !currentProfile?.company_id;

  const handleDuplicate = (profileId: string, profileName: string) => {
    setDuplicateSourceId(profileId);
    setDuplicateName(`${profileName} (customizado)`);
    setDuplicateDialogOpen(true);
  };

  const handleDuplicateConfirm = async () => {
    if (!duplicateSourceId || !duplicateName.trim() || !activeCompanyId) return;
    await duplicateProfile.mutateAsync({
      baseProfileId: duplicateSourceId,
      newName: duplicateName.trim(),
      targetCompanyId: activeCompanyId,
    });
    setDuplicateDialogOpen(false);
  };

  const handleRename = (profileId: string, currentName: string) => {
    setRenameTargetId(profileId);
    setRenameName(currentName);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    if (!renameTargetId || !renameName.trim()) return;
    await renameProfile.mutateAsync({ profileId: renameTargetId, newName: renameName.trim() });
    setRenameDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Perfis de Acesso
          </CardTitle>
          <CardDescription>
            Configure as permissões de cada perfil. Perfis base são somente leitura — duplique para criar um perfil customizado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Profile selector */}
          <div className="flex flex-wrap gap-2">
            {matrix.profiles.map(profile => {
              const isCustom = !!profile.company_id;
              return (
                <button
                  key={profile.id}
                  onClick={() => setSelectedProfile(profile.id)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                    activeProfile === profile.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {!isCustom && <Lock className="h-3 w-3" />}
                    {profile.name}
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      L{profile.level}
                    </Badge>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Actions for the selected profile */}
          {currentProfile && (
            <div className="flex items-center gap-2">
              {!currentProfile.company_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDuplicate(currentProfile.id, currentProfile.name)}
                  disabled={duplicateProfile.isPending}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicar para minha empresa
                </Button>
              )}
              {currentProfile.company_id && !currentProfile.is_protected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRename(currentProfile.id, currentProfile.name)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Renomear
                </Button>
              )}
              {isReadOnly && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Somente leitura
                </span>
              )}
            </div>
          )}

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar módulos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Permission Matrix */}
          {activeProfile && (
            <div className="border rounded-lg overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[220px]">
                      Módulo
                    </TableHead>
                    {visibleActions.map(action => (
                      <TableHead key={action.id} className="text-center min-w-[80px]">
                        {ACTION_LABELS[action.key] || action.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(groupedModules).map(([layer, modules]) => (
                    <>{/* Layer header */}
                      <TableRow key={`layer-${layer}`} className="bg-muted/30">
                        <TableCell
                          colSpan={visibleActions.length + 1}
                          className="font-semibold text-xs uppercase tracking-wider text-muted-foreground py-2"
                        >
                          {LAYER_LABELS[layer] || layer}
                        </TableCell>
                      </TableRow>
                      {modules.map(mod => (
                        <TableRow key={mod.id}>
                          <TableCell className="sticky left-0 bg-background z-10 font-medium text-sm">
                            <span className="truncate block max-w-[220px]" title={mod.key}>
                              {mod.name}
                            </span>
                          </TableCell>
                          {visibleActions.map(action => {
                            const featureKey = `${mod.id}:${action.id}`;
                            const featureId = matrix.featureMap[featureKey];
                            const hasFeature = !!featureId;
                            const isAllowed = hasFeature && matrix.permissions[activeProfile]?.[featureId];

                            return (
                              <TableCell key={action.id} className="text-center">
                                {hasFeature ? (
                                  <Checkbox
                                    checked={!!isAllowed}
                                    disabled={isReadOnly || togglePermission.isPending}
                                    onCheckedChange={(checked) => {
                                      togglePermission.mutate({
                                        profileId: activeProfile,
                                        featureId,
                                        allowed: !!checked,
                                      });
                                    }}
                                  />
                                ) : (
                                  <span className="text-muted-foreground/30">—</span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Duplicate Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar Perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do novo perfil</Label>
              <Input
                value={duplicateName}
                onChange={e => setDuplicateName(e.target.value)}
                placeholder="Ex: Operador customizado"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleDuplicateConfirm}
              disabled={!duplicateName.trim() || duplicateProfile.isPending}
            >
              {duplicateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear Perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Novo nome</Label>
              <Input
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={!renameName.trim() || renameProfile.isPending}
            >
              {renameProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
