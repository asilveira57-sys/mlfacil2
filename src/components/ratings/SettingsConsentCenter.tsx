import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, X } from 'lucide-react';
import { useMyConsents, useSubmitConsent, useActiveConsentTemplate } from '@/hooks/useRatings';
import { toast } from 'sonner';
import { format } from 'date-fns';

type Props = {
  userId: string;
};

export function SettingsConsentCenter({ userId }: Props) {
  const { data: consents = [] } = useMyConsents(userId);
  const { data: template } = useActiveConsentTemplate('testimonial_publication_v1');
  const submitConsent = useSubmitConsent();

  // Get latest consent per key
  const latestByKey = consents.reduce((acc: Record<string, any>, c: any) => {
    if (!acc[c.consent_key] || new Date(c.accepted_at) > new Date(acc[c.consent_key].accepted_at)) {
      acc[c.consent_key] = c;
    }
    return acc;
  }, {});

  const handleRevoke = async (consent: any) => {
    if (!template) return;
    try {
      await submitConsent.mutateAsync({
        userId,
        templateId: template.id,
        consentKey: consent.consent_key,
        consentVersion: consent.consent_version,
        accepted: false,
        source: 'settings_page',
        metadata: { revoked_consent_id: consent.id },
      });
      toast.success('Consentimento revogado com sucesso.');
    } catch {
      toast.error('Erro ao revogar consentimento.');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Consentimentos e Privacidade
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.values(latestByKey).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum consentimento registrado.</p>
        ) : (
          Object.values(latestByKey).map((c: any) => (
            <div key={c.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border">
              <div className="space-y-1 flex-1">
                <p className="text-sm font-medium">{c.consent_templates?.title || c.consent_key}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={c.accepted ? 'default' : 'secondary'}>
                    {c.accepted ? 'Aceito' : 'Revogado'}
                  </Badge>
                  {c.metadata?.channels && (
                    <span className="text-xs text-muted-foreground">
                      Canais: {c.metadata.channels.join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(c.accepted_at), 'dd/MM/yyyy HH:mm')} · v{c.consent_version}
                </p>
              </div>
              {c.accepted && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleRevoke(c)}
                >
                  <X className="h-4 w-4 mr-1" /> Revogar
                </Button>
              )}
            </div>
          ))
        )}

        {consents.length > Object.keys(latestByKey).length && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Ver histórico completo ({consents.length} registros)</summary>
            <div className="mt-2 space-y-1">
              {consents.map((c: any) => (
                <div key={c.id} className="flex gap-2 text-muted-foreground">
                  <span>{format(new Date(c.accepted_at), 'dd/MM/yyyy HH:mm')}</span>
                  <span>{c.accepted ? '✅ Aceito' : '❌ Revogado'}</span>
                  <span>v{c.consent_version}</span>
                  <span>({c.source})</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
