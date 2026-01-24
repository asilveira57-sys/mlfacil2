// Blog Types

export type BlogPostStatus = 'rascunho' | 'publicado' | 'arquivado';
export type BlogPostOrigem = 'manual' | 'automatico';

export interface BlogCategory {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogPost {
  id: string;
  titulo: string;
  slug: string;
  resumo: string | null;
  conteudo_principal: string | null;
  imagem_capa: string | null;
  status: BlogPostStatus;
  data_publicacao: string | null;
  data_agendada: string | null;
  autor: string | null;
  categoria_id: string | null;
  tags: string[];
  // SEO fields
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  canonical_url: string | null;
  // Automation fields
  origem: BlogPostOrigem;
  modulo_vinculado: string | null;
  modulo_referencia_id: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
  // Joined fields
  categoria?: BlogCategory;
}

export interface BlogPostInsert {
  titulo: string;
  resumo?: string;
  conteudo_principal?: string;
  imagem_capa?: string;
  status?: BlogPostStatus;
  data_publicacao?: string;
  data_agendada?: string;
  autor?: string;
  categoria_id?: string;
  tags?: string[];
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  canonical_url?: string;
  origem?: BlogPostOrigem;
  modulo_vinculado?: string;
  modulo_referencia_id?: string;
}

export interface BlogPostUpdate {
  titulo?: string;
  resumo?: string;
  conteudo_principal?: string;
  imagem_capa?: string;
  status?: BlogPostStatus;
  data_publicacao?: string;
  data_agendada?: string;
  autor?: string;
  categoria_id?: string;
  tags?: string[];
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  canonical_url?: string;
}

export interface BlogCategoryInsert {
  nome: string;
  descricao?: string;
}

export interface BlogCategoryUpdate {
  nome?: string;
  descricao?: string;
}

// Validation helpers
export interface BlogSeoValidation {
  isValid: boolean;
  errors: string[];
}

export function validateSeoBeforePublish(post: BlogPost): BlogSeoValidation {
  const errors: string[] = [];
  
  if (!post.meta_title || post.meta_title.trim() === '') {
    errors.push('Meta título é obrigatório para publicação');
  } else if (post.meta_title.length > 60) {
    errors.push('Meta título deve ter no máximo 60 caracteres');
  }
  
  if (!post.meta_description || post.meta_description.trim() === '') {
    errors.push('Meta descrição é obrigatória para publicação');
  } else if (post.meta_description.length > 160) {
    errors.push('Meta descrição deve ter no máximo 160 caracteres');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
