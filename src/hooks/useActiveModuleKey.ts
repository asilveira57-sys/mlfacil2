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
  'settings': 'settings',
  'tools': 'tools',
  'produtos': 'produtos',
};

/** Label map for human-readable module names in selectors */
export const MODULE_LABELS: Record<string, string> = {
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
  'settings': 'Configurações',
  'tools': 'Ferramentas',
  'produtos': 'Produtos',
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
