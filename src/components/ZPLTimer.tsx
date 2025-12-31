import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface ZPLTimerProps {
  isActive: boolean;
  estimatedSeconds?: number;
  message?: string;
  userName?: string;
}

export const ZPLTimer = ({ isActive, estimatedSeconds = 0, message, userName }: ZPLTimerProps) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatEstimatedTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} segundos`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
    return `${mins}:${secs.toString().padStart(2, '0')} minutos`;
  };

  const displayMessage = message
    ?.replace('{PRIMEIRO_NOME}', userName?.split(' ')[0] || 'Usuário')
    ?.replace('{TIME}', formatEstimatedTime(estimatedSeconds));

  const progressPercentage = estimatedSeconds > 0 
    ? Math.min((elapsedSeconds / estimatedSeconds) * 100, 100) 
    : 0;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <div className="p-4 space-y-3">
        {/* Timer Display */}
        <div className="flex items-center justify-center gap-3">
          <div className="text-3xl font-mono font-bold text-primary">
            {formatTime(elapsedSeconds)}
          </div>
          
          {estimatedSeconds > 0 && (
            <div className="text-sm text-muted-foreground">
              Tempo estimado: {formatEstimatedTime(estimatedSeconds)}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {estimatedSeconds > 0 && (
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div 
              className="bg-primary h-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        )}

        {/* Custom Message */}
        {displayMessage && (
          <p className="text-sm text-center text-muted-foreground">
            {displayMessage}
          </p>
        )}
      </div>
    </Card>
  );
};
