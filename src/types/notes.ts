// Notes Widget - Types and Constants

export const NOTE_COLORS = [
  { hex: '#FBBF24', label: 'Amarelo' },
  { hex: '#34D399', label: 'Verde' },
  { hex: '#60A5FA', label: 'Azul' },
  { hex: '#F472B6', label: 'Rosa' },
  { hex: '#A78BFA', label: 'Roxo' },
  { hex: '#FB923C', label: 'Laranja' },
  { hex: '#F87171', label: 'Vermelho' },
  { hex: '#E5E7EB', label: 'Cinza' },
] as const;

export const NOTE_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;

export type NoteStatus = (typeof NOTE_STATUS)[keyof typeof NOTE_STATUS];

export const NOTE_EVENT_TYPES = {
  CREATED: 'created',
  UPDATED: 'updated',
  PINNED: 'pinned',
  UNPINNED: 'unpinned',
  SENT_TO_TASKS: 'sent_to_tasks',
  ARCHIVED: 'archived',
} as const;

export type NoteEventType = (typeof NOTE_EVENT_TYPES)[keyof typeof NOTE_EVENT_TYPES];

export interface Note {
  id: string;
  workspace_id: string;
  company_id: string | null;
  created_by_user_id: string;
  title: string;
  content_rich: Record<string, unknown> | null;
  content_plain: string;
  color_hex: string;
  status: NoteStatus;
  created_at: string;
  updated_at: string;
}

export interface NoteAttachment {
  id: string;
  workspace_id: string;
  note_id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface NotePin {
  id: string;
  workspace_id: string;
  company_id: string | null;
  note_id: string;
  module_key: string;
  route_path: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_by_user_id: string;
  created_at: string;
}

export interface NoteEvent {
  id: string;
  workspace_id: string;
  note_id: string;
  event_type: NoteEventType;
  payload_json: Record<string, unknown> | null;
  created_by_user_id: string;
  created_at: string;
}

export interface NoteWithPins extends Note {
  pins?: NotePin[];
}
