import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createConsent, saveConsent, getStoredConsent } from '@/lib/cookies/consent';
import { recordConsentOnServer } from '@/lib/cookies/api';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function CookiePreferencesModal({ open, onOpenChange, onSaved }: Props) {
  const current = getStoredConsent();
  const [perfEnabled, setPerfEnabled] = useState(current?.performance ?? false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(current?.analytics ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (type: 'all' | 'custom') => {
    setSaving(true);
    try {
      const perf = type === 'all' ? true : perfEnabled;
      const analytics = type === 'all' ? true : analyticsEnabled;
      const consent = createConsent(type, perf, analytics);
      saveConsent(consent);

      // Try to sync to server
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await recordConsentOnServer({
          consent_scope: 'cookies',
          consent_type: type,
          performance: perf,
          analytics: analytics,
          source: 'settings',
        });
      }

      toast.success('Preferências salvas!');
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar preferências');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Configurar Cookies
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Essenciais</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Necessários para o funcionamento da plataforma.
              </p>
            </div>
            <Switch checked disabled className="opacity-70" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="perf-switch-settings" className="text-sm font-medium">Desempenho</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Medição de desempenho e identificação de erros.
              </p>
            </div>
            <Switch
              id="perf-switch-settings"
              checked={perfEnabled}
              onCheckedChange={setPerfEnabled}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="analytics-switch-settings" className="text-sm font-medium">Análise</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Avaliação de uso e comportamento agregado.
              </p>
            </div>
            <Switch
              id="analytics-switch-settings"
              checked={analyticsEnabled}
              onCheckedChange={setAnalyticsEnabled}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => handleSave('custom')} disabled={saving} className="w-full sm:w-auto">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Salvar preferências
          </Button>
          <Button onClick={() => handleSave('all')} disabled={saving} className="w-full sm:w-auto">
            Aceitar todos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
