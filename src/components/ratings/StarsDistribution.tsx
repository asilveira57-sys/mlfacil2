import type { RatingStats } from '@/hooks/useRatings';

export function StarsDistribution({ stats }: { stats: RatingStats }) {
  const bars = [
    { label: '5', count: stats.stars_5 },
    { label: '4', count: stats.stars_4 },
    { label: '3', count: stats.stars_3 },
    { label: '2', count: stats.stars_2 },
    { label: '1', count: stats.stars_1 },
  ];
  const max = Math.max(...bars.map((b) => b.count), 1);

  return (
    <div className="space-y-1.5">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2 text-sm">
          <span className="w-4 text-right text-muted-foreground">{b.label}</span>
          <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-yellow-400 transition-all"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs text-muted-foreground">{b.count}</span>
        </div>
      ))}
    </div>
  );
}
