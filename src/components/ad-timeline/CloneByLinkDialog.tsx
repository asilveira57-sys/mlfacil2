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
import { Separator } from '@/components/ui/separator';
import { Copy, Link, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useQueryClient } from '@tanstack/react-query';

interface CloneByLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CloneChecklist {
  keep_title: boolean;
  keep_description: boolean;
  keep_images: boolean;
  keep_attributes: boolean;
  keep_price: boolean;
}

export function CloneByLinkDialog({ open, onOpenChange }: CloneByLinkDialogProps) {
  const { activeAccount } = useActiveAccount();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<CloneChecklist>({
    keep_title: true,
    keep_description: true,
    keep_images: true,
    keep_attributes: true,
    keep_price: true,
  });

  // Extract item ID from Mercado Livre link
  const extractItemId = (url: string): string | null => {
    // Patterns for various ML ID formats:
    // - MLB1234567890 (item regular)
    // - MLB-1234567890 (with hyphen)
    // - MLBU1234567890 (catalog/universal product)
    // - MLA, MLC, MLM, etc. (other countries)
    // - /up/MLBU... (universal product URL format)
    const patterns = [
      /\/up\/(MLB[A-Z]?\d+)/i,           // Universal product: /up/MLBU1234567890
      /\/p\/(MLB[A-Z]?[-]?\d+)/i,        // Product page: /p/MLB1234567890
      /item_id=(MLB[A-Z]?[-]?\d+)/i,     // Query param: item_id=MLB...
      /(MLB[A-Z]?[-]?\d{8,})/i,          // Any MLB ID in URL (8+ digits)
      /(ML[A-Z]{1,2}[-]?\d{8,})/i,       // Other countries: MLA, MLC, MLM, etc.
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        // Normalize: remove hyphens and uppercase
        const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
        return id;
      }
    }
    return null;
  };

  const handleCreateCloneAction = async () => {
    setError(null);
    
    if (!link.trim()) {
      setError('Cole o link do anúncio');
      return;
    }

    const itemId = extractItemId(link);
    if (!itemId) {
      setError('Link inválido. Cole um link de anúncio do Mercado Livre (ex: https://www.mercadolivre.com.br/...)');
      return;
    }

    if (!activeAccount?.sellerId) {
      setError('Selecione uma conta do Mercado Livre');
      return;
    }

    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) throw new Error('Não autenticado');

      // Get ml_account_id using ml_user_id (which maps to sellerId)
      // sellerId might be string, ml_user_id might be numeric - handle both
      const { data: mlAccount, error: accountError } = await supabase
        .from('ml_accounts')
        .select('id')
        .eq('ml_user_id', String(activeAccount.sellerId))
        .eq('user_id', user.id)
        .maybeSingle();

      if (accountError) {
        console.error('[CloneByLinkDialog] Account lookup error:', accountError);
        throw new Error(`Erro ao buscar conta: ${accountError.message}`);
      }

      if (!mlAccount?.id) {
        console.error('[CloneByLinkDialog] Account not found for sellerId:', activeAccount.sellerId);
        throw new Error('Conta do Mercado Livre não encontrada');
      }

      // Resolve workspace_id (RLS requires a workspace the user is member of)
      let workspaceId: string | null = null;

      const { data: prefs, error: prefsError } = await supabase
        .from('user_preferences')
        .select('active_workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (prefsError) {
        console.error('[CloneByLinkDialog] Preferences lookup error:', prefsError);
      }

      workspaceId = (prefs as any)?.active_workspace_id ?? null;

      if (!workspaceId) {
        const { data: member, error: memberError } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (memberError) {
          console.error('[CloneByLinkDialog] Workspace membership lookup error:', memberError);
        }

        workspaceId = (member as any)?.workspace_id ?? null;
      }

      if (!workspaceId) {
        throw new Error('Workspace não encontrado. Verifique seu acesso ao workspace.');
      }

      // Build checklist
      const actionChecklist: Record<string, unknown> = {
        title: checklist.keep_title,
        description: checklist.keep_description,
        pictures: checklist.keep_images,
        attributes: checklist.keep_attributes,
        price: checklist.keep_price,
        source: 'manual_link',
      };

      // Create clone action
      const { error: insertError } = await supabase
        .from('ad_lifecycle_actions')
        .insert({
          workspace_id: workspaceId,
          ml_account_id: mlAccount.id,
          item_id: itemId,
          action_type: 'CLONE',
          action_status: 'DRAFT',
          reason: 'CLONE_MANUAL',
          checklist: actionChecklist as never,
          created_by: user.id,
        });

      if (insertError) {
        console.error('[CloneByLinkDialog] Insert error:', insertError);
        throw new Error(`Erro ao criar rascunho: ${insertError.message}`);
      }

      toast.success('Rascunho de clonagem criado', {
        description: `Anúncio ${itemId} adicionado à fila de rascunhos`,
      });

      // Invalidate cache so the list updates immediately
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });

      // Reset and close
      setLink('');
      setChecklist({
        keep_title: true,
        keep_description: true,
        keep_images: true,
        keep_attributes: true,
        keep_price: true,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[CloneByLinkDialog] Error:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
      setError(null);
    } catch {
      toast.error('Não foi possível acessar a área de transferência');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clonar Anúncio por Link
          </DialogTitle>
          <DialogDescription>
            Cole o link de qualquer anúncio do Mercado Livre para criar uma cópia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Link Input */}
          <div className="space-y-2">
            <Label htmlFor="link">Link do anúncio</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="link"
                  placeholder="https://www.mercadolivre.com.br/..."
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    setError(null);
                  }}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={handlePaste} type="button">
                Colar
              </Button>
            </div>
            {error && (
              <div className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            {link && extractItemId(link) && (
              <p className="text-xs text-muted-foreground">
                ID detectado: <span className="font-mono">{extractItemId(link)}</span>
              </p>
            )}
          </div>

          <Separator />

          {/* Clone Checklist */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">O que manter do anúncio original?</Label>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep_title"
                  checked={checklist.keep_title}
                  onCheckedChange={(checked) => 
                    setChecklist(prev => ({ ...prev, keep_title: !!checked }))
                  }
                />
                <Label htmlFor="keep_title" className="text-sm font-normal">Título</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep_description"
                  checked={checklist.keep_description}
                  onCheckedChange={(checked) => 
                    setChecklist(prev => ({ ...prev, keep_description: !!checked }))
                  }
                />
                <Label htmlFor="keep_description" className="text-sm font-normal">Descrição</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep_images"
                  checked={checklist.keep_images}
                  onCheckedChange={(checked) => 
                    setChecklist(prev => ({ ...prev, keep_images: !!checked }))
                  }
                />
                <Label htmlFor="keep_images" className="text-sm font-normal">Imagens</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep_attributes"
                  checked={checklist.keep_attributes}
                  onCheckedChange={(checked) => 
                    setChecklist(prev => ({ ...prev, keep_attributes: !!checked }))
                  }
                />
                <Label htmlFor="keep_attributes" className="text-sm font-normal">Atributos</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep_price"
                  checked={checklist.keep_price}
                  onCheckedChange={(checked) => 
                    setChecklist(prev => ({ ...prev, keep_price: !!checked }))
                  }
                />
                <Label htmlFor="keep_price" className="text-sm font-normal">Preço</Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreateCloneAction} disabled={loading || !link.trim()}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
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
