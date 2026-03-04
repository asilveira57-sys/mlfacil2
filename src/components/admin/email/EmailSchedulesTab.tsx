import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, Play, Plus, Calendar, Users } from 'lucide-react';
import { useEmailSchedules, type EmailSchedule } from '@/hooks/useEmailSchedules';
import { useEmailTemplates } from '@/hooks/useEmailAdmin';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SCOPE_LABELS: Record<string, string> = {
  all: 'Todos os usuários',
  trial_expiring: 'Trial expirando (3 dias)',
  trial_expired: 'Trial expirado',
  active_paid: 'Assinantes ativos',
  inactive_30d: 'Inativos 30 dias',
  custom_segment: 'Segmento customizado',
};

const CRON_PRESETS = [
  { label: 'Diário 9h', value: '0 9 * * *' },
  { label: 'Semanal (Seg 9h)', value: '0 9 * * 1' },
  { label: 'Semanal (Sex 14h)', value: '0 14 * * 5' },
  { label: 'Mensal (Dia 1, 9h)', value: '0 9 1 * *' },
  { label: 'A cada 6 horas', value: '0 */6 * * *' },
];

export function EmailSchedulesTab() {
  const { data: schedules, isLoading, createSchedule, updateSchedule, runNow } = useEmailSchedules();
  const { data: templates } = useEmailTemplates();
  const [dialogOpen, setDialogOpen] = useState(false);

  // New schedule form
  const [form, setForm] = useState({
    name: '',
    description: '',
    template_id: '',
    cron_expression: '0 9 * * 1',
    scope: 'all',
    is_one_shot: false,
  });

  const handleCreate = () => {
    if (!form.name || !form.template_id) return;
    createSchedule.mutate(form, {
      onSuccess: () => {
        setDialogOpen(false);
        setForm({ name: '', description: '', template_id: '', cron_expression: '0 9 * * 1', scope: 'all', is_one_shot: false });
      },
    });
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
          Agendamentos recorrentes ou únicos para envio automático de e-mails.
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Agendamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Agendamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Lembrete semanal de vendas"
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
                <Label>Frequência (cron)</Label>
                <Select value={form.cron_expression} onValueChange={(v) => setForm({ ...form, cron_expression: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CRON_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Cron: {form.cron_expression}</p>
              </div>
              <div>
                <Label>Escopo (público-alvo)</Label>
                <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCOPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_one_shot}
                  onCheckedChange={(c) => setForm({ ...form, is_one_shot: c })}
                />
                <Label>Envio único (desativa após executar)</Label>
              </div>
              <Button onClick={handleCreate} disabled={!form.name || !form.template_id || createSchedule.isPending} className="w-full">
                {createSchedule.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar Agendamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!schedules || schedules.length === 0) ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum agendamento criado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((s: EmailSchedule) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">{s.name}</CardTitle>
                    <Badge variant={s.is_enabled ? 'default' : 'secondary'}>
                      {s.is_enabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {s.is_one_shot && <Badge variant="outline">Único</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={s.is_enabled}
                      onCheckedChange={(checked) =>
                        updateSchedule.mutate({ id: s.id, is_enabled: checked })
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => runNow.mutate(s.id)}
                      disabled={runNow.isPending}
                    >
                      <Play className="h-3 w-3" /> Executar agora
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Cron
                    </span>
                    <span className="font-mono">{s.cron_expression}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" /> Escopo
                    </span>
                    <span>{SCOPE_LABELS[s.scope] || s.scope}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Último envio</span>
                    <span>
                      {s.last_run_at
                        ? `${format(new Date(s.last_run_at), 'dd/MM HH:mm', { locale: ptBR })} (${s.last_run_count || 0} emails)`
                        : 'Nunca'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Próximo envio</span>
                    <span>
                      {s.next_run_at
                        ? format(new Date(s.next_run_at), 'dd/MM HH:mm', { locale: ptBR })
                        : '—'}
                    </span>
                  </div>
                </div>
                {s.description && (
                  <p className="text-xs text-muted-foreground mt-2">{s.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
