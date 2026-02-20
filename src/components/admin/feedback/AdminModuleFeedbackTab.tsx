import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StarRating } from '@/components/ratings/StarRating';
import { useAdminModuleFeedback, useAdminUpdateFeedbackStatus, useAdminCreateTestimonial } from '@/hooks/useFeedback';
import { EyeOff, Eye, Send } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  submitted: 'bg-green-100 text-green-800',
  hidden: 'bg-red-100 text-red-800',
  featured: 'bg-blue-100 text-blue-800',
  draft: 'bg-gray-100 text-gray-600',
};

export function AdminModuleFeedbackTab() {
  const { data: feedback = [], isLoading } = useAdminModuleFeedback();
  const updateStatus = useAdminUpdateFeedbackStatus();
  const createTestimonial = useAdminCreateTestimonial();

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  const toggleHidden = (f: any) => {
    const newStatus = f.status === 'hidden' ? 'submitted' : 'hidden';
    updateStatus.mutate({ table: 'module_feedback', id: f.id, status: newStatus });
    toast.success(newStatus === 'hidden' ? 'Ocultado' : 'Visível');
  };

  const convertToTestimonial = (f: any) => {
    if (!f.comment) {
      toast.error('Sem comentário para converter');
      return;
    }
    createTestimonial.mutate({
      sellerId: f.seller_id,
      source: 'module_feedback',
      sourceId: f.id,
      displayName: 'Seller',
      quote: f.comment,
      rating: f.rating,
    });
    toast.success('Candidato a depoimento criado');
  };

  return (
    <div className="space-y-3">
      {feedback.map((f) => (
        <Card key={f.id}>
          <CardContent className="pt-4 flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <StarRating value={f.rating} readOnly size="sm" />
                <Badge className={statusColors[f.status] || ''}>{f.status}</Badge>
                <Badge variant="outline" className="text-xs">{f.module_slug}</Badge>
              </div>
              {f.tags && f.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {f.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
              {f.comment && <p className="text-sm">{f.comment}</p>}
              <p className="text-xs text-muted-foreground">
                {format(new Date(f.created_at), 'dd/MM/yyyy HH:mm')}
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => toggleHidden(f)} title={f.status === 'hidden' ? 'Mostrar' : 'Ocultar'}>
                {f.status === 'hidden' ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              {f.comment && f.rating >= 4 && (
                <Button size="sm" variant="ghost" onClick={() => convertToTestimonial(f)} title="Converter em depoimento">
                  <Send className="h-4 w-4 text-blue-600" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      {feedback.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma avaliação de módulo.</p>}
    </div>
  );
}
