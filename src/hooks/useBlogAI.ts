import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Action = 'generate_meta' | 'improve_content' | 'generate_alt' | 'seo_audit';

interface MetaResult { meta_title: string; meta_description: string; meta_keywords: string; }
interface AltResult { alt: string; }
interface AuditResult { score: number; problemas: string[]; sugestoes: string[]; pontos_fortes: string[]; }
interface ImproveResult {
  sugestoes_gramatica: string[];
  estrutura_recomendada: string[];
  palavras_repetidas: string[];
  score_legibilidade: number;
}

export function useBlogAI() {
  const [loading, setLoading] = useState<Action | null>(null);

  async function call<T>(action: Action, payload: Record<string, unknown>): Promise<T | null> {
    setLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke('blog-ai-assistant', {
        body: { action, ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.data as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro na IA';
      toast.error(message);
      return null;
    } finally {
      setLoading(null);
    }
  }

  return {
    loading,
    generateMeta: (p: { titulo?: string; resumo?: string; conteudo?: string }) =>
      call<MetaResult>('generate_meta', p),
    generateAlt: (p: { imagem_url: string; contexto?: string }) =>
      call<AltResult>('generate_alt', p),
    improveContent: (p: { conteudo: string }) =>
      call<ImproveResult>('improve_content', p),
    seoAudit: (p: { titulo?: string; resumo?: string; conteudo?: string; contexto?: string }) =>
      call<AuditResult>('seo_audit', p),
  };
}
