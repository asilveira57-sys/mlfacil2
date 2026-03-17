import { Info, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocation } from 'react-router-dom';

interface ShippingBlockedScreenProps {
  sellerId: string | null;
  reason: string | null;
}

/**
 * Informational screen shown when a seller tries to access shipping features
 * but doesn't meet eligibility criteria. Uses neutral/informative styling (no error colors).
 */
export function ShippingBlockedScreen({ sellerId, reason }: ShippingBlockedScreenProps) {
  const location = useLocation();

  // Log render and route access attempt
  useEffect(() => {
    supabase
      .rpc('register_system_log', {
        p_level: 'info',
        p_system_area: 'shipping_eligibility',
        p_action: 'blocked_route_access',
        p_user_id: null,
        p_success: false,
        p_message: `Shipping feature blocked for seller ${sellerId} at ${location.pathname}`,
        p_meta_json: {
          seller_id: sellerId,
          reason,
          route: location.pathname,
          rendered_at: new Date().toISOString(),
        },
      })
      .then(({ error }) => {
        if (error && import.meta.env.DEV) {
          console.warn('[ShippingBlocked] Log failed:', error.message);
        }
      });
  }, [sellerId, reason, location.pathname]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-lg w-full border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
            <Info className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-lg font-semibold text-foreground">
            Funcionalidade indisponível para esta conta
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Sua conta está conectada, mas ainda não possui movimentação suficiente para utilizar essa funcionalidade.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pb-6">
          <div className="flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 rounded-lg px-4 py-3 mt-2">
            <TrendingUp className="h-4 w-4 shrink-0" />
            <span>
              Assim que houver vendas no Mercado Livre, o acesso será liberado automaticamente.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
