import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MessageSquareHeart, X } from 'lucide-react';
import { StarRating } from '@/components/ratings/StarRating';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import {
  useAdminSystemFeedback,
  useMySystemFeedback,
  useUpsertSystemFeedback,
  useShouldShowFeedbackPrompt,
} from '@/hooks/useFeedback';

type Props = {
  userId: string;
  sellerId: string;
  userName?: string;
  userCompany?: string;
};

/**
 * Smart System Rating Card for the Home screen.
 * 
 * - Always shows aggregated stats (avg rating, count) from system_feedback.
 * - Highlights a CTA prompt when display rules allow it.
 * - Uses the new FeedbackModal for submission.
 */
export function SmartSystemRatingCard({ userId, sellerId, userName, userCompany }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);

  // All system feedback for stats
  const { data: allFeedback = [] } = useAdminSystemFeedback();
  // Current user's feedback
  const { data: myFeedback } = useMySystemFeedback(userId, sellerId);
  // Should we actively prompt?
  const shouldPrompt = useShouldShowFeedbackPrompt('system', undefined, userId, sellerId);

  const upsert = useUpsertSystemFeedback();

  // Compute aggregate stats from system_feedback
  const stats = useMemo(() => {
    if (!allFeedback.length) return null;
    const validFeedback = allFeedback.filter(f => f.status !== 'hidden');
    if (!validFeedback.length) return null;

    const total = validFeedback.length;
    const avgRating = validFeedback.reduce((sum, f) => sum + f.rating, 0) / total;
    const distribution = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
    validFeedback.forEach(f => {
      if (f.rating >= 1 && f.rating <= 5) distribution[f.rating - 1]++;
    });

    return { avgRating, total, distribution };
  }, [allFeedback]);

  const handleSubmit = async (data: { rating: number; comment?: string }) => {
    await upsert.mutateAsync({
      userId,
      sellerId,
      rating: data.rating,
      comment: data.comment,
    });
  };

  const showPromptBanner = shouldPrompt && !promptDismissed;

  return (
    <>
      <Card className="overflow-hidden">
        {/* Prompt Banner — only when rules allow */}
        {showPromptBanner && (
          <div className="bg-primary/5 border-b border-primary/10 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MessageSquareHeart className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {myFeedback ? 'Atualize sua avaliação!' : 'Avalie o Marketplace Fácil'}
                </p>
                <p className="text-xs text-muted-foreground">Sua opinião nos ajuda a evoluir</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setModalOpen(true)}>
                {myFeedback ? 'Atualizar' : 'Avaliar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPromptDismissed(true)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            Avaliação do Sistema
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {stats ? (
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold">{stats.avgRating.toFixed(1)}</p>
                <StarRating value={Math.round(stats.avgRating)} readOnly size="sm" />
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.total} {stats.total === 1 ? 'avaliação' : 'avaliações'}
                </p>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map(star => {
                  const count = stats.distribution[star - 1];
                  const max = Math.max(...stats.distribution, 1);
                  return (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-right text-muted-foreground">{star}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-yellow-400 transition-all"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma avaliação ainda.</p>
          )}

          {/* My rating indicator */}
          {myFeedback && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Sua nota:</span>
                <StarRating value={myFeedback.rating} readOnly size="sm" />
              </div>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setModalOpen(true)}>
                Editar
              </Button>
            </div>
          )}

          {!showPromptBanner && !myFeedback && (
            <Button onClick={() => setModalOpen(true)} className="w-full" variant="outline">
              Avaliar o sistema
            </Button>
          )}
        </CardContent>
      </Card>

      <FeedbackModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        kind="system"
        existingRating={myFeedback?.rating}
        existingComment={myFeedback?.comment || undefined}
        isPending={upsert.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
