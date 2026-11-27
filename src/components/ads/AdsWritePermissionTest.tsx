import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";

/**
 * Testa se o Mercado Livre aceita comandos de escrita de publicidade desta conta.
 * Manda para uma campanha o MESMO status que ela já tem — não altera nada.
 */
export function AdsWritePermissionTest({ sellerId }: { sellerId?: string | null }) {
  const [testando, setTestando] = useState(false);
  const [res, setRes] = useState<any>(null);

  const testar = async () => {
    if (!sellerId) return;
    setTestando(true); setRes(null);
    try {
      const { data, error } = await supabase.functions.invoke("ads-campaign-manage", {
        body: { seller_id: sellerId, action: "test_write" },
      });
      if (error) throw error;
      setRes(data);
    } catch (e: any) {
      setRes({ permissao_escrita: false, details: e?.message || String(e) });
    } finally {
      setTestando(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={testar} disabled={testando || !sellerId}>
        {testando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
        Testar permissão de escrita
      </Button>
      {res && (
        <Alert variant={res.permissao_escrita ? "default" : "destructive"}>
          {res.permissao_escrita ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <AlertDescription>
            <p className="font-medium">
              {res.permissao_escrita === true && "Escrita liberada: o sistema pode pausar, ativar, mover e criar campanhas."}
              {res.permissao_escrita === false && "Escrita recusada pelo Mercado Livre."}
              {res.permissao_escrita == null && !res.error && "Teste inconclusivo."}
              {res.error && !("permissao_escrita" in res) && "Não foi possível testar."}
            </p>
            <p className="text-sm">{res.details}</p>
            {res.campanha_testada && (
              <p className="text-xs opacity-80">
                Testado na campanha "{res.campanha_testada.name}" sem alterar nada (status mantido: {res.campanha_testada.status}).
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
