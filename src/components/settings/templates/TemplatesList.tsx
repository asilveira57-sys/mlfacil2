import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Plus, Copy, Pencil, ToggleLeft, ToggleRight, Search,
  LayoutTemplate, Star, Globe, Tag, Calendar, Building2,
} from 'lucide-react';
import { useTemplatesList, useTemplateMutations } from '@/hooks/useTemplates';
import { TemplateWizard } from './TemplateWizard';
import type { TemplateScope } from '@/types/templates';

interface TemplatesListProps {
  onEdit: (id: string) => void;
}

const SCOPE_CONFIG: Record<TemplateScope, { label: string; icon: typeof Globe; color: string }> = {
  global: { label: 'Global', icon: Globe, color: 'bg-primary/10 text-primary' },
  category: { label: 'Categoria', icon: Tag, color: 'bg-accent/10 text-accent-foreground' },
  subcategory: { label: 'Subcategoria', icon: Tag, color: 'bg-warning/10 text-warning' },
  seasonal: { label: 'Sazonal', icon: Calendar, color: 'bg-success/10 text-success' },
  company: { label: 'Empresa', icon: Building2, color: 'bg-secondary/10 text-secondary-foreground' },
};

export function TemplatesList({ onEdit }: TemplatesListProps) {
  const { data: templates, isLoading } = useTemplatesList();
  const { toggleActive, duplicateTemplate } = useTemplateMutations();
  const [search, setSearch] = useState('');
  const [showWizard, setShowWizard] = useState(false);

  if (showWizard) {
    return <TemplateWizard templateId={null} onClose={() => setShowWizard(false)} />;
  }

  const filtered = (templates || []).filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5 text-primary" />
                Templates
              </CardTitle>
              <CardDescription className="mt-1">
                Gerencie os templates visuais do sistema
              </CardDescription>
            </div>
            <Button onClick={() => setShowWizard(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar templates..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <LayoutTemplate className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {search ? 'Nenhum template encontrado.' : 'Nenhum template criado ainda.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(template => {
                const scopeCfg = SCOPE_CONFIG[template.scope as TemplateScope] || SCOPE_CONFIG.global;
                const ScopeIcon = scopeCfg.icon;

                return (
                  <div
                    key={template.id}
                    className="flex items-center gap-4 p-4 border rounded-lg bg-card hover:shadow-sm transition-shadow"
                  >
                    {/* Status indicator */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${template.is_active ? 'bg-success' : 'bg-muted-foreground/30'}`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm truncate">{template.name}</h4>
                        {template.is_system_default && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Star className="h-3 w-3" />
                            Sistema
                          </Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {template.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className={`text-[10px] gap-1 ${scopeCfg.color}`} variant="secondary">
                          <ScopeIcon className="h-3 w-3" />
                          {scopeCfg.label}
                        </Badge>
                        <Badge variant={template.is_active ? 'default' : 'secondary'} className="text-[10px]">
                          {template.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Editar"
                        onClick={() => onEdit(template.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Duplicar"
                        onClick={() => duplicateTemplate.mutate(template.id)}
                        disabled={duplicateTemplate.isPending}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={template.is_active ? 'Desativar' : 'Ativar'}
                        onClick={() => toggleActive.mutate({ id: template.id, is_active: !template.is_active })}
                        disabled={toggleActive.isPending}
                      >
                        {template.is_active ? (
                          <ToggleRight className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
