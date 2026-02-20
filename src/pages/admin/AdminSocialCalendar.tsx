import { useState } from 'react';
import { Plus, RefreshCw, ToggleLeft, ToggleRight, Pencil, BarChart2, Calendar, BookTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  useAdminCalendarEvents,
  useAdminTemplates,
  useAdminEngagementMetrics,
  useAdminUpsertEvent,
  useAdminUpsertTemplate,
  useAdminToggleEvent,
  SocialCalendarEvent,
  SocialCalendarTemplate,
} from '@/hooks/useSocialCalendar';

const CATEGORY_OPTS = ['tematica', 'feriado', 'comercial', 'sazonal'];
const NICHE_OPTS = ['geral', 'beleza', 'autopeças', 'pet', 'papelaria', 'eletrônicos', 'moda'];
const FORMAT_OPTS = ['feed', 'stories', 'reels', 'carrossel', 'shorts'];

export function AdminSocialCalendar() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [importing, setImporting] = useState(false);
  const [editEvent, setEditEvent] = useState<Partial<SocialCalendarEvent> | null>(null);
  const [editTemplate, setEditTemplate] = useState<Partial<SocialCalendarTemplate> | null>(null);

  const { data: events = [], isLoading: evLoading } = useAdminCalendarEvents(year);
  const { data: templates = [], isLoading: tplLoading } = useAdminTemplates();
  const { data: metrics } = useAdminEngagementMetrics();
  const upsertEvent = useAdminUpsertEvent();
  const upsertTemplate = useAdminUpsertTemplate();
  const toggleEvent = useAdminToggleEvent();

  const handleImport = async (action: string) => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('social-calendar-import', {
        body: { action, year, country_code: 'BR' },
      });
      if (error) throw error;
      toast.success(`Importação concluída! ${JSON.stringify(data)}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Erro na importação');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events" className="gap-2"><Calendar className="h-4 w-4" />Eventos ({events.length})</TabsTrigger>
          <TabsTrigger value="templates" className="gap-2"><BookTemplate className="h-4 w-4" />Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="metrics" className="gap-2"><BarChart2 className="h-4 w-4" />Métricas</TabsTrigger>
        </TabsList>

        {/* ── EVENTS ── */}
        <TabsContent value="events" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleImport('import_un')} disabled={importing}>
              <RefreshCw className={`h-3 w-3 ${importing ? 'animate-spin' : ''}`} /> Importar ONU
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleImport('import_holidays')} disabled={importing}>
              <RefreshCw className={`h-3 w-3 ${importing ? 'animate-spin' : ''}`} /> Importar Feriados BR
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleImport('import_all')} disabled={importing}>
              <RefreshCw className={`h-3 w-3 ${importing ? 'animate-spin' : ''}`} /> Importar Tudo
            </Button>
            <Button size="sm" className="gap-1 ml-auto" onClick={() => setEditEvent({ category: 'comercial', source: 'manual', is_active: true })}>
              <Plus className="h-3 w-3" /> Novo evento
            </Button>
          </div>

          <ScrollArea className="h-[480px]">
            <div className="space-y-2">
              {evLoading && <p className="text-muted-foreground text-sm animate-pulse">Carregando...</p>}
              {events.map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 border rounded-lg p-3 bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs shrink-0">{ev.category}</Badge>
                      <span className="text-sm font-medium truncate">{ev.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{ev.event_date} · {ev.source}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditEvent(ev)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleEvent.mutate({ id: ev.id, is_active: !ev.is_active })}>
                      {ev.is_active ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── TEMPLATES ── */}
        <TabsContent value="templates" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1" onClick={() => setEditTemplate({ niche: 'geral', format: 'feed', is_active: true })}>
              <Plus className="h-3 w-3" /> Novo template
            </Button>
          </div>
          <ScrollArea className="h-[480px]">
            <div className="space-y-2">
              {tplLoading && <p className="text-muted-foreground text-sm animate-pulse">Carregando...</p>}
              {templates.map((tpl) => (
                <div key={tpl.id} className="flex items-start gap-3 border rounded-lg p-3 bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">{tpl.format}</Badge>
                      <Badge variant="outline" className="text-xs">{tpl.niche}</Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{tpl.hook}</p>
                    <p className="text-xs text-muted-foreground truncate">{tpl.script}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditTemplate(tpl)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── METRICS ── */}
        <TabsContent value="metrics" className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total de eventos" value={metrics?.total ?? 0} />
            {Object.entries(metrics?.byType ?? {}).map(([k, v]) => (
              <MetricCard key={k} label={k} value={v as number} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Event Dialog */}
      {editEvent && (
        <EventDialog
          initial={editEvent}
          onClose={() => setEditEvent(null)}
          onSave={async (data) => { await upsertEvent.mutateAsync(data); setEditEvent(null); }}
        />
      )}

      {/* Edit Template Dialog */}
      {editTemplate && (
        <TemplateDialog
          initial={editTemplate}
          onClose={() => setEditTemplate(null)}
          onSave={async (data) => { await upsertTemplate.mutateAsync(data); setEditTemplate(null); }}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded-xl p-4 bg-card text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground capitalize">{label}</p>
    </div>
  );
}

function EventDialog({ initial, onClose, onSave }: { initial: Partial<SocialCalendarEvent>; onClose: () => void; onSave: (d: any) => Promise<void> }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title || !form.event_date) { toast.error('Título e data são obrigatórios'); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{form.id ? 'Editar evento' : 'Novo evento'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Título</Label><Input value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} /></div>
          <div><Label>Data</Label><Input type="date" value={form.event_date ?? ''} onChange={(e) => set('event_date', e.target.value)} /></div>
          <div><Label>Descrição</Label><Textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Categoria</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORY_OPTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>País (null=global)</Label><Input value={form.country_code ?? ''} onChange={(e) => set('country_code', e.target.value || null)} placeholder="BR, null..." /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({ initial, onClose, onSave }: { initial: Partial<SocialCalendarTemplate>; onClose: () => void; onSave: (d: any) => Promise<void> }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.hook || !form.script) { toast.error('Hook e roteiro são obrigatórios'); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{form.id ? 'Editar template' : 'Novo template'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nicho</Label>
              <Select value={form.niche} onValueChange={(v) => set('niche', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NICHE_OPTS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Formato</Label>
              <Select value={form.format} onValueChange={(v) => set('format', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMAT_OPTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Hook</Label><Input value={form.hook ?? ''} onChange={(e) => set('hook', e.target.value)} placeholder="Use {{evento}} como variável" /></div>
          <div><Label>Roteiro</Label><Textarea value={form.script ?? ''} onChange={(e) => set('script', e.target.value)} rows={3} /></div>
          <div><Label>CTA</Label><Input value={form.cta ?? ''} onChange={(e) => set('cta', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
