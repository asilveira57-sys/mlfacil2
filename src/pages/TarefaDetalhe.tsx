import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { TaskDetail } from '@/components/tasks/TaskDetail';
import { useTaskDetails, useTasks } from '@/hooks/useTasks';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Skeleton } from '@/components/ui/skeleton';
import { PageContainer } from '@/components/layout/PageContainer';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import type { Task } from '@/types/tasks';

export default function TarefaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentWorkspace, members } = useWorkspace();
  // Use centralized hook instead of direct Supabase call
  const currentUserId = useCurrentUserId();
  
  const {
    task,
    checklists,
    comments,
    watchers,
    loading,
    refetch,
    addChecklist,
    toggleChecklist,
    deleteChecklist,
    addComment,
    toggleWatch,
  } = useTaskDetails(id || null);

  const { updateTask, deleteTask } = useTasks(currentWorkspace?.id || null);

  const handleUpdate = async (updates: Partial<Task>): Promise<boolean> => {
    if (!id) return false;
    const result = await updateTask(id, updates);
    if (result) refetch();
    return result;
  };

  const handleDelete = async () => {
    if (!id) return;
    if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
      await deleteTask(id);
      navigate('/tarefas');
    }
  };

  const handleAddChecklist = async (title: string): Promise<void> => {
    await addChecklist(title);
  };

  const handleAddComment = async (comment: string): Promise<void> => {
    await addComment(comment);
  };

  if (loading) {
    return (
      <PageContainer title="Carregando..." subtitle="Detalhes da tarefa">
        <div className="container mx-auto p-6 space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!task) {
    return (
      <PageContainer title="Tarefa não encontrada" subtitle="Detalhes da tarefa">
        <div className="container mx-auto p-6">
          <Button variant="ghost" onClick={() => navigate('/tarefas')} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">Tarefa não encontrada</h2>
            <p className="text-muted-foreground">
              Esta tarefa pode ter sido excluída ou você não tem permissão para visualizá-la.
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={task.title} subtitle="Detalhes da tarefa">
      <div className="container mx-auto p-6">
        <Button variant="ghost" onClick={() => navigate('/tarefas')} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para tarefas
        </Button>

        <TaskDetail
          task={task}
          checklists={checklists}
          comments={comments}
          watchers={watchers}
          loading={false}
          members={members}
          currentUserId={currentUserId}
          onUpdate={handleUpdate}
          onAddChecklist={handleAddChecklist}
          onToggleChecklist={toggleChecklist}
          onDeleteChecklist={deleteChecklist}
          onAddComment={handleAddComment}
          onToggleWatch={toggleWatch}
        />
      </div>
    </PageContainer>
  );
}
