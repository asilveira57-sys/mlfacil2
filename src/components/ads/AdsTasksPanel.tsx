import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckSquare, 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  ExternalLink,
  ListTodo,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { useAdsTasksHistory } from '@/hooks/useAdsTasksHistory';
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS } from '@/types/tasks';
import type { Task } from '@/types/tasks';

interface AdsTasksPanelProps {
  sellerId: string;
  workspaceId?: string;
}

export function AdsTasksPanel({ sellerId, workspaceId }: AdsTasksPanelProps) {
  const navigate = useNavigate();
  const { tasks, stats, loading } = useAdsTasksHistory(sellerId, workspaceId);
  const [showAll, setShowAll] = useState(false);

  const displayedTasks = showAll ? tasks : tasks.slice(0, 5);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'doing':
        return <Clock className="h-4 w-4 text-primary" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getRuleTypeIcon = (task: Task) => {
    const ruleType = (task.source_ref as Record<string, unknown>)?.rule_type;
    if (ruleType === 'opportunity') {
      return <TrendingUp className="h-4 w-4 text-success" />;
    }
    return <AlertTriangle className="h-4 w-4 text-destructive" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!workspaceId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Tarefas de ADS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Ative o módulo de Tarefas para visualizar o histórico de tarefas geradas pelo motor de regras.
          </p>
          <div className="text-center">
            <Button variant="outline" onClick={() => navigate('/tarefas')}>
              Ir para Tarefas
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Tarefas de ADS
            </CardTitle>
            <CardDescription>
              Tarefas geradas automaticamente pelas regras
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/tarefas?source=ads')}
            className="gap-1"
          >
            Ver todas
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-medium">{stats.pending}</span>
              <span className="text-muted-foreground ml-1">pendentes</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm">
              <span className="font-medium">{stats.inProgress}</span>
              <span className="text-muted-foreground ml-1">em andamento</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm">
              <span className="font-medium">{stats.completed}</span>
              <span className="text-muted-foreground ml-1">concluídas</span>
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Nenhuma tarefa de ADS</p>
            <p className="text-sm mt-1">
              As tarefas aparecerão aqui quando as regras forem acionadas
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className={showAll ? 'h-[400px]' : undefined}>
              <div className="space-y-2">
                {displayedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/tarefas?task=${task.id}`)}
                  >
                    <div className="mt-0.5">
                      {getStatusIcon(task.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getRuleTypeIcon(task)}
                        <p className="font-medium text-sm truncate">{task.title}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${TASK_PRIORITY_COLORS[task.priority]}`}
                        >
                          {TASK_PRIORITY_LABELS[task.priority]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {TASK_STATUS_LABELS[task.status]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          • {formatDate(task.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {tasks.length > 5 && !showAll && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full mt-3"
                onClick={() => setShowAll(true)}
              >
                Ver mais {tasks.length - 5} tarefas
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
