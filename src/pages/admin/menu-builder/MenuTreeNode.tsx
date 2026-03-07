import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  ChevronRight,
  ChevronDown,
  GripVertical,
  Pencil,
  ArrowUpToLine,
  CornerDownRight,
  Copy,
  Trash2,
  Plus,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TreeNode } from './types';
import { LAYER_OPTIONS } from './types';
import { Draggable } from '@hello-pangea/dnd';

interface MenuTreeNodeProps {
  node: TreeNode;
  flatIndex: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: (id: string) => void;
  onSelect: (node: TreeNode) => void;
  onRename: (id: string, name: string) => void;
  onMoveToRoot: (id: string) => void;
  onAddSubmenu: (parentId: string) => void;
  onDuplicate: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

export function MenuTreeNode({
  node,
  flatIndex,
  isExpanded,
  isSelected,
  onToggleExpand,
  onSelect,
  onRename,
  onMoveToRoot,
  onAddSubmenu,
  onDuplicate,
  onDelete,
  onToggleActive,
}: MenuTreeNodeProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasChildren = node.children.length > 0;
  const layerInfo = LAYER_OPTIONS.find(l => l.value === node.layer);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleRenameSubmit = () => {
    if (editValue.trim() && editValue !== node.name) {
      onRename(node.id, editValue.trim());
    } else {
      setEditValue(node.name);
    }
    setEditing(false);
  };

  return (
    <Draggable draggableId={node.id} index={flatIndex}>
      {(provided, snapshot) => (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors group border border-transparent',
                isSelected && 'bg-accent border-accent-foreground/10',
                !isSelected && 'hover:bg-accent/50',
                snapshot.isDragging && 'bg-accent shadow-lg ring-2 ring-primary/20',
                !node.is_active && 'opacity-40',
              )}
              style={{
                ...provided.draggableProps.style,
                paddingLeft: `${node.depth * 24 + 8}px`,
              }}
              onClick={() => onSelect(node)}
            >
              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity" />
              </div>

              {hasChildren ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
                  className="p-0.5 hover:bg-muted rounded"
                >
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </button>
              ) : (
                <div className="w-[18px]" />
              )}

              {editing ? (
                <Input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit();
                    if (e.key === 'Escape') { setEditValue(node.name); setEditing(false); }
                  }}
                  className="h-6 text-sm px-1 py-0 w-48"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="text-sm flex-1 truncate select-none"
                  onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
                >
                  {node.name}
                </span>
              )}

              {node.route && (
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px] hidden sm:inline">
                  {node.route}
                </span>
              )}

              {node.depth === 0 && layerInfo && (
                <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4 shrink-0', layerInfo.color)}>
                  {layerInfo.label}
                </Badge>
              )}

              {!node.is_active && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-muted-foreground">
                  Inativo
                </Badge>
              )}
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent className="w-52">
            <ContextMenuItem onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Renomear
            </ContextMenuItem>
            {node.parent_module_id && (
              <ContextMenuItem onClick={() => onMoveToRoot(node.id)}>
                <ArrowUpToLine className="h-3.5 w-3.5 mr-2" />
                Mover para raiz
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => onAddSubmenu(node.id)}>
              <Plus className="h-3.5 w-3.5 mr-2" />
              Adicionar submenu
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onDuplicate(node)}>
              <Copy className="h-3.5 w-3.5 mr-2" />
              Duplicar
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onToggleActive(node.id, !node.is_active)}>
              {node.is_active ? <EyeOff className="h-3.5 w-3.5 mr-2" /> : <Eye className="h-3.5 w-3.5 mr-2" />}
              {node.is_active ? 'Desativar' : 'Ativar'}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onDelete(node)} className="text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Excluir
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </Draggable>
  );
}
