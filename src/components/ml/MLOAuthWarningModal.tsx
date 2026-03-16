import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight } from 'lucide-react';
import mlLogo from '@/assets/ml-logo.png';

interface MLOAuthWarningModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function MLOAuthWarningModal({ open, onClose, onConfirm, loading }: MLOAuthWarningModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
        {/* Header with logos */}
        <div className="flex items-center justify-center gap-6 px-8 pt-8 pb-4">
          <img src={mlLogo} alt="Mercado Livre" className="w-14 h-14 object-contain" />
          <div className="w-px h-10 bg-border" />
          <span className="text-xl font-bold tracking-tight text-foreground">MKTP Fácil</span>
        </div>

        {/* Content */}
        <div className="px-8 pb-6 space-y-5">
          <h2 className="text-lg font-semibold text-foreground text-center">
            Conectar conta do Mercado Livre
          </h2>

          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            Você será redirecionado para a página oficial do Mercado Livre para autorizar a conexão com o MKTP Fácil.
          </p>

          {/* Warning about certification */}
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-4">
            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
              O Mercado Livre pode exibir um aviso informando que o aplicativo ainda não é certificado.
              <br />
              <strong>O MKTP Fácil está em processo de homologação oficial.</strong>
            </p>
          </div>

          {/* Security items */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-sm text-foreground">Login feito diretamente no Mercado Livre</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-sm text-foreground">O MKTP Fácil nunca recebe sua senha</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-sm text-foreground">A autorização pode ser revogada a qualquer momento</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-8 pb-8 pt-0 flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={onClose} className="sm:flex-1" disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="sm:flex-1 bg-[#FFE600] hover:bg-[#FFD700] text-[#333333] font-semibold"
          >
            {loading ? 'Conectando...' : 'Conectar minha conta'}
            {!loading && <ArrowRight className="w-4 h-4 ml-1" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
