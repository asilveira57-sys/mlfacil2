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
  // ============ HEADER ============
  'home.header.logo_name': 'ML Analyzer Pro',
  'home.header.menu_recursos': 'Recursos',
  'home.header.menu_como_funciona': 'Como funciona',
  'home.header.menu_integracoes': 'Integrações',
  'home.header.menu_planos': 'Planos',
  'home.header.menu_blog': 'Blog',
  'home.header.menu_suporte': 'Suporte',
  'home.header.btn_entrar': 'Entrar',
  'home.header.btn_criar_conta': 'Criar conta',

  // ============ HERO ============
  'home.hero.badge': 'Plataforma completa para sellers do Mercado Livre',
  'home.hero.title': 'Gestão inteligente para escalar suas vendas',
  'home.hero.subtitle': 'Centralize operações, monitore performance e tome decisões baseadas em dados. Tudo que você precisa para vender mais, em uma única plataforma.',
  'home.hero.cta_primary': 'Criar conta grátis',
  'home.hero.cta_secondary': 'Ver demonstração',
  'home.hero.trust_mercadopago': 'Integração oficial com Mercado Pago',
  'home.hero.trust_multiconta': 'Suporte a múltiplas contas',
  
  // ============ BENEFITS ============
  'home.benefits.title': 'Por que escolher nossa plataforma?',
  'home.benefits.subtitle': 'Desenvolvida por sellers, para sellers. Entendemos os desafios do dia a dia e criamos soluções que realmente funcionam.',
  'home.benefits.item1.title': 'Centralização completa',
  'home.benefits.item1.description': 'Todas suas operações em um único painel intuitivo.',
  'home.benefits.item2.title': 'Análise de dados avançada',
  'home.benefits.item2.description': 'Dashboards e relatórios para decisões estratégicas.',
  'home.benefits.item3.title': 'Automação inteligente',
  'home.benefits.item3.description': 'Reduza tarefas manuais e ganhe tempo.',
  'home.benefits.item4.title': 'Suporte dedicado',
  'home.benefits.item4.description': 'Atendimento humanizado quando você precisar.',
  'home.benefits.item5.title': 'Segurança de dados',
  'home.benefits.item5.description': 'Seus dados protegidos com criptografia.',
  'home.benefits.item6.title': 'Atualizações constantes',
  'home.benefits.item6.description': 'Novas funcionalidades baseadas em feedback.',
  
  // ============ MODULES ============
  'home.modules.title': 'Módulos poderosos para seu negócio',
  'home.modules.subtitle': 'Ferramentas especializadas que cobrem todas as necessidades de um seller profissional.',
  'home.modules.item1.title': 'Pendências',
  'home.modules.item1.description': 'Organize e acompanhe todas as tarefas pendentes.',
  'home.modules.item2.title': 'Dashboard',
  'home.modules.item2.description': 'Visão geral de vendas e métricas em tempo real.',
  'home.modules.item3.title': 'Tendências',
  'home.modules.item3.description': 'Acompanhe o que está vendendo no mercado.',
  'home.modules.item4.title': 'Concorrência',
  'home.modules.item4.description': 'Monitore preços e estratégias dos concorrentes.',
  'home.modules.item5.title': 'Etiquetas',
  'home.modules.item5.description': 'Geração automática de etiquetas de envio.',
  'home.modules.item6.title': 'Custos',
  'home.modules.item6.description': 'Controle de custos e margem de lucro.',
  
  // ============ HOW IT WORKS ============
  'home.howitworks.title': 'Como funciona?',
  'home.howitworks.subtitle': 'Em apenas 3 passos você começa a otimizar suas vendas.',
  'home.howitworks.step1.number': '1',
  'home.howitworks.step1.title': 'Conecte sua conta',
  'home.howitworks.step1.description': 'Integre sua conta do Mercado Livre em poucos cliques.',
  'home.howitworks.step2.number': '2',
  'home.howitworks.step2.title': 'Configure o painel',
  'home.howitworks.step2.description': 'Personalize os módulos de acordo com suas necessidades.',
  'home.howitworks.step3.number': '3',
  'home.howitworks.step3.title': 'Otimize suas vendas',
  'home.howitworks.step3.description': 'Use insights e dados para vender mais e melhor.',
  
  // ============ INTEGRATIONS ============
  'home.integrations.title': 'Integrações e Segurança',
  'home.integrations.subtitle': 'Conectado com as principais ferramentas e preparado para proteger seus dados.',
  'home.integrations.item1.title': 'Mercado Pago',
  'home.integrations.item1.description': 'Pagamentos por assinatura e avulsos integrados nativamente.',
  'home.integrations.item2.title': 'Notas e Faturamento',
  'home.integrations.item2.description': 'Acompanhe notas fiscais e histórico de cobranças.',
  'home.integrations.item3.title': 'Segurança & LGPD',
  'home.integrations.item3.description': 'Dados criptografados e conformidade com legislação brasileira.',
  'home.integrations.item4.title': 'Multiconta',
  'home.integrations.item4.description': 'Gerencie múltiplas contas do Mercado Livre em um só painel.',
  'home.integrations.badge1': 'SSL 256-bit',
  'home.integrations.badge2': 'LGPD Compliant',
  'home.integrations.badge3': 'Backup diário',
  'home.integrations.badge4': '99.9% Uptime',
  
  // ============ DEMO ============
  'home.demo.title': 'Veja a plataforma em ação',
  'home.demo.subtitle': 'Assista uma demonstração rápida e entenda como podemos ajudar seu negócio a crescer.',
  'home.demo.btn_watch': 'Assistir demonstração',
  
  // ============ PRICING ============
  'home.pricing.title': 'Planos para cada fase do seu negócio',
  'home.pricing.subtitle': 'Escolha o plano ideal e comece a transformar suas operações hoje mesmo.',
  'home.pricing.trial_text': 'Experimente 7 dias grátis em qualquer plano',
  'home.pricing.plan1.name': 'Starter',
  'home.pricing.plan1.price': 'A definir',
  'home.pricing.plan1.description': 'Para quem está começando',
  'home.pricing.plan1.feature1': 'Até 3 anúncios',
  'home.pricing.plan1.feature2': 'Dashboard básico',
  'home.pricing.plan1.feature3': 'Suporte por email',
  'home.pricing.plan2.name': 'Pro',
  'home.pricing.plan2.price': 'A definir',
  'home.pricing.plan2.description': 'Para sellers em crescimento',
  'home.pricing.plan2.feature1': 'Até 50 anúncios',
  'home.pricing.plan2.feature2': 'Dashboard completo',
  'home.pricing.plan2.feature3': 'Análise de concorrência',
  'home.pricing.plan2.feature4': 'Suporte prioritário',
  'home.pricing.plan3.name': 'Enterprise',
  'home.pricing.plan3.price': 'Sob consulta',
  'home.pricing.plan3.description': 'Para grandes operações',
  'home.pricing.plan3.feature1': 'Anúncios ilimitados',
  'home.pricing.plan3.feature2': 'API dedicada',
  'home.pricing.plan3.feature3': 'Gerente de conta',
  'home.pricing.plan3.feature4': 'SLA garantido',
  'home.pricing.btn_select': 'Selecionar plano',
  
  // ============ TESTIMONIALS ============
  'home.testimonials.title': 'O que nossos clientes dizem',
  'home.testimonials.subtitle': 'Histórias reais de sellers que transformaram seus negócios com nossa plataforma.',
  'home.testimonials.item1.name': 'Carlos Silva',
  'home.testimonials.item1.role': 'Seller há 5 anos',
  'home.testimonials.item1.content': 'Finalmente uma ferramenta que entende as dores de quem vende no Mercado Livre. Consegui aumentar minhas vendas em 40% nos primeiros 3 meses.',
  'home.testimonials.item1.avatar': 'CS',
  'home.testimonials.item2.name': 'Ana Martins',
  'home.testimonials.item2.role': 'Loja de eletrônicos',
  'home.testimonials.item2.content': 'O módulo de concorrência me ajudou a ajustar preços de forma inteligente. Hoje tenho uma visão muito mais clara do mercado.',
  'home.testimonials.item2.avatar': 'AM',
  'home.testimonials.item3.name': 'Roberto Santos',
  'home.testimonials.item3.role': 'Full Commerce',
  'home.testimonials.item3.content': 'A gestão multiconta era um pesadelo antes. Agora gerencio 8 contas em um só painel sem perder nenhum detalhe.',
  'home.testimonials.item3.avatar': 'RS',
  'home.testimonials.stat1.value': '2.500+',
  'home.testimonials.stat1.label': 'Sellers ativos',
  'home.testimonials.stat2.value': '15M+',
  'home.testimonials.stat2.label': 'Análises realizadas',
  'home.testimonials.stat3.value': 'R$ 80M',
  'home.testimonials.stat3.label': 'GMV monitorado',
  'home.testimonials.stat4.value': '98%',
  'home.testimonials.stat4.label': 'Satisfação',
  
  // ============ FAQ ============
  'home.faq.title': 'Perguntas frequentes',
  'home.faq.subtitle': 'Tire suas dúvidas sobre a plataforma, pagamentos e suporte.',
  'home.faq.item1.question': 'Como funciona a cobrança?',
  'home.faq.item1.answer': 'Cobramos mensalmente via Mercado Pago. Você pode cancelar a qualquer momento.',
  'home.faq.item2.question': 'Posso testar antes de assinar?',
  'home.faq.item2.answer': 'Sim! Oferecemos 7 dias grátis para você experimentar todos os recursos.',
  'home.faq.item3.question': 'Meus dados estão seguros?',
  'home.faq.item3.answer': 'Sim, utilizamos criptografia SSL 256-bit e estamos em conformidade com a LGPD.',
  'home.faq.item4.question': 'Posso gerenciar múltiplas contas?',
  'home.faq.item4.answer': 'Sim, nos planos Pro e Enterprise você pode conectar múltiplas contas do Mercado Livre.',
  'home.faq.item5.question': 'Qual o suporte oferecido?',
  'home.faq.item5.answer': 'Oferecemos suporte por email em todos os planos e suporte prioritário nos planos Pro e Enterprise.',
  'home.faq.item6.question': 'Como faço para cancelar?',
  'home.faq.item6.answer': 'Você pode cancelar diretamente na área de configurações da sua conta, sem burocracia.',
  
  // ============ CTA ============
  'home.cta.title': 'Pronto para escalar suas vendas?',
  'home.cta.subtitle': 'Junte-se a milhares de sellers que já estão usando nossa plataforma para vender mais e com mais inteligência.',
  'home.cta.btn_primary': 'Criar conta grátis',
  'home.cta.btn_secondary': 'Falar com especialista',
  
  // ============ FOOTER ============
  'home.footer.logo_name': 'ML Analyzer Pro',
  'home.footer.description': 'Plataforma completa de gestão e inteligência para sellers do Mercado Livre.',
  'home.footer.col1.title': 'Produto',
  'home.footer.col1.link1': 'Recursos',
  'home.footer.col1.link2': 'Planos',
  'home.footer.col1.link3': 'Integrações',
  'home.footer.col1.link4': 'Atualizações',
  'home.footer.col2.title': 'Suporte',
  'home.footer.col2.link1': 'Central de ajuda',
  'home.footer.col2.link2': 'Contato',
  'home.footer.col2.link3': 'Status',
  'home.footer.col2.link4': 'FAQ',
  'home.footer.col3.title': 'Legal',
  'home.footer.col3.link1': 'Termos de uso',
  'home.footer.col3.link2': 'Privacidade',
  'home.footer.col3.link3': 'Cookies',
  'home.footer.col3.link4': 'LGPD',
  'home.footer.copyright': '© 2024 ML Analyzer Pro. Todos os direitos reservados.',
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
