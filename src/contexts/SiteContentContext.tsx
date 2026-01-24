import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { siteDefaultTexts } from '@/content/siteDefaultTexts';

interface SiteContentContextType {
  content: Record<string, string>;
  loading: boolean;
  getText: (key: string, fallback?: string) => string;
  refresh: () => Promise<void>;
}

const SiteContentContext = createContext<SiteContentContextType | undefined>(undefined);

// Default fallback texts
const defaultTexts: Record<string, string> = siteDefaultTexts;

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

  // Recarrega quando o usuário volta para a aba (útil após editar no admin em outra rota/aba)
  useEffect(() => {
    const onFocus = () => fetchContent();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
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

