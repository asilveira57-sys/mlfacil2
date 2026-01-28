// Collaborator Management Types

export type CollaboratorStatus = 'invited' | 'active' | 'disabled' | 'deleted';

export interface Collaborator {
  id: string;
  workspace_id: string;
  name: string;
  email: string;
  status: CollaboratorStatus;
  invited_at: string | null;
  accepted_at: string | null;
  disabled_at: string | null;
  deleted_at: string | null;
  auth_user_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CollaboratorModuleAccess {
  id: string;
  collaborator_id: string;
  module_key: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollaboratorWithModules extends Collaborator {
  modules: CollaboratorModuleAccess[];
}

// Module catalog for UI checkboxes
export interface ModuleDefinition {
  key: string;
  label: string;
  description?: string;
  restricted?: boolean;
}

export const MODULE_CATALOG: ModuleDefinition[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Visão geral e métricas' },
  { key: 'vendas', label: 'Vendas', description: 'Gestão de vendas e pedidos' },
  { key: 'tarefas', label: 'Tarefas', description: 'Quadro de tarefas e automações' },
  { key: 'promocoes', label: 'Promoções', description: 'Gestão de promoções' },
  { key: 'mercado_ads', label: 'Mercado ADS', description: 'Publicidade e campanhas' },
  { key: 'linha_do_tempo', label: 'Linha do Tempo', description: 'Timeline de anúncios' },
  { key: 'pos_venda', label: 'Pós-Venda', description: 'Mensagens automáticas' },
  { key: 'perguntas', label: 'Perguntas', description: 'Gestão de Q&A' },
  { key: 'radiografia', label: 'Radiografia', description: 'Análise de anúncios' },
  { key: 'mercado', label: 'Mercado', description: 'Explorador de mercado' },
  { key: 'tendencias', label: 'Tendências', description: 'Análise de tendências' },
  { key: 'abc', label: 'Curva ABC', description: 'Análise ABC de produtos' },
  { key: 'etiquetas', label: 'Etiquetas', description: 'Impressão de etiquetas' },
  { key: 'custos', label: 'Custos', description: 'Gestão de custos e margens', restricted: true },
];

export const COLLABORATOR_STATUS_LABELS: Record<CollaboratorStatus, string> = {
  invited: 'Convidado',
  active: 'Ativo',
  disabled: 'Desativado',
  deleted: 'Excluído',
};

export const COLLABORATOR_STATUS_COLORS: Record<CollaboratorStatus, string> = {
  invited: 'bg-amber-100 text-amber-700 border-amber-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  disabled: 'bg-gray-100 text-gray-600 border-gray-200',
  deleted: 'bg-red-100 text-red-600 border-red-200',
};
