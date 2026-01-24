import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { 
  BlogPost, 
  BlogCategory, 
  BlogPostInsert, 
  BlogPostUpdate,
  BlogCategoryInsert,
  BlogCategoryUpdate,
  BlogPostStatus
} from '@/types/blog';

export function useBlog() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // ===== POSTS =====
  
  const fetchPosts = useCallback(async (options?: {
    status?: BlogPostStatus;
    categoryId?: string;
    limit?: number;
    offset?: number;
  }) => {
    setLoading(true);
    try {
      let query = supabase
        .from('blog_posts')
        .select('*, categoria:blog_categories(*)');
      
      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.categoryId) {
        query = query.eq('categoria_id', options.categoryId);
      }
      
      query = query.order('created_at', { ascending: false });
      
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as BlogPost[];
    } catch (error: any) {
      toast({
        title: 'Erro ao buscar posts',
        description: error.message,
        variant: 'destructive'
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchPostBySlug = useCallback(async (slug: string) => {
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*, categoria:blog_categories(*)')
        .eq('slug', slug)
        .single();
      
      if (error) throw error;
      return data as BlogPost;
    } catch (error: any) {
      toast({
        title: 'Erro ao buscar post',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    }
  }, [toast]);

  const fetchPostById = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*, categoria:blog_categories(*)')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as BlogPost;
    } catch (error: any) {
      toast({
        title: 'Erro ao buscar post',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    }
  }, [toast]);

  const createPost = useCallback(async (post: BlogPostInsert) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .insert([post])
        .select('*, categoria:blog_categories(*)')
        .single();
      
      if (error) throw error;
      
      toast({
        title: 'Post criado',
        description: 'O post foi criado com sucesso.'
      });
      
      return data as BlogPost;
    } catch (error: any) {
      toast({
        title: 'Erro ao criar post',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const updatePost = useCallback(async (id: string, updates: BlogPostUpdate) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .update(updates)
        .eq('id', id)
        .select('*, categoria:blog_categories(*)')
        .single();
      
      if (error) throw error;
      
      toast({
        title: 'Post atualizado',
        description: 'O post foi atualizado com sucesso.'
      });
      
      return data as BlogPost;
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar post',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const deletePost = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('blog_posts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast({
        title: 'Post excluído',
        description: 'O post foi excluído com sucesso.'
      });
      
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir post',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ===== CATEGORIES =====

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('blog_categories')
        .select('*')
        .order('nome', { ascending: true });
      
      if (error) throw error;
      return data as BlogCategory[];
    } catch (error: any) {
      toast({
        title: 'Erro ao buscar categorias',
        description: error.message,
        variant: 'destructive'
      });
      return [];
    }
  }, [toast]);

  const fetchCategoryBySlug = useCallback(async (slug: string) => {
    try {
      const { data, error } = await supabase
        .from('blog_categories')
        .select('*')
        .eq('slug', slug)
        .single();
      
      if (error) throw error;
      return data as BlogCategory;
    } catch (error: any) {
      toast({
        title: 'Erro ao buscar categoria',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    }
  }, [toast]);

  const createCategory = useCallback(async (category: BlogCategoryInsert) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('blog_categories')
        .insert([category])
        .select()
        .single();
      
      if (error) throw error;
      
      toast({
        title: 'Categoria criada',
        description: 'A categoria foi criada com sucesso.'
      });
      
      return data as BlogCategory;
    } catch (error: any) {
      toast({
        title: 'Erro ao criar categoria',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const updateCategory = useCallback(async (id: string, updates: BlogCategoryUpdate) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('blog_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      toast({
        title: 'Categoria atualizada',
        description: 'A categoria foi atualizada com sucesso.'
      });
      
      return data as BlogCategory;
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar categoria',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const deleteCategory = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('blog_categories')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast({
        title: 'Categoria excluída',
        description: 'A categoria foi excluída com sucesso.'
      });
      
      return true;
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir categoria',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ===== PUBLIC METHODS =====

  const fetchPublishedPosts = useCallback(async (options?: {
    categorySlug?: string;
    limit?: number;
    offset?: number;
  }) => {
    try {
      let query = supabase
        .from('blog_posts')
        .select('*, categoria:blog_categories(*)')
        .eq('status', 'publicado')
        .lte('data_publicacao', new Date().toISOString())
        .order('data_publicacao', { ascending: false });
      
      if (options?.categorySlug) {
        // First get the category
        const { data: category } = await supabase
          .from('blog_categories')
          .select('id')
          .eq('slug', options.categorySlug)
          .single();
        
        if (category) {
          query = query.eq('categoria_id', category.id);
        }
      }
      
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as BlogPost[];
    } catch (error: any) {
      console.error('[useBlog] Error fetching published posts:', error);
      return [];
    }
  }, []);

  return {
    loading,
    // Posts
    fetchPosts,
    fetchPostBySlug,
    fetchPostById,
    createPost,
    updatePost,
    deletePost,
    fetchPublishedPosts,
    // Categories
    fetchCategories,
    fetchCategoryBySlug,
    createCategory,
    updateCategory,
    deleteCategory
  };
}
