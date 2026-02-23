import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft,
  Calendar,
  User,
  Tag,
  Plus,
  Check,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Send,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  SOURCE_TYPES,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type TaskChecklist,
  type TaskComment,
  type TaskWatcher,
} from '@/types/tasks';
import type { WorkspaceMember } from '@/types/tasks';

/** Returns "First Last" from a full name, or just "First" if single word */
function shortName(fullName: string | undefined, fallbackId: string): string {
  if (!fullName) return fallbackId.slice(0, 8) + '...';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

interface TaskDetailProps {
  task: Task | null;
  checklists: TaskChecklist[];
  comments: TaskComment[];
  watchers: TaskWatcher[];
  loading: boolean;
  members: WorkspaceMember[];
  currentUserId: string | null;
  onUpdate: (updates: Partial<Task>) => Promise<boolean>;
  onAddChecklist: (title: string) => Promise<void>;
  onToggleChecklist: (id: string, is_done: boolean) => Promise<void>;
  onDeleteChecklist: (id: string) => Promise<void>;
  onAddComment: (comment: string) => Promise<void>;
  onToggleWatch: () => Promise<void>;
}

export function TaskDetail({
  task,
  checklists,
  comments,
  watchers,
  loading,
  members,
  currentUserId,
  onUpdate,
  onAddChecklist,
  onToggleChecklist,
  onDeleteChecklist,
  onAddComment,
  onToggleWatch,
}: TaskDetailProps) {
  const navigate = useNavigate();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const isWatching = watchers.some(w => w.user_id === currentUserId);
  const checklistProgress = checklists.length
    ? Math.round((checklists.filter(c => c.is_done).length / checklists.length) * 100)
    : 0;

  const handleTitleSave = async () => {
    if (titleValue.trim() && titleValue !== task?.title) {
      await onUpdate({ title: titleValue.trim() });
    }
    setEditingTitle(false);
  };

  const handleAddChecklistItem = async () => {
    if (newChecklistItem.trim()) {
      await onAddChecklist(newChecklistItem.trim());
      setNewChecklistItem('');
    }
  };

  const handleAddComment = async () => {
    if (newComment.trim()) {
      setSubmittingComment(true);
      await onAddComment(newComment.trim());
      setNewComment('');
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="container max-w-4xl py-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-8 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="container max-w-4xl py-12 text-center">
        <h2 className="text-xl font-semibold">Tarefa não encontrada</h2>
        <Button className="mt-4" onClick={() => navigate('/tarefas')}>
          Voltar para lista
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/tarefas')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1">
          {editingTitle ? (
            <Input
              autoFocus
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
              className="text-xl font-semibold"
            />
          ) : (
            <h1
              className="text-xl font-semibold cursor-pointer hover:text-primary"
              onClick={() => {
                setTitleValue(task.title);
                setEditingTitle(true);
              }}
            >
              {task.title}
            </h1>
          )}
        </div>

        <Button
          variant={isWatching ? 'secondary' : 'outline'}
          size="sm"
          onClick={onToggleWatch}
        >
          {isWatching ? (
            <>
              <EyeOff className="h-4 w-4 mr-1" />
              Parar de observar
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-1" />
              Observar
            </>
          )}
        </Button>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <Select
              value={task.status}
              onValueChange={value => onUpdate({ status: value as TaskStatus })}
            >
              <SelectTrigger className="h-8">
                <Badge className={TASK_STATUS_COLORS[task.status]}>
                  {TASK_STATUS_LABELS[task.status]}
                </Badge>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Prioridade</p>
            <Select
              value={task.priority}
              onValueChange={value => onUpdate({ priority: value as TaskPriority })}
            >
              <SelectTrigger className="h-8">
                <Badge variant="secondary" className={TASK_PRIORITY_COLORS[task.priority]}>
                  {TASK_PRIORITY_LABELS[task.priority]}
                </Badge>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Prazo</p>
            <div className="flex items-center gap-1 text-sm">
              <Calendar className="h-4 w-4" />
              {task.due_at
                ? format(new Date(task.due_at), "dd 'de' MMM", { locale: ptBR })
                : 'Não definido'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Responsável</p>
            <Select
              value={task.assignee_user_id || 'none'}
              onValueChange={value =>
                onUpdate({ assignee_user_id: value === 'none' ? null : value })
              }
            >
              <SelectTrigger className="h-8">
                <div className="flex items-center gap-1 text-sm">
                  <User className="h-4 w-4" />
                  {task.assignee_user_id
                    ? shortName(members.find(m => m.user_id === task.assignee_user_id)?.full_name, task.assignee_user_id)
                    : 'Nenhum'}
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {members.map(member => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {shortName(member.full_name, member.user_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Source Card */}
      {task.source_type && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {task.source_type}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {task.source_ref && (task.source_ref as any).promotion_name
                    ? (task.source_ref as any).promotion_name
                    : `ID: ${task.source_id || 'N/A'}`}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!task.source_type}
                onClick={() => {
                  if (task.source_type === 'promotion') {
                    navigate('/promocoes');
                  }
                }}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Ver origem
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-4 w-4 text-muted-foreground" />
          {task.tags.map(tag => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="description" className="space-y-4">
        <TabsList>
          <TabsTrigger value="description">Descrição</TabsTrigger>
          <TabsTrigger value="checklist">
            Checklist {checklists.length > 0 && `(${checklistProgress}%)`}
          </TabsTrigger>
          <TabsTrigger value="comments">
            Comentários ({comments.length})
          </TabsTrigger>
          <TabsTrigger value="watchers">
            Observadores ({watchers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description">
          <Card>
            <CardContent className="p-4">
              <Textarea
                placeholder="Adicione uma descrição..."
                value={task.description || ''}
                onChange={e => onUpdate({ description: e.target.value })}
                className="min-h-[150px] border-0 focus-visible:ring-0 resize-none"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklist">
          <Card>
            <CardContent className="p-4 space-y-3">
              {/* Progress */}
              {checklists.length > 0 && (
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
              )}

              {/* Items */}
              {checklists.map(item => (
                <div key={item.id} className="flex items-center gap-3 group">
                  <Checkbox
                    checked={item.is_done}
                    onCheckedChange={checked => onToggleChecklist(item.id, !!checked)}
                  />
                  <span className={item.is_done ? 'line-through text-muted-foreground' : ''}>
                    {item.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={() => onDeleteChecklist(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {/* Add new */}
              <div className="flex items-center gap-2 pt-2">
                <Input
                  placeholder="Adicionar item..."
                  value={newChecklistItem}
                  onChange={e => setNewChecklistItem(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddChecklistItem()}
                />
                <Button size="icon" onClick={handleAddChecklistItem}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments">
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Add comment */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Escreva um comentário..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  className="min-h-[80px]"
                />
                <Button
                  size="icon"
                  onClick={handleAddComment}
                  disabled={submittingComment || !newComment.trim()}
                >
                  {submittingComment ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Comments list */}
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum comentário ainda
                </p>
              ) : (
                <div className="space-y-3">
                  {comments.map(comment => (
                    <div key={comment.id} className="border-l-2 pl-3 py-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{shortName(members.find(m => m.user_id === comment.user_id)?.full_name, comment.user_id)}</span>
                        <span>•</span>
                        <span>
                          {format(new Date(comment.created_at), "dd/MM 'às' HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{comment.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="watchers">
          <Card>
            <CardContent className="p-4">
              {watchers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum observador
                </p>
              ) : (
                <div className="space-y-2">
                  {watchers.map(watcher => (
                    <div key={watcher.id} className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span className="text-sm">{shortName(members.find(m => m.user_id === watcher.user_id)?.full_name, watcher.user_id)}</span>
                      {watcher.user_id === currentUserId && (
                        <Badge variant="secondary" className="text-xs">
                          Você
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
