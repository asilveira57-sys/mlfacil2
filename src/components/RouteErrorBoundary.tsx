import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary global para rotas. Evita "tela branca" quando:
 *  - Um componente lazy falha em hidratar (chunk antigo após deploy);
 *  - Um hook lança em runtime (ex.: ChunkLoadError, TypeError).
 *
 * Mostra UI mínima com "Recarregar" que limpa caches que costumam causar
 * o problema (sessionStorage flag de retry de chunk + service workers, se houver).
 */
export class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log apenas para debugging — não persiste PII.
    console.error('[RouteErrorBoundary] caught', error, info?.componentStack);
  }

  private handleReload = () => {
    try {
      // Limpa flag do lazyRetry para permitir nova tentativa de carregar chunk.
      sessionStorage.removeItem('lazy_module_reloaded');
    } catch {
      // ignore
    }
    // Hard reload — busca chunks novos.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'Erro desconhecido ao carregar a página.';
    const isChunk = /chunk|loading|dynamically imported|failed to fetch/i.test(msg);

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border rounded-lg p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Não foi possível abrir esta página</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isChunk
                ? 'O sistema foi atualizado. Recarregue a página para carregar a versão mais recente.'
                : 'Ocorreu um erro inesperado. Recarregue a página para tentar novamente.'}
            </p>
          </div>
          <details className="text-xs text-muted-foreground text-left bg-muted rounded p-2">
            <summary className="cursor-pointer">Detalhes técnicos</summary>
            <pre className="whitespace-pre-wrap break-words mt-2">{msg}</pre>
          </details>
          <Button onClick={this.handleReload} className="w-full gap-2">
            <RotateCw className="h-4 w-4" />
            Recarregar página
          </Button>
        </div>
      </div>
    );
  }
}
