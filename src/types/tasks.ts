// Task Management Module - Types and Constants

// =============================================
// ENUMS / CONSTANTS
// =============================================

export const TASK_STATUS = {
  TODO: 'todo',
  DOING: 'doing',
  BLOCKED: 'blocked',
  DONE: 'done',
} as const;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A fazer',
  doing: 'Em andamento',
  blocked: 'Bloqueado',
  done: 'Concluído',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-700 border-slate-300',
  doing: 'bg-blue-100 text-blue-700 border-blue-300',
  blocked: 'bg-red-100 text-red-700 border-red-300',
  done: 'bg-green-100 text-green-700 border-green-300',
};

export const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export const WORKSPACE_ROLE = {
  ADMIN: 'admin',
  GESTOR: 'gestor',
  OPERADOR: 'operador',
  VISUALIZADOR: 'visualizador',
} as const;

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  operador: 'Operador',
  visualizador: 'Visualizador',
};

export const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: 'task_assigned',
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
  MENTION: 'mention',
  AUTOMATION_CREATED: 'automation_created',
  COMMENT_ADDED: 'comment_added',
} as const;

export const SOURCE_TYPES = {
  PROMOTION: 'promotion',
  COST: 'cost',
  COMPETITOR: 'competitor',
  ADS: 'ads',
  ADS_RULE: 'ads_rule',
  ORDER: 'order',
  LISTING: 'listing',
  MANUAL: 'manual',
  NOTE: 'note',
} as const;

// =============================================
// TYPES
// =============================================

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];
export type TaskPriority = (typeof TASK_PRIORITY)[keyof typeof TASK_PRIORITY];
export type WorkspaceRole = (typeof WORKSPACE_ROLE)[keyof typeof WORKSPACE_ROLE];
export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
export type SourceType = (typeof SOURCE_TYPES)[keyof typeof SOURCE_TYPES];

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  full_name?: string;
  created_at: string;
}

export interface WorkspaceAccount {
  id: string;
  workspace_id: string;
  name: string;
  marketplace: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  account_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  assignee_user_id: string | null;
  created_by_user_id: string;
  tags: string[];
  source_type: SourceType | null;
  source_id: string | null;
  source_ref: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TaskChecklist {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
}

export interface TaskWatcher {
  id: string;
  task_id: string;
  user_id: string;
  created_at: string;
}

export interface Notification {
  id: string;
  workspace_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SystemEvent {
  id: string;
  workspace_id: string;
  account_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

export interface AutomationRule {
  id: string;
  workspace_id: string;
  account_id: string | null;
  is_enabled: boolean;
  name: string;
  trigger_event_type: string;
  conditions: Record<string, unknown>;
  actions: AutomationAction[];
  created_at: string;
  updated_at: string;
}

export interface AutomationAction {
  type: 'create_task' | 'assign_to' | 'set_due_in_hours' | 'add_checklist' | 'notify' | 'add_tag';
  params: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  workspace_id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

// =============================================
// HELPER FUNCTIONS
// =============================================

export function canManage(role: WorkspaceRole): boolean {
  return role === 'admin' || role === 'gestor';
}

export function canEditTasks(role: WorkspaceRole): boolean {
  return role === 'admin' || role === 'gestor' || role === 'operador';
}

export function canViewOnly(role: WorkspaceRole): boolean {
  return role === 'visualizador';
}

export function getStatusOptions() {
  return Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({
    value: value as TaskStatus,
    label,
  }));
}

export function getPriorityOptions() {
  return Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({
    value: value as TaskPriority,
    label,
  }));
}

export function getRoleOptions() {
  return Object.entries(WORKSPACE_ROLE_LABELS).map(([value, label]) => ({
    value: value as WorkspaceRole,
    label,
  }));
}
