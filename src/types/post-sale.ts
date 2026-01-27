export type PostSaleMessageType = 'informativa' | 'preventiva' | 'relacionamento';
export type PostSaleTriggerEvent = 'venda_confirmada' | 'pedido_enviado' | 'pedido_entregue';
export type PostSaleLogisticsProfile = 'mercado_envios' | 'full' | 'outros';
export type PostSaleMessageStatus = 'enviado' | 'bloqueado' | 'erro' | 'pendente' | 'rascunho';

export interface PostSaleTemplate {
  id: string;
  user_id: string;
  seller_id: string;
  name: string;
  trigger_event: PostSaleTriggerEvent;
  message_type: PostSaleMessageType;
  content: string;
  is_active: boolean;
  logistics_profile: PostSaleLogisticsProfile;
  max_characters: number;
  created_at: string;
  updated_at: string;
}

export interface PostSaleTemplateScope {
  id: string;
  template_id: string;
  scope_type: 'account' | 'listing' | 'sku';
  scope_value: string | null;
  is_enabled: boolean;
  created_at: string;
}

export interface PostSaleAutomationRule {
  id: string;
  user_id: string;
  seller_id: string;
  template_id: string;
  is_active: boolean;
  require_approval: boolean;
  wait_for_buyer_response: boolean;
  created_at: string;
  updated_at: string;
}

export interface PostSaleMessage {
  id: string;
  user_id: string;
  seller_id: string;
  order_id: string;
  pack_id?: string;
  buyer_id?: string;
  buyer_name?: string;
  listing_id?: string;
  listing_title?: string;
  template_id?: string;
  trigger_event: PostSaleTriggerEvent;
  message_type: PostSaleMessageType;
  content_sent: string;
  status: PostSaleMessageStatus;
  block_reason?: string;
  block_details?: Record<string, unknown>;
  suggested_fix?: string;
  ml_message_id?: string;
  sent_at?: string;
  created_at: string;
  is_visible: boolean;
}

export interface ValidationViolation {
  category: string;
  pattern: string;
  description: string;
  match: string;
}

export interface ValidationResult {
  isValid: boolean;
  violations: ValidationViolation[];
  suggestedFix?: string;
}

export const triggerEventLabels: Record<PostSaleTriggerEvent, string> = {
  venda_confirmada: 'Venda Confirmada',
  pedido_enviado: 'Pedido Enviado',
  pedido_entregue: 'Pedido Entregue',
};

export const messageTypeLabels: Record<PostSaleMessageType, string> = {
  informativa: 'Informativa',
  preventiva: 'Preventiva',
  relacionamento: 'Relacionamento',
};

export const logisticsProfileLabels: Record<PostSaleLogisticsProfile, string> = {
  mercado_envios: 'Mercado Envios',
  full: 'Full',
  outros: 'Outras Modalidades',
};

export const statusLabels: Record<PostSaleMessageStatus, string> = {
  enviado: 'Enviado',
  bloqueado: 'Bloqueado',
  erro: 'Erro',
  pendente: 'Pendente',
  rascunho: 'Rascunho',
};

export const availableVariables = [
  { key: 'nome_comprador', label: 'Nome do Comprador', example: 'João Silva' },
  { key: 'produto', label: 'Nome do Produto', example: 'Smartphone XYZ' },
  { key: 'pedido', label: 'Número do Pedido', example: '123456789' },
  { key: 'prazo_entrega', label: 'Prazo de Entrega', example: '3 dias úteis' },
];
