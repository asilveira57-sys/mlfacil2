import { ReactNode } from 'react';
import { Loader2, Inbox, Info, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * MKTP Fácil — Sistema Unificado de Estados
 * 
 * 4 estados padronizados:
 * 1. LOADING   — azul/neutro, carregamento ou sincronização
 * 2. EMPTY     — neutro, sem dados disponíveis
 * 3. BLOCKED   — amarelo/informativo, bloqueio funcional por elegibilidade
 * 4. ERROR     — vermelho, erro técnico real
 */

// ─── 1. LOADING STATE ─────────────────────────────────────────────────────────

interface SystemLoadingProps {
  message?: string;
  className?: string;
}

export function SystemLoading({
  message = 'Estamos atualizando seus dados',
  className = '',
}: SystemLoadingProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── 2. EMPTY STATE ────────────────────────────────────────────────────────────

interface SystemEmptyProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function SystemEmpty({
  title = 'Ainda não há dados para exibir',
  message = 'Assim que novas informações forem registradas, o sistema será atualizado automaticamente.',
  icon,
  className = '',
  children,
}: SystemEmptyProps) {
  return (
    <Card className={`p-8 text-center ${className}`}>
      <div className="flex flex-col items-center justify-center space-y-3">
        {icon || <Inbox className="w-12 h-12 text-muted-foreground/30" />}
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">{message}</p>
        {children}
      </div>
    </Card>
  );
}

// ─── 3. BLOCKED STATE (Elegibilidade) ──────────────────────────────────────────

interface SystemBlockedProps {
  title?: string;
  message?: string;
  hint?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function SystemBlocked({
  title = 'Funcionalidade indisponível para esta conta',
  message = 'Sua conta está conectada, mas ainda não possui movimentação suficiente para utilizar essa funcionalidade.',
  hint = 'Assim que houver vendas no Mercado Livre, o acesso será liberado automaticamente.',
  icon,
  className = '',
  children,
}: SystemBlockedProps) {
  return (
    <div className={`flex items-center justify-center min-h-[50vh] p-6 ${className}`}>
      <Card className="max-w-lg w-full border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/10">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
            {icon || <Info className="h-7 w-7 text-amber-600 dark:text-amber-400" />}
          </div>
          <CardTitle className="text-lg font-semibold text-foreground">
            {title}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pb-6">
          {hint && (
            <div className="flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 rounded-lg px-4 py-3">
              <TrendingUp className="h-4 w-4 shrink-0" />
              <span>{hint}</span>
            </div>
          )}
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 4. ERROR STATE (Técnico Real) ─────────────────────────────────────────────

interface SystemErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function SystemError({
  title = 'Não foi possível carregar os dados neste momento',
  message = 'Tente novamente em instantes',
  onRetry,
  retryLabel = 'Tentar novamente',
  className = '',
}: SystemErrorProps) {
  return (
    <Card className={`p-8 text-center ${className}`}>
      <div className="flex flex-col items-center justify-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-destructive/70" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground max-w-sm">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            {retryLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ─── Barrel re-export for convenience ──────────────────────────────────────────

export const SystemStates = {
  Loading: SystemLoading,
  Empty: SystemEmpty,
  Blocked: SystemBlocked,
  Error: SystemError,
};
