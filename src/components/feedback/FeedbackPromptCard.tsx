import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, X } from 'lucide-react';
import { FeedbackModal } from './FeedbackModal';
import { useUpsertModuleFeedback, useUpsertSystemFeedback, useMyModuleFeedback, useMySystemFeedback, useShouldShowFeedbackPrompt } from '@/hooks/useFeedback';

type Props = {
  kind: 'module' | 'system';
  moduleSlug?: string;
  moduleName?: string;
  userId: string;
  sellerId: string;
};

export function FeedbackPromptCard({ kind, moduleSlug, moduleName, userId, sellerId }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  const shouldShow = useShouldShowFeedbackPrompt(kind, moduleSlug, userId, sellerId);

  const { data: moduleFeedback } = useMyModuleFeedback(
    kind === 'module' ? moduleSlug : undefined,
    userId,
    sellerId
  );
  const { data: systemFeedback } = useMySystemFeedback(
    kind === 'system' ? userId : undefined,
    kind === 'system' ? sellerId : undefined
  );

  const upsertModule = useUpsertModuleFeedback();
  const upsertSystem = useUpsertSystemFeedback();

  const existing = kind === 'module' ? moduleFeedback : systemFeedback;

  if (dismissed || !shouldShow) return null;

  const handleSubmit = async (data: { rating: number; comment?: string; tags?: string[] }) => {
    if (kind === 'module' && moduleSlug) {
      await upsertModule.mutateAsync({
        userId,
        sellerId,
        moduleSlug,
        rating: data.rating,
        comment: data.comment,
        tags: data.tags,
      });
    } else {
      await upsertSystem.mutateAsync({
        userId,
        sellerId,
        rating: data.rating,
        comment: data.comment,
      });
    }
  };

  return (
    <>
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Star className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {kind === 'module' ? `Avalie o módulo ${moduleName || ''}` : 'Avalie o sistema'}
              </p>
              <p className="text-xs text-muted-foreground">
                Sua opinião nos ajuda a melhorar
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>Avaliar</Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <FeedbackModal
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        moduleName={moduleName}
        existingRating={existing?.rating}
        existingComment={existing?.comment || undefined}
        existingTags={kind === 'module' ? (moduleFeedback?.tags || undefined) : undefined}
        isPending={upsertModule.isPending || upsertSystem.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
