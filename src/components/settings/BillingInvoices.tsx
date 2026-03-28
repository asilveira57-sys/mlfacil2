import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Download, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function BillingInvoices() {
  // Future: fetch from a invoices/nfse table
  const invoices: any[] = [];

  return (
    <div className="space-y-6">
      <Alert className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400">
        <Info className="h-4 w-4" />
        <AlertDescription>
          As notas fiscais de serviço (NFS-e) são emitidas após a confirmação do pagamento e ficam disponíveis para download aqui.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Notas Fiscais de Serviço
          </CardTitle>
          <CardDescription>
            Documentos fiscais emitidos para seus pagamentos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma nota fiscal emitida ainda.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Após a confirmação de pagamento, a NFS-e será emitida e ficará disponível aqui para download.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">NFS-e #{inv.number}</p>
                    <p className="text-xs text-muted-foreground">{inv.date}</p>
                  </div>
                  <button className="flex items-center gap-1 text-primary text-sm hover:underline">
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
