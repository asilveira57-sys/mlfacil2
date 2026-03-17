import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import mlLogo from '@/assets/ml-logo.png';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MLOAuthWarningModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function MLOAuthWarningModal({ open, onClose, onConfirm, loading }: MLOAuthWarningModalProps) {
  // Log modal display
  useEffect(() => {
    if (!open) return;
    supabase
      .rpc('register_system_log', {
        p_level: 'info',
        p_system_area: 'oauth',
        p_action: 'pre_auth_modal_displayed',
        p_user_id: null,
        p_success: true,
        p_message: 'Pre-auth OAuth warning modal displayed',
        p_meta_json: { component: 'MLOAuthWarningModal', rendered_at: new Date().toISOString() },
      })
      .then(() => {});
  }, [open]);

  const handleConfirm = () => {
    // Log click
    supabase
      .rpc('register_system_log', {
        p_level: 'info',
        p_system_area: 'oauth',
        p_action: 'pre_auth_connect_clicked',
        p_user_id: null,
        p_success: true,
        p_message: 'User clicked Connect with Mercado Livre',
        p_meta_json: { component: 'MLOAuthWarningModal' },
      })
      .then(() => {});
    onConfirm();
  };

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
            Conectar sua conta ao Mercado Livre
          </h2>

          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            Você será direcionado ao ambiente oficial do Mercado Livre para autorizar a integração com o MKTP Fácil.
          </p>

          {/* Homologation notice - informative, not alarming */}
          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Durante esse processo, pode aparecer um aviso informando que a aplicação ainda está em homologação.{' '}
              <strong className="text-foreground">Isso é esperado neste momento</strong> e não interfere na segurança da conexão.
            </p>
          </div>

          {/* Post-auth info */}
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Após a autorização, seus dados serão sincronizados automaticamente para iniciar o uso da plataforma.
          </p>

          {/* Security items */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground">Integração segura via protocolo OAuth oficial</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground">O MKTP Fácil nunca recebe sua senha</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground">A autorização pode ser revogada a qualquer momento</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-8 pb-8 pt-0 flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={onClose} className="sm:flex-1" disabled={loading}>
            Voltar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="sm:flex-1 bg-[#FFE600] hover:bg-[#FFD700] text-[#333333] font-semibold"
          >
            {loading ? 'Conectando...' : 'Conectar com Mercado Livre'}
            {!loading && <ArrowRight className="w-4 h-4 ml-1" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
