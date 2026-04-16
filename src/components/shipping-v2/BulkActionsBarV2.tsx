import { Button } from '@/components/ui/button';
import { FileText, Printer, X, Loader2, ChevronDown, AlertTriangle } from 'lucide-react';
import { LabelGenerationProgress, GenerationProgress } from '@/components/shipping/LabelGenerationProgress';
import type { LabelTestLayout, SelectionCapabilitiesV2, SelectionDiagnostics } from '@/lib/labeltestEligibility';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BulkActionsBarV2Props {
  selectedCount: number;
  onClear: () => void;
  onGenerateLabels: (format: 'pdf' | 'zpl', layout: LabelTestLayout) => void;
  isGenerating: boolean;
  generationProgress: GenerationProgress;
  capabilities: SelectionCapabilitiesV2;
  diagnostics: SelectionDiagnostics;
}

export function BulkActionsBarV2({
  selectedCount,
  onClear,
  onGenerateLabels,
  isGenerating,
  generationProgress,
  capabilities,
  diagnostics,
}: BulkActionsBarV2Props) {
  if (selectedCount === 0 && generationProgress.status === 'idle') return null;

  const { total_valid, total_invalid, items } = diagnostics;
  const invalidReasons = [...new Set(items.filter(i => !i.eligible).map(i => i.reason_message))];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-6 py-3 flex flex-col gap-2 min-w-[500px]">
        {generationProgress.status !== 'idle' && (
          <div className="text-primary-foreground">
            <LabelGenerationProgress progress={generationProgress} />
          </div>
        )}

        {selectedCount > 0 && generationProgress.status === 'idle' && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* Counters */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
              </span>
              <span className="text-xs opacity-80">
                ({total_valid} válido{total_valid !== 1 ? 's' : ''}
                {total_invalid > 0 && (
                  <>, <span className="text-yellow-300">{total_invalid} inválido{total_invalid !== 1 ? 's' : ''}</span></>
                )})
              </span>
              {total_invalid > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-4 w-4 text-yellow-300 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-medium mb-1">Motivos de inelegibilidade:</p>
                      <ul className="text-xs space-y-0.5">
                        {invalidReasons.map((r, i) => (
                          <li key={i}>• {r}</li>
                        ))}
                      </ul>
                      {total_valid > 0 && (
                        <p className="text-xs mt-1 opacity-80">
                          Os {total_valid} válido(s) serão gerados normalmente.
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <div className="h-6 w-px bg-primary-foreground/30" />

            {/* PDF Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" disabled={isGenerating || total_valid === 0}>
                  {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                  PDF
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-popover">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Formato PDF</DropdownMenuLabel>
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
                <Button variant="secondary" size="sm" disabled={isGenerating || total_valid === 0}>
                  {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
                  ZPL
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-popover">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Formato ZPL</DropdownMenuLabel>
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
