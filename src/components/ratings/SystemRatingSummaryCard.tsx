import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { StarRating } from './StarRating';
import { StarsDistribution } from './StarsDistribution';
import { SystemRatingModal } from './SystemRatingModal';
import { useSystemRatingStats } from '@/hooks/useRatings';

type Props = {
  userId: string;
  userName?: string;
  userCompany?: string;
};

export function SystemRatingSummaryCard({ userId, userName, userCompany }: Props) {
  const { data: stats } = useSystemRatingStats();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            Avaliação do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats && stats.ratings_count > 0 ? (
            <>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold">{Number(stats.avg_stars).toFixed(1)}</p>
                  <StarRating value={Math.round(Number(stats.avg_stars))} readOnly size="sm" />
                  <p className="text-xs text-muted-foreground mt-1">{stats.ratings_count} avaliações</p>
                </div>
                <div className="flex-1">
                  <StarsDistribution stats={stats} />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma avaliação ainda.</p>
          )}
          <Button onClick={() => setModalOpen(true)} className="w-full" variant="outline">
            Avaliar o sistema
          </Button>
        </CardContent>
      </Card>

      <SystemRatingModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        userId={userId}
        userName={userName}
        userCompany={userCompany}
      />
    </>
  );
}
