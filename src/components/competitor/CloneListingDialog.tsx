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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, Sparkles, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CloneListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  sellerListingId: string;
  sellerListingTitle: string;
  sellerListingPrice: number;
  competitorPrice: number | null;
  competitorLabel: string;
  trackerId: string;
}

interface CloneChecklist {
  keep_title: boolean;
  keep_description: boolean;
  keep_images: boolean;
  keep_attributes: boolean;
  adjust_price: boolean;
  new_price?: number;
}

export function CloneListingDialog({
  open,
  onOpenChange,
  sellerId,
  sellerListingId,
  sellerListingTitle,
  sellerListingPrice,
  competitorPrice,
  competitorLabel,
  trackerId,
}: CloneListingDialogProps) {
  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState<CloneChecklist>({
    keep_title: true,
    keep_description: true,
    keep_images: true,
    keep_attributes: true,
    adjust_price: true,
    new_price: competitorPrice ? competitorPrice - 0.10 : sellerListingPrice,
  });

  // Calculate suggested competitive price
  const suggestedPrice = competitorPrice ? competitorPrice - 0.10 : sellerListingPrice;
  const priceDifference = competitorPrice ? sellerListingPrice - competitorPrice : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleCreateCloneAction = async () => {
    if (!sellerId) {
      toast.error('Contexto de conta não disponível');
      return;
    }

    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) throw new Error('Não autenticado');

      // Resolve the correct workspace ID (NOT user.id)
      let resolvedWorkspaceId: string | null = null;
      
      // 1) Try user_preferences.active_workspace_id
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if ((prefs as any)?.active_workspace_id) {
        resolvedWorkspaceId = (prefs as any).active_workspace_id;
      } else {
        // 2) Fallback: first workspace membership
        const { data: member } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        
        resolvedWorkspaceId = (member as any)?.workspace_id || null;
      }

      if (!resolvedWorkspaceId) {
        throw new Error('Workspace não encontrado');
      }

      // Fetch the ml_account_id for this seller (by ml_user_id which is the seller_id)
      const { data: mlAccount } = await supabase
        .from('ml_accounts')
        .select('id')
        .eq('ml_user_id', sellerId)
        .maybeSingle();

      if (!mlAccount?.id) {
        throw new Error('Conta do Mercado Livre não encontrada');
      }

      // Create clone action checklist as plain object
      const actionChecklist: Record<string, unknown> = {
        keep_title: checklist.keep_title,
        keep_description: checklist.keep_description,
        keep_images: checklist.keep_images,
        keep_attributes: checklist.keep_attributes,
        adjust_price: checklist.adjust_price,
        new_price: checklist.new_price,
        source: 'competitor_tracking',
        competitor_label: competitorLabel,
        competitor_price: competitorPrice,
        tracker_id: trackerId,
      };

      // Create a clone action in ad_lifecycle_actions
      const insertResult = await supabase
        .from('ad_lifecycle_actions')
        .insert([{
          workspace_id: resolvedWorkspaceId,
          ml_account_id: mlAccount.id,
          item_id: sellerListingId,
          action_type: 'CLONE',
          action_status: 'DRAFT',
          reason: `CLONE_COMPETITIVO:${trackerId}`,
          checklist: actionChecklist as never,
          created_by: user.id,
        }] as never);

      if (insertResult.error) throw insertResult.error;

      toast.success('Rascunho de clonagem criado', {
        description: 'Vá para Central de Ações para revisar e executar',
        action: {
          label: 'Ver Ações',
          onClick: () => window.open('/anuncios/acoes', '_blank'),
        },
      });

      onOpenChange(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[CloneListingDialog] Error:', err);
      toast.error('Erro ao criar rascunho de clonagem', {
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clonar Anúncio Competitivo
          </DialogTitle>
          <DialogDescription>
            Crie uma nova versão do seu anúncio com preço competitivo baseado no concorrente monitorado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source Listing Info */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Anúncio Original</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{sellerListingTitle}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Seu preço: {formatCurrency(sellerListingPrice)}</Badge>
                  {competitorPrice && (
                    <Badge variant="secondary">Concorrente: {formatCurrency(competitorPrice)}</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Price Comparison */}
          {competitorPrice && priceDifference > 0 && (
            <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <p className="text-sm text-warning-foreground">
                Seu preço está {formatCurrency(priceDifference)} acima do concorrente
              </p>
            </div>
          )}

          <Separator />

          {/* Clone Checklist */}
          <div className="space-y-3">
            <p className="text-sm font-medium">O que manter do anúncio original?</p>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep_title"
                  checked={checklist.keep_title}
                  onCheckedChange={(checked) => 
                    setChecklist(prev => ({ ...prev, keep_title: !!checked }))
                  }
                />
                <Label htmlFor="keep_title" className="text-sm">Título</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep_description"
                  checked={checklist.keep_description}
                  onCheckedChange={(checked) => 
                    setChecklist(prev => ({ ...prev, keep_description: !!checked }))
                  }
                />
                <Label htmlFor="keep_description" className="text-sm">Descrição</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep_images"
                  checked={checklist.keep_images}
                  onCheckedChange={(checked) => 
                    setChecklist(prev => ({ ...prev, keep_images: !!checked }))
                  }
                />
                <Label htmlFor="keep_images" className="text-sm">Imagens</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep_attributes"
                  checked={checklist.keep_attributes}
                  onCheckedChange={(checked) => 
                    setChecklist(prev => ({ ...prev, keep_attributes: !!checked }))
                  }
                />
                <Label htmlFor="keep_attributes" className="text-sm">Atributos técnicos</Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Price Adjustment */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="adjust_price"
                checked={checklist.adjust_price}
                onCheckedChange={(checked) => 
                  setChecklist(prev => ({ ...prev, adjust_price: !!checked }))
                }
              />
              <Label htmlFor="adjust_price" className="text-sm font-medium">Ajustar preço competitivo</Label>
            </div>

            {checklist.adjust_price && (
              <div className="pl-6 space-y-2">
                <Label htmlFor="new_price" className="text-sm">Novo preço sugerido</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="new_price"
                    type="number"
                    step="0.01"
                    value={checklist.new_price || ''}
                    onChange={(e) => 
                      setChecklist(prev => ({ ...prev, new_price: parseFloat(e.target.value) || 0 }))
                    }
                    className="w-32"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChecklist(prev => ({ ...prev, new_price: suggestedPrice }))}
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    Sugerir
                  </Button>
                </div>
                {checklist.new_price && checklist.new_price < sellerListingPrice && (
                  <p className="text-xs text-muted-foreground">
                    Economia de {formatCurrency(sellerListingPrice - checklist.new_price)} em relação ao seu preço atual
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreateCloneAction} disabled={loading}>
            {loading ? (
              <>Criando...</>
            ) : (
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
