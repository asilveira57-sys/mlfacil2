import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Settings, Plus, ChevronsUpDown, Search, ChevronDown, ChevronRight,
} from 'lucide-react';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import { buildTree, flattenTree, type TreeNode, type ModuleItem } from './types';
import { useMenuModules, useMenuBuilderActions } from './useMenuBuilderActions';
import { MenuTreeNode } from './MenuTreeNode';
import { ModuleEditSheet } from './ModuleEditSheet';
import { NewModuleDialog } from './NewModuleDialog';
import { DeleteModuleDialog } from './DeleteModuleDialog';

export default function MenuBuilderPage() {
  const { data: modules, isLoading } = useMenuModules();
  const actions = useMenuBuilderActions();

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<TreeNode | null>(null);
  const [search, setSearch] = useState('');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newSubmenuParent, setNewSubmenuParent] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TreeNode | null>(null);

  // Expand all on first load
  useEffect(() => {
    if (modules) {
      setExpandedNodes(new Set(modules.map(i => i.id)));
    }
  }, [modules]);

  const tree = useMemo(() => buildTree(modules || []), [modules]);

  // Filter tree by search
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();

    const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.reduce<TreeNode[]>((acc, node) => {
        const matchesSelf = node.name.toLowerCase().includes(q) || node.route?.toLowerCase().includes(q) || node.key.toLowerCase().includes(q);
        const filteredChildren = filterNodes(node.children);
        if (matchesSelf || filteredChildren.length > 0) {
          acc.push({ ...node, children: filteredChildren });
        }
        return acc;
      }, []);
    };
    return filterNodes(tree);
  }, [tree, search]);

  // Build visible flat list based on expanded state
  const visibleFlat = useMemo(() => {
    const result: TreeNode[] = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        result.push({ ...node, depth });
        if (expandedNodes.has(node.id) && node.children.length > 0) {
          walk(node.children, depth + 1);
        }
      }
    };
    walk(filteredTree, 0);
    return result;
  }, [filteredTree, expandedNodes]);

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const collapseAll = () => setExpandedNodes(new Set());
  const expandAll = () => {
    if (modules) setExpandedNodes(new Set(modules.map(i => i.id)));
  };

  // --- Drag & Drop ---
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !modules) return;

    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    if (srcIdx === destIdx) return;

    const draggedNode = visibleFlat[srcIdx];
    const destNode = visibleFlat[destIdx];

    // Determine new parent and sort order
    let newParentId: string | null = destNode.parent_module_id;
    const destDepth = destNode.depth;
    const dragDepth = draggedNode.depth;

    // If dropping onto a deeper level, make it a child of the node above
    if (destIdx > 0 && destDepth > dragDepth) {
      // Find the parent at destination
      for (let i = destIdx - 1; i >= 0; i--) {
        if (visibleFlat[i].depth === destDepth - 1) {
          newParentId = visibleFlat[i].id;
          break;
        }
      }
    }

    // Get siblings at the same level
    const allItems = modules.map(m => ({
      id: m.id,
      sort_order: m.sort_order,
      parent_module_id: m.parent_module_id,
    }));

    // Update dragged item's parent
    const draggedIdx = allItems.findIndex(i => i.id === draggedNode.id);
    if (draggedIdx >= 0) {
      allItems[draggedIdx].parent_module_id = newParentId;
    }

    // Recalculate sort orders for siblings of the destination
    const siblings = allItems
      .filter(i => i.parent_module_id === newParentId)
      .sort((a, b) => a.sort_order - b.sort_order);

    // Remove dragged from siblings and re-insert at position
    const withoutDragged = siblings.filter(s => s.id !== draggedNode.id);
    const insertAt = Math.min(destIdx, withoutDragged.length);

    // Find the position relative to siblings
    let siblingInsertIdx = 0;
    if (destNode.parent_module_id === newParentId) {
      siblingInsertIdx = withoutDragged.findIndex(s => s.id === destNode.id);
      if (siblingInsertIdx < 0) siblingInsertIdx = withoutDragged.length;
      if (destIdx > srcIdx) siblingInsertIdx++;
    }

    withoutDragged.splice(siblingInsertIdx, 0, allItems[draggedIdx]);

    // Assign new sort orders
    const updates = withoutDragged.map((item, idx) => ({
      id: item.id,
      sort_order: (idx + 1) * 10,
      parent_module_id: item.parent_module_id,
    }));

    actions.reorder(updates);
  };

  // --- Actions ---
  const handleMoveToRoot = (id: string) => {
    actions.updateModule.mutate({ id, updates: { parent_module_id: null } });
  };

  const handleAddSubmenu = (parentId: string) => {
    const parent = modules?.find(m => m.id === parentId);
    setNewSubmenuParent({ id: parentId, name: parent?.name || '' });
  };

  const handleDuplicate = (node: TreeNode) => {
    const maxSort = modules
      ? Math.max(0, ...modules.filter(m => m.parent_module_id === node.parent_module_id).map(m => m.sort_order))
      : 0;
    actions.createModule.mutate({
      name: `${node.name} (cópia)`,
      key: `${node.key}-copy-${Date.now()}`,
      icon_key: node.icon_key,
      route: node.route,
      layer: node.layer,
      parent_module_id: node.parent_module_id,
      sort_order: maxSort + 10,
    });
  };

  const handleToggleActive = (id: string, active: boolean) => {
    actions.updateModule.mutate({ id, updates: { is_active: active } });
  };

  const handleCreateModule = (data: Parameters<typeof actions.createModule.mutate>[0]) => {
    const maxSort = modules
      ? Math.max(0, ...modules.filter(m => m.parent_module_id === data.parent_module_id).map(m => m.sort_order))
      : 0;
    actions.createModule.mutate({ ...data, sort_order: maxSort + 10 });
  };

  const handleDeleteConfirm = (promoteChildren: boolean) => {
    if (!deleteTarget) return;
    actions.deleteModule.mutate({ id: deleteTarget.id, promoteChildren });
    setDeleteTarget(null);
    if (selectedItem?.id === deleteTarget.id) setSelectedItem(null);
  };

  const handleSaveEdit = (id: string, updates: Partial<ModuleItem>) => {
    actions.updateModule.mutate({ id, updates });
    setSelectedItem(null);
  };

  return (
    <div className="flex gap-4 h-full">
      <Card className="flex-1 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Construtor de Menu (Módulos)
            </CardTitle>
            <Button size="sm" onClick={() => setNewMenuOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Menu
            </Button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar módulo..."
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs h-8 gap-1">
              <ChevronDown className="h-3.5 w-3.5" />
              Expandir
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs h-8 gap-1">
              <ChevronRight className="h-3.5 w-3.5" />
              Colapsar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto max-h-[calc(100vh-260px)]">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando módulos...</p>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="menu-tree">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-0.5">
                    {visibleFlat.map((node, idx) => (
                      <MenuTreeNode
                        key={node.id}
                        node={node}
                        flatIndex={idx}
                        isExpanded={expandedNodes.has(node.id)}
                        isSelected={selectedItem?.id === node.id}
                        onToggleExpand={toggleExpand}
                        onSelect={setSelectedItem}
                        onRename={actions.renameModule}
                        onMoveToRoot={handleMoveToRoot}
                        onAddSubmenu={handleAddSubmenu}
                        onDuplicate={handleDuplicate}
                        onDelete={setDeleteTarget}
                        onToggleActive={handleToggleActive}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </CardContent>
      </Card>

      <ModuleEditSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSave={handleSaveEdit}
        saving={actions.updateModule.isPending}
      />

      <NewModuleDialog
        open={newMenuOpen || !!newSubmenuParent}
        onOpenChange={(open) => {
          if (!open) { setNewMenuOpen(false); setNewSubmenuParent(null); }
        }}
        onSubmit={handleCreateModule}
        parentId={newSubmenuParent?.id ?? null}
        parentName={newSubmenuParent?.name}
      />

      <DeleteModuleDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        node={deleteTarget}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
