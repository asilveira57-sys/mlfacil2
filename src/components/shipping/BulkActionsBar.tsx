import { Button } from '@/components/ui/button';
import { FileText, Printer, X, Loader2, ChevronDown, ClipboardList } from 'lucide-react';
import { LabelGenerationProgress, GenerationProgress } from './LabelGenerationProgress';
import { DraggableFloatingBar } from './DraggableFloatingBar';
import { LabelLayout } from '@/hooks/useShippingLabels';
import { SelectionCapabilities } from '@/lib/shippingLabelRules';
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
  capabilities: SelectionCapabilities;
}

export function BulkActionsBar({
  selectedCount,
  onClear,
  onGenerateLabels,
  onSeparationReport,
  isGenerating,
  generationProgress,
  capabilities,
}: BulkActionsBarProps) {
  // Show progress bar even when nothing selected (during generation)
  if (selectedCount === 0 && generationProgress.status === 'idle') return null;

  return (
    <DraggableFloatingBar storageKey="bulk-actions-bar-pos">
      <>
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
                <DropdownMenuItem 
                  onClick={() => onGenerateLabels('pdf', 'meli_100x150')}
                  disabled={!capabilities.canStandardPdf.enabled}
                  className={!capabilities.canStandardPdf.enabled ? 'opacity-50' : ''}
                >
                  <span className="font-medium">Padrão ML</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {!capabilities.canStandardPdf.enabled ? capabilities.canStandardPdf.reason : 'etiqueta + DANFE'}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onGenerateLabels('pdf', 'meli_100x150_no_nf')}>
                  <span className="font-medium">Cabeçalho sem DANFE</span>
                  <span className="ml-2 text-xs text-muted-foreground">somente etiqueta</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onGenerateLabels('pdf', 'mlfacil_100x175_header')}
                  disabled={!capabilities.canHeaderPdf.enabled}
                  className={!capabilities.canHeaderPdf.enabled ? 'opacity-50' : ''}
                >
                  <span className="font-medium">Cabeçalho + DANFE</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {!capabilities.canHeaderPdf.enabled ? capabilities.canHeaderPdf.reason : 'etiqueta + NF'}
                  </span>
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

            {/* Separation Report */}
            {onSeparationReport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" disabled={isGenerating}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Separação
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-popover">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Relatório de Separação
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onSeparationReport('per_order')}>
                    <span className="font-medium">Por pedido</span>
                    <span className="ml-2 text-xs text-muted-foreground">lista por venda</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSeparationReport('accumulated')}>
                    <span className="font-medium">Acumulado</span>
                    <span className="ml-2 text-xs text-muted-foreground">soma quantidades</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
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
      </>
    </DraggableFloatingBar>
  );
}
