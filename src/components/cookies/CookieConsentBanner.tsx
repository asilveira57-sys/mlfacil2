import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, Settings, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  CookieConsent,
  getStoredConsent,
  saveConsent,
  createConsent,
} from '@/lib/cookies/consent';
import { syncConsentToDb } from '@/lib/cookies/sync';

import { recordConsentOnServer } from '@/lib/cookies/api';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  onConsent: (consent: CookieConsent) => void;
}

export function CookieConsentBanner({ onConsent }: Props) {
  const [visible, setVisible] = useState(() => getStoredConsent() === null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [perfEnabled, setPerfEnabled] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  if (!visible) return null;

  const handleAcceptAll = async () => {
    const consent = createConsent('all', true, true);
    saveConsent(consent);
    syncConsentToDb(consent);
    setVisible(false);
    onConsent(consent);

    // Also record via edge function if logged in
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      recordConsentOnServer({
        consent_scope: 'cookies',
        consent_type: 'all',
        performance: true,
        analytics: true,
        source: 'banner',
      });
    }
  };

  const handleSavePreferences = async () => {
    const consent = createConsent('custom', perfEnabled, analyticsEnabled);
    saveConsent(consent);
    syncConsentToDb(consent);
    setShowPreferences(false);
    setVisible(false);
    onConsent(consent);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      recordConsentOnServer({
        consent_scope: 'cookies',
        consent_type: 'custom',
        performance: perfEnabled,
        analytics: analyticsEnabled,
        source: 'banner',
      });
    }
  };

  return (
    <>
      {/* Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 animate-in slide-in-from-bottom-4 duration-500">
        <div className="mx-auto max-w-4xl rounded-xl border border-border bg-card shadow-2xl p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex w-10 h-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Cookie className="w-5 h-5 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Utilizamos cookies para garantir o funcionamento do sistema, melhorar sua experiência e analisar o uso da plataforma.
                Ao continuar navegando, você concorda com nossa{' '}
                <Link to="/politica-de-cookies" className="text-primary underline hover:text-primary/80 transition-colors">
                  Política de Cookies
                </Link>.
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                <Button onClick={handleAcceptAll} size="sm" className="font-medium">
                  Aceitar todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreferences(true)}
                  className="font-medium"
                >
                  <Settings className="w-4 h-4 mr-1.5" />
                  Configurar preferências
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/politica-de-cookies">Política de Cookies</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences Modal */}
      <Dialog open={showPreferences} onOpenChange={setShowPreferences}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Configurar Cookies
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Essential - always on */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-medium">Essenciais</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Necessários para o funcionamento da plataforma.
                </p>
              </div>
              <Switch checked disabled className="opacity-70" />
            </div>

            {/* Performance */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="perf-switch" className="text-sm font-medium">Desempenho</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Medição de desempenho e identificação de erros.
                </p>
              </div>
              <Switch
                id="perf-switch"
                checked={perfEnabled}
                onCheckedChange={setPerfEnabled}
              />
            </div>

            {/* Analytics */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="analytics-switch" className="text-sm font-medium">Análise</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Avaliação de uso e comportamento agregado.
                </p>
              </div>
              <Switch
                id="analytics-switch"
                checked={analyticsEnabled}
                onCheckedChange={setAnalyticsEnabled}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleSavePreferences} className="w-full sm:w-auto">
              Salvar preferências
            </Button>
            <Button onClick={handleAcceptAll} className="w-full sm:w-auto">
              Aceitar todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
