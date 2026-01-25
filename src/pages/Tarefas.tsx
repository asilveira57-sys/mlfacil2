import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, List, LayoutGrid, Bell, Settings, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useTasks } from '@/hooks/useTasks';
import { useNotifications, useSystemEvents } from '@/hooks/useNotifications';
import { useAutomationRules } from '@/hooks/useAutomationRules';
import { TaskFilters } from '@/components/tasks/TaskFilters';
import { TaskList } from '@/components/tasks/TaskList';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { TaskDrawer } from '@/components/tasks/TaskDrawer';
import { TaskBulkActions } from '@/components/tasks/TaskBulkActions';
import { NotificationList } from '@/components/tasks/NotificationList';
import { EventList } from '@/components/tasks/EventList';
import { TasksOnboarding } from '@/components/tasks/TasksOnboarding';
import { TasksEmptyState } from '@/components/tasks/TasksEmptyState';
import { WorkspaceSwitcher } from '@/components/tasks/WorkspaceSwitcher';
import { AutomationRuleEditor } from '@/components/tasks/AutomationRuleEditor';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { Task, TaskStatus, TaskPriority, AutomationRule, WorkspaceAccount, SystemEvent } from '@/types/tasks';

export default function Tarefas() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const { 
    activeWorkspace, 
    workspaces, 
    tasksEnabled, 
    loading: prefsLoading, 
    enableTasks, 
    switchWorkspace,
    refetch: refetchPrefs
  } = useUserPreferences();

  const { members, accounts } = useWorkspace();

  const {
    tasks,
    loading: tasksLoading,
    filters,
    setFilters,
    createTask,
    updateTask,
    deleteTask,
    bulkUpdateStatus,
    bulkUpdateAssignee,
    bulkUpdatePriority,
  } = useTasks(activeWorkspace?.id || null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Determine current view from path
  const getActiveTab = () => {
    if (location.pathname.includes('/quadro')) return 'quadro';
    if (location.pathname.includes('/inbox')) return 'inbox';
    if (location.pathname.includes('/regras')) return 'regras';
    return 'lista';
  };

  const activeTab = getActiveTab();

  const handleTabChange = (value: string) => {
    switch (value) {
      case 'lista':
        navigate('/tarefas');
        break;
      case 'quadro':
        navigate('/tarefas/quadro');
        break;
      case 'inbox':
        navigate('/tarefas/inbox');
        break;
      case 'regras':
        navigate('/tarefas/regras');
        break;
    }
  };

  const handleCreateTask = async (data: Partial<Task>): Promise<boolean> => {
    const result = await createTask(data);
    return result !== null;
  };

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
    updateTask(taskId, { status });
  };

  const handleBulkStatusChange = async (status: TaskStatus) => {
    await bulkUpdateStatus(selectedTaskIds, status);
    setSelectedTaskIds([]);
  };

  const handleBulkAssigneeChange = async (assigneeId: string | null) => {
    await bulkUpdateAssignee(selectedTaskIds, assigneeId);
    setSelectedTaskIds([]);
  };

  const handleBulkPriorityChange = async (priority: TaskPriority) => {
    await bulkUpdatePriority(selectedTaskIds, priority);
    setSelectedTaskIds([]);
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    await switchWorkspace(workspaceId);
  };

  const handleEnableTasks = async (): Promise<boolean> => {
    const success = await enableTasks();
    if (success) {
      await refetchPrefs();
    }
    return success;
  };

  // Loading state
  if (prefsLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Onboarding - tasks not enabled
  if (!tasksEnabled) {
    return <TasksOnboarding onEnable={handleEnableTasks} />;
  }

  // No workspace (shouldn't happen after ensure_workspace, but fallback)
  if (!activeWorkspace) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Erro ao carregar workspace</h2>
          <p className="text-muted-foreground">
            Tente recarregar a página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Tarefas</h1>
          </div>
          <WorkspaceSwitcher
            currentWorkspace={activeWorkspace}
            workspaces={workspaces}
            onSwitch={handleSwitchWorkspace}
          />
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova tarefa
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="lista" className="gap-2">
            <List className="h-4 w-4" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="quadro" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Quadro
          </TabsTrigger>
          <TabsTrigger value="inbox" className="gap-2">
            <Bell className="h-4 w-4" />
            Inbox
          </TabsTrigger>
          <TabsTrigger value="regras" className="gap-2">
            <Settings className="h-4 w-4" />
            Regras
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Content based on active tab */}
      {activeTab === 'lista' && (
        <>
          <TaskFilters
            filters={filters}
            onFiltersChange={setFilters}
            members={members}
            accounts={accounts}
          />
          {!tasksLoading && tasks.length === 0 ? (
            <TasksEmptyState onCreateTask={() => setDrawerOpen(true)} />
          ) : (
            <TaskList
              tasks={tasks}
              loading={tasksLoading}
              selectedIds={selectedTaskIds}
              onSelectChange={setSelectedTaskIds}
              onStatusChange={handleStatusChange}
              onDelete={deleteTask}
            />
          )}
          {selectedTaskIds.length > 0 && (
            <TaskBulkActions
              selectedCount={selectedTaskIds.length}
              members={members}
              onClear={() => setSelectedTaskIds([])}
              onStatusChange={handleBulkStatusChange}
              onAssigneeChange={handleBulkAssigneeChange}
              onPriorityChange={handleBulkPriorityChange}
            />
          )}
        </>
      )}

      {activeTab === 'quadro' && (
        <>
          <TaskFilters
            filters={filters}
            onFiltersChange={setFilters}
            members={members}
            accounts={accounts}
          />
          {!tasksLoading && tasks.length === 0 ? (
            <TasksEmptyState onCreateTask={() => setDrawerOpen(true)} />
          ) : (
            <TaskBoard
              tasks={tasks}
              loading={tasksLoading}
              onStatusChange={handleStatusChange}
            />
          )}
        </>
      )}

      {activeTab === 'inbox' && (
        <InboxContent workspaceId={activeWorkspace.id} />
      )}

      {activeTab === 'regras' && (
        <RulesContent workspaceId={activeWorkspace.id} accounts={accounts} />
      )}

      {/* Create/Edit Drawer */}
      <TaskDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSave={handleCreateTask}
        members={members}
        accounts={accounts}
      />
    </div>
  );
}

