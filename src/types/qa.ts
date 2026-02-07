// Q&A Module Types

// Enums matching database
export type QaQuestionStatus = 'pending' | 'answered' | 'draft' | 'archived' | 'blocked';
export type QaResponseSource = 'manual' | 'library' | 'ai_suggested' | 'ai_edited';
export type QaRiskLevel = 'low' | 'medium' | 'high';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationCategory = 
  | 'qa_pending'
  | 'qa_sla_warning'
  | 'qa_sla_breached'
  | 'qa_blocked'
  | 'qa_send_error'
  | 'post_sale_blocked'
  | 'post_sale_error'
  | 'system_alert'
  | 'task_assigned'
  | 'promotion_alert';

// Interfaces
export interface QaResponseCategory {
  id: string;
  user_id: string;
  seller_id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QaLibraryResponse {
  id: string;
  user_id: string;
  seller_id: string;
  category_id: string | null;
  name: string;
  content: string;
  shortcut: string | null;
  tags: string[];
  usage_count: number;
  is_approved: boolean;
  is_active: boolean;
  use_greeting: boolean;
  use_signature: boolean;
  created_at: string;
  updated_at: string;
  category?: QaResponseCategory;
}

export interface QaQuestion {
  id: string;
  user_id: string;
  seller_id: string;
  workspace_id: string | null;
  ml_question_id: string;
  ml_item_id: string;
  ml_buyer_id: string | null;
  question_text: string;
  item_title: string | null;
  item_sku: string | null;
  item_variation: string | null;
  item_thumbnail: string | null;
  status: QaQuestionStatus;
  risk_level: QaRiskLevel;
  risk_reasons: string[];
  category: string | null;
  question_date: string;
  answered_at: string | null;
  sla_deadline: string | null;
  is_sla_breached: boolean;
  needs_attention: boolean;
  is_snoozed: boolean;
  snooze_until: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  responses?: QaResponse[];
  latest_response?: QaResponse;
}

export interface QaResponse {
  id: string;
  user_id: string;
  seller_id: string;
  question_id: string;
  response_text: string;
  source: QaResponseSource;
  library_response_id: string | null;
  ai_original_text: string | null;
  ai_model: string | null;
  validation_passed: boolean | null;
  validation_errors: string[];
  is_draft: boolean;
  is_sent: boolean;
  sent_at: string | null;
  ml_response_id: string | null;
  send_error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface QaAuditLog {
  id: string;
  user_id: string;
  seller_id: string;
  question_id: string | null;
  response_id: string | null;
  action: string;
  actor_id: string;
  question_text: string | null;
  response_text: string | null;
  response_source: QaResponseSource | null;
  validation_result: Record<string, unknown> | null;
  block_reasons: string[] | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

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
  is_read: boolean;
  is_dismissed: boolean;
  is_actioned: boolean;
  created_at: string;
  read_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

export interface QaDailyMetrics {
  id: string;
  user_id: string;
  seller_id: string;
  metric_date: string;
  questions_received: number;
  questions_answered: number;
  questions_pending: number;
  questions_blocked: number;
  avg_response_time_minutes: number | null;
  sla_breaches: number;
  responses_from_library: number;
  responses_from_ai: number;
  responses_manual: number;
  created_at: string;
  updated_at: string;
}

// UI Labels
export const STATUS_LABELS: Record<QaQuestionStatus, string> = {
  pending: 'Pendente',
  answered: 'Respondida',
  draft: 'Em revisão',
  archived: 'Arquivada',
  blocked: 'Bloqueada',
};

export const STATUS_COLORS: Record<QaQuestionStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  answered: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  draft: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  archived: 'bg-muted text-muted-foreground border-border',
  blocked: 'bg-destructive/10 text-destructive border-destructive/20',
};

export const RISK_LABELS: Record<QaRiskLevel, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

export const RISK_COLORS: Record<QaRiskLevel, string> = {
  low: 'bg-emerald-500/10 text-emerald-600',
  medium: 'bg-amber-500/10 text-amber-600',
  high: 'bg-destructive/10 text-destructive',
};

export const SOURCE_LABELS: Record<QaResponseSource, string> = {
  manual: 'Manual',
  library: 'Biblioteca',
  ai_suggested: 'IA',
  ai_edited: 'IA (editada)',
};

export const PRIORITY_LABELS: Record<NotificationPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  qa_pending: 'Pergunta pendente',
  qa_sla_warning: 'SLA próximo',
  qa_sla_breached: 'SLA estourado',
  qa_blocked: 'Resposta bloqueada',
  qa_send_error: 'Erro de envio',
  post_sale_blocked: 'Pós-venda bloqueado',
  post_sale_error: 'Erro pós-venda',
  system_alert: 'Sistema',
  task_assigned: 'Tarefa atribuída',
  promotion_alert: 'Promoção',
};

// Question categories for classification
export const QUESTION_CATEGORIES = [
  { value: 'frete', label: 'Frete' },
  { value: 'compatibilidade', label: 'Compatibilidade' },
  { value: 'uso', label: 'Uso do produto' },
  { value: 'garantia', label: 'Garantia' },
  { value: 'nota_fiscal', label: 'Nota Fiscal' },
  { value: 'estoque', label: 'Estoque' },
  { value: 'variacao', label: 'Variação' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'outro', label: 'Outro' },
];
