import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Plug, RefreshCw, Store, Unplug, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Magalu — lojas conectadas (28/nov/2026, beta, ainda sem item no menu). Mesmo molde da tela da Shopee.
 * Rotas: /magalu e /magalu/callback (o ID Magalu devolve o vendedor para cá com ?code=&state=).
 * O state é gerado pela função magalu-auth, guardado no sessionStorage e conferido na volta.
 * Os tokens nunca chegam ao navegador: ficam em magalu_accounts e só a função magalu-auth lê.
 */
type Loja = { id: string; tenant_id: string; seller_name: string | null; ambiente: string; status: string; ultimo_erro: string | null; updated_at: string };
const CHAVE_STATE = "magalu_oauth_state";

export default function MagaluLojas() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const jaTrocou = useRef(false);

  const carregar = async () => {
    setCarregando(true);
    const { data } = await (supabase as any).from("magalu_accounts")
      .select("id, tenant_id, seller_name, ambiente, status, ultimo_erro, updated_at")
      .order("created_at", { ascending: false });
    setLojas(data || []);
    setCarregando(false);
  };

  // Volta do ID Magalu: confere o state e troca o code pelo token
  useEffect(() => {
    const code = params.get("code");
    const erroMagalu = params.get("error");
    if (erroMagalu) {
      setAviso({ tipo: "erro", texto: `A Magalu não concluiu a autorização (${params.get("error_description") || erroMagalu}).` });
      navigate("/magalu", { replace: true });
      carregar();
      return;
    }
    if (!code || jaTrocou.current) { carregar(); return; }
    jaTrocou.current = true;
    const stateEsperado = sessionStorage.getItem(CHAVE_STATE);
    sessionStorage.removeItem(CHAVE_STATE);
    if (!stateEsperado || stateEsperado !== params.get("state")) {
      setAviso({ tipo: "erro", texto: "Link de retorno inválido ou expirado. Clique em Conectar de novo." });
      navigate("/magalu", { replace: true });
      carregar();
      return;
    }
    (async () => {
      setTrocando(true);
      const { data, error } = await supabase.functions.invoke("magalu-auth", { body: { action: "exchange", code } });
      if (error || data?.error) setAviso({ tipo: "erro", texto: data?.details || data?.error || error?.message || "Falha ao conectar." });
      else setAviso({ tipo: "ok", texto: `Loja ${data.loja?.seller_name || data.loja?.tenant_id} conectada.` });
      setTrocando(false);
      navigate("/magalu", { replace: true });
      carregar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectar = async () => {
    setConectando(true);
    const { data, error } = await supabase.functions.invoke("magalu-auth", { body: { action: "auth_url" } });
    if (error || !data?.url) {
      setAviso({ tipo: "erro", texto: data?.details || data?.error || error?.message || "Não foi possível gerar o link." });
      setConectando(false);
      return;
    }
    sessionStorage.setItem(CHAVE_STATE, data.state);
    window.location.href = data.url;
  };

  const testar = async (l: Loja) => {
    const { data } = await supabase.functions.invoke("magalu-auth", { body: { action: "test", id: l.id } });
    if (data?.success) {
      const ped = data.pedidos?.ok ? "pedidos OK" : `pedidos: ${data.pedidos?.erro || "sem acesso"}`;
      toast.success(`Conexão OK: ${data.loja?.seller?.name || l.seller_name || l.tenant_id} · ${ped}`);
    } else toast.error(data?.details || data?.error || "Falhou");
    carregar();
  };

  const desconectar = async (l: Loja) => {
    if (!confirm(`Desconectar a loja ${l.seller_name || l.tenant_id}?`)) return;
    await supabase.functions.invoke("magalu-auth", { body: { action: "disconnect", id: l.id } });
    carregar();
  };

  return (
    <PageContainer title="Magalu" subtitle="Conecte suas lojas do Magalu Marketplace ao MKTP Fácil (beta)">
      <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
        {trocando && (
          <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertDescription>Finalizando a conexão com a Magalu…</AlertDescription></Alert>
        )}
        {aviso && (
          <Alert variant={aviso.tipo === "erro" ? "destructive" : "default"}>
            {aviso.tipo === "ok" && <CheckCircle2 className="h-4 w-4" />}
            <AlertDescription>{aviso.texto}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" /> Lojas Magalu</CardTitle>
            <CardDescription>
              Ao conectar, você entra no ID Magalu com o login da sua loja (conta PJ), escolhe a loja e autoriza o MKTP Fácil.
              Depois volta para cá automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={conectar} disabled={conectando}>
              {conectando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
              Conectar loja Magalu
            </Button>

            {carregando ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : lojas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma loja conectada ainda.</p>
            ) : (
              <div className="space-y-2">
                {lojas.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{l.seller_name || `Loja ${l.tenant_id}`}</p>
                      <p className="text-xs text-muted-foreground truncate">ID {l.tenant_id} · {l.ambiente === "teste" ? "ambiente de teste" : "produção"}</p>
                      {l.ultimo_erro && <p className="text-xs text-destructive">{l.ultimo_erro}</p>}
                    </div>
                    <Badge variant={l.status === "conectada" ? "default" : "secondary"}>{l.status}</Badge>
                    {l.status !== "desconectada" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => testar(l)}><RefreshCw className="h-4 w-4 mr-1" />Testar</Button>
                        <Button size="sm" variant="ghost" onClick={() => desconectar(l)}><Unplug className="h-4 w-4 mr-1" />Desconectar</Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
