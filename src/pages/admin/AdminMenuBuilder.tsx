import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  ChevronRight, ChevronDown, GripVertical, Settings, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleItem {
  id: string;
  key: string;
  name: string;
  layer: 'admin' | 'ferramentas' | 'marketplace' | 'operacional' | 'sistema';
  parent_module_id: string | null;
  sort_order: number;
  icon_key: string;
  route: string | null;
  is_active: boolean;
  is_internal_only: boolean;
  description: string | null;
}

interface TreeNode extends ModuleItem {
  children: TreeNode[];
}

const LAYER_OPTIONS = [
  { value: 'admin', label: 'Admin', color: 'bg-red-500/10 text-red-700 border-red-500/20' },
  { value: 'marketplace', label: 'Marketplace', color: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
  { value: 'operacional', label: 'Operacional', color: 'bg-green-500/10 text-green-700 border-green-500/20' },
  { value: 'ferramentas', label: 'Ferramentas', color: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
  { value: 'sistema', label: 'Sistema', color: 'bg-muted text-muted-foreground' },
];

export default function AdminMenuBuilder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<TreeNode | null>(null);

  const { data: modules, isLoading } = useQuery({
    queryKey: ['admin-menu-modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data || []) as ModuleItem[];
    },
  });

  const tree = buildTree(modules || []);

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (modules) {
      setExpandedNodes(new Set(modules.map(i => i.id)));
    }
  }, [modules]);

  const handleSelect = (node: TreeNode) => {
    setSelectedItem({ ...node });
  };

  const updateItemMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<ModuleItem> }) => {
      const { error } = await supabase
        .from('system_modules')
        .update(data.updates)
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-menu-modules'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-menu-system-modules'] });
      toast({ title: "Módulo atualizado" });
    },
  });

  const handleSave = () => {
    if (!selectedItem) return;
    updateItemMutation.mutate({
      id: selectedItem.id,
      updates: {
        name: selectedItem.name,
        icon_key: selectedItem.icon_key,
        route: selectedItem.route,
        is_active: selectedItem.is_active,
        is_internal_only: selectedItem.is_internal_only,
        description: selectedItem.description,
      },
    });
  };

  const handleMove = async (itemId: string, direction: 'up' | 'down') => {
    if (!modules) return;
    const item = modules.find(i => i.id === itemId);
    if (!item) return;

    const siblings = modules
      .filter(i => i.parent_module_id === item.parent_module_id)
      .sort((a, b) => a.sort_order - b.sort_order);

    const idx = siblings.findIndex(s => s.id === itemId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const a = siblings[idx];
    const b = siblings[swapIdx];

    await Promise.all([
      supabase.from('system_modules').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('system_modules').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);

    queryClient.invalidateQueries({ queryKey: ['admin-menu-modules'] });
    queryClient.invalidateQueries({ queryKey: ['dynamic-menu-system-modules'] });
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedItem?.id === node.id;
    const layerInfo = LAYER_OPTIONS.find(l => l.value === node.layer);

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors group",
            isSelected && "bg-accent",
            !node.is_active && "opacity-50",
          )}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => handleSelect(node)}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />

          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }} className="p-0.5">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          ) : (
            <div className="w-4.5" />
          )}

          <span className="text-sm flex-1 truncate">{node.name}</span>

          {node.route && (
            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">{node.route}</span>
          )}

          {depth === 0 && layerInfo && (
            <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-4", layerInfo.color)}>
              {layerInfo.label}
            </Badge>
          )}

          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleMove(node.id, 'up'); }}>↑</Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleMove(node.id, 'down'); }}>↓</Button>
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div>{node.children.map(child => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex gap-4 h-full">
      <Card className="flex-1 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Construtor de Menu (Módulos)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-y-auto max-h-[calc(100vh-200px)]">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="space-y-0.5">{tree.map(node => renderNode(node))}</div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <SheetContent className="w-[400px] sm:max-w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Editar Módulo</SheetTitle>
            <SheetDescription>Configure as propriedades do módulo.</SheetDescription>
          </SheetHeader>

          {selectedItem && (
            <div className="space-y-6 mt-6">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Informações</h4>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={selectedItem.name} onChange={(e) => setSelectedItem({ ...selectedItem, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Ícone (Lucide key)</Label>
                  <Input value={selectedItem.icon_key} onChange={(e) => setSelectedItem({ ...selectedItem, icon_key: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Rota</Label>
                  <Input
                    value={selectedItem.route || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, route: e.target.value || null })}
                    placeholder="Sem rota (agrupador)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    value={selectedItem.description || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, description: e.target.value || null })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Ativo</Label>
                  <Switch checked={selectedItem.is_active} onCheckedChange={(v) => setSelectedItem({ ...selectedItem, is_active: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Interno (só admin)</Label>
                  <Switch checked={selectedItem.is_internal_only} onCheckedChange={(v) => setSelectedItem({ ...selectedItem, is_internal_only: v })} />
                </div>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p><strong>Key:</strong> {selectedItem.key}</p>
                <p><strong>Layer:</strong> {selectedItem.layer}</p>
                <p><strong>Sort Order:</strong> {selectedItem.sort_order}</p>
              </div>

              <Button onClick={handleSave} className="w-full" disabled={updateItemMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Salvar Alterações
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function buildTree(items: ModuleItem[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  items.forEach(item => {
    nodeMap.set(item.id, { ...item, children: [] });
  });

  nodeMap.forEach(node => {
    if (node.parent_module_id && nodeMap.has(node.parent_module_id)) {
      nodeMap.get(node.parent_module_id)!.children.push(node);
    } else if (!node.parent_module_id) {
      roots.push(node);
    }
  });

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    nodes.forEach(n => sort(n.children));
  };
  sort(roots);

  return roots;
}
