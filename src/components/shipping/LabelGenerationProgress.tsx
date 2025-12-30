import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export interface BatchProgress {
  batch_id: number;
  status: string;
  label_count: number;
  retry_count: number;
  error?: string;
}

export interface GenerationProgress {
  status: 'idle' | 'processing' | 'completed' | 'partial' | 'error';
  total_labels: number;
  processed_labels: number;
  total_batches: number;
  completed_batches: number;
  error_batches: number;
  batch_details?: BatchProgress[];
}

interface LabelGenerationProgressProps {
  progress: GenerationProgress;
}

export function LabelGenerationProgress({ progress }: LabelGenerationProgressProps) {
  if (progress.status === 'idle') return null;

  const percentage = progress.total_batches > 0 
    ? Math.round((progress.completed_batches / progress.total_batches) * 100)
    : 0;

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'partial':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case 'processing':
        return `Processando lote ${progress.completed_batches + 1} de ${progress.total_batches}...`;
      case 'completed':
        return `${progress.processed_labels} etiqueta(s) gerada(s) com sucesso`;
      case 'partial':
        return `${progress.processed_labels} gerada(s), ${progress.error_batches} lote(s) com erro`;
      case 'error':
        return 'Erro ao gerar etiquetas';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>
      
      {progress.status === 'processing' && (
        <div className="space-y-1">
          <Progress value={percentage} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.completed_batches}/{progress.total_batches} lotes</span>
            <span>{percentage}%</span>
          </div>
        </div>
      )}

      {progress.batch_details && progress.batch_details.some(b => b.retry_count > 1) && (
        <div className="text-xs text-muted-foreground">
          {progress.batch_details
            .filter(b => b.retry_count > 1)
            .map(b => (
              <div key={b.batch_id}>
                Lote {b.batch_id}: {b.retry_count} tentativa(s)
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
