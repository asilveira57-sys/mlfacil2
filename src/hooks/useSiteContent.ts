import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SiteContent {
  id: string;
  chave: string;
  texto: string;
  pagina: string;
  secao: string | null;
  tipo: string;
  descricao: string | null;
  status: string;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export interface SiteContentInsert {
  chave: string;
  texto: string;
  pagina: string;
  secao?: string;
  tipo?: string;
  descricao?: string;
  status?: string;
  ordem?: number;
}

export interface SiteContentUpdate {
  texto?: string;
  pagina?: string;
  secao?: string;
  tipo?: string;
  descricao?: string;
  status?: string;
  ordem?: number;
}

// Fallback texts when content doesn't exist in database
const defaultTexts: Record<string, string> = {
  // Hero
  'home.hero.badge': 'Plataforma completa para sellers do Mercado Livre',
  'home.hero.title': 'Gestão inteligente para escalar suas vendas',
  'home.hero.subtitle': 'Centralize operações, monitore performance e tome decisões baseadas em dados. Tudo que você precisa para vender mais, em uma única plataforma.',
  'home.hero.cta_primary': 'Criar conta grátis',
  'home.hero.cta_secondary': 'Ver demonstração',
  'home.hero.trust_mercadopago': 'Integração oficial com Mercado Pago',
  'home.hero.trust_multiconta': 'Suporte a múltiplas contas',
  
  // Benefits
  'home.benefits.title': 'Por que escolher nossa plataforma?',
  'home.benefits.subtitle': 'Desenvolvida por sellers, para sellers. Entendemos os desafios do dia a dia e criamos soluções que realmente funcionam.',
  
  // Modules
  'home.modules.title': 'Módulos poderosos para seu negócio',
  'home.modules.subtitle': 'Ferramentas especializadas que cobrem todas as necessidades de um seller profissional.',
  
  // How it works
  'home.howitworks.title': 'Como funciona?',
  'home.howitworks.subtitle': 'Em apenas 3 passos você começa a otimizar suas vendas.',
  
  // Integrations
  'home.integrations.title': 'Integrações e Segurança',
  'home.integrations.subtitle': 'Conectado com as principais ferramentas e preparado para proteger seus dados.',
  
  // Demo
  'home.demo.title': 'Veja a plataforma em ação',
  'home.demo.subtitle': 'Assista uma demonstração rápida e entenda como podemos ajudar seu negócio a crescer.',
  
  // Pricing
  'home.pricing.title': 'Planos para cada fase do seu negócio',
  'home.pricing.subtitle': 'Escolha o plano ideal e comece a transformar suas operações hoje mesmo.',
  
  // Testimonials
  'home.testimonials.title': 'O que nossos clientes dizem',
  'home.testimonials.subtitle': 'Histórias reais de sellers que transformaram seus negócios com nossa plataforma.',
  
  // FAQ
  'home.faq.title': 'Perguntas frequentes',
  'home.faq.subtitle': 'Tire suas dúvidas sobre a plataforma, pagamentos e suporte.',
  
  // CTA
  'home.cta.title': 'Pronto para escalar suas vendas?',
  'home.cta.subtitle': 'Junte-se a milhares de sellers que já estão usando nossa plataforma para vender mais e com mais inteligência.',
};

/**
 * Hook to fetch and manage site content.
 * Provides fallback values when content doesn't exist.
 */
export function useSiteContent() {
  const [content, setContent] = useState<Record<string, string>>({});
  const [allContent, setAllContent] = useState<SiteContent[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all content for a page
  const fetchContentByPage = useCallback(async (pagina: string) => {
    try {
      const { data, error } = await supabase
        .from('site_content')
        .select('*')
        .eq('pagina', pagina)
        .order('ordem');

      if (error) throw error;

      const contentMap: Record<string, string> = {};
      (data || []).forEach((item: SiteContent) => {
        contentMap[item.chave] = item.texto;
      });

      setContent(prev => ({ ...prev, ...contentMap }));
      return data as SiteContent[];
    } catch (error) {
      console.error('[useSiteContent] Error fetching content:', error);
      return [];
    }
  }, []);

  // Fetch all content (for admin)
  const fetchAllContent = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('site_content')
        .select('*')
        .order('pagina')
        .order('ordem');

      if (error) throw error;

      setAllContent(data as SiteContent[] || []);
      
      const contentMap: Record<string, string> = {};
      (data || []).forEach((item: SiteContent) => {
        contentMap[item.chave] = item.texto;
      });
      setContent(contentMap);
      
      return data as SiteContent[];
    } catch (error) {
      console.error('[useSiteContent] Error fetching all content:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Get text by key with fallback
  const getText = useCallback((key: string): string => {
    return content[key] || defaultTexts[key] || key;
  }, [content]);

  // Create content
  const createContent = useCallback(async (data: SiteContentInsert): Promise<SiteContent | null> => {
    try {
      const { data: result, error } = await supabase
        .from('site_content')
        .insert([data] as any)
        .select()
        .single();

      if (error) throw error;
      return result as SiteContent;
    } catch (error) {
      console.error('[useSiteContent] Error creating content:', error);
      return null;
    }
  }, []);

  // Update content
  const updateContent = useCallback(async (id: string, data: SiteContentUpdate): Promise<SiteContent | null> => {
    try {
      const { data: result, error } = await supabase
        .from('site_content')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result as SiteContent;
    } catch (error) {
      console.error('[useSiteContent] Error updating content:', error);
      return null;
    }
  }, []);

  // Delete content
  const deleteContent = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('site_content')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[useSiteContent] Error deleting content:', error);
      return false;
    }
  }, []);

  // Upsert content (create or update by key)
  const upsertContent = useCallback(async (chave: string, texto: string, pagina: string, descricao?: string): Promise<SiteContent | null> => {
    try {
      const { data: existing } = await supabase
        .from('site_content')
        .select('id')
        .eq('chave', chave)
        .maybeSingle();

      if (existing) {
        return updateContent(existing.id, { texto });
      } else {
        return createContent({ chave, texto, pagina, descricao });
      }
    } catch (error) {
      console.error('[useSiteContent] Error upserting content:', error);
      return null;
    }
  }, [createContent, updateContent]);

  return {
    content,
    allContent,
    loading,
    getText,
    fetchContentByPage,
    fetchAllContent,
    createContent,
    updateContent,
    deleteContent,
    upsertContent,
    defaultTexts
  };
}
