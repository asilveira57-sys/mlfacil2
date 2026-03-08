import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Maps route segments to module_key identifiers.
 * Exported for use in module selector UIs.
 */
export const ROUTE_MODULE_MAP: Record<string, string> = {
  'inicio': 'inicio',
  'dashboard': 'dashboard',
  'shipping-labels': 'etiquetas',
  'tarefas': 'tarefas',
  'seed': 'seed',
  'promocoes': 'promocoes',
  'publicidade': 'mercado_ads',
  'anuncios': 'linha_do_tempo',
  'mensagens': 'pos_venda',
  'perguntas': 'perguntas',
  'radiografia': 'radiografia',
  'mercado': 'mercado',
  'tendencias': 'tendencias',
  'concorrencia': 'concorrencia',
  'abc-analysis': 'abc',
  'custos': 'custos',
  'precificacao': 'precificacao',
  'comissoes': 'comissoes',
  'frete': 'frete',
  'settings': 'settings',
  'tools': 'tools',
  'produtos': 'produtos',
  'postits': 'postits',
};

/** Label map for human-readable module names in selectors */
export const MODULE_LABELS: Record<string, string> = {
  '__global__': 'Geral (todos)',
  'inicio': 'Início',
  'dashboard': 'Dashboard',
  'etiquetas': 'Etiquetas',
  'tarefas': 'Tarefas',
  'seed': 'Seed',
  'promocoes': 'Promoções',
  'mercado_ads': 'Publicidade',
  'linha_do_tempo': 'Anúncios',
  'pos_venda': 'Pós-Venda',
  'perguntas': 'Perguntas',
  'radiografia': 'Radiografia',
  'mercado': 'Mercado',
  'tendencias': 'Tendências',
  'concorrencia': 'Concorrência',
  'abc': 'ABC',
  'custos': 'Custos',
  'precificacao': 'Precificação',
  'comissoes': 'Comissões',
  'frete': 'Gestão de Frete',
  'settings': 'Configurações',
  'tools': 'Ferramentas',
  'produtos': 'Produtos',
  'postits': 'Post-its',
};

/** Returns list of available modules for selectors */
export function getAvailableModules() {
  return Object.values(ROUTE_MODULE_MAP).map((key) => ({
    key,
    label: MODULE_LABELS[key] || key,
  }));
}

export function useActiveModuleKey(): string {
  const { pathname } = useLocation();

  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0] || 'inicio';
    return ROUTE_MODULE_MAP[firstSegment] || firstSegment;
  }, [pathname]);
}
