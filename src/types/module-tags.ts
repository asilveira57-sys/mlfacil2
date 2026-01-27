// Module Tags Types

export interface ModuleTag {
  id: string;
  name: string;
  color: string;
  style: 'badge' | 'selo';
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SystemModule {
  id: string;
  name: string;
  description: string | null;
  icon_name: string | null;
  route: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModuleTagAssignment {
  id: string;
  module_id: string;
  tag_id: string;
  created_at: string;
}

export interface ModuleWithTags extends SystemModule {
  tags: ModuleTag[];
}

export type TagInsert = Pick<ModuleTag, 'name' | 'color' | 'style' | 'priority'>;
export type TagUpdate = Partial<TagInsert> & { is_active?: boolean };
