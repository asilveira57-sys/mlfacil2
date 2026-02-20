import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, GripVertical, CalendarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useSavedIdeas, useUpdateIdeaStatus, useUpdateIdea, useDeleteIdea, SavedIdea } from '@/hooks/useSocialCalendar';

const COLUMNS: { key: SavedIdea['status']; label: string; color: string }[] = [
  { key: 'backlog', label: '📋 Backlog', color: 'border-muted' },
  { key: 'produzindo', label: '⚙️ Produzindo', color: 'border-blue-300' },
  { key: 'postado', label: '✅ Postado', color: 'border-green-300' },
];

export function SocialCalendarSavedIdeas() {
  const { data: ideas = [], isLoading } = useSavedIdeas();
  const updateStatus = useUpdateIdeaStatus();
  const updateIdea = useUpdateIdea();
  const deleteIdea = useDeleteIdea();
  const [editing, setEditing] = useState<SavedIdea | null>(null);

  const byStatus = COLUMNS.reduce<Record<string, SavedIdea[]>>((acc, col) => {
    acc[col.key] = ideas.filter((i) => i.status === col.key);
    return acc;
  }, {});

  if (isLoading) {
    return <div className="text-center py-16 text-muted-foreground animate-pulse">Carregando pautas...</div>;
  }

  if (ideas.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium mb-2">Nenhuma pauta salva</p>
        <p className="text-sm">Acesse o Calendário, clique em "Ver ideias" e salve suas pautas favoritas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className={cn('border-2 rounded-xl', col.color)}>
            <div className="p-3 border-b bg-muted/30 rounded-t-xl">
              <h3 className="font-semibold text-sm">{col.label}</h3>
              <p className="text-xs text-muted-foreground">{byStatus[col.key]?.length ?? 0} pautas</p>
            </div>
            <ScrollArea className="h-[420px]">
              <div className="p-3 space-y-3">
                {(byStatus[col.key] ?? []).map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    onEdit={() => setEditing(idea)}
                    onDelete={() => deleteIdea.mutate(idea.id)}
                    onChangeStatus={(status) => updateStatus.mutate({ id: idea.id, status })}
                  />
                ))}
                {(byStatus[col.key] ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center py-4 italic">Vazio</p>
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      {editing && (
        <EditIdeaDialog
          idea={editing}
          open
          onClose={() => setEditing(null)}
          onSave={async (updates) => {
            await updateIdea.mutateAsync({ id: editing.id, ...updates });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function IdeaCard({
  idea,
  onEdit,
  onDelete,
  onChangeStatus,
}: {
  idea: SavedIdea;
  onEdit: () => void;
  onDelete: () => void;
  onChangeStatus: (s: SavedIdea['status']) => void;
}) {
  const title = idea.custom_title ?? idea.event?.title ?? 'Pauta sem título';

  return (
    <div className="border rounded-lg p-3 bg-card space-y-2 shadow-sm">
      <p className="text-sm font-medium leading-snug">{title}</p>
      {idea.event?.event_date && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarIcon className="h-3 w-3" />
          {format(new Date(idea.event.event_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
        </div>
      )}
      {idea.planned_date && (
        <div className="flex items-center gap-1 text-xs text-blue-600">
          <CalendarIcon className="h-3 w-3" />
          Planejo: {format(new Date(idea.planned_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
        </div>
      )}
      {idea.custom_notes && (
        <p className="text-xs text-muted-foreground line-clamp-2">{idea.custom_notes}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <Select value={idea.status} onValueChange={(v) => onChangeStatus(v as SavedIdea['status'])}>
          <SelectTrigger className="h-6 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="backlog">Backlog</SelectItem>
            <SelectItem value="produzindo">Produzindo</SelectItem>
            <SelectItem value="postado">Postado</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditIdeaDialog({
  idea,
  open,
  onClose,
  onSave,
}: {
  idea: SavedIdea;
  open: boolean;
  onClose: () => void;
  onSave: (updates: { custom_title?: string; custom_notes?: string; planned_date?: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(idea.custom_title ?? idea.event?.title ?? '');
  const [notes, setNotes] = useState(idea.custom_notes ?? '');
  const [date, setDate] = useState(idea.planned_date ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ custom_title: title, custom_notes: notes, planned_date: date || undefined });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Pauta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da pauta" />
          </div>
          <div>
            <Label>Data planejada</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações, ideias, referências..."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
