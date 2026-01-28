import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusBucket } from "@/types/ad-timeline";

interface StatusBadgeProps {
  bucket: StatusBucket;
  className?: string;
  showLabel?: boolean;
}

const bucketConfig: Record<StatusBucket, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  'OK': { label: 'OK', variant: 'default', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
  '30D': { label: '30 dias', variant: 'secondary', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  '60D': { label: '60 dias', variant: 'secondary', className: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  '90D': { label: '90 dias', variant: 'destructive', className: 'bg-red-500/10 text-red-600 border-red-500/20' },
  '120D': { label: '120 dias', variant: 'destructive', className: 'bg-red-600/10 text-red-700 border-red-600/20' },
  'NO_SALES': { label: 'Sem vendas', variant: 'outline', className: 'bg-muted text-muted-foreground' },
};

export function StatusBucketBadge({ bucket, className, showLabel = true }: StatusBadgeProps) {
  const config = bucketConfig[bucket] || bucketConfig.NO_SALES;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(config.className, "font-medium", className)}
    >
      {showLabel ? config.label : bucket}
    </Badge>
  );
}
