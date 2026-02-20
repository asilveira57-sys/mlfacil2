import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StarRating } from '@/components/ratings/StarRating';
import { useAdminTestimonials } from '@/hooks/useFeedback';
import { Eye, EyeOff, Star } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export function AdminPublishedTab() {
  const { testimonials, isLoading, togglePublished, toggleFeatured } = useAdminTestimonials();

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-3">
      {testimonials.map((t) => (
        <Card key={t.id}>
          <CardContent className="pt-4 flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                {t.rating && <StarRating value={t.rating} readOnly size="sm" />}
                <Badge variant={t.published ? 'default' : 'secondary'}>
                  {t.published ? 'Publicado' : 'Rascunho'}
                </Badge>
                {t.featured && <Badge className="bg-yellow-100 text-yellow-800">Destaque</Badge>}
                <Badge variant="outline" className="text-xs">{t.source}</Badge>
              </div>
              <p className="text-sm">"{t.quote}"</p>
              <p className="text-xs text-muted-foreground">
                {t.display_name} {t.company_name && `· ${t.company_name}`}
                {t.consent_status !== 'none' && ` · Consentimento: ${t.consent_status}`}
                {' · '}{format(new Date(t.created_at), 'dd/MM/yyyy')}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  toggleFeatured.mutate({ id: t.id, featured: !t.featured });
                  toast.success(t.featured ? 'Destaque removido' : 'Destacado');
                }}
                title={t.featured ? 'Remover destaque' : 'Destacar'}
              >
                <Star className={`h-4 w-4 ${t.featured ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  togglePublished.mutate({ id: t.id, published: !t.published });
                  toast.success(t.published ? 'Despublicado' : 'Publicado');
                }}
                title={t.published ? 'Despublicar' : 'Publicar'}
              >
                {t.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {testimonials.length === 0 && <p className="text-sm text-muted-foreground">Nenhum depoimento.</p>}
    </div>
  );
}
