import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SiteContentContextType {
  content: Record<string, string>;
  loading: boolean;
  getText: (key: string, fallback?: string) => string;
  refresh: () => Promise<void>;
}

const SiteContentContext = createContext<SiteContentContextType | undefined>(undefined);

// Default fallback texts
const defaultTexts: Record<string, string> = {
  // Hero
  'home.hero.badge': 'Plataforma completa para sellers do Mercado Livre',
  'home.hero.title': 'Gestão inteligente para escalar suas vendas',
  'home.hero.subtitle': 'Centralize operações, monitore performance e tome decisões baseadas em dados. Tudo que você precisa para vender mais, em uma única plataforma.',
  'home.hero.cta_primary': 'Criar conta grátis',
  'home.hero.cta_secondary': 'Ver demonstração',
  'home.hero.trust_mercadopago': 'Integração oficial com Mercado Pago',
  'home.hero.trust_multiconta': 'Suporte a múltiplas contas',
  
  // Benefits section
  'home.benefits.title': 'Por que escolher nossa plataforma?',
  'home.benefits.subtitle': 'Desenvolvida por sellers, para sellers. Entendemos os desafios do dia a dia e criamos soluções que realmente funcionam.',
  'home.benefits.item1.title': 'Centralização de rotinas',
  'home.benefits.item1.description': 'Todas as operações do seu negócio em um só lugar. Sem precisar alternar entre várias ferramentas.',
  'home.benefits.item2.title': 'Visão clara de performance',
  'home.benefits.item2.description': 'Dashboards intuitivos que mostram exatamente como está o desempenho das suas vendas.',
  'home.benefits.item3.title': 'Menos trabalho manual',
  'home.benefits.item3.description': 'Automatize tarefas repetitivas e foque no que realmente importa: crescer seu negócio.',
  'home.benefits.item4.title': 'Alertas e pendências',
  'home.benefits.item4.description': 'Receba notificações sobre ações importantes e nunca perca uma oportunidade.',
  'home.benefits.item5.title': 'Histórico e auditoria',
  'home.benefits.item5.description': 'Acompanhe todas as mudanças e tenha controle total sobre a evolução dos seus anúncios.',
  'home.benefits.item6.title': 'Operação previsível',
  'home.benefits.item6.description': 'Planeje com confiança usando dados confiáveis e análises precisas do mercado.',
  
  // Modules section
  'home.modules.title': 'Módulos poderosos para seu negócio',
  'home.modules.subtitle': 'Ferramentas especializadas que cobrem todas as necessidades de um seller profissional.',
  'home.modules.item1.title': 'Pendências',
  'home.modules.item1.description': 'Gerencie tarefas, pedidos em atraso e ações necessárias em um painel centralizado.',
  'home.modules.item2.title': 'Tendências & Insights',
  'home.modules.item2.description': 'Descubra produtos em alta, palavras-chave trending e oportunidades de mercado.',
  'home.modules.item3.title': 'Concorrência',
  'home.modules.item3.description': 'Monitore preços, posicionamento e estratégias dos seus principais concorrentes.',
  'home.modules.item4.title': 'Auditoria & Validações',
  'home.modules.item4.description': 'Identifique problemas nos seus anúncios antes que afetem suas vendas.',
  'home.modules.item5.title': 'Custos & Margem',
  'home.modules.item5.description': 'Controle custos, calcule margens reais e otimize a precificação dos produtos.',
  'home.modules.item6.title': 'Relatórios',
  'home.modules.item6.description': 'Exporte dados detalhados para análise e acompanhe a evolução ao longo do tempo.',
  
  // How it works
  'home.howitworks.title': 'Como funciona?',
  'home.howitworks.subtitle': 'Em apenas 3 passos você começa a otimizar suas vendas.',
  'home.howitworks.step1.title': 'Conecte sua conta',
  'home.howitworks.step1.description': 'Integração rápida e segura com o Mercado Livre. Seus dados são importados automaticamente.',
  'home.howitworks.step2.title': 'Escolha e analise',
  'home.howitworks.step2.description': 'Explore os módulos disponíveis e analise seus dados com dashboards interativos e insights.',
  'home.howitworks.step3.title': 'Aplique e acompanhe',
  'home.howitworks.step3.description': 'Implemente as melhorias sugeridas e monitore os resultados em tempo real.',
  
  // Integrations
  'home.integrations.title': 'Integrações e Segurança',
  'home.integrations.subtitle': 'Conectado com as principais ferramentas e preparado para proteger seus dados.',
  
  // Demo
  'home.demo.title': 'Veja a plataforma em ação',
  'home.demo.subtitle': 'Assista uma demonstração rápida e entenda como podemos ajudar seu negócio a crescer.',
  'home.demo.duration': '5 minutos para conhecer as principais funcionalidades e entender como aplicar no seu dia a dia.',
  
  // Pricing
  'home.pricing.title': 'Planos para cada fase do seu negócio',
  'home.pricing.subtitle': 'Escolha o plano ideal e comece a transformar suas operações hoje mesmo.',
  'home.pricing.trial': 'Todos os planos incluem 7 dias de teste grátis. Cancele quando quiser.',
  
  // Testimonials
  'home.testimonials.title': 'O que nossos clientes dizem',
  'home.testimonials.subtitle': 'Histórias reais de sellers que transformaram seus negócios com nossa plataforma.',
  
  // FAQ
  'home.faq.title': 'Perguntas frequentes',
  'home.faq.subtitle': 'Tire suas dúvidas sobre a plataforma, pagamentos e suporte.',
  
  // CTA
  'home.cta.title': 'Pronto para escalar suas vendas?',
  'home.cta.subtitle': 'Junte-se a milhares de sellers que já estão usando nossa plataforma para vender mais e com mais inteligência.',
  
  // Footer
  'home.footer.description': 'Plataforma completa de gestão e análise para sellers do Mercado Livre.',
  'home.footer.contact': 'contato@mlanalyzerpro.com.br',
};

interface SiteContentProviderProps {
  children: ReactNode;
}

export function SiteContentProvider({ children }: SiteContentProviderProps) {
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchContent = async () => {
    try {
      const { data, error } = await supabase
        .from('site_content')
        .select('chave, texto')
        .eq('status', 'ativo');

      if (error) throw error;

      const contentMap: Record<string, string> = {};
      (data || []).forEach((item: { chave: string; texto: string }) => {
        contentMap[item.chave] = item.texto;
      });

      setContent(contentMap);
    } catch (error) {
      console.error('[SiteContentProvider] Error fetching content:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  const getText = (key: string, fallback?: string): string => {
    return content[key] || defaultTexts[key] || fallback || key;
  };

  const refresh = async () => {
    setLoading(true);
    await fetchContent();
  };

  return (
    <SiteContentContext.Provider value={{ content, loading, getText, refresh }}>
      {children}
    </SiteContentContext.Provider>
  );
}

export function useSiteContentContext() {
  const context = useContext(SiteContentContext);
  if (context === undefined) {
    // Return a fallback for components that don't need the provider
    return {
      content: {},
      loading: false,
      getText: (key: string, fallback?: string) => defaultTexts[key] || fallback || key,
      refresh: async () => {}
    };
  }
  return context;
}
