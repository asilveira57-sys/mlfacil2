import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Eye, Pencil, Code } from 'lucide-react';
import { useEmailTemplates, useEmailCategories } from '@/hooks/useEmailAdmin';
import type { EmailTemplate } from '@/hooks/useEmailAdmin';

export function EmailTemplatesTab() {
  const { data: templates, isLoading, updateTemplate, renderPreview } = useEmailTemplates();
  const { data: categories } = useEmailCategories();
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewTemplateName, setPreviewTemplateName] = useState('');

  const getCategoryName = (categoryId: string) => {
    return categories?.find((c) => c.id === categoryId)?.name || '—';
  };

  const handleEdit = (tpl: EmailTemplate) => {
    setEditingTemplate({ ...tpl });
    setPreviewHtml(null);
    setPreviewSubject(null);
    const vars: Record<string, string> = {};
    for (const v of tpl.variables_schema_json || []) {
      vars[v] = '';
    }
    setPreviewVariables(vars);
  };

  const handleSave = () => {
    if (!editingTemplate) return;
    updateTemplate.mutate({
      id: editingTemplate.id,
      subject: editingTemplate.subject,
      body_html: editingTemplate.body_html,
      body_text: editingTemplate.body_text,
      is_enabled: editingTemplate.is_enabled,
    });
    setEditingTemplate(null);
  };

  const handlePreviewInEdit = () => {
    if (!editingTemplate) return;
    renderPreview.mutate(
      { template_id: editingTemplate.id, variables: previewVariables },
      {
        onSuccess: (data) => setPreviewHtml(data.body_html),
      }
    );
  };

  const handleQuickPreview = (tpl: EmailTemplate) => {
    setPreviewTemplateName(tpl.name);
    setPreviewHtml(null);
    setPreviewSubject(null);
    setPreviewDialogOpen(true);

    // Build sample variables
    const sampleVars: Record<string, string> = {};
    for (const v of tpl.variables_schema_json || []) {
      sampleVars[v] = getSampleValue(v);
    }

    renderPreview.mutate(
      { template_id: tpl.id, variables: sampleVars },
      {
        onSuccess: (data) => {
          setPreviewHtml(data.body_html);
          setPreviewSubject(data.subject);
        },
      }
    );
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
          <CardTitle className="text-base">Templates de E-mail ({templates?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {templates?.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{tpl.name}</p>
                    <Badge variant={tpl.is_enabled ? 'default' : 'secondary'} className="text-[10px]">
                      {tpl.is_enabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{tpl.subject}</p>
                  <div className="flex gap-2 mt-0.5">
                    <code className="text-[10px] text-muted-foreground">{tpl.key}</code>
                    <span className="text-[10px] text-muted-foreground">v{tpl.version}</span>
                    <span className="text-[10px] text-muted-foreground">{getCategoryName(tpl.category_id)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleQuickPreview(tpl)} title="Preview">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(tpl)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview: {previewTemplateName}
            </DialogTitle>
          </DialogHeader>

          {renderPreview.isPending && !previewHtml ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewHtml ? (
            <div className="space-y-3">
              {previewSubject && (
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Assunto: </span>
                  <span className="text-sm font-medium">{previewSubject}</span>
                </div>
              )}
              <div className="rounded-lg border bg-background p-4">
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Erro ao carregar preview</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Template: {editingTemplate?.name}</DialogTitle>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Habilitado</Label>
                <Switch
                  checked={editingTemplate.is_enabled}
                  onCheckedChange={(v) => setEditingTemplate({ ...editingTemplate, is_enabled: v })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Assunto</Label>
                <Input
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Code className="h-3 w-3" /> Body HTML
                </Label>
                <Textarea
                  rows={10}
                  className="font-mono text-xs"
                  value={editingTemplate.body_html}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body_html: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Body Text (fallback)</Label>
                <Textarea
                  rows={4}
                  className="font-mono text-xs"
                  value={editingTemplate.body_text}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body_text: e.target.value })}
                />
              </div>

              {/* Variables */}
              <div className="space-y-2">
                <Label className="text-xs">Variáveis disponíveis</Label>
                <div className="flex flex-wrap gap-1">
                  {(editingTemplate.variables_schema_json || []).map((v) => (
                    <Badge key={v} variant="outline" className="text-[10px]">
                      {'{{' + v + '}}'}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Preview section */}
              <div className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Preview</Label>
                  <Button variant="outline" size="sm" onClick={handlePreviewInEdit} disabled={renderPreview.isPending}>
                    {renderPreview.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                    Renderizar
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(previewVariables).map((key) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[10px]">{key}</Label>
                      <Input
                        className="h-7 text-xs"
                        value={previewVariables[key]}
                        onChange={(e) => setPreviewVariables({ ...previewVariables, [key]: e.target.value })}
                        placeholder={`[${key}]`}
                      />
                    </div>
                  ))}
                </div>

                {previewHtml && (
                  <div className="border rounded p-3 bg-background">
                    <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={updateTemplate.isPending}>
              {updateTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar (nova versão)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Returns a realistic sample value for common variable names */
function getSampleValue(varName: string): string {
  const samples: Record<string, string> = {
    user_name: 'João Silva',
    recipient: 'joao@exemplo.com',
    site_name: 'MKTP Fácil',
    confirmation_url: 'https://mktpfacil.com/confirm?token=abc123',
    subject: 'Oferta Especial de Novembro',
    plan_name: 'Profissional',
    days_to_expire: '3',
    token: '482901',
    ticket_id: '#1042',
    company_name: 'Loja Exemplo LTDA',
    period: '30 dias',
    date: new Date().toLocaleDateString('pt-BR'),
    amount: 'R$ 149,90',
    message: 'Sua solicitação foi processada com sucesso.',
  };
  return samples[varName] || `[${varName}]`;
}
