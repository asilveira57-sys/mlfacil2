import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from '@/components/ratings/StarRating';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const MODULE_TAGS = ['Excelente', 'Fácil de usar', 'Rápido', 'Completo', 'Lento', 'Confuso', 'Bug'];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: 'module' | 'system';
  moduleName?: string;
  existingRating?: number;
  existingComment?: string;
  existingTags?: string[];
  isPending?: boolean;
  onSubmit: (data: { rating: number; comment?: string; tags?: string[]; nps?: number }) => Promise<void>;
};

export function FeedbackModal({
  open, onOpenChange, kind, moduleName,
  existingRating, existingComment, existingTags,
  isPending, onSubmit,
}: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    if (existingRating) setRating(existingRating);
    if (existingComment) setComment(existingComment);
    if (existingTags) setTags(existingTags);
  }, [existingRating, existingComment, existingTags]);

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleSubmit = async () => {
    if (rating < 1) return;
    try {
      await onSubmit({ rating, comment: comment || undefined, tags: tags.length > 0 ? tags : undefined });
      toast.success('Avaliação salva!');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    }
  };

  const title = kind === 'module' ? `Avaliar ${moduleName || 'módulo'}` : 'Avaliar o Sistema';
  const description = kind === 'module'
    ? 'Como você avalia este módulo?'
    : 'Como você avalia o Marketplace Fácil?';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex justify-center">
            <StarRating value={rating} onChange={setRating} size="lg" />
          </div>

          {kind === 'module' && (
            <div className="flex flex-wrap gap-2 justify-center">
              {MODULE_TAGS.map(tag => (
                <Badge
                  key={tag}
                  variant={tags.includes(tag) ? 'default' : 'outline'}
                  className="cursor-pointer select-none"
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

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
          <Button onClick={handleSubmit} disabled={rating < 1 || isPending}>
            {isPending ? 'Salvando...' : existingRating ? 'Atualizar' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
