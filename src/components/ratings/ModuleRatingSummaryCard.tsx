import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MessageSquare } from 'lucide-react';
import { StarRating } from './StarRating';
import { ModuleRatingModal } from './ModuleRatingModal';
import { useModuleRatingStats, useModuleRatingsList } from '@/hooks/useRatings';

type Props = {
  moduleId: string;
  moduleName: string;
  userId: string;
};

export function ModuleRatingSummaryCard({ moduleId, moduleName, userId }: Props) {
  const { data: stats } = useModuleRatingStats(moduleId);
  const { data: reviews = [] } = useModuleRatingsList(moduleId);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
              {stats && stats.ratings_count > 0 ? (
                <span className="text-sm">
                  <strong>{Number(stats.avg_stars).toFixed(1)}</strong>
                  <span className="text-muted-foreground"> ({stats.ratings_count})</span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Sem avaliações</span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
              Avaliar
            </Button>
          </div>

          {reviews.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {reviews.map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-xs">
                  <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <StarRating value={r.stars} readOnly size="sm" />
                    {r.comment && <p className="text-muted-foreground mt-0.5">{r.comment}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ModuleRatingModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        moduleId={moduleId}
        moduleName={moduleName}
        userId={userId}
      />
    </>
  );
}
