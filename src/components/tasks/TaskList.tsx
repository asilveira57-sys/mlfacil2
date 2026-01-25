import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, ExternalLink, AlertCircle } from 'lucide-react';
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  type Task,
  type TaskStatus,
  type TaskPriority,
} from '@/types/tasks';

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}

export function TaskList({
  tasks,
  loading,
  selectedIds,
  onSelectChange,
  onStatusChange,
  onDelete,
}: TaskListProps) {
  const navigate = useNavigate();

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectChange([...selectedIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === tasks.length) {
      onSelectChange([]);
    } else {
      onSelectChange(tasks.map(t => t.id));
    }
  };

  const isOverdue = (task: Task) => {
    if (!task.due_at || task.status === 'done') return false;
    return new Date(task.due_at) < new Date();
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">Nenhuma tarefa encontrada</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Crie uma nova tarefa para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={selectedIds.length === tasks.length && tasks.length > 0}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead>Título</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-28">Prioridade</TableHead>
            <TableHead className="w-40">Prazo</TableHead>
            <TableHead className="w-32">Origem</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map(task => (
            <TableRow
              key={task.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/tarefas/${task.id}`)}
            >
              <TableCell onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.includes(task.id)}
                  onCheckedChange={() => toggleSelect(task.id)}
                />
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-medium line-clamp-1">{task.title}</span>
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {task.tags.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {task.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{task.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge className={TASK_STATUS_COLORS[task.status]}>
                  {TASK_STATUS_LABELS[task.status]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className={TASK_PRIORITY_COLORS[task.priority]}>
                  {TASK_PRIORITY_LABELS[task.priority]}
                </Badge>
              </TableCell>
              <TableCell>
                {task.due_at ? (
                  <span className={isOverdue(task) ? 'text-destructive font-medium' : ''}>
                    {format(new Date(task.due_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {task.source_type ? (
                  <Badge variant="outline" className="text-xs capitalize">
                    {task.source_type}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Manual</span>
                )}
              </TableCell>
              <TableCell onClick={e => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/tarefas/${task.id}`)}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Mudar status</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                          <DropdownMenuItem
                            key={value}
                            onClick={() => onStatusChange(task.id, value as TaskStatus)}
                            disabled={task.status === value}
                          >
                            {label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDelete(task.id)}
                    >
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
