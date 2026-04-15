import { AlertTriangle, Printer, Info } from 'lucide-react';

export function PrintInstructionsV2() {
  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
        <Printer className="h-4 w-4" />
        <span>Instruções de Impressão (anti-A4)</span>
      </div>
      <ul className="text-sm text-amber-600 dark:text-amber-500 space-y-1.5 ml-6 list-disc">
        <li>
          <strong>Tamanho real / Actual size</strong> — não ajustar à página
        </li>
        <li>
          Papel <strong>100×150mm</strong> (padrão) ou <strong>100×175mm</strong> (com cabeçalho)
        </li>
        <li>
          Desmarque <strong>"Ajustar à página"</strong> e <strong>"Redimensionar"</strong> no diálogo de impressão
        </li>
        <li>
          Se usar ZPL, verifique a intensidade (darkness) da impressora
        </li>
      </ul>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
        <Info className="h-3.5 w-3.5" />
        <span>V2 — Cada etiqueta gerada inclui metadados de tamanho físico no PDF</span>
      </div>
    </div>
  );
}
