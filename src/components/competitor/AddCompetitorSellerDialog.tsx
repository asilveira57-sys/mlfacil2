import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Star, Package, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ResolvedPreview {
  ml_seller_id: string;
  ml_nickname: string;
  reputation: any;
  total_items: number;
}

interface AddCompetitorSellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (resolvedSeller: ResolvedPreview, alias?: string) => Promise<boolean>;
  sellerId: string;
}

export function AddCompetitorSellerDialog({ open, onOpenChange, onAdd, sellerId }: AddCompetitorSellerDialogProps) {
  const [input, setInput] = useState('');
  const [alias, setAlias] = useState('');
  const [preview, setPreview] = useState<ResolvedPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setPreview(null);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('competitor-seller-sync', {
        body: { action: 'preview', input: input.trim(), seller_id: sellerId },
      });
      if (fnError) {
        // Extract detailed error message from 400 responses
        const errorBody = (fnError as any)?.context?.body;
        const errorMsg = errorBody?.error || fnError.message || 'Erro ao buscar seller';
        throw new Error(errorMsg);
      }
      if (data?.error) throw new Error(data.error);
      setPreview(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao buscar seller';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!preview) return;
    setAdding(true);
    const ok = await onAdd(preview, alias.trim() || undefined);
    setAdding(false);
    if (ok) {
      setInput('');
      setAlias('');
      setPreview(null);
      setError(null);
      onOpenChange(false);
    }
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setInput('');
      setAlias('');
      setPreview(null);
      setError(null);
    }
    onOpenChange(o);
  };

  const reputationLevel = preview?.reputation?.level_id;
  const reputationColor = reputationLevel === '5_green' ? 'text-green-600' : reputationLevel?.includes('yellow') ? 'text-yellow-600' : 'text-muted-foreground';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Monitorar Vendedor Concorrente
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Cole o link de um anúncio do vendedor que deseja monitorar. Por conformidade com LGPD, o vendedor será identificado com um apelido anônimo.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Link do Anúncio, ID do Seller ou ID do Anúncio (MLB)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="Ex: https://www.mercadolivre.com.br/produto-xyz/p/MLB12345678 ou 66043362"
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
              />
              <Button onClick={handlePreview} disabled={loading || !input.trim()} variant="outline">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {error && (
              <div className="text-sm text-destructive mt-2 p-3 bg-destructive/10 rounded-md border border-destructive/20">
                <p className="font-medium mb-1">Erro ao identificar vendedor</p>
                <p className="whitespace-pre-line">{error}</p>
              </div>
            )}
          </div>

          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          )}

          {preview && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-lg">{preview.ml_nickname}</p>
                  <p className="text-sm text-muted-foreground">ID: {preview.ml_seller_id}</p>
                </div>
                {reputationLevel && (
                  <div className="flex items-center gap-1">
                    <Star className={`h-4 w-4 ${reputationColor}`} />
                    <span className={`text-sm font-medium ${reputationColor}`}>
                      {preview.reputation?.power_seller_status || reputationLevel}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{preview.total_items} anúncios ativos</span>
              </div>
              {preview.reputation?.transactions?.completed && (
                <Badge variant="secondary">
                  {preview.reputation.transactions.completed} vendas
                </Badge>
              )}
            </div>
          )}

          <div>
            <Label>Apelido (opcional)</Label>
            <Input
              placeholder="Ex: Fornecedor João"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Será exibido como: <span className="font-medium">{preview?.ml_nickname || 'palavra1.palavra2.palavra3'}</span>{alias ? ` (${alias})` : ''}
            </p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              💡 O apelido anônimo protege a identidade do vendedor (LGPD). Use o campo acima para adicionar sua própria identificação interna.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={adding || !preview} className="gap-2">
            {adding ? 'Adicionando...' : 'Monitorar Seller'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
