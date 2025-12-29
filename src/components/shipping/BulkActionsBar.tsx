import { Button } from '@/components/ui/button';
import { FileText, Printer, X, Loader2 } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  onGeneratePDF: () => void;
  onGenerateZPL: () => void;
  isGenerating: boolean;
}

export function BulkActionsBar({
  selectedCount,
  onClear,
  onGeneratePDF,
  onGenerateZPL,
  isGenerating,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-6 py-3 flex items-center gap-4">
        <span className="font-medium">
          {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
        </span>
        
        <div className="h-6 w-px bg-primary-foreground/30" />
        
        <Button
          variant="secondary"
          size="sm"
          onClick={onGeneratePDF}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-2" />
          )}
          Gerar PDF
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={onGenerateZPL}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          Gerar ZPL
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="text-primary-foreground hover:bg-primary-foreground/20"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
