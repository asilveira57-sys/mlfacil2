import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, User, Tag, AlertCircle } from 'lucide-react';
import {
  TASK_STATUS,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  type Task,
  type TaskStatus,
} from '@/types/tasks';

interface TaskBoardProps {
  tasks: Task[];
  loading: boolean;
  onStatusChange: (id: string, status: TaskStatus) => void;
  wipLimits?: Partial<Record<TaskStatus, number>>;
}

const COLUMNS: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];

export function TaskBoard({
  tasks,
  loading,
  onStatusChange,
  wipLimits = {},
}: TaskBoardProps) {
  const navigate = useNavigate();

  const getColumnTasks = (status: TaskStatus) =>
    tasks.filter(t => t.status === status);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId as TaskStatus;

    // Check WIP limit
    const columnTasks = getColumnTasks(newStatus);
    const limit = wipLimits[newStatus];
    if (limit && columnTasks.length >= limit) {
      return; // Don't allow drop
    }

    onStatusChange(taskId, newStatus);
  };

  const isOverdue = (task: Task) => {
    if (!task.due_at || task.status === 'done') return false;
    return new Date(task.due_at) < new Date();
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map(col => (
          <div key={col} className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full">
        {COLUMNS.map(status => {
          const columnTasks = getColumnTasks(status);
          const limit = wipLimits[status];
          const isAtLimit = limit && columnTasks.length >= limit;

          return (
            <div key={status} className="flex flex-col">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">
                    {TASK_STATUS_LABELS[status]}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {columnTasks.length}
                    {limit ? `/${limit}` : ''}
                  </Badge>
                </div>
                {isAtLimit && (
                  <Badge variant="destructive" className="text-xs">
                    Limite
                  </Badge>
                )}
              </div>

              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 min-h-[200px] p-2 rounded-lg border-2 border-dashed transition-colors ${
                      snapshot.isDraggingOver
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent bg-muted/30'
                    }`}
                  >
                    {columnTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                        <AlertCircle className="h-5 w-5 mb-1" />
                        Nenhuma tarefa
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {columnTasks.map((task, index) => (
                          <Draggable
                            key={task.id}
                            draggableId={task.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`cursor-pointer transition-shadow ${
                                  snapshot.isDragging ? 'shadow-lg' : ''
                                } ${isOverdue(task) ? 'border-destructive' : ''}`}
                                onClick={() => navigate(`/tarefas/${task.id}`)}
                              >
                                <CardContent className="p-3 space-y-2">
                                  <p className="font-medium text-sm line-clamp-2">
                                    {task.title}
                                  </p>

                                  <div className="flex flex-wrap gap-1">
                                    <Badge
                                      variant="secondary"
                                      className={`text-xs ${TASK_PRIORITY_COLORS[task.priority]}`}
                                    >
                                      {TASK_PRIORITY_LABELS[task.priority]}
                                    </Badge>
                                    {task.source_type && (
                                      <Badge variant="outline" className="text-xs capitalize">
                                        {task.source_type}
                                      </Badge>
                                    )}
                                  </div>

                                  {task.due_at && (
                                    <div
                                      className={`flex items-center gap-1 text-xs ${
                                        isOverdue(task) ? 'text-destructive' : 'text-muted-foreground'
                                      }`}
                                    >
                                      <Calendar className="h-3 w-3" />
                                      {format(new Date(task.due_at), "dd MMM", { locale: ptBR })}
                                    </div>
                                  )}

                                  {task.tags && task.tags.length > 0 && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Tag className="h-3 w-3" />
                                      {task.tags.slice(0, 2).join(', ')}
                                      {task.tags.length > 2 && ` +${task.tags.length - 2}`}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            )}
                          </Draggable>
                        ))}
                      </div>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
