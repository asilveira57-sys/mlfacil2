import { Button } from '@/components/ui/button';
import { FileText, Printer, X, Loader2, ChevronDown, ClipboardList } from 'lucide-react';
import { LabelGenerationProgress, GenerationProgress } from './LabelGenerationProgress';
import { LabelLayout } from '@/hooks/useShippingLabels';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  onGenerateLabels: (format: 'pdf' | 'zpl', layout: LabelLayout) => void;
  onSeparationReport?: (mode: 'per_order' | 'accumulated') => void;
  isGenerating: boolean;
  generationProgress: GenerationProgress;
}

export function BulkActionsBar({
  selectedCount,
  onClear,
  onGenerateLabels,
  onSeparationReport,
  isGenerating,
  generationProgress,
}: BulkActionsBarProps) {
  // Show progress bar even when nothing selected (during generation)
  if (selectedCount === 0 && generationProgress.status === 'idle') return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-6 py-3 flex flex-col gap-2 min-w-[500px]">
        {/* Progress indicator */}
        {generationProgress.status !== 'idle' && (
          <div className="text-primary-foreground">
            <LabelGenerationProgress progress={generationProgress} />
          </div>
        )}

        {/* Action buttons - only show when items selected and not generating */}
        {selectedCount > 0 && generationProgress.status === 'idle' && (
          <div className="flex items-center gap-4">
            <span className="font-medium">
              {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
            </span>
            
            <div className="h-6 w-px bg-primary-foreground/30" />
            
            {/* PDF Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  PDF
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-popover">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Formato PDF
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onGenerateLabels('pdf', 'meli_100x150')}>
                  <span className="font-medium">Padrão ML</span>
                  <span className="ml-2 text-xs text-muted-foreground">100×150mm</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onGenerateLabels('pdf', 'mlfacil_100x175_header')}>
                  <span className="font-medium">Com Cabeçalho</span>
                  <span className="ml-2 text-xs text-muted-foreground">100×175mm</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* ZPL Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 mr-2" />
                  )}
                  ZPL
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-popover">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Formato ZPL
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onGenerateLabels('zpl', 'meli_100x150')}>
                  <span className="font-medium">Padrão ML</span>
                  <span className="ml-2 text-xs text-muted-foreground">100×150mm</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onGenerateLabels('zpl', 'mlfacil_100x175_header')}>
                  <span className="font-medium">Com Cabeçalho</span>
                  <span className="ml-2 text-xs text-muted-foreground">100×175mm</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={onClear}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
