import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Lightbulb, ExternalLink, Check, Undo2, Play, Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * Recomendações de publicidade lidas ao vivo da API nova do Product Ads.
 * Enquanto o Mercado Livre não libera a escrita para o app, cada recomendação abre a
 * campanha/anúncio no painel do Mercado Ads para o vendedor confirmar lá.
 * Quando a escrita for liberada, basta trocar ESCRITA_LIBERADA para true.
 */
const ESCRITA_LIBERADA = false;

// Links do painel do Mercado Ads (conferir se abrem a tela certa)
const LINK_PAINEL = "https://ads.mercadolivre.com.br/";
const linkCampanha = (id: string | number) => `https://ads.mercadolivre.com.br/productads/campaigns/${id}`;

const BRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const GRAVIDADE: Record<string, { label: string; cls: string }> = {
  alta: { label: "Urgente", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  media: { label: "Atenção", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  oportunidade: { label: "Oportunidade", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
};

const TIPOS: Record<string, string> = {
  campanha_sem_venda: "Campanha gastando sem vender",
  acos_acima: "ACOS acima do objetivo",
  orcamento_curto: "Orçamento curto",
  sem_impressao: "Campanha sem impressões",
  anuncio_sem_venda: "Anúncio gastando sem vender",
  anuncio_acos_alto: "Anúncio com ACOS alto",
  mover_escala: "Mover para campanha maior",
  fora_de_campanha: "Fora da publicidade",
};

const chave = (sellerId: string) => `ads-recs-feitas:${sellerId}`;
const lerFeitas = (sellerId: string): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(chave(sellerId)) || "{}"); } catch { return {}; }
};
const gravarFeitas = (sellerId: string, v: Record<string, string>) => {
  try { localStorage.setItem(chave(sellerId), JSON.stringify(v)); } catch { /* sem storage */ }
};
const idRec = (r: any) => `${r.tipo}:${r.item_id || r.campaign_id}`;