// Inbox sub-component
function InboxContent({ workspaceId }: { workspaceId: string }) {
  const [activeInboxTab, setActiveInboxTab] = useState<'notifications' | 'events'>('notifications');
  const { notifications, loading: notificationsLoading, markAsRead, markAllAsRead } = useNotifications(workspaceId);
  const { events, loading: eventsLoading } = useSystemEvents(workspaceId);

  const handleCreateTaskFromEvent = (event: SystemEvent) => {
    console.log('Create task from event:', event);
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeInboxTab} onValueChange={(v) => setActiveInboxTab(v as 'notifications' | 'events')}>
        <TabsList>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="events">Eventos do Sistema</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeInboxTab === 'notifications' ? (
        <NotificationList
          notifications={notifications}
          loading={notificationsLoading}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
        />
      ) : (
        <EventList
          events={events}
          loading={eventsLoading}
          onCreateTask={handleCreateTaskFromEvent}
        />
      )}
    </div>
  );
}

// Rules sub-component
function RulesContent({ workspaceId, accounts }: { workspaceId: string; accounts: WorkspaceAccount[] }) {
  const { rules, loading, createRule, updateRule, deleteRule, toggleRule } = useAutomationRules(workspaceId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const handleCreateOrUpdate = async (data: Partial<AutomationRule>) => {
    if (data.id) {
      await updateRule(data.id, data);
    } else {
      await createRule(data);
    }
  };

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setEditorOpen(true);
  };

  const handleDelete = async (ruleId: string) => {
    if (confirm('Tem certeza que deseja excluir esta regra?')) {
      await deleteRule(ruleId);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          Configure regras para criar tarefas automaticamente a partir de eventos do sistema.
        </p>
        <Button onClick={() => { setEditingRule(null); setEditorOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova regra
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Nenhuma regra configurada</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Crie regras para automatizar a criação de tarefas.
            </p>
            <Button onClick={() => { setEditingRule(null); setEditorOpen(true); }}>
              Criar primeira regra
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={rule.is_enabled}
                      onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rule.name}</span>
                        <Badge variant={rule.is_enabled ? 'default' : 'secondary'}>
                          {rule.is_enabled ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Gatilho: <code className="bg-muted px-1 rounded">{rule.trigger_event_type}</code>
                        {' · '}
                        {rule.actions.length} {rule.actions.length === 1 ? 'ação' : 'ações'}
                      </p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(rule)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AutomationRuleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        rule={editingRule}
        accounts={accounts}
        onSave={handleCreateOrUpdate}
      />
    </div>
  );
}
