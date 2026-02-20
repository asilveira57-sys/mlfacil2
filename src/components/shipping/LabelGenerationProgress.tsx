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
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'partial':
        return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case 'processing':
        return `Processando lote ${progress.completed_batches + 1} de ${progress.total_batches}...`;
      case 'completed':
        return `${progress.processed_labels} etiqueta(s) gerada(s) com sucesso!`;
      case 'partial':
        return `${progress.processed_labels} gerada(s), ${progress.error_batches} lote(s) com erro`;
      case 'error':
        return 'Erro ao gerar etiquetas';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-3 min-w-[300px]">
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>
      
      {progress.status === 'processing' && (
        <div className="space-y-2">
          {/* Indeterminate progress bar */}
          <div className="h-3 w-full bg-primary-foreground/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-foreground rounded-full animate-pulse"
              style={{ width: '100%', opacity: 0.7 }}
            />
          </div>
          
          {/* Progress info */}
          {progress.total_batches > 1 && (
            <div className="flex justify-between text-xs opacity-80">
              <span>{progress.completed_batches}/{progress.total_batches} lotes</span>
              <span>{percentage}%</span>
            </div>
          )}
        </div>
      )}

      {/* Retry info */}
      {progress.batch_details && progress.batch_details.some(b => b.retry_count > 1) && (
        <div className="text-xs opacity-70">
          {progress.batch_details
            .filter(b => b.retry_count > 1)
            .map(b => (
              <div key={b.batch_id}>
                ⟳ Lote {b.batch_id}: tentativa {b.retry_count}/5
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
