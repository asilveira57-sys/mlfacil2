import { useState, useMemo } from 'react';
import { useAccessProfiles } from '@/hooks/useAccessProfiles';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Shield, Search, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

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

export function AdminAccessProfiles() {
  const { matrix, isLoading, togglePermission } = useAccessProfiles();
  const [search, setSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

  // Group modules by layer
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

  // Available actions (only those that have features)
  const visibleActions = useMemo(() => {
    if (!matrix) return [];
    // Filter actions that exist in at least one feature
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Perfis de Acesso & Permissões
          </CardTitle>
          <CardDescription>
            Configure quais ações cada perfil pode executar em cada módulo do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Profile selector tabs */}
          <div className="flex flex-wrap gap-2">
            {matrix.profiles.map(profile => (
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
                  {profile.is_protected && <Lock className="h-3 w-3" />}
                  {profile.name}
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    L{profile.level}
                  </Badge>
                </span>
              </button>
            ))}
          </div>

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
                    <>
                      {/* Layer header row */}
                      <TableRow key={`layer-${layer}`} className="bg-muted/30">
                        <TableCell
                          colSpan={visibleActions.length + 1}
                          className="font-semibold text-xs uppercase tracking-wider text-muted-foreground py-2"
                        >
                          {LAYER_LABELS[layer] || layer}
                        </TableCell>
                      </TableRow>
                      {/* Module rows */}
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
                            const isProtected = currentProfile?.is_protected;

                            return (
                              <TableCell key={action.id} className="text-center">
                                {hasFeature ? (
                                  <Checkbox
                                    checked={!!isAllowed}
                                    disabled={isProtected || togglePermission.isPending}
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

          {currentProfile?.is_protected && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              Este perfil é protegido e não pode ser editado.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