export function AdsRecommendationsPanel({ sellerId }: { sellerId?: string | null }) {
  const [dias, setDias] = useState("30");
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("todas");
  const [verFeitas, setVerFeitas] = useState(false);
  const [feitas, setFeitas] = useState<Record<string, string>>(() => (sellerId ? lerFeitas(sellerId) : {}));
  const [executando, setExecutando] = useState<string | null>(null);

  const analisar = async () => {
    if (!sellerId) return;
    setCarregando(true); setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("ads-campaign-manage", {
        body: { seller_id: sellerId, action: "recommendations", days: Number(dias) },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.details || data?.error || "Não foi possível ler a publicidade.");
      setDados(data);
      setFeitas(lerFeitas(sellerId));
    } catch (e: any) {
      setErro(e?.message || String(e));
    } finally {
      setCarregando(false);
    }
  };

  const marcar = (r: any, feito: boolean) => {
    if (!sellerId) return;
    const novo = { ...feitas };
    if (feito) novo[idRec(r)] = new Date().toISOString(); else delete novo[idRec(r)];
    setFeitas(novo); gravarFeitas(sellerId, novo);
  };

  const executar = async (r: any) => {
    if (!sellerId || !r.comando) return;
    setExecutando(idRec(r));
    try {
      const { data, error } = await supabase.functions.invoke("ads-campaign-manage", {
        body: { seller_id: sellerId, ...r.comando },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.details || data.error);
      toast.success("Feito no Mercado Livre.");
      marcar(r, true);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setExecutando(null);
    }
  };

  const recs: any[] = dados?.recomendacoes || [];
  const visiveis = useMemo(() => recs.filter((r) =>
    (filtro === "todas" || r.gravidade === filtro || r.tipo === filtro) && (verFeitas || !feitas[idRec(r)])
  ), [recs, filtro, feitas, verFeitas]);
  const contagem = (g: string) => recs.filter((r) => r.gravidade === g && !feitas[idRec(r)]).length;
  const r0 = dados?.resumo;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-primary" /> Recomendações de publicidade
          </CardTitle>
          <CardDescription>
            O sistema lê suas campanhas e anúncios direto do Mercado Livre e aponta o que mexer.
            {!ESCRITA_LIBERADA && " Por enquanto você confirma cada mudança no painel do Mercado Ads: o botão abre a tela certa."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={dias} onValueChange={setDias}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={analisar} disabled={carregando || !sellerId}>
            {carregando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lightbulb className="h-4 w-4 mr-2" />}
            {dados ? "Analisar de novo" : "Analisar publicidade"}
          </Button>
          <Button variant="outline" asChild>
            <a href={LINK_PAINEL} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-2" />Abrir Mercado Ads</a>
          </Button>
          {carregando && <span className="text-sm text-muted-foreground">Lendo campanhas e anúncios… pode levar até um minuto.</span>}
        </CardContent>
      </Card>

      {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}

      {r0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Investimento</p><p className="text-xl font-semibold">{BRL(r0.custo)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Vendas por ads</p><p className="text-xl font-semibold">{BRL(r0.vendas_ads)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ACOS geral</p><p className="text-xl font-semibold">{r0.vendas_ads ? `${((r0.custo / r0.vendas_ads) * 100).toFixed(1)}%` : "—"}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Campanhas ativas / anúncios</p><p className="text-xl font-semibold">{r0.campanhas_ativas} / {r0.anuncios_total}</p></CardContent></Card>
        </div>
      )}
      {r0 && r0.anuncios_lidos < r0.anuncios_total && (
        <p className="text-xs text-muted-foreground">Foram analisados os primeiros {r0.anuncios_lidos} de {r0.anuncios_total} anúncios.</p>
      )}

      {dados && (
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["todas", `Todas (${recs.filter((r) => !feitas[idRec(r)]).length})`],
            ["alta", `Urgentes (${contagem("alta")})`],
            ["media", `Atenção (${contagem("media")})`],
            ["oportunidade", `Oportunidades (${contagem("oportunidade")})`],
          ].map(([v, l]) => (
            <Button key={v} size="sm" variant={filtro === v ? "default" : "outline"} onClick={() => setFiltro(v)}>{l}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setVerFeitas(!verFeitas)}>
            {verFeitas ? "Esconder as já feitas" : "Mostrar as já feitas"}
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">Período: {dados.periodo.de.split("-").reverse().join("/")} a {dados.periodo.ate.split("-").reverse().join("/")}</span>
        </div>
      )}

      {dados && visiveis.length === 0 && (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Nada para mexer neste filtro. 👍</CardContent></Card>
      )}

      <div className="space-y-3">
        {visiveis.map((r) => {
          const g = GRAVIDADE[r.gravidade] || GRAVIDADE.media;
          const m = r.metricas || {};
          const feito = !!feitas[idRec(r)];
          const campId = r.campanha_destino?.id || r.campaign_id;
          return (
            <Card key={idRec(r)} className={feito ? "opacity-60" : ""}>
              <CardContent className="p-4 flex gap-4">
                {r.thumbnail && <img src={r.thumbnail.replace("http://", "https://")} alt="" className="h-16 w-16 rounded object-cover shrink-0" />}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={g.cls}>{g.label}</Badge>
                    <Badge variant="secondary">{TIPOS[r.tipo] || r.tipo}</Badge>
                    {feito && <Badge variant="outline"><Check className="h-3 w-3 mr-1" />Feito</Badge>}
                  </div>
                  <p className="font-medium">{r.titulo}</p>
                  {r.titulo_anuncio && (
                    <p className="text-sm text-muted-foreground truncate">
                      {r.item_id} · {r.titulo_anuncio}{r.campanha ? ` · campanha "${r.campanha}"` : ""}
                    </p>
                  )}
                  <p className="text-sm">{r.motivo}</p>
                  <p className="text-sm font-medium text-primary">→ {r.sugestao}</p>
                  <p className="text-xs text-muted-foreground">
                    {Number(m.prints || 0).toLocaleString("pt-BR")} impressões · {m.clicks || 0} cliques · gasto {BRL(m.cost)} · vendas {BRL(m.total_amount)} ({m.units_quantity || 0} un.)
                    {m.acos ? ` · ACOS ${Number(m.acos).toFixed(1)}%` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {ESCRITA_LIBERADA && r.comando ? (
                      <Button size="sm" onClick={() => executar(r)} disabled={executando === idRec(r) || feito}>
                        {executando === idRec(r) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                        Executar
                      </Button>
                    ) : (
                      campId ? (
                        <Button size="sm" asChild>
                          <a href={linkCampanha(campId)} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />Abrir campanha no Mercado Ads
                          </a>
                        </Button>
                      ) : null
                    )}
                    {r.item_id && (
                      <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(r.item_id); toast.success(`${r.item_id} copiado`); }}>
                        <Copy className="h-4 w-4 mr-1" />Copiar MLB
                      </Button>
                    )}
                    {r.permalink && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={r.permalink} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Ver anúncio</a>
                      </Button>
                    )}
                    {feito ? (
                      <Button size="sm" variant="ghost" onClick={() => marcar(r, false)}><Undo2 className="h-4 w-4 mr-1" />Desmarcar</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => marcar(r, true)}><Check className="h-4 w-4 mr-1" />Marcar como feito</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
