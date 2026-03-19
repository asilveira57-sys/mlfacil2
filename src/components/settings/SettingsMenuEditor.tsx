import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GripVertical, Pencil, Check, X, Settings2, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditableItem {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  display_order: number;
  group_name?: string;
  markedForDeletion?: boolean;
}

function SortableItem({
  item,
  onToggle,
  onRename,
  onMarkDelete,
}: {
  item: EditableItem;
  onToggle: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onMarkDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(item.name);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleConfirm = () => {
    if (tempName.trim()) {
      onRename(item.id, tempName.trim());
    }
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background",
        isDragging && "opacity-50 shadow-lg z-50",
        !item.active && "opacity-50",
        item.markedForDeletion && "opacity-30 bg-destructive/5 border-destructive/30"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleConfirm}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={cn("text-sm truncate", item.markedForDeletion && "line-through")}>{item.name}</span>
            {!item.markedForDeletion && (
              <button
                onClick={() => { setTempName(item.name); setEditing(true); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {!item.markedForDeletion && (
        <Switch
          checked={item.active}
          onCheckedChange={() => onToggle(item.id)}
          className="shrink-0"
        />
      )}

      <button
        onClick={() => onMarkDelete(item.id)}
        className={cn(
          "shrink-0 p-1 rounded-md transition-colors",
          item.markedForDeletion
            ? "text-muted-foreground hover:text-foreground"
            : "text-muted-foreground hover:text-destructive"
        )}
        title={item.markedForDeletion ? "Desfazer exclusão" : "Excluir item"}
      >
        {item.markedForDeletion ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function SettingsMenuEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const handleOpen = useCallback(async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLoadingItems(true);
      try {
        const [groupsRes, itemsRes] = await Promise.all([
          supabase.from('config_menu_groups').select('*').order('display_order', { ascending: true }),
          supabase.from('config_menu_items').select('*').order('display_order', { ascending: true }),
        ]);

        const groups = groupsRes.data || [];
        const allItems = itemsRes.data || [];

        const flat: EditableItem[] = [];
        groups.forEach(g => {
          allItems
            .filter(i => i.group_id === g.id && !i.parent_id)
            .forEach(item => {
              flat.push({
                id: item.id,
                slug: item.slug,
                name: item.name,
                active: item.active,
                display_order: item.display_order,
                group_name: g.name,
                markedForDeletion: false,
              });
            });
        });
        setItems(flat);
      } catch (err) {
        console.error('[SettingsMenuEditor] Failed to load items:', err);
      } finally {
        setLoadingItems(false);
      }
      setHasChanges(false);
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id);
      const newIndex = prev.findIndex(i => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setHasChanges(true);
  };

  const handleToggle = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, active: !i.active } : i));
    setHasChanges(true);
  };

  const handleRename = (id: string, name: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, name } : i));
    setHasChanges(true);
  };

  const handleMarkDelete = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, markedForDeletion: !i.markedForDeletion } : i));
    setHasChanges(true);
  };

  const itemsToDelete = items.filter(i => i.markedForDeletion);
  const itemsToSave = items.filter(i => !i.markedForDeletion);

  const handleSaveClick = () => {
    if (itemsToDelete.length > 0) {
      setConfirmDeleteOpen(true);
    } else {
      saveMutation.mutate();
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Delete marked items
      if (itemsToDelete.length > 0) {
        const deleteIds = itemsToDelete.map(i => i.id);
        const { error: delError } = await supabase
          .from("config_menu_items")
          .delete()
          .in("id", deleteIds);
        if (delError) throw delError;
      }

      // Update remaining items
      for (const [index, item] of itemsToSave.entries()) {
        const { error } = await supabase
          .from("config_menu_items")
          .update({ display_order: index + 1, name: item.name, active: item.active })
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["config-menu"] });
      await queryClient.refetchQueries({ queryKey: ["config-menu"] });
      toast({ title: "Menu atualizado com sucesso" });
      setHasChanges(false);
      setOpen(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    },
  });

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Settings2 className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:max-w-[400px] flex flex-col">
          <SheetHeader>
            <SheetTitle>Editar Menu</SheetTitle>
            <SheetDescription>Arraste para reordenar, clique no lápis para renomear.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto mt-4 space-y-2">
            {loadingItems ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Carregando itens...</div>
            ) : items.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Nenhum item encontrado</div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  {items.map(item => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      onToggle={handleToggle}
                      onRename={handleRename}
                      onMarkDelete={handleMarkDelete}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="pt-4 border-t border-border mt-auto space-y-2">
            {itemsToDelete.length > 0 && (
              <p className="text-xs text-destructive text-center">
                {itemsToDelete.length} item(ns) será(ão) excluído(s) permanentemente
              </p>
            )}
            <Button
              onClick={handleSaveClick}
              disabled={!hasChanges || saveMutation.isPending}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar Alterações
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir permanentemente {itemsToDelete.length} item(ns):
              <span className="block mt-2 font-medium text-foreground">
                {itemsToDelete.map(i => i.name).join(", ")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => saveMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir e Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
