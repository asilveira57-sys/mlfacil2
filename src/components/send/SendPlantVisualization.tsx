import { cn } from "@/lib/utils";
import { GROWTH_STAGE_CONFIG, HEALTH_STATUS_CONFIG, SendGrowthStage, SendHealthStatus } from "@/types/send";

interface SendPlantVisualizationProps {
  growthStage: SendGrowthStage;
  healthStatus: SendHealthStatus;
  daysPlanted: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function SendPlantVisualization({
  growthStage,
  healthStatus,
  daysPlanted,
  size = 'md',
  showLabel = true,
}: SendPlantVisualizationProps) {
  const stageConfig = GROWTH_STAGE_CONFIG[growthStage];
  const healthConfig = HEALTH_STATUS_CONFIG[healthStatus];

  const sizeClasses = {
    xs: 'w-10 h-12',
    sm: 'w-16 h-20',
    md: 'w-24 h-32',
    lg: 'w-32 h-40',
  };

  const emojiSizes = {
    xs: 'text-lg',
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-5xl',
  };

  // Calculate progress to next stage
  const currentStageIndex = Object.keys(GROWTH_STAGE_CONFIG).indexOf(growthStage);
  const stages = Object.entries(GROWTH_STAGE_CONFIG);
  const nextStage = stages[currentStageIndex + 1];
  const daysToNext = nextStage ? nextStage[1].daysRequired - daysPlanted : 0;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Plant container */}
      <div 
        className={cn(
          "relative flex flex-col items-center justify-end rounded-xl transition-all",
          sizeClasses[size],
          healthConfig.bgColor,
          healthStatus === 'weakening' && 'animate-pulse',
        )}
      >
        {/* Soil */}
        <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-amber-900/30 to-amber-700/20 rounded-b-xl" />
        
        {/* Plant emoji */}
        <div className={cn("relative z-10 mb-2", emojiSizes[size])}>
          {stageConfig.emoji}
        </div>

        {/* Health indicator */}
        <div 
          className={cn(
            "absolute top-1 right-1 w-2 h-2 rounded-full",
            healthStatus === 'healthy' && 'bg-emerald-500',
            healthStatus === 'stagnant' && 'bg-amber-500',
            healthStatus === 'weakening' && 'bg-orange-500 animate-pulse',
            healthStatus === 'dormant' && 'bg-slate-400',
          )}
        />
      </div>

      {/* Labels */}
      {showLabel && (
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {stageConfig.label}
          </p>
          <p className={cn("text-xs", healthConfig.color)}>
            {healthConfig.label}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {daysPlanted} dias plantado
          </p>
          {nextStage && daysToNext > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {daysToNext}d para {stages[currentStageIndex + 1][1].label.toLowerCase()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
