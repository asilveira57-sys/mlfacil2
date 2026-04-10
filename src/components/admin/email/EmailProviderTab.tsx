import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';

export function EmailProviderTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provedor de Envio</CardTitle>
          <CardDescription>Sistema de e-mails configurado e ativo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium">Lovable Cloud — Ativo</p>
              <p className="text-xs text-muted-foreground">
                E-mails de autenticação (cadastro, recuperação de senha, etc.) são enviados automaticamente.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Remetente</p>
              <p className="text-sm font-medium">MKTP Fácil</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">E-mail</p>
              <p className="text-sm font-medium">noreply@notifica.mktpfacil.com</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Domínio</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium">notify.notifica.mktpfacil.com</p>
                <Badge variant="outline" className="text-green-600 border-green-300">Verificado</Badge>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Idioma</p>
              <p className="text-sm font-medium">Português (BR)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
