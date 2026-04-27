import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
  autoRecovering: boolean;
}

const AUTO_RECOVER_KEY = 'route_error_auto_recover_at';
const AUTO_RECOVER_COOLDOWN_MS = 15_000; // 15s — evita loop, mas permite recuperação rápida

/**
 * Limpa caches do navegador (Service Worker + Cache API) que possam estar servindo
 * uma versão antiga do app. Ideal antes de um reload por ChunkLoadError.
 */
async function clearStaleClientCaches(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }
}

/**
 * Recarrega a página forçando bypass de cache via query string com timestamp.
 * Isso garante que o navegador busque um index.html novo, com referências
 * aos chunks atuais.
 */
function hardReloadWithCacheBust() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

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
    const name = error?.name || '';
    const isTransient = /chunk|loading|dynamically imported|failed to fetch|networkerror/i.test(msg);
    // Erros típicos quando uma extensão (Google Translate, Grammarly, etc.)
    // muda o DOM por fora do React. Recuperamos com reload + flag para mostrar
    // mensagem clara sobre o que aconteceu.
    const isDomMutationByExtension =
      /removeChild|insertBefore|not a child of this node|failed to execute .* on 'node'/i.test(msg)
      || name === 'NotFoundError';

    if (!isTransient && !isDomMutationByExtension) return;

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
    this.autoRecoverTimer = window.setTimeout(async () => {
      await clearStaleClientCaches();
      hardReloadWithCacheBust();
    }, 1500);
  }

  componentWillUnmount() {
    if (this.autoRecoverTimer !== null) {
      window.clearTimeout(this.autoRecoverTimer);
    }
  }

  private handleReload = async () => {
    try {
      sessionStorage.removeItem('lazy_module_reloaded');
      sessionStorage.removeItem(AUTO_RECOVER_KEY);
    } catch {
      // ignore
    }
    await clearStaleClientCaches();
    hardReloadWithCacheBust();
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

    const isExtensionInterference =
      /removeChild|insertBefore|not a child of this node|failed to execute .* on 'node'/i.test(msg)
      || this.state.error?.name === 'NotFoundError';

    let title = 'Não foi possível abrir esta página';
    let description = 'Ocorreu um erro inesperado. Recarregue a página para tentar novamente.';
    if (isExtensionInterference) {
      title = 'Tradução automática ou extensão interferindo';
      description =
        'Detectamos que a tradução automática do navegador (ou uma extensão) está alterando o sistema e impedindo o carregamento. Desative a tradução desta página e recarregue. Se preferir, use o seletor de idioma do próprio sistema.';
    } else if (isChunk) {
      description = 'O sistema foi atualizado ou sua conexão oscilou. Recarregue para carregar a versão mais recente.';
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
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
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
