import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Extracts the active module key from the current route path.
 * Maps route segments to module_key identifiers dynamically.
 * No hardcoded enum — derives from URL structure.
 */
const ROUTE_MODULE_MAP: Record<string, string> = {
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

export function useActiveModuleKey(): string {
  const { pathname } = useLocation();

  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0] || 'inicio';
    return ROUTE_MODULE_MAP[firstSegment] || firstSegment;
  }, [pathname]);
}
