// ERP Integration Types (Tiny, Olist)

export interface ErpIntegration {
  id: string;
  company_id: string;
  provider: 'tiny' | 'olist';
  display_name: string | null;
  api_key: string | null;
  api_user: string | null;
  environment: string;
  status: string;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_message: string | null;
  last_sync_at: string | null;
  sync_costs: boolean;
  sync_orders: boolean;
  sync_invoicing: boolean;
  sync_frequency_minutes: number;
  capture_from_date: string | null;
  order_status_filter: string[];
  channel_filter: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface NfseSettings {
  id: string;
  company_id: string;
  service_description: string | null;
  service_code: string | null;
  cnae: string | null;
  aliquota_iss: number | null;
  natureza_operacao: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NfseFieldMapping {
  id: string;
  company_id: string;
  provider: 'tiny' | 'olist';
  target_field: string;
  source_path: string;
  fallback_value: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationSyncRun {
  id: string;
  integration_id: string;
  company_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  orders_fetched: number;
  orders_created: number;
  orders_updated: number;
  orders_failed: number;
  error_message: string | null;
  error_details: Record<string, any> | null;
}

export interface ServiceOrder {
  id: string;
  company_id: string;
  integration_id: string | null;
  provider: 'tiny' | 'olist';
  external_order_id: string;
  external_order_number: string | null;
  order_date: string | null;
  order_status: string | null;
  channel: string | null;
  total_value: number | null;
  raw_data: Record<string, any> | null;
  customer_id: string | null;
  nfse_status: 'pending' | 'ready' | 'issued' | 'error';
  nfse_error_message: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  customer?: ServiceOrderCustomer;
}

export interface ServiceOrderCustomer {
  id: string;
  company_id: string;
  external_customer_id: string | null;
  provider: string | null;
  nome: string | null;
  documento: string | null;
  documento_tipo: 'cpf' | 'cnpj' | null;
  email: string | null;
  telefone: string | null;
  endereco_rua: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_uf: string | null;
  endereco_cep: string | null;
  observacoes: string | null;
  is_complete: boolean;
  missing_fields: string[] | null;
  raw_data: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceInvoiceQueue {
  id: string;
  company_id: string;
  service_order_id: string;
  customer_id: string | null;
  status: 'pending' | 'ready' | 'processing' | 'issued' | 'error' | 'cancelled';
  nfse_number: string | null;
  nfse_protocol: string | null;
  nfse_url: string | null;
  issued_at: string | null;
  service_description: string | null;
  service_code: string | null;
  valor_servico: number | null;
  valor_iss: number | null;
  error_message: string | null;
  retry_count: number;
  last_retry_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  service_order?: ServiceOrder;
  customer?: ServiceOrderCustomer;
}

export interface ServiceInvoiceEvent {
  id: string;
  queue_id: string;
  event_type: 'created' | 'data_completed' | 'submitted' | 'issued' | 'error' | 'retry' | 'cancelled';
  event_data: Record<string, any> | null;
  created_by: string | null;
  created_at: string;
}

// Field mapping constants
export const TOMADOR_FIELDS = [
  { key: 'nome', label: 'Nome/Razão Social', required: true },
  { key: 'documento', label: 'CPF/CNPJ', required: true },
  { key: 'email', label: 'E-mail', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
  { key: 'endereco_rua', label: 'Rua', required: true },
  { key: 'endereco_numero', label: 'Número', required: true },
  { key: 'endereco_complemento', label: 'Complemento', required: false },
  { key: 'endereco_bairro', label: 'Bairro', required: true },
  { key: 'endereco_cidade', label: 'Cidade', required: true },
  { key: 'endereco_uf', label: 'UF', required: true },
  { key: 'endereco_cep', label: 'CEP', required: true },
] as const;

export const DEFAULT_TINY_MAPPINGS: Record<string, string> = {
  nome: 'cliente.nome',
  documento: 'cliente.cpf_cnpj',
  email: 'cliente.email',
  telefone: 'cliente.fone',
  endereco_rua: 'cliente.endereco',
  endereco_numero: 'cliente.numero',
  endereco_complemento: 'cliente.complemento',
  endereco_bairro: 'cliente.bairro',
  endereco_cidade: 'cliente.cidade',
  endereco_uf: 'cliente.uf',
  endereco_cep: 'cliente.cep',
};

export const DEFAULT_OLIST_MAPPINGS: Record<string, string> = {
  nome: 'customer.name',
  documento: 'customer.document',
  email: 'customer.email',
  telefone: 'customer.phone',
  endereco_rua: 'shipping_address.street',
  endereco_numero: 'shipping_address.number',
  endereco_complemento: 'shipping_address.complement',
  endereco_bairro: 'shipping_address.neighborhood',
  endereco_cidade: 'shipping_address.city',
  endereco_uf: 'shipping_address.state',
  endereco_cep: 'shipping_address.zip_code',
};

export type ErpProvider = 'tiny' | 'olist';
export type NfseStatus = 'pending' | 'ready' | 'issued' | 'error';
export type InvoiceQueueStatus = 'pending' | 'ready' | 'processing' | 'issued' | 'error' | 'cancelled';
