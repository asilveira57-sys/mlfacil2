export interface ModuleItem {
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
  status: string;
}

export interface TreeNode extends ModuleItem {
  children: TreeNode[];
  depth: number;
}

export const LAYER_OPTIONS = [
  { value: 'admin', label: 'Admin', color: 'bg-red-500/10 text-red-700 border-red-500/20' },
  { value: 'marketplace', label: 'Marketplace', color: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
  { value: 'operacional', label: 'Operacional', color: 'bg-green-500/10 text-green-700 border-green-500/20' },
  { value: 'ferramentas', label: 'Ferramentas', color: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
  { value: 'sistema', label: 'Sistema', color: 'bg-muted text-muted-foreground' },
  { value: 'financeiro', label: 'Financeiro', color: 'bg-purple-500/10 text-purple-700 border-purple-500/20' },
] as const;

export function buildTree(items: ModuleItem[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  items.forEach(item => {
    nodeMap.set(item.id, { ...item, children: [], depth: 0 });
  });

  nodeMap.forEach(node => {
    if (node.parent_module_id && nodeMap.has(node.parent_module_id)) {
      node.depth = (nodeMap.get(node.parent_module_id)!.depth || 0) + 1;
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

export function flattenTree(nodes: TreeNode[], depth = 0): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}
