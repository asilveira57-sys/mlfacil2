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
      let data: any = null;
      let fnError: any = null;
      
      try {
        const result = await supabase.functions.invoke('competitor-seller-sync', {
          body: { action: 'preview', input: input.trim(), seller_id: sellerId },
        });
        data = result.data;
        fnError = result.error;
      } catch (invokeErr: any) {
        // supabase-js may throw instead of returning { error } for non-2xx
        fnError = invokeErr;
      }
      
      if (fnError) {
        let errorMsg = 'Erro ao buscar seller';
        
        try {
          // Try to extract JSON from error message
          const rawMsg = typeof fnError === 'string' ? fnError : fnError?.message || '';
          const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.error) errorMsg = parsed.error;
          }
        } catch (_) { /* ignore parse errors */ }
        
        // Try context body as fallback
        if (errorMsg === 'Erro ao buscar seller') {
          try {
            const ctxError = fnError?.context?.body?.error;
            if (ctxError) errorMsg = ctxError;
          } catch (_) { /* ignore */ }
        }
        
        // Try data.error (sometimes returned in body even on error)
        if (errorMsg === 'Erro ao buscar seller' && typeof data === 'object' && data?.error) {
          errorMsg = data.error;
        }
        
        if (errorMsg === 'Erro ao buscar seller') {
          errorMsg = (typeof fnError === 'string' ? fnError : fnError?.message) || errorMsg;
        }
        
        setError(errorMsg);
        toast.error(errorMsg.split('\n')[0]);
        return;
      }
      
      if (data?.error) {
        setError(data.error);
        toast.error(String(data.error).split('\n')[0]);
        return;
      }
      
      if (!data || !data.ml_seller_id) {
        setError('Resposta inválida do servidor');
        toast.error('Resposta inválida do servidor');
        return;
      }
      
      setPreview(data);
    } catch (e) {
      console.error('Preview error:', e);
      const msg = e instanceof Error ? e.message : 'Erro ao buscar seller';
      setError(msg);
      toast.error(msg.split('\n')[0]);
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
              <div className="text-sm mt-2 p-4 rounded-md border-2" style={{ 
                backgroundColor: 'hsl(var(--destructive) / 0.1)', 
                borderColor: 'hsl(var(--destructive) / 0.3)' 
              }}>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <svg className="h-5 w-5" style={{ color: 'hsl(var(--destructive))' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold mb-2" style={{ color: 'hsl(var(--destructive))' }}>
                      {error.includes('MLBU') || error.includes('catálogo') ? '⚠️ Link de Catálogo Não Suportado' : 'Erro ao Identificar Vendedor'}
                    </p>
                    <p className="whitespace-pre-line leading-relaxed">{error}</p>
                  </div>
                </div>
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
