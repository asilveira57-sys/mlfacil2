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
  profile_id?: string | null;
}

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
