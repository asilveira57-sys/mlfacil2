import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Send, Pause, XCircle, Users, Megaphone } from 'lucide-react';
import { useEmailCampaigns, type EmailCampaign } from '@/hooks/useEmailCampaigns';
import { useEmailTemplates } from '@/hooks/useEmailAdmin';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  scheduled: { label: 'Agendada', variant: 'outline' },
  running: { label: 'Enviando', variant: 'default' },
  paused: { label: 'Pausada', variant: 'outline' },
  completed: { label: 'Concluída', variant: 'default' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
};

const AUDIENCE_SCOPES = [
  { value: 'all', label: 'Todos os usuários' },
  { value: 'trial_active', label: 'Trial ativo' },
  { value: 'paid_active', label: 'Assinantes ativos' },
  { value: 'custom_emails', label: 'Lista de e-mails' },
];

export function EmailCampaignsTab() {
  const { data: campaigns, isLoading, createCampaign, campaignAction } = useEmailCampaigns();
  const { data: templates } = useEmailTemplates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    template_id: '',
    audience_scope: 'all',
    throttle_per_minute: 60,
  });

  const handleCreate = () => {
    if (!form.name || !form.template_id) return;
    createCampaign.mutate(
      {
        name: form.name,
        description: form.description || null,
        template_id: form.template_id,
        audience_json: { scope: form.audience_scope },
        throttle_per_minute: form.throttle_per_minute,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setForm({ name: '', description: '', template_id: '', audience_scope: 'all', throttle_per_minute: 60 });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Campanhas de e-mail com segmentação de audiência e controle de envio.
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Campanha</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Black Friday 2026"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div>
                <Label>Template</Label>
                <Select value={form.template_id} onValueChange={(v) => setForm({ ...form, template_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(templates || []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Audiência</Label>
                <Select value={form.audience_scope} onValueChange={(v) => setForm({ ...form, audience_scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_SCOPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Throttle (emails/min)</Label>
                <Input
                  type="number"
                  value={form.throttle_per_minute}
                  onChange={(e) => setForm({ ...form, throttle_per_minute: Number(e.target.value) })}
                  min={1}
                  max={300}
                />
              </div>
              <Button onClick={handleCreate} disabled={!form.name || !form.template_id || createCampaign.isPending} className="w-full">
                {createCampaign.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar Campanha
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!campaigns || campaigns.length === 0) ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhuma campanha criada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c: EmailCampaign) => {
            const statusInfo = STATUS_LABELS[c.status] || { label: c.status, variant: 'secondary' as const };
            return (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm">{c.name}</CardTitle>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      {c.status === 'draft' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => campaignAction.mutate({ campaign_id: c.id, action: 'build_recipients' })}
                            disabled={campaignAction.isPending}
                          >
                            <Users className="h-3 w-3" /> Construir audiência
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1"
                            onClick={() => campaignAction.mutate({ campaign_id: c.id, action: 'send' })}
                            disabled={campaignAction.isPending || c.total_recipients === 0}
                          >
                            <Send className="h-3 w-3" /> Enviar
                          </Button>
                        </>
                      )}
                      {c.status === 'running' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => campaignAction.mutate({ campaign_id: c.id, action: 'pause' })}
                          disabled={campaignAction.isPending}
                        >
                          <Pause className="h-3 w-3" /> Pausar
                        </Button>
                      )}
                      {['draft', 'running', 'paused'].includes(c.status) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1"
                          onClick={() => campaignAction.mutate({ campaign_id: c.id, action: 'cancel' })}
                          disabled={campaignAction.isPending}
                        >
                          <XCircle className="h-3 w-3" /> Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Template</span>
                      <p className="font-medium truncate">{c.template_name || '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Destinatários</span>
                      <p className="font-medium">{c.total_recipients}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Enviados</span>
                      <p className="font-medium text-green-600">{c.sent_count}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Falhas</span>
                      <p className="font-medium text-red-600">{c.failed_count}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Criada</span>
                      <p className="font-medium">
                        {format(new Date(c.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground mt-2">{c.description}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
