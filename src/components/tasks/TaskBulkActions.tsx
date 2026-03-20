import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { X, CheckSquare, User, Flag, Calendar, Loader2 } from 'lucide-react';
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
} from '@/types/tasks';
import type { WorkspaceMember } from '@/types/tasks';

interface TaskBulkActionsProps {
  selectedCount: number;
  onClear: () => void;
  onStatusChange: (status: TaskStatus) => Promise<void>;
  onPriorityChange: (priority: TaskPriority) => Promise<void>;
  onAssigneeChange: (assignee: string | null) => Promise<void>;
  members: WorkspaceMember[];
}

export function TaskBulkActions({
  selectedCount,
  onClear,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  members,
}: TaskBulkActionsProps) {
  const [loading, setLoading] = useState(false);

  const handleAction = async (action: () => Promise<void>) => {
    setLoading(true);
    try {
      await action();
    } finally {
      setLoading(false);
    }
  };

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 bg-background border shadow-lg rounded-lg px-4 py-3">
        <Badge variant="secondary" className="font-mono">
          {selectedCount}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {selectedCount === 1 ? 'tarefa selecionada' : 'tarefas selecionadas'}
        </span>

        <div className="h-4 w-px bg-border mx-2" />

        {loading && <Loader2 className="h-4 w-4 animate-spin" />}

        {/* Status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading}>
              <CheckSquare className="h-4 w-4 mr-1" />
              Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <DropdownMenuItem
                key={value}
                onClick={() => handleAction(() => onStatusChange(value as TaskStatus))}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Priority */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading}>
              <Flag className="h-4 w-4 mr-1" />
              Prioridade
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
              <DropdownMenuItem
                key={value}
                onClick={() => handleAction(() => onPriorityChange(value as TaskPriority))}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Assignee */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading}>
              <User className="h-4 w-4 mr-1" />
              Atribuir
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleAction(() => onAssigneeChange(null))}>
              Remover responsável
            </DropdownMenuItem>
            {members.map(member => (
              <DropdownMenuItem
                key={member.user_id}
                onClick={() => handleAction(() => onAssigneeChange(member.user_id))}
              >
                {member.full_name || member.user_id.slice(0, 8) + '...'}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-4 w-px bg-border mx-2" />

        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
