/**
 * Create Ticket Dialog
 * Modal for creating new support tickets with context and attachments
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Image, 
  X, 
  Upload, 
  Loader2, 
  MapPin, 
  Layers,
  Send,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/hooks/useWorkspace';

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenshot: string | null;
  context: {
    route: string;
    module: string;
  } | null;
  onClearScreenshot: () => void;
}

type TicketCategory = 'erro' | 'duvida' | 'sugestao' | 'financeiro' | 'integracao' | 'outro';

const CATEGORY_TO_DB: Record<TicketCategory, string> = {
  'erro': 'bug',
  'duvida': 'question',
  'sugestao': 'suggestion',
  'financeiro': 'financial',
  'integracao': 'integration',
  'outro': 'other',
};

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'erro', label: 'Erro no sistema' },
  { value: 'duvida', label: 'Dúvida' },
  { value: 'sugestao', label: 'Sugestão' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'integracao', label: 'Integração' },
  { value: 'outro', label: 'Outro' },
];

export function CreateTicketDialog({
  open,
  onOpenChange,
  screenshot,
  context,
  onClearScreenshot,
}: CreateTicketDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  
  const MODULE_OPTIONS = [
    'Dashboard', 'Vendas', 'Etiquetas', 'Radiografia', 'Custos',
    'Precificação', 'Curva ABC', 'Mercado ADS', 'Configurações', 'Outro',
  ];

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('duvida');
  const [description, setDescription] = useState('');
  const [selectedModule, setSelectedModule] = useState(context?.module || 'Outro');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const validFiles = Array.from(files).filter(
        file => file.type.startsWith('image/') || file.type === 'application/pdf'
      );
      setAdditionalFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (index: number) => {
    setAdditionalFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o assunto e a descrição do chamado.',
        variant: 'destructive',
      });
      return;
    }

    if (!currentWorkspace) {
      toast({
        title: 'Erro',
        description: 'Nenhum workspace selecionado.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert([{
          user_id: user.id,
          workspace_id: currentWorkspace.id,
          subject: subject.trim(),
          category: CATEGORY_TO_DB[category] as 'bug' | 'question' | 'suggestion' | 'financial' | 'integration' | 'other',
          description: description.trim(),
          current_route: context?.route || null,
          current_module: selectedModule || null,
          status: 'open' as const,
          priority: 'medium' as const,
          metadata: {
            user_agent: navigator.userAgent,
            screen_resolution: `${window.screen.width}x${window.screen.height}`,
            created_at_local: new Date().toISOString(),
          },
        }])
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Upload screenshot if available
      if (screenshot && ticket) {
        const base64Data = screenshot.split(',')[1];
        const blob = await fetch(`data:image/png;base64,${base64Data}`).then(r => r.blob());
        const fileName = `screenshot-${ticket.id}-${Date.now()}.png`;
        const filePath = `${user.id}/${ticket.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('support-attachments')
          .upload(filePath, blob, {
            contentType: 'image/png',
          });

        if (!uploadError) {
          await supabase.from('support_attachments').insert({
            ticket_id: ticket.id,
            file_name: fileName,
            file_type: 'image/png',
            file_size: blob.size,
            storage_path: filePath,
            is_screenshot: true,
          });
        }
      }

      // Upload additional files
      for (const file of additionalFiles) {
        const fileName = `${Date.now()}-${file.name}`;
        const filePath = `${user.id}/${ticket.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('support-attachments')
          .upload(filePath, file);

        if (!uploadError) {
          await supabase.from('support_attachments').insert({
            ticket_id: ticket.id,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            storage_path: filePath,
            is_screenshot: false,
          });
        }
      }

      // Create initial log
      await supabase.from('support_ticket_logs').insert({
        ticket_id: ticket.id,
        user_id: user.id,
        action: 'created',
        new_value: { status: 'open', category },
      });

      toast({
        title: 'Chamado aberto com sucesso!',
        description: `Ticket #${ticket.id.slice(0, 8)} criado. Acompanhe pelo painel de suporte.`,
      });

      // Reset form
      setSubject('');
      setCategory('duvida');
      setDescription('');
      setSelectedModule(context?.module || 'Outro');
      setAdditionalFiles([]);
      onClearScreenshot();
      onOpenChange(false);
    } catch (error) {
      console.error('[CreateTicket] Error:', error);
      toast({
        title: 'Erro ao criar chamado',
        description: 'Tente novamente ou entre em contato pelo chat.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abrir Chamado de Suporte</DialogTitle>
          <DialogDescription>
            Descreva seu problema e nossa equipe responderá em breve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Context badges */}
          {context && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {context.route}
              </Badge>
            </div>
          )}

          {/* Module selector */}
          <div className="space-y-2">
            <Label>Módulo</Label>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULE_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Assunto *</Label>
            <Input
              id="subject"
              placeholder="Resumo do seu problema"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição detalhada *</Label>
            <Textarea
              id="description"
              placeholder="Descreva o problema em detalhes. Quanto mais informações, mais rápido poderemos ajudar."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          {/* Screenshot preview */}
          {screenshot && (
            <div className="space-y-2">
              <Label>Screenshot capturado</Label>
              <div className="relative rounded-lg border overflow-hidden bg-muted/50">
                <img
                  src={screenshot}
                  alt="Screenshot"
                  className="w-full h-32 object-cover object-top"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6"
                  onClick={onClearScreenshot}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Additional files */}
          <div className="space-y-2">
            <Label>Anexos adicionais</Label>
            <div className="flex flex-wrap gap-2">
              {additionalFiles.map((file, index) => (
                <Badge key={index} variant="outline" className="gap-1 pr-1">
                  <Image className="h-3 w-3" />
                  {file.name.length > 20 ? file.name.slice(0, 20) + '...' : file.name}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-1"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              <Upload className="h-4 w-4" />
              <span>Adicionar imagem ou PDF</span>
              <input
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                multiple
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Abrir Chamado
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
