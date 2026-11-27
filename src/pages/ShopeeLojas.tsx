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
 * Shopee — lojas conectadas (27/nov/2026, beta, ainda sem item no menu).
 * Rotas: /shopee e /shopee/callback (a Shopee devolve o vendedor para cá com ?code=&shop_id=).
 * Os tokens nunca chegam ao navegador: ficam em shopee_accounts e só a função shopee-auth lê.
 */
type Loja = { id: string; shop_id: number; shop_name: string | null; region: string | null; ambiente: string; status: string; ultimo_erro: string | null; updated_at: string };

export default function ShopeeLojas() {
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
    const { data } = await (supabase as any).from("shopee_accounts")
      .select("id, shop_id, shop_name, region, ambiente, status, ultimo_erro, updated_at")
      .order("created_at", { ascending: false });
    setLojas(data || []);
    setCarregando(false);
  };

  // Volta da Shopee: troca o code pelo token
  useEffect(() => {
    const code = params.get("code");
    const shopId = params.get("shop_id");
    if (!code || !shopId || jaTrocou.current) { carregar(); return; }
    jaTrocou.current = true;
    (async () => {
      setTrocando(true);
      const { data, error } = await supabase.functions.invoke("shopee-auth", { body: { action: "exchange", code, shop_id: shopId } });
      if (error || data?.error) setAviso({ tipo: "erro", texto: data?.details || data?.error || error?.message || "Falha ao conectar." });
      else setAviso({ tipo: "ok", texto: `Loja ${data.loja?.shop_name || data.loja?.shop_id} conectada.` });
      setTrocando(false);
      navigate("/shopee", { replace: true });
      carregar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectar = async () => {
    setConectando(true);
    const { data, error } = await supabase.functions.invoke("shopee-auth", { body: { action: "auth_url" } });
    if (error || !data?.url) {
      setAviso({ tipo: "erro", texto: data?.details || data?.error || error?.message || "Não foi possível gerar o link." });
      setConectando(false);
      return;
    }
    window.location.href = data.url;
  };

  const testar = async (l: Loja) => {
    const { data } = await supabase.functions.invoke("shopee-auth", { body: { action: "test", id: l.id } });
    if (data?.success) toast.success(`Conexão OK: ${data.loja?.shop_name || l.shop_id}`);
    else toast.error(data?.details || data?.error || "Falhou");
    carregar();
  };

  const desconectar = async (l: Loja) => {
    if (!confirm(`Desconectar a loja ${l.shop_name || l.shop_id}?`)) return;
    await supabase.functions.invoke("shopee-auth", { body: { action: "disconnect", id: l.id } });
    carregar();
  };

  return (
    <PageContainer title="Shopee" subtitle="Conecte suas lojas da Shopee ao MKTP Fácil (beta)">
      <div className="p-4 lg:p-6 space-y-4 max-w-3xl">
        {trocando && (
          <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertDescription>Finalizando a conexão com a Shopee…</AlertDescription></Alert>
        )}
        {aviso && (
          <Alert variant={aviso.tipo === "erro" ? "destructive" : "default"}>
            {aviso.tipo === "ok" && <CheckCircle2 className="h-4 w-4" />}
            <AlertDescription>{aviso.texto}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" /> Lojas Shopee</CardTitle>
            <CardDescription>
              Ao conectar, você será levado à Shopee para autorizar o MKTP Fácil. Depois volta para cá automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={conectar} disabled={conectando}>
              {conectando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
              Conectar loja Shopee
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
                      <p className="font-medium">{l.shop_name || `Loja ${l.shop_id}`}</p>
                      <p className="text-xs text-muted-foreground">ID {l.shop_id}{l.region ? ` · ${l.region}` : ""} · {l.ambiente === "teste" ? "ambiente de teste" : "produção"}</p>
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
