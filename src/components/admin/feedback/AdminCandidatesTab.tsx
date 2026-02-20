import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StarRating } from '@/components/ratings/StarRating';
import { useAdminSystemFeedback, useAdminModuleFeedback, useAdminCreateTestimonial } from '@/hooks/useFeedback';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useMemo } from 'react';

export function AdminCandidatesTab() {
  const { data: systemFeedback = [] } = useAdminSystemFeedback();
  const { data: moduleFeedback = [] } = useAdminModuleFeedback();
  const createTestimonial = useAdminCreateTestimonial();

  // Candidatos: nota >= 4 + comentário com texto
  const candidates = useMemo(() => {
    const all = [
      ...systemFeedback
        .filter(f => f.rating >= 4 && f.comment && f.comment.trim().length > 10 && f.status !== 'hidden')
        .map(f => ({ ...f, source: 'system_feedback' as const, module_slug: undefined as string | undefined })),
      ...moduleFeedback
        .filter(f => f.rating >= 4 && f.comment && f.comment.trim().length > 10 && f.status !== 'hidden')
        .map(f => ({ ...f, source: 'module_feedback' as const })),
    ];
    return all.sort((a, b) => b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [systemFeedback, moduleFeedback]);

  const convert = (c: any) => {
    createTestimonial.mutate({
      sellerId: c.seller_id,
      source: c.source,
      sourceId: c.id,
      displayName: 'Seller',
      quote: c.comment,
      rating: c.rating,
    });
    toast.success('Depoimento criado!');
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Avaliações com nota ≥ 4 e comentário relevante — prontas para virar depoimento.
      </p>
      {candidates.map((c) => (
        <Card key={c.id}>
          <CardContent className="pt-4 flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <StarRating value={c.rating} readOnly size="sm" />
                <Badge variant="outline" className="text-xs">
                  {c.source === 'system_feedback' ? 'Sistema' : c.module_slug}
                </Badge>
              </div>
              <p className="text-sm">{c.comment}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(c.created_at), 'dd/MM/yyyy')}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => convert(c)} title="Criar depoimento" disabled={createTestimonial.isPending}>
              <Send className="h-4 w-4 text-blue-600" />
            </Button>
          </CardContent>
        </Card>
      ))}
      {candidates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum candidato encontrado.</p>}
    </div>
  );
}
