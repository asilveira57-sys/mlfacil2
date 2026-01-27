// Notification System Types

import type { NotificationCategory, NotificationPriority } from './qa';

export interface AppNotification {
  id: string;
  user_id: string;
  workspace_id: string | null;
  seller_id: string | null;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  action_url: string | null;
  group_key: string | null;
  origin_module: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  is_actioned: boolean;
  is_snoozed: boolean;
  snooze_until: string | null;
  snoozed_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  read_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  workspace_id: string | null;
  qa_pending_enabled: boolean;
  qa_sla_warning_enabled: boolean;
  qa_sla_breached_enabled: boolean;
  qa_blocked_enabled: boolean;
  qa_send_error_enabled: boolean;
  post_sale_blocked_enabled: boolean;
  post_sale_error_enabled: boolean;
  system_alert_enabled: boolean;
  show_in_bell: boolean;
  show_in_dashboard: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationAuditLog {
  id: string;
  notification_id: string | null;
  user_id: string;
  action: 'created' | 'read' | 'dismissed' | 'snoozed' | 'resolved' | 'unsnoozed';
  action_details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Snooze options
export const SNOOZE_OPTIONS = [
  { value: 1, label: '1 hora' },
  { value: 3, label: '3 horas' },
  { value: 24, label: 'Amanhã' },
] as const;

// Category icons and colors (for UI)
export const CATEGORY_CONFIG: Record<NotificationCategory, {
  icon: string;
  color: string;
  bgColor: string;
  label: string;
  module: 'qa' | 'post_sale' | 'system' | 'tasks' | 'promotion';
}> = {
  qa_pending: {
    icon: 'MessageCircle',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    label: 'Pergunta pendente',
    module: 'qa',
  },
  qa_sla_warning: {
    icon: 'Timer',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    label: 'SLA próximo',
    module: 'qa',
  },
  qa_sla_breached: {
    icon: 'TimerOff',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'SLA estourado',
    module: 'qa',
  },
  qa_blocked: {
    icon: 'XCircle',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'Resposta bloqueada',
    module: 'qa',
  },
  qa_send_error: {
    icon: 'AlertTriangle',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'Erro de envio',
    module: 'qa',
  },
  post_sale_blocked: {
    icon: 'XCircle',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    label: 'Pós-venda bloqueado',
    module: 'post_sale',
  },
  post_sale_error: {
    icon: 'AlertTriangle',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    label: 'Erro pós-venda',
    module: 'post_sale',
  },
  system_alert: {
    icon: 'Settings',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    label: 'Sistema',
    module: 'system',
  },
  task_assigned: {
    icon: 'CheckCircle',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Tarefa atribuída',
    module: 'tasks',
  },
  promotion_alert: {
    icon: 'Bell',
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    label: 'Promoção',
    module: 'promotion',
  },
};

// Priority configuration
export const PRIORITY_CONFIG: Record<NotificationPriority, {
  color: string;
  bgColor: string;
  label: string;
  order: number;
}> = {
  urgent: {
    color: 'text-red-600',
    bgColor: 'bg-red-500/10',
    label: 'Urgente',
    order: 4,
  },
  high: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-500/10',
    label: 'Alta',
    order: 3,
  },
  normal: {
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    label: 'Normal',
    order: 2,
  },
  low: {
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    label: 'Baixa',
    order: 1,
  },
};
