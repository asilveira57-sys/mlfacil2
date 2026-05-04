import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOfferCheckout, type TierOffer } from "@/hooks/useTierOffers";

interface PendingOffer {
  offerId: string;
  defaultEmail: string;
}

/**
 * Wraps useOfferCheckout to ensure recurring (preapproval) checkouts always
 * collect/confirm the Mercado Pago payer email before redirecting.
 *
 * One-time (avulso) checkouts do NOT prompt — they intentionally skip
 * payer.email so MP doesn't lock the buyer to a specific account.
 */
export function useCheckoutWithPayerEmail() {
  const { checkout, loading: checkoutLoading } = useOfferCheckout();
  const [pending, setPending] = useState<PendingOffer | null>(null);
  const [confirming, setConfirming] = useState(false);

  const startCheckout = useCallback(
    async (offer: Pick<TierOffer, "id" | "billing_mode">) => {
      if (!offer?.id) return;

      // Avulso → no payer email, original behaviour.
      if (offer.billing_mode !== "recurring") {
        await checkout(offer.id);
        return;
      }

      // Recurring → ask the user to confirm the MP account email first.
      let defaultEmail = "";
      try {
        const { data } = await supabase.auth.getUser();
        defaultEmail = data.user?.email ?? "";
      } catch {
        defaultEmail = "";
      }
      setPending({ offerId: offer.id, defaultEmail });
    },
    [checkout]
  );

  const confirmEmail = useCallback(
    async (email: string) => {
      if (!pending) return;
      setConfirming(true);
      try {
        await checkout(pending.offerId, email);
      } finally {
        setConfirming(false);
        setPending(null);
      }
    },
    [checkout, pending]
  );

  const cancel = useCallback(() => {
    if (confirming) return;
    setPending(null);
  }, [confirming]);

  return {
    startCheckout,
    pending,
    confirmEmail,
    cancel,
    dialogOpen: pending !== null,
    defaultEmail: pending?.defaultEmail ?? "",
    loading: checkoutLoading || confirming,
  };
}
