import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Link } from 'lucide-react';
import { useCompetitorTracking } from '@/hooks/useCompetitorTracking';

interface AddTrackedListingDialogProps {
  sellerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddTrackedListingDialog({ sellerId, open, onOpenChange }: AddTrackedListingDialogProps) {
  const { addTracker } = useCompetitorTracking(sellerId);
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    competitor_url: '',
    competitor_label: '',
    min_price: '',
    max_price: '',
    reaction_mode: 'monitorar',
    undercut_amount: '0.10',
    check_interval_minutes: '120',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.competitor_url || !formData.competitor_label) return;

    setLoading(true);
    try {
      const result = await addTracker({
        competitor_url: formData.competitor_url,
        competitor_label: formData.competitor_label,
        min_price: formData.min_price ? parseFloat(formData.min_price) : undefined,
        max_price: formData.max_price ? parseFloat(formData.max_price) : undefined,
        reaction_mode: formData.reaction_mode,
        undercut_amount: parseFloat(formData.undercut_amount) || 0.10,
        check_interval_minutes: parseInt(formData.check_interval_minutes) || 120,
      });

      if (result) {
        setFormData({
          competitor_url: '',
          competitor_label: '',
          min_price: '',
          max_price: '',
          reaction_mode: 'monitorar',
          undercut_amount: '0.10',
          check_interval_minutes: '120',
        });
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Adicionar Concorrente
          </DialogTitle>
          <DialogDescription>
            Cole o link de um anúncio do Mercado Livre para monitorar seu preço
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="competitor_url">Link do Anúncio *</Label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="competitor_url"
                placeholder="https://www.mercadolivre.com.br/..."
                value={formData.competitor_url}
                onChange={(e) => setFormData(prev => ({ ...prev, competitor_url: e.target.value }))}
                className="pl-10"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Aceita links de produto ou item (MLB...)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="competitor_label">Nome do Concorrente *</Label>
            <Input
              id="competitor_label"
              placeholder="Ex: Concorrente A, Loja XYZ"
              value={formData.competitor_label}
              onChange={(e) => setFormData(prev => ({ ...prev, competitor_label: e.target.value }))}
              required
            />
            <p className="text-xs text-muted-foreground">
              Nome interno para identificação
            </p>
          </div>

          <div className="space-y-2">
            <Label>Intervalo de Verificação</Label>
            <Select
              value={formData.check_interval_minutes}
              onValueChange={(value) => setFormData(prev => ({ ...prev, check_interval_minutes: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">A cada 1 hora</SelectItem>
                <SelectItem value="120">A cada 2 horas</SelectItem>
                <SelectItem value="240">A cada 4 horas</SelectItem>
                <SelectItem value="360">A cada 6 horas</SelectItem>
                <SelectItem value="720">A cada 12 horas</SelectItem>
                <SelectItem value="1440">A cada 24 horas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_price">Preço Mínimo</Label>
              <Input
                id="min_price"
                type="number"
                step="0.01"
                min="0"
                placeholder="R$ 0,00"
                value={formData.min_price}
                onChange={(e) => setFormData(prev => ({ ...prev, min_price: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Alerta se cair abaixo
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_price">Preço Máximo</Label>
              <Input
                id="max_price"
                type="number"
                step="0.01"
                min="0"
                placeholder="R$ 0,00"
                value={formData.max_price}
                onChange={(e) => setFormData(prev => ({ ...prev, max_price: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Limite superior
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Reação</Label>
            <Select
              value={formData.reaction_mode}
              onValueChange={(value) => setFormData(prev => ({ ...prev, reaction_mode: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monitorar">
                  <div>
                    <div className="font-medium">Apenas Monitorar</div>
                    <div className="text-xs text-muted-foreground">Receber alertas de mudança</div>
                  </div>
                </SelectItem>
                <SelectItem value="sugerir">
                  <div>
                    <div className="font-medium">Sugerir Novo Preço</div>
                    <div className="text-xs text-muted-foreground">Recomendar ajuste quando concorrente mudar</div>
                  </div>
                </SelectItem>
                <SelectItem value="auto_aplicar" disabled>
                  <div>
                    <div className="font-medium">Ajustar Automaticamente</div>
                    <div className="text-xs text-muted-foreground">Integração pendente</div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.reaction_mode !== 'monitorar' && (
            <div className="space-y-2">
              <Label htmlFor="undercut_amount">Valor de Ajuste</Label>
              <Select
                value={formData.undercut_amount}
                onValueChange={(value) => setFormData(prev => ({ ...prev, undercut_amount: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.01">R$ 0,01 (1 centavo abaixo)</SelectItem>
                  <SelectItem value="0.10">R$ 0,10 (10 centavos abaixo)</SelectItem>
                  <SelectItem value="0.50">R$ 0,50 (50 centavos abaixo)</SelectItem>
                  <SelectItem value="1.00">R$ 1,00 (1 real abaixo)</SelectItem>
                  <SelectItem value="2.00">R$ 2,00 (2 reais abaixo)</SelectItem>
                  <SelectItem value="5.00">R$ 5,00 (5 reais abaixo)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Quanto ficar abaixo do concorrente ao reagir
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !formData.competitor_url || !formData.competitor_label}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
