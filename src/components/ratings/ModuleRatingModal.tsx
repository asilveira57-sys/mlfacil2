import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from './StarRating';
import { useMyModuleRating, useUpsertModuleRating } from '@/hooks/useRatings';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  moduleId: string;
  moduleName: string;
  userId: string;
};

export function ModuleRatingModal({ open, onOpenChange, moduleId, moduleName, userId }: Props) {
  const { data: existing } = useMyModuleRating(moduleId, userId);
  const upsert = useUpsertModuleRating(moduleId);

  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (existing) {
      setStars(existing.stars);
      setComment(existing.comment || '');
    }
  }, [existing]);

  const handleSubmit = async () => {
    if (stars < 1) return;
    try {
      await upsert.mutateAsync({ userId, stars, comment });
      toast.success('Avaliação salva!');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Avaliar {moduleName}</DialogTitle>
          <DialogDescription>Como você avalia este módulo?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex justify-center">
            <StarRating value={stars} onChange={setStars} size="lg" />
          </div>
          <Textarea
            placeholder="Comentário opcional (até 500 caracteres)"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 500))}
            rows={3}
          />
          <p className="text-xs text-muted-foreground text-right">{comment.length}/500</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={stars < 1 || upsert.isPending}>
            {upsert.isPending ? 'Salvando...' : existing ? 'Atualizar' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
