import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, CheckCircle2, XCircle } from 'lucide-react';
import { useEmailProviderSettings } from '@/hooks/useEmailAdmin';
import { toast } from 'sonner';

export function EmailProviderTab() {
  const { data: provider, isLoading, upsertProvider, testProvider } = useEmailProviderSettings();
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Sync state from data
  if (provider && !initialized) {
    setFromName(provider.from_name || '');
    setFromEmail(provider.from_email || '');
    setReplyTo(provider.reply_to_email || '');
    setIsEnabled(provider.is_enabled);
    setInitialized(true);
  }

  const VERIFIED_DOMAIN = 'notify.notifica.mktpfacil.com';

  const handleSave = () => {
    if (fromEmail && !fromEmail.endsWith(`@${VERIFIED_DOMAIN}`)) {
      toast.error(`O e-mail do remetente deve usar o domínio verificado: @${VERIFIED_DOMAIN}`);
      return;
    }
    upsertProvider.mutate({
      provider_type: 'RESEND' as any,
      is_enabled: isEnabled,
      from_name: fromName,
      from_email: fromEmail || `noreply@${VERIFIED_DOMAIN}`,
      reply_to_email: replyTo || null,
    });
  };

  const handleTest = () => {
    if (!testEmail) return;
    testProvider.mutate(testEmail);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provedor de Envio</CardTitle>
          <CardDescription>Configure o provedor Resend para envio de e-mails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Provedor ativo</Label>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Resend</Badge>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do remetente</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="MKTP Fácil" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail do remetente</Label>
              <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@mktpfacil.com" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Reply-to (opcional)</Label>
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="suporte@mktpfacil.com" />
            </div>
          </div>

          <Button onClick={handleSave} disabled={upsertProvider.isPending}>
            {upsertProvider.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar Configuração
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Teste de Envio</CardTitle>
          <CardDescription>Envie um e-mail de teste para validar a configuração</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="email@teste.com"
              className="flex-1"
            />
            <Button onClick={handleTest} disabled={testProvider.isPending || !testEmail}>
              {testProvider.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar Teste
            </Button>
          </div>

          {provider?.last_test_at && (
            <div className="flex items-center gap-2 text-sm">
              {provider.last_test_status === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-muted-foreground">
                Último teste: {new Date(provider.last_test_at).toLocaleString('pt-BR')}
                {provider.last_test_status === 'ok' ? ' — OK' : ` — Erro: ${provider.last_test_error}`}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
