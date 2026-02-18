import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  ChevronRight, ChevronDown, GripVertical, Settings, Eye, EyeOff, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MenuItem {
  id: string;
  parent_id: string | null;
  category_root: string;
  label: string;
  icon_key: string;
  route: string | null;
  order_index: number;
  status: string;
  feature_key: string | null;
  permission_key: string | null;
  scope: string;
  marketplace_code: string | null;
}

interface MenuItemRule {
  id: string;
  menu_item_id: string;
  allowed_roles: string[];
  min_plan_code: string | null;
  allowed_plans: string[] | null;
  requires_marketplace_connected: boolean;
  required_feature_flags: string[] | null;
  is_enabled: boolean;
}

interface TreeNode extends MenuItem {
  children: TreeNode[];
  rule?: MenuItemRule;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo', color: 'bg-green-500/10 text-green-700 border-green-500/20' },
  { value: 'beta', label: 'Beta', color: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
  { value: 'coming_soon', label: 'Em breve', color: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
  { value: 'hidden', label: 'Oculto', color: 'bg-muted text-muted-foreground' },
];

const PLAN_OPTIONS = ['zpl', 'basic', 'pro', 'analytics_pro'];
const ROLE_OPTIONS = ['admin', 'owner', 'collaborator'];

export default function AdminMenuBuilder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<TreeNode | null>(null);
  const [editingRule, setEditingRule] = useState<Partial<MenuItemRule>>({});

  // Fetch all items and rules
  const { data: menuData, isLoading } = useQuery({
    queryKey: ['admin-menu-items'],
    queryFn: async () => {
      const [itemsRes, rulesRes] = await Promise.all([
        supabase.from('menu_items').select('*').order('order_index'),
        supabase.from('menu_item_rules').select('*'),
      ]);
      return {
        items: (itemsRes.data || []) as MenuItem[],
        rules: (rulesRes.data || []) as MenuItemRule[],
      };
    },
  });

  // Build tree
  const tree = buildTree(menuData?.items || [], menuData?.rules || []);

  // Toggle expand
  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Expand all on load
  useEffect(() => {
    if (menuData?.items) {
      setExpandedNodes(new Set(menuData.items.map(i => i.id)));
    }
  }, [menuData]);

  // Select item for editing
  const handleSelect = (node: TreeNode) => {
    setSelectedItem(node);
    setEditingRule(node.rule || {
      allowed_roles: [],
      min_plan_code: null,
      allowed_plans: null,
      requires_marketplace_connected: false,
      required_feature_flags: null,
      is_enabled: true,
    });
  };

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<MenuItem> }) => {
      const { error } = await supabase
        .from('menu_items')
        .update(data.updates)
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-menu-items'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-menu-items'] });
      toast({ title: "Item atualizado" });
    },
  });

  // Upsert rule mutation
  const upsertRuleMutation = useMutation({
    mutationFn: async (data: { menu_item_id: string; rule: Partial<MenuItemRule> }) => {
      const { error } = await supabase
        .from('menu_item_rules')
        .upsert({
          menu_item_id: data.menu_item_id,
          allowed_roles: data.rule.allowed_roles || [],
          min_plan_code: data.rule.min_plan_code || null,
          allowed_plans: data.rule.allowed_plans || null,
          requires_marketplace_connected: data.rule.requires_marketplace_connected ?? false,
          required_feature_flags: data.rule.required_feature_flags || null,
          is_enabled: data.rule.is_enabled ?? true,
        }, { onConflict: 'menu_item_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-menu-items'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-menu-items'] });
      toast({ title: "Regras salvas" });
    },
  });

  // Save current item
  const handleSave = () => {
    if (!selectedItem) return;
    
    updateItemMutation.mutate({
      id: selectedItem.id,
      updates: {
        label: selectedItem.label,
        icon_key: selectedItem.icon_key,
        route: selectedItem.route,
        status: selectedItem.status,
        permission_key: selectedItem.permission_key,
      },
    });

    upsertRuleMutation.mutate({
      menu_item_id: selectedItem.id,
      rule: editingRule,
    });
  };

  // Move item up/down
  const handleMove = async (itemId: string, direction: 'up' | 'down') => {
    if (!menuData) return;
    const item = menuData.items.find(i => i.id === itemId);
    if (!item) return;
    
    const siblings = menuData.items
      .filter(i => i.parent_id === item.parent_id)
      .sort((a, b) => a.order_index - b.order_index);
    
    const idx = siblings.findIndex(s => s.id === itemId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const a = siblings[idx];
    const b = siblings[swapIdx];

    await Promise.all([
      supabase.from('menu_items').update({ order_index: b.order_index }).eq('id', a.id),
      supabase.from('menu_items').update({ order_index: a.order_index }).eq('id', b.id),
    ]);

    queryClient.invalidateQueries({ queryKey: ['admin-menu-items'] });
    queryClient.invalidateQueries({ queryKey: ['dynamic-menu-items'] });
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedItem?.id === node.id;
    const statusInfo = STATUS_OPTIONS.find(s => s.value === node.status);

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors group",
            isSelected && "bg-accent",
          )}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => handleSelect(node)}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
          
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
              className="p-0.5"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-4.5" />
          )}

          <span className="text-sm flex-1 truncate">{node.label}</span>

          {node.route && (
            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
              {node.route}
            </span>
          )}

          <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-4", statusInfo?.color)}>
            {statusInfo?.label}
          </Badge>

          {node.rule && !node.rule.is_enabled && (
            <EyeOff className="h-3.5 w-3.5 text-destructive" />
          )}

          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); handleMove(node.id, 'up'); }}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); handleMove(node.id, 'down'); }}
            >
              ↓
            </Button>
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex gap-4 h-full">
      {/* Tree Panel */}
      <Card className="flex-1 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Construtor de Menu
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-y-auto max-h-[calc(100vh-200px)]">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="space-y-0.5">
              {tree.map(node => renderNode(node))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Panel */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <SheetContent className="w-[400px] sm:max-w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Editar Item</SheetTitle>
            <SheetDescription>Configure as propriedades e regras de acesso.</SheetDescription>
          </SheetHeader>

          {selectedItem && (
            <div className="space-y-6 mt-6">
              {/* Basic Info */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Informações</h4>
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    value={selectedItem.label}
                    onChange={(e) => setSelectedItem({ ...selectedItem, label: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ícone (Lucide key)</Label>
                  <Input
                    value={selectedItem.icon_key}
                    onChange={(e) => setSelectedItem({ ...selectedItem, icon_key: e.target.value })}
                  />
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
                  <Label>Status</Label>
                  <Select
                    value={selectedItem.status}
                    onValueChange={(v) => setSelectedItem({ ...selectedItem, status: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Permission Key</Label>
                  <Input
                    value={selectedItem.permission_key || ''}
                    onChange={(e) => setSelectedItem({ ...selectedItem, permission_key: e.target.value || null })}
                    placeholder="ex: meli.panel.dashboard.view"
                  />
                </div>
              </div>

              {/* Rules */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Regras de Acesso</h4>
                
                <div className="flex items-center justify-between">
                  <Label>Habilitado</Label>
                  <Switch
                    checked={editingRule.is_enabled ?? true}
                    onCheckedChange={(v) => setEditingRule({ ...editingRule, is_enabled: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Roles permitidos</Label>
                  <div className="flex gap-2 flex-wrap">
                    {ROLE_OPTIONS.map(role => (
                      <label key={role} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={(editingRule.allowed_roles || []).includes(role)}
                          onCheckedChange={(checked) => {
                            const current = editingRule.allowed_roles || [];
                            setEditingRule({
                              ...editingRule,
                              allowed_roles: checked
                                ? [...current, role]
                                : current.filter(r => r !== role),
                            });
                          }}
                        />
                        {role}
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Vazio = todos os roles</p>
                </div>

                <div className="space-y-2">
                  <Label>Plano mínimo</Label>
                  <Select
                    value={editingRule.min_plan_code || 'none'}
                    onValueChange={(v) => setEditingRule({ ...editingRule, min_plan_code: v === 'none' ? null : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem restrição</SelectItem>
                      {PLAN_OPTIONS.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label>Requer marketplace conectado</Label>
                  <Switch
                    checked={editingRule.requires_marketplace_connected ?? false}
                    onCheckedChange={(v) => setEditingRule({ ...editingRule, requires_marketplace_connected: v })}
                  />
                </div>
              </div>

              {/* Meta */}
              <div className="space-y-2 text-xs text-muted-foreground">
                <p><strong>Feature Key:</strong> {selectedItem.feature_key || '—'}</p>
                <p><strong>Scope:</strong> {selectedItem.scope}</p>
                <p><strong>Marketplace:</strong> {selectedItem.marketplace_code || '—'}</p>
                <p><strong>Category Root:</strong> {selectedItem.category_root}</p>
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

function buildTree(items: MenuItem[], rules: MenuItemRule[]): TreeNode[] {
  const rulesMap = new Map<string, MenuItemRule>();
  rules.forEach(r => rulesMap.set(r.menu_item_id, r));

  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  items.forEach(item => {
    nodeMap.set(item.id, { ...item, children: [], rule: rulesMap.get(item.id) });
  });

  nodeMap.forEach(node => {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id)!.children.push(node);
    } else if (!node.parent_id) {
      roots.push(node);
    }
  });

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.order_index - b.order_index);
    nodes.forEach(n => sort(n.children));
  };
  sort(roots);

  return roots;
}
