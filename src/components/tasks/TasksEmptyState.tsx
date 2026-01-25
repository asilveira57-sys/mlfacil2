import React from 'react';
import { ClipboardList, Plus, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface TasksEmptyStateProps {
  onCreateTask: () => void;
}

export function TasksEmptyState({ onCreateTask }: TasksEmptyStateProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Nenhuma tarefa ainda</h3>
        <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
          Comece criando sua primeira tarefa manualmente ou configure regras 
          para gerar tarefas automaticamente.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={onCreateTask}>
            <Plus className="h-4 w-4 mr-2" />
            Criar primeira tarefa
          </Button>
          <Button variant="outline" onClick={() => navigate('/tarefas/regras')}>
            <Settings className="h-4 w-4 mr-2" />
            Configurar regras
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
