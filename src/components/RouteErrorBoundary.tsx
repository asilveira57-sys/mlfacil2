import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
  autoRecovering: boolean;
}

const AUTO_RECOVER_KEY = 'route_error_auto_recover_at';
const AUTO_RECOVER_COOLDOWN_MS = 60_000; // 1 min — evita loop de reload

/**
 * ErrorBoundary global para rotas. Evita "tela branca" quando:
 *  - Um componente lazy falha em hidratar (chunk antigo após deploy);
 *  - Um hook lança em runtime (ex.: ChunkLoadError, TypeError).
 *
 * Comportamento:
 *  - Erros de chunk/network → tenta recarregar automaticamente UMA vez
 *    após 1.5s (com cooldown de 1min para evitar loop infinito).
 *  - Outros erros ou após o cooldown → mostra UI manual de recuperação.
 *
 * Isso protege usuários com conexão instável que ficavam presos na tela
 * "Não foi possível abrir esta página" ao voltar para uma rota.
 */
export class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null, autoRecovering: false };
  private autoRecoverTimer: number | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, autoRecovering: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[RouteErrorBoundary] caught', error, info?.componentStack);

    const msg = error?.message || '';
    const isTransient = /chunk|loading|dynamically imported|failed to fetch|networkerror/i.test(msg);

    if (!isTransient) return;

    // Verifica cooldown — se acabamos de tentar auto-recover, não tenta de novo.
    let lastRecoverAt = 0;
    try {
      lastRecoverAt = Number(sessionStorage.getItem(AUTO_RECOVER_KEY) || 0);
    } catch { /* ignore */ }

    const now = Date.now();
    if (now - lastRecoverAt < AUTO_RECOVER_COOLDOWN_MS) {
      console.warn('[RouteErrorBoundary] auto-recover skipped (cooldown active)');
      return;
    }

    // Marca que estamos em auto-recover e agenda reload.
    try {
      sessionStorage.setItem(AUTO_RECOVER_KEY, String(now));
      sessionStorage.removeItem('lazy_module_reloaded');
    } catch { /* ignore */ }

    this.setState({ autoRecovering: true });
    this.autoRecoverTimer = window.setTimeout(() => {
      window.location.reload();
    }, 1500);
  }

  componentWillUnmount() {
    if (this.autoRecoverTimer !== null) {
      window.clearTimeout(this.autoRecoverTimer);
    }
  }

  private handleReload = () => {
    try {
      sessionStorage.removeItem('lazy_module_reloaded');
      sessionStorage.removeItem(AUTO_RECOVER_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'Erro desconhecido ao carregar a página.';
    const isChunk = /chunk|loading|dynamically imported|failed to fetch|networkerror/i.test(msg);

    // Auto-recover em andamento → mostra spinner amigável em vez da tela de erro.
    if (this.state.autoRecovering) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border rounded-lg p-6 text-center space-y-4">
            <div className="flex justify-center">
              <RotateCw className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Recarregando…</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Restabelecendo a conexão. Aguarde um instante.
              </p>
            </div>
          </div>
        </div>
      );
    }

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
                ? 'O sistema foi atualizado ou sua conexão oscilou. Recarregue para carregar a versão mais recente.'
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
