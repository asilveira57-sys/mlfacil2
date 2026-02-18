import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Star, Package, UserPlus } from 'lucide-react';
import { resolveSellerFromLink, ResolvedSeller } from '@/lib/meli/resolveSellerFromLink';
import { toast } from 'sonner';

interface AddCompetitorSellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (resolvedSeller: ResolvedSeller, alias?: string) => Promise<boolean>;
}

export function AddCompetitorSellerDialog({ open, onOpenChange, onAdd }: AddCompetitorSellerDialogProps) {
  const [input, setInput] = useState('');
  const [alias, setAlias] = useState('');
  const [preview, setPreview] = useState<ResolvedSeller | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setPreview(null);
    setError(null);
    try {
      const result = await resolveSellerFromLink(input.trim());
      setPreview(result);
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
            Cole o link de um anúncio do vendedor que deseja monitorar. O sistema identificará o vendedor automaticamente.
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
              <p className="text-sm text-destructive mt-1">{error}</p>
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
              Será exibido como: {preview?.ml_nickname || 'NICKNAME'}{alias ? ` (${alias})` : ''}
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
