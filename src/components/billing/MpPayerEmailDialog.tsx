import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Loader2 } from "lucide-react";

interface MpPayerEmailDialogProps {
  open: boolean;
  defaultEmail: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (email: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Confirmation dialog for Mercado Pago recurring subscriptions.
 *
 * Mercado Pago validates the `payer_email` against the MP account used at
 * checkout. When the customer's MP account email differs from the email used
 * to log in to MKTP Fácil, the checkout fails with
 * "Seu e-mail não corresponde ao da assinatura".
 *
 * This dialog asks the user to confirm/correct the email BEFORE we create
 * the preapproval, avoiding the failure inside Mercado Pago's UI.
 */
export function MpPayerEmailDialog({
  open,
  defaultEmail,
  loading,
  onCancel,
  onConfirm,
}: MpPayerEmailDialogProps) {
  const [email, setEmail] = useState(defaultEmail || "");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(defaultEmail || "");
      setTouched(false);
    }
  }, [open, defaultEmail]);

  const trimmed = email.trim().toLowerCase();
  const valid = EMAIL_RE.test(trimmed);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || loading) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !loading && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirme o e-mail do Mercado Pago</DialogTitle>
          <DialogDescription>
            Para criar sua assinatura recorrente, o Mercado Pago precisa do
            e-mail da conta que você vai usar para pagar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Use o mesmo e-mail da sua conta no Mercado Pago. Se for diferente
              do seu e-mail de acesso ao MKTP Fácil, altere abaixo antes de
              continuar.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="mp-payer-email">E-mail do Mercado Pago</Label>
            <Input
              id="mp-payer-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="seu-email@exemplo.com"
              disabled={loading}
            />
            {touched && !valid && (
              <p className="text-xs text-destructive">
                Informe um e-mail válido.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Continuar para o pagamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
