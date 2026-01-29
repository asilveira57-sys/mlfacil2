import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface CloneCompetitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  competitorItemId: string;
  competitorLabel: string;
  competitorTitle: string | null;
  competitorPrice: number | null;
}

interface CloneChecklist {
  title: boolean;
  description: boolean;
  pictures: boolean;
  attributes: boolean;
  price: boolean;
  quantity: boolean;
}

export function CloneCompetitorDialog({
  open,
  onOpenChange,
  sellerId,
  competitorItemId,
  competitorLabel,
  competitorTitle,
  competitorPrice,
}: CloneCompetitorDialogProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState<CloneChecklist>({
    title: true,
    description: true,
    pictures: true,
    attributes: true,
    price: true,
    quantity: true,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleCreateCloneAction = async () => {
    if (!sellerId || !competitorItemId) {
      toast.error('Dados insuficientes para clonar');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Não autenticado');

      const userId = session.user.id;

      // Create clone action in ad_lifecycle_actions
      const { error } = await supabase
        .from('ad_lifecycle_actions')
        .insert({
          workspace_id: userId,
          ml_account_id: sellerId,
          item_id: competitorItemId,
          action_type: 'CLONE',
          action_status: 'DRAFT',
          reason: `CLONE_CONCORRENTE:${competitorLabel}`,
          checklist: checklist as never,
          created_by: userId,
        });

      if (error) throw error;

      toast.success('Rascunho de clonagem criado!', {
        description: 'Vá para Central de Ações para revisar e executar',
        action: {
          label: 'Ver Ações',
          onClick: () => navigate('/anuncios/acoes'),
        },
      });

      onOpenChange(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[CloneCompetitorDialog] Error:', err);
      toast.error('Erro ao criar rascunho', { description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clonar Anúncio do Concorrente
          </DialogTitle>
          <DialogDescription>
            Crie um novo anúncio baseado neste concorrente monitorado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">{competitorLabel}</p>
            {competitorTitle && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{competitorTitle}</p>
            )}
            {competitorPrice && (
              <p className="text-sm font-semibold mt-1">{formatCurrency(competitorPrice)}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">ID: {competitorItemId}</p>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">O que copiar do anúncio?</p>
            
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'title', label: 'Título' },
                { key: 'description', label: 'Descrição' },
                { key: 'pictures', label: 'Imagens' },
                { key: 'attributes', label: 'Atributos' },
                { key: 'price', label: 'Preço' },
                { key: 'quantity', label: 'Quantidade' },
              ] as const).map(({ key, label }) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={checklist[key]}
                    onCheckedChange={(checked) =>
                      setChecklist(prev => ({ ...prev, [key]: !!checked }))
                    }
                  />
                  <Label htmlFor={key} className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreateCloneAction} disabled={loading}>
            {loading ? 'Criando...' : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Criar Rascunho
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
